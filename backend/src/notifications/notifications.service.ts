import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ActingUser, actorStamp } from '../audit/actor';
import { quranCircleValue } from '../students/quran-circles';
import { ANNOUNCEMENT_MAX_LENGTH, messages, whatsappLink, whatsappNumber } from './whatsapp-templates';

export const MESSAGE_KINDS = ['ABSENCE', 'LATE', 'PAYMENT', 'REMINDER', 'ANNOUNCEMENT'] as const;
type Kind = typeof MESSAGE_KINDS[number];
type Recipient = { parentId: string; parentName: string; relation: string | null; phone: string };
const MAX_PARENTS_PER_STUDENT = 3;
const parentSelect = { id: true, firstName: true, lastName: true, relation: true, phone: true, whatsappPhone: true, whatsappOptOut: true } as const;
const studentName = (student: { firstName: string; lastName: string }) => `${student.firstName} ${student.lastName}`;
const dedupeKey = (kind: string, referenceId: string | null | undefined, phone: string) => `${kind}:${referenceId || '-'}:${phone}`;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Recipients ────────────────────────────────────────────────────────────────

  private async recipientsByStudent(studentIds: string[]) {
    const students = await this.prisma.student.findMany({
      where: { id: { in: [...new Set(studentIds)] } },
      select: {
        id: true,
        parent: { select: parentSelect },
        guardians: { select: { relation: true, parent: { select: parentSelect } }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
      },
    });
    const result = new Map<string, Recipient[]>();
    for (const student of students) {
      const parents = [
        ...(student.parent ? [student.parent] : []),
        ...student.guardians.map(guardian => ({ ...guardian.parent, relation: guardian.relation || guardian.parent.relation })),
      ];
      const seenParents = new Set<string>();
      const seenPhones = new Set<string>();
      const recipients: Recipient[] = [];
      for (const parent of parents) {
        if (seenParents.has(parent.id) || parent.whatsappOptOut) continue;
        seenParents.add(parent.id);
        const phone = whatsappNumber(parent.whatsappPhone) || whatsappNumber(parent.phone);
        if (!phone || seenPhones.has(phone)) continue;
        seenPhones.add(phone);
        recipients.push({ parentId: parent.id, parentName: `${parent.firstName} ${parent.lastName}`, relation: parent.relation, phone });
        if (recipients.length >= MAX_PARENTS_PER_STUDENT) break;
      }
      result.set(student.id, recipients);
    }
    return result;
  }

  /** Adds the WhatsApp link and who already opened it, so a parent is not contacted twice by mistake. */
  private async links<T extends Recipient>(kind: Kind, referenceId: string, text: string, recipients: T[]) {
    const keys = recipients.map(recipient => dedupeKey(kind, referenceId, recipient.phone));
    const logs = keys.length ? await this.prisma.whatsAppMessageLog.findMany({ where: { dedupeKey: { in: keys } } }) : [];
    const byKey = new Map(logs.map(log => [log.dedupeKey, log]));
    return recipients.map(recipient => {
      const log = byKey.get(dedupeKey(kind, referenceId, recipient.phone));
      return { ...recipient, url: whatsappLink(recipient.phone, text),
        lastOpenedAt: log?.openedAt ?? null, lastOpenedBy: log?.actorName ?? null, openCount: log?.openCount ?? 0 };
    });
  }

  // ── Messages ──────────────────────────────────────────────────────────────────

  async absences(dateStr?: string) {
    const day = dateStr || new Date().toISOString().slice(0, 10);
    const date = new Date(`${day}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) throw new BadRequestException('Date invalide.');
    const records = await this.prisma.attendance.findMany({
      where: { date, status: { in: ['ABSENT', 'LATE'] }, student: { status: 'ACTIVE', departure: { is: null } } },
      include: { classroom: { select: { name: true } }, student: { select: { id: true, firstName: true, lastName: true, matricule: true } } },
      orderBy: [{ classroom: { name: 'asc' } }, { student: { lastName: 'asc' } }],
    });
    const recipients = await this.recipientsByStudent(records.map(record => record.studentId));
    return Promise.all(records.map(async record => {
      const kind: Kind = record.status === 'LATE' ? 'LATE' : 'ABSENCE';
      const text = messages.attendance(studentName(record.student), record.classroom.name, record.status === 'LATE', record.date);
      return { kind, referenceId: record.id, status: record.status, justified: record.justified, studentId: record.studentId, student: record.student,
        classroom: record.classroom.name, text, recipients: await this.links(kind, record.id, text, recipients.get(record.studentId) || []) };
    }));
  }

  async payment(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { invoice: { include: { student: { select: { id: true, firstName: true, lastName: true } } } } } });
    if (!payment || payment.cancelledAt || payment.invoice.cancelledAt) throw new NotFoundException('Paiement introuvable ou annulé.');
    const student = payment.invoice.student;
    const text = messages.payment(studentName(student), payment.amount, payment.invoice.title, payment.paymentNumber, payment.invoice.balance);
    const recipients = (await this.recipientsByStudent([student.id])).get(student.id) || [];
    return { kind: 'PAYMENT' as Kind, referenceId: payment.id, studentId: student.id, title: `Reçu ${payment.paymentNumber} — ${studentName(student)}`, text,
      recipients: await this.links('PAYMENT', payment.id, text, recipients) };
  }

  async reminder(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId }, include: { student: { select: { id: true, firstName: true, lastName: true } } } });
    if (!invoice || invoice.cancelledAt || invoice.balance <= 0) throw new BadRequestException('Facture active avec solde à payer requise.');
    const text = messages.reminder(studentName(invoice.student), invoice.balance, invoice.invoiceNumber, invoice.title, invoice.dueDate);
    const recipients = (await this.recipientsByStudent([invoice.studentId])).get(invoice.studentId) || [];
    return { kind: 'REMINDER' as Kind, referenceId: invoice.id, studentId: invoice.studentId, title: `Relance ${invoice.invoiceNumber} — ${studentName(invoice.student)}`, text,
      recipients: await this.links('REMINDER', invoice.id, text, recipients) };
  }

  async announcement(input: { audience?: string; classroomId?: string; quranCircle?: string; message?: string }) {
    const message = String(input?.message || '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (message.length < 10) throw new BadRequestException('Le message doit contenir au moins 10 caractères.');
    if (message.length > ANNOUNCEMENT_MAX_LENGTH) throw new BadRequestException(`Le message ne peut pas dépasser ${ANNOUNCEMENT_MAX_LENGTH} caractères.`);
    const audience = String(input?.audience || '');
    const where: Prisma.StudentWhereInput = { status: 'ACTIVE', departure: { is: null }, enrollments: { some: { academicYear: { isCurrent: true }, status: 'REGISTERED' } } };
    let label = 'Tous les parents';
    if (audience === 'CLASS') {
      const classroom = input.classroomId ? await this.prisma.classroom.findUnique({ where: { id: input.classroomId }, select: { id: true, name: true } }) : null;
      if (!classroom) throw new BadRequestException('Choisissez une classe.');
      where.enrollments = { some: { classroomId: classroom.id, status: 'REGISTERED' } };
      label = `Classe ${classroom.name}`;
    } else if (audience === 'QURAN_CIRCLE') {
      let circle: string | null | undefined;
      try { circle = quranCircleValue(input.quranCircle); } catch (error: any) { throw new BadRequestException(error.message); }
      if (!circle) throw new BadRequestException('Choisissez une halkha coranique.');
      where.quranCircle = circle;
      label = circle;
    } else if (audience !== 'ALL') {
      throw new BadRequestException('Destinataires invalides.');
    }
    const students = await this.prisma.student.findMany({ where, select: { id: true, firstName: true, lastName: true }, orderBy: { lastName: 'asc' } });
    const byStudent = await this.recipientsByStudent(students.map(student => student.id));
    const byPhone = new Map<string, Recipient & { studentId: string; students: string[] }>();
    const skipped: string[] = [];
    for (const student of students) {
      const list = byStudent.get(student.id) || [];
      if (!list.length) skipped.push(studentName(student));
      for (const recipient of list) {
        const existing = byPhone.get(recipient.phone);
        if (existing) existing.students.push(studentName(student));
        else byPhone.set(recipient.phone, { ...recipient, studentId: student.id, students: [studentName(student)] });
      }
    }
    const text = messages.announcement(message);
    // Same text → same reference, so reopening the announcement shows who was already contacted.
    const referenceId = 'ANN-' + createHash('sha256').update(text).digest('hex').slice(0, 16);
    return { kind: 'ANNOUNCEMENT' as Kind, referenceId, label, text, studentCount: students.length, skippedCount: skipped.length, skippedStudents: skipped.slice(0, 50),
      recipients: await this.links('ANNOUNCEMENT', referenceId, text, [...byPhone.values()]) };
  }

  // ── Log of opened links ───────────────────────────────────────────────────────

  async logOpened(input: { kind?: string; referenceId?: string; phone?: string; studentId?: string; parentId?: string; message?: string }, actor: ActingUser) {
    const author = actorStamp(actor);
    const kind = String(input?.kind || '') as Kind;
    if (!MESSAGE_KINDS.includes(kind)) throw new BadRequestException('Type de message invalide.');
    const phone = whatsappNumber('+' + String(input?.phone || '').replace(/^\+/, ''));
    if (!phone) throw new BadRequestException('Numéro WhatsApp invalide.');
    const message = String(input?.message || '').slice(0, 4000);
    const referenceId = input?.referenceId ? String(input.referenceId).slice(0, 100) : null;
    const key = dedupeKey(kind, referenceId, phone);
    const actorData = { actorId: author.id, actorName: author.name, actorRole: author.role };
    await this.prisma.whatsAppMessageLog.upsert({
      where: { dedupeKey: key },
      create: { kind, referenceId, recipientPhone: phone, message, dedupeKey: key,
        studentId: input?.studentId ? String(input.studentId) : null, parentId: input?.parentId ? String(input.parentId) : null, ...actorData },
      update: { openCount: { increment: 1 }, openedAt: new Date(), message, ...actorData },
    });
    return { logged: true };
  }

  async journal(params: { kind?: string; studentId?: string }) {
    const where: Prisma.WhatsAppMessageLogWhereInput = {};
    if (params.kind) where.kind = String(params.kind);
    if (params.studentId) where.studentId = String(params.studentId);
    const rows = await this.prisma.whatsAppMessageLog.findMany({ where, orderBy: { openedAt: 'desc' }, take: 300 });
    const ids = [...new Set(rows.map(row => row.studentId).filter(Boolean) as string[])];
    const students = await this.prisma.student.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, matricule: true } });
    const byId = new Map(students.map(student => [student.id, student]));
    return rows.map(row => ({ ...row, student: row.studentId ? byId.get(row.studentId) || null : null }));
  }
}
