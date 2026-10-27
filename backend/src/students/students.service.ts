import { findOrCreateParent } from '../parents/parent-identity';
import { schoolFees, schoolOptions, validatePersonalOptions, validateProgramAge, validateOptionsForClass, registrationAdjustment, registrationSnapshot } from '../school/school-options';
import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DocumentsService } from '../documents/documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, Gender, StudentStatus, InvoiceType, InvoiceStatus, PaymentMethod } from '@prisma/client';
import { ActingUser, actorStamp } from '../audit/actor';
import { randomUUID } from 'node:crypto';
import { normalizeEmail } from '../common/email';
import { cashDay, dayRange, openCashDay } from '../finances/cash-day';

@Injectable()
export class StudentsService {
  constructor(private prisma: PrismaService, private readonly documents: DocumentsService) {}

  async findAll(params: { classId?: string; search?: string; status?: string; fullDay?: string }, requester: any) {
    const { classId, search, status, fullDay } = params;

    // A departure preserves the complete archive but removes the pupil from every active roster.
    // Departed pupils remain available from the dedicated "Départs et remboursements" register.
    const where: any = { departure: { is: null } };
    if (fullDay !== undefined) {
      if (!['true', 'false'].includes(fullDay)) throw new BadRequestException('Filtre journée continue invalide.');
      where.fullDay = fullDay === 'true';
    }

    if (status) {
      where.status = status as StudentStatus;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { matricule: { contains: search, mode: 'insensitive' } },
        { schoolMatricule: { contains: search, mode: 'insensitive' } },
      ];
    }

    const roles: string[] = requester?.roles || [];
    const isManager = roles.includes('ADMIN') || roles.includes('DIRECTEUR');
    const isTeacher = roles.includes('ENSEIGNANT') && !isManager;
    if (!isManager && roles.includes('PARENT') && !isTeacher) {
      if (!requester.email || !requester.emailVerified) throw new ForbiddenException('Vérifiez votre adresse e-mail pour accéder aux dossiers de vos enfants.');
      const ownership = { OR: [
        { parent: { is: { email: { equals: requester.email, mode: 'insensitive' } } } },
        { guardians: { some: { parent: { email: { equals: requester.email, mode: 'insensitive' } } } } },
      ] };
      where.AND = [...(where.AND || []), ownership];
    } else if (isTeacher) {
      if (!requester.email) return [];
      const assigned = await this.prisma.classroom.findMany({
        where: { teacher: { is: { email: requester.email } } },
        select: { id: true },
      });
      const classroomIds = assigned.map((item) => item.id);
      if (classroomIds.length === 0 || (classId && !classroomIds.includes(classId))) return [];
      where.enrollments = {
        some: { classroomId: classId ? classId : { in: classroomIds } },
      };
    } else if (classId) {
      where.enrollments = { some: { classroomId: classId } };
    }

    return this.prisma.student.findMany({
      where,
      include: {
        departure: true,
        parent: isTeacher
          ? { select: { id: true, firstName: true, lastName: true, phone: true, relation: true } }
          : true,
        guardians: { include: { parent: true }, orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }] },
        enrollments: {
          where: { academicYear: { isCurrent: true } },
          include: {
            classroom: true,
            academicYear: true,
          },
          orderBy: { enrollmentDate: 'desc' },
          take: 1,
        },
        ...(!isTeacher ? {
          invoices: {
            where: { cancelledAt: null },
            select: { amount: true, paidAmount: true, balance: true, status: true },
          },
        } : {}),
      },
      orderBy: { lastName: 'asc' },
    });
  }

  async findOne(id: string, requester: any) {
    const roles: string[] = requester?.roles || [];
    const isManager = roles.includes('ADMIN') || roles.includes('DIRECTEUR');
    const isTeacher = roles.includes('ENSEIGNANT') && !isManager;
    const isParent = !isManager && !isTeacher && roles.includes('PARENT');
    if (isParent && (!requester.email || !requester.emailVerified)) throw new ForbiddenException('Vérifiez votre adresse e-mail pour accéder aux dossiers de vos enfants.');
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: {
        departure: true,
        parent: isTeacher
          ? { select: { id: true, firstName: true, lastName: true, phone: true, relation: true } }
          : { include: { ...((isManager || isParent) ? { documents: { orderBy: { createdAt: 'desc' as const } } } : {}) } },
        guardians: { include: { parent: true }, orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }] },
        ...((isManager || isParent) ? { documents: { orderBy: { createdAt: 'desc' as const } } } : {}),
        enrollments: {
          include: { classroom: { include: { teacher: { select: { email: true } } } }, academicYear: true },
          orderBy: [{ academicYear: { isCurrent: 'desc' } }, { academicYear: { startDate: 'desc' } }],
        },
        ...(!isTeacher ? {
          invoices: { include: { payments: true }, orderBy: { createdAt: 'desc' } },
        } : {}),
        grades: {
          include: { subject: true },
          orderBy: { date: 'desc' },
        },
        reportCards: {
          include: { classroom: true },
          orderBy: { term: 'asc' },
        },
        attendances: {
          include: { classroom: { select: { name: true } } },
          orderBy: { date: 'desc' },
          take: 30,
        },
      },
    });

    if (!student) {
      throw new NotFoundException(`Élève avec l'ID ${id} non trouvé`);
    }

    const parentEmails = [student.parent, ...(student.guardians || []).map((item: any) => item.parent)]
      .map((parent: any) => String(parent?.email || '').toLowerCase());
    if (!isManager && roles.includes('PARENT') && !parentEmails.includes(String(requester.email || '').toLowerCase())) {
      throw new NotFoundException(`Élève avec l'ID ${id} non trouvé`);
    }
    if (!isManager && roles.includes('ENSEIGNANT') &&
        !student.enrollments.some((item) => item.classroom.teacher?.email === requester.email)) {
      throw new NotFoundException(`Élève avec l'ID ${id} non trouvé`);
    }
    if (roles.includes('COMPTABLE') && !isManager) {
      delete (student as any).documents;
      if (student.parent) delete (student.parent as any).documents;
    }

    const attendanceGroups = await this.prisma.attendance.groupBy({
      by: ['status'],
      where: { studentId: id },
      _count: { _all: true },
    });
    const attendanceSummary = {
      total: attendanceGroups.reduce((sum, group) => sum + group._count._all, 0),
      present: attendanceGroups.find((group) => group.status === 'PRESENT')?._count._all || 0,
      absent: attendanceGroups.find((group) => group.status === 'ABSENT')?._count._all || 0,
      late: attendanceGroups.find((group) => group.status === 'LATE')?._count._all || 0,
      excused: attendanceGroups.find((group) => group.status === 'EXCUSED')?._count._all || 0,
    };
    return { ...student, attendanceSummary, calculatedFees: student.enrollments[0] ? schoolFees(student, student.enrollments[0].classroom) : null };
  }

  async getPhoto(id: string, requester: any) {
    const roles: string[] = requester?.roles || [];
    const isManager = roles.includes('ADMIN') || roles.includes('DIRECTEUR');
    const isTeacher = roles.includes('ENSEIGNANT') && !isManager;
    const scannerOnly = roles.includes('CONTROLEUR_PRESENCE') &&
      !roles.some((role) => ['ADMIN', 'DIRECTEUR', 'COMPTABLE', 'ENSEIGNANT', 'PARENT'].includes(role));

    const student = await this.prisma.student.findUnique({
      where: { id },
      select: {
        id: true,
        parent: { select: { email: true } },
        enrollments: {
          select: { classroom: { select: { teacher: { select: { email: true } } } } },
        },
      },
    });
    if (!student) throw new NotFoundException('Élève introuvable.');

    if (!scannerOnly && !isManager && roles.includes('PARENT') && !isTeacher &&
        String(student.parent?.email || '').toLowerCase() !== String(requester.email || '').toLowerCase()) {
      throw new NotFoundException('Élève introuvable.');
    }
    if (!scannerOnly && isTeacher &&
        !student.enrollments.some((item) => item.classroom.teacher?.email === requester.email)) {
      throw new NotFoundException('Élève introuvable.');
    }
    return this.documents.studentPhoto(id);
  }

  private async findDuplicates(tx: Prisma.TransactionClient, data: any) {
    const name = (value: string) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
    const phone = (value: string) => String(value || '').replace(/\D/g, '').replace(/^(00221|221)(?=\d{9}$)/, '');
    const birth = new Date(data.dateOfBirth);
    if (!Number.isFinite(birth.getTime())) throw new BadRequestException('Date de naissance invalide.');
    const from = new Date(birth.toISOString().slice(0, 10) + 'T00:00:00.000Z');
    const to = new Date(from.getTime() + 86400000);
    const candidates = await tx.student.findMany({
      where: { dateOfBirth: { gte: from, lt: to } },
      include: { parent: { select: { id: true, phone: true } } },
    });
    const chosenParent = data.parentId ? await tx.parent.findUnique({ where: { id: data.parentId }, select: { phone: true } }) : null;
    const parentPhone = phone(chosenParent?.phone || data.parentData?.phone);
    return candidates.filter(row => name(row.firstName) === name(data.firstName) && name(row.lastName) === name(data.lastName) &&
      (data.parentId ? row.parentId === data.parentId || (!!parentPhone && phone(row.parent?.phone || '') === parentPhone)
        : parentPhone ? phone(row.parent?.phone || '') === parentPhone : !row.parentId))
      .map(row => ({ id: row.id, matricule: row.matricule, firstName: row.firstName, lastName: row.lastName }));
  }

  async create(data: {
    firstName: string;
    lastName: string;
    gender: Gender;
    dateOfBirth: string | Date;
    placeOfBirth?: string;
    address?: string;
    bloodGroup?: string;
    photoUrl?: string;
    schoolMatricule?: string;
    classroomId?: string;
    academicYearId?: string;
    parentId?: string;
    parentData?: {
      firstName: string;
      lastName: string;
      phone: string;
      email?: string;
      relation?: string;
      address?: string;
      profession?: string;
    };
    guardians?: Array<{ parentId?: string; relation?: string; data?: { firstName: string; lastName?: string; phone: string; email?: string; relation?: string; address?: string; profession?: string } }>;
    generateInvoice?: boolean;
    supplies?: boolean;
    fullDay?: boolean;
    transportZone?: number | null;
    karate?: boolean;
    eveningClasses?: boolean;
    hairCare?: boolean;
    pharmacyKit?: boolean;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    healthNotes?: string;
    schoolItemsProvided?: string;
    originClass?: string;
    quranLevel?: string;
    duplicateOverrideReason?: string;
  }, actor: ActingUser) {
    const author = actorStamp(actor);
    const schoolMatricule = String(data.schoolMatricule || '').trim() || null;
    if (schoolMatricule && schoolMatricule.length > 100) throw new BadRequestException('Le matricule école ne peut pas dépasser 100 caractères.');
    const options = schoolOptions(data as any);
    const selectedClass = data.classroomId ? await this.prisma.classroom.findUnique({ where: { id: data.classroomId }, }) : null;
    if (data.classroomId && !selectedClass) throw new BadRequestException('Classe sélectionnée introuvable.');
    validateProgramAge(selectedClass?.program, data.dateOfBirth);
    validateOptionsForClass(options, selectedClass);
    validatePersonalOptions({ ...options, gender: data.gender });
    const studentId = await this.prisma.$transaction(async (tx) => {
    // Generate matricule
    // Serialize registration numbering; deletion must never reuse a matricule.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261007)`;
    if (schoolMatricule && await tx.student.findFirst({ where: { schoolMatricule: { equals: schoolMatricule, mode: 'insensitive' } }, select: { id: true } })) {
      throw new ConflictException('Ce matricule historique est déjà attribué à un autre élève.');
    }
    const duplicates = await this.findDuplicates(tx, data);
    const reason = data.duplicateOverrideReason?.trim();
    if (duplicates.length && (!reason || reason.length < 10 || reason.length > 1000)) {
      throw new ConflictException({ message: 'Un dossier similaire existe déjà. Vérifiez le matricule avant de poursuivre. Pour un homonyme, indiquez un motif de dérogation (10 à 1 000 caractères).', duplicates });
    }
    const records = await tx.student.findMany({ select: { matricule: true } });
    const currentYear = new Date().getFullYear();
    const maximum = Math.max(0, ...records.map(row => { const match = row.matricule.match(new RegExp(`^OK-${currentYear}-(\\d+)$`)); return match ? Number(match[1]) : 0; }));
    const counter = await tx.registrationCounter.findUnique({ where: { year: currentYear } });
    const nextNumber = Math.max(maximum, counter?.value || 0) + 1;
    await tx.registrationCounter.upsert({ where: { year: currentYear }, update: { value: nextNumber }, create: { year: currentYear, value: nextNumber } });
    const matricule = `OK-${currentYear}-${String(nextNumber).padStart(4, '0')}`;

    let parentId = data.parentId;
    const guardianRows: Array<{ parentId: string; relation: string }> = [];

    for (const guardian of data.guardians || []) {
      let guardianParentId = guardian.parentId;
      if (!guardianParentId && guardian.data?.firstName?.trim() && guardian.data?.phone?.trim()) {
        const relation = guardian.relation || guardian.data.relation || 'Guardian';
        const parent = await findOrCreateParent(tx, { ...guardian.data, lastName: guardian.data.lastName?.trim() || data.lastName.trim(), relation, email: normalizeEmail(guardian.data.email) } as any);
        guardianParentId = parent.id;
      }
      if (guardianParentId && !guardianRows.some(row => row.parentId === guardianParentId)) {
        guardianRows.push({ parentId: guardianParentId, relation: guardian.relation || guardian.data?.relation || 'Guardian' });
      }
    }

    // Create parent if new parent data provided
    if (!parentId && data.parentData && data.parentData.firstName && data.parentData.phone) {
      const parent = await findOrCreateParent(tx, { ...data.parentData, email: normalizeEmail(data.parentData.email) });
      parentId = parent.id;
    }
    if (parentId && !guardianRows.some(row => row.parentId === parentId)) {
      guardianRows.unshift({ parentId, relation: data.parentData?.relation || 'Parent' });
    }
    if (!parentId && guardianRows.length) parentId = guardianRows[0].parentId;
    if (!parentId) throw new BadRequestException('Renseignez au moins un père, une mère ou un tuteur légal.');

    // Create student
    const student = await tx.student.create({
      data: {
        ...options,
        matricule,
        schoolMatricule,
        duplicateOverrideReason: duplicates.length ? reason : null,
        firstName: data.firstName,
        lastName: data.lastName,
        gender: data.gender,
        dateOfBirth: new Date(data.dateOfBirth),
        placeOfBirth: data.placeOfBirth,
        address: data.address,
        bloodGroup: data.bloodGroup,
        photoUrl: data.photoUrl,
        parentId,
        createdById: author.id,
        createdByName: author.name,
        createdByRole: author.role,
      },
      include: { parent: true },
    });
    if (guardianRows.length) await tx.studentGuardian.createMany({ data: guardianRows.map((guardian, index) => ({ studentId: student.id, parentId: guardian.parentId, relation: guardian.relation, isPrimary: index === 0 })) });

    // Handle Enrollment if classroomId provided
    if (data.classroomId) {
      let academicYearId = data.academicYearId;
      if (!academicYearId) {
        const currentYearRecord = await tx.academicYear.findFirst({
          where: { isCurrent: true },
        });
        academicYearId = currentYearRecord?.id;
      }

      if (academicYearId) {
        await tx.enrollment.create({
          data: {
            studentId: student.id,
            classroomId: data.classroomId,
            academicYearId,
            status: 'REGISTERED',
            registeredById: author.id,
            registeredByName: author.name,
            registeredByRole: author.role,
          },
        });

        // Generate Registration invoice if requested
        if (data.generateInvoice !== false) {
          const classroom = await tx.classroom.findUnique({
            where: { id: data.classroomId },
          });

          if (classroom) {
            await tx.invoice.create({
              data: {
                invoiceNumber: `FAC-${currentYear}-${randomUUID().toUpperCase()}`,
                studentId: student.id,
                academicYearId,
                title: `Inscription - ${classroom.name}`,
                type: InvoiceType.REGISTRATION,
                registrationOptions: registrationSnapshot(student),
                amount: schoolFees(student, classroom).registrationFee,
                paidAmount: 0,
                balance: schoolFees(student, classroom).registrationFee,
                dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // in 15 days
                status: InvoiceStatus.UNPAID,
                createdById: author.id,
                createdByName: author.name,
                createdByRole: author.role,
              },
            });
          }
        }
      }
    }

    if (duplicates.length) await tx.businessAudit.create({ data: {
      action: 'STUDENT_DUPLICATE_OVERRIDE', entityId: student.id,
      actorId: author.id, actorName: author.name, actorRole: author.role,
      reason, details: JSON.stringify({ existingIds: duplicates.map(row => row.id) }),
    } });
    return student.id;
    });

    return this.findOne(studentId, { roles: ['ADMIN', 'DIRECTEUR'] });
  }

  async quote(data: any) {
    const classroom = await this.prisma.classroom.findUnique({ where: { id: data.classroomId || '' } });
    if (!classroom) throw new BadRequestException('Choisissez une classe.');
    const options = schoolOptions(data);
    validateOptionsForClass(options, classroom);
    const fees = schoolFees(options, classroom);
    if (!data.studentId) return fees;
    const current = await this.prisma.student.findUnique({ where: { id: data.studentId }, include: {
      enrollments: { where: { academicYear: { isCurrent: true } }, take: 1, include: { classroom: true } },
    } });
    if (!current) throw new NotFoundException('Élève introuvable.');
    const enrollment = current.enrollments[0];
    const invoices = enrollment ? await this.prisma.invoice.findMany({ where: { studentId: current.id, academicYearId: enrollment.academicYearId, type: InvoiceType.REGISTRATION, cancelledAt: null } }) : [];
    if (invoices.length > 1) throw new BadRequestException('Plusieurs factures d’inscription existent : faites vérifier le dossier.');
    const invoice = invoices[0];
    const adjustment = enrollment && invoice ? registrationAdjustment(current, { ...current, ...options }, enrollment.classroom, classroom, invoice) : null;
    const projectedAmount = adjustment ? adjustment.registrationFee - Number(invoice?.discountAmount || 0) : null;
    return { ...fees, projectedAmount, paidAmount: invoice?.paidAmount ?? null,
      projectedBalance: projectedAmount === null ? null : Math.max(0, projectedAmount - (invoice?.paidAmount || 0)) };
  }

  async applyRegistrationDiscount(studentId: string, data: { invoiceId?: string; amount?: number; type?: string; reason?: string }, actor: ActingUser) {
    const author = actorStamp(actor);
    const amount = Number(data.amount);
    if (!Number.isInteger(amount) || amount < 0) throw new BadRequestException('Le montant de la réduction doit être un nombre entier positif ou zéro.');
    const type = String(data.type || '').trim();
    if (amount > 0 && !['DISCOUNT', 'SOCIAL_CASE'].includes(type)) throw new BadRequestException('Choisissez « réduction accordée » ou « cas social ».');
    const reason = String(data.reason || '').trim();
    if (amount > 0 && (reason.length < 10 || reason.length > 1000)) throw new BadRequestException('La justification doit contenir entre 10 et 1 000 caractères.');
    if (!data.invoiceId) throw new BadRequestException('Facture d’inscription manquante.');

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Invoice" WHERE id = ${data.invoiceId} FOR UPDATE`);
      const invoice = await tx.invoice.findFirst({ where: { id: data.invoiceId, studentId, type: InvoiceType.REGISTRATION, cancelledAt: null } });
      if (!invoice) throw new NotFoundException('Facture d’inscription introuvable.');
      if (Number(invoice.discountRefundedAmount || 0) > 0) throw new BadRequestException('Cette réduction ne peut plus être modifiée car le remboursement au parent a déjà été enregistré.');
      const previousDiscount = Number(invoice.discountAmount || 0);
      const grossAmount = Number(invoice.grossAmount ?? invoice.amount + previousDiscount);
      if (amount > grossAmount) throw new BadRequestException('La réduction ne peut pas dépasser le montant normal de l’inscription.');
      const netAmount = grossAmount - amount;
      const balance = Math.max(0, netAmount - invoice.paidAmount);
      const refundDue = Math.max(0, invoice.paidAmount - netAmount);
      await tx.invoice.update({ where: { id: invoice.id }, data: {
        grossAmount, amount: netAmount, balance,
        discountAmount: amount,
        discountType: amount ? type : null,
        discountReason: amount ? reason : null,
        discountApprovedAt: amount ? new Date() : null,
        discountApprovedById: amount ? author.id : null,
        discountApprovedByName: amount ? author.name : null,
        discountRefundDue: refundDue,
        status: balance === 0 ? InvoiceStatus.PAID : invoice.paidAmount > 0 ? InvoiceStatus.PARTIAL : InvoiceStatus.UNPAID,
      } });
      await tx.businessAudit.create({ data: {
        action: amount ? 'REGISTRATION_DISCOUNT_APPROVED' : 'REGISTRATION_DISCOUNT_REMOVED', entityId: invoice.id,
        actorId: author.id, actorName: author.name, actorRole: author.role, reason: reason || 'Réduction retirée par le directeur.',
        details: JSON.stringify({ studentId, invoiceNumber: invoice.invoiceNumber, grossAmount, previousDiscount, discountAmount: amount, netAmount, refundDue, type: amount ? type : null }),
      } });
    });
    return this.findOne(studentId, { roles: ['ADMIN', 'DIRECTEUR'] });
  }

  async refundRegistrationDiscount(studentId: string, data: { invoiceId?: string; refundedOn?: string; paymentMethod?: PaymentMethod; recipient?: string; requestKey?: string }, actor: ActingUser) {
    if (!actor?.roles?.includes('COMPTABLE')) throw new ForbiddenException('Cette action est réservée au comptable.');
    const author = actorStamp(actor);
    const invoiceId = String(data.invoiceId || '').trim();
    const recipient = String(data.recipient || '').trim();
    const requestKey = String(data.requestKey || '').trim();
    const refundedOnText = String(data.refundedOn || '').trim();
    if (!invoiceId) throw new BadRequestException('Facture d’inscription manquante.');
    if (recipient.length < 2 || recipient.length > 150) throw new BadRequestException('Le bénéficiaire doit contenir entre 2 et 150 caractères.');
    if (requestKey.length < 16 || requestKey.length > 80) throw new BadRequestException('Référence de demande invalide.');
    dayRange(refundedOnText);
    if (refundedOnText > cashDay(new Date())) throw new BadRequestException('La date ne peut pas être future.');
    if (!Object.values(PaymentMethod).includes(data.paymentMethod as PaymentMethod)) throw new BadRequestException('Mode de remboursement invalide.');
    const refundedOn = new Date(refundedOnText + 'T00:00:00Z');

    await this.prisma.$transaction(async tx => {
      await openCashDay(tx, refundedOnText);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE`);
      const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, studentId, type: InvoiceType.REGISTRATION, cancelledAt: null }, include: { payments: { where: { cancelledAt: null }, include: { refunds: true }, orderBy: { paymentDate: 'asc' } } } });
      if (!invoice) throw new NotFoundException('Facture d’inscription introuvable.');
      const alreadyRefunded = Number(invoice.discountRefundedAmount || 0);
      const remaining = Number(invoice.discountRefundDue || 0) - alreadyRefunded;
      if (remaining <= 0) throw new BadRequestException('Aucun remboursement de réduction n’est en attente.');
      if (await tx.refund.findFirst({ where: { requestKey: { startsWith: requestKey + '-' } } })) throw new ConflictException('Cette remise au parent a déjà été enregistrée.');
      let toAllocate = remaining;
      let index = 0;
      const createdIds: string[] = [];
      for (const payment of invoice.payments) {
        if (cashDay(payment.paymentDate) > refundedOnText) continue;
        const refunded = payment.refunds.reduce((sum, item) => sum + item.amount, 0);
        const amount = Math.min(toAllocate, payment.amount - refunded);
        if (amount <= 0) continue;
        const refund = await tx.refund.create({ data: {
          paymentId: payment.id, amount, refundedOn, paymentMethod: data.paymentMethod as PaymentMethod,
          reason: `Remboursement de la réduction d’inscription ${invoice.invoiceNumber}`, recipient,
          mode: 'REFUND_RECORDED', requestKey: `${requestKey}-${index++}`,
          refundNumber: 'REM-' + refundedOnText.slice(0, 4) + '-' + randomUUID().toUpperCase(),
          actorId: author.id, actorName: author.name, actorRole: author.role,
        } });
        createdIds.push(refund.id);
        toAllocate -= amount;
        if (toAllocate === 0) break;
      }
      if (toAllocate > 0) throw new BadRequestException('Les paiements encaissés ne permettent pas de rembourser la totalité du trop-perçu.');
      await tx.invoice.update({ where: { id: invoice.id }, data: { discountRefundedAmount: alreadyRefunded + remaining, discountRefundedAt: refundedOn, discountRefundedById: author.id, discountRefundedByName: author.name } });
      await tx.businessAudit.create({ data: { action: 'REGISTRATION_DISCOUNT_REFUNDED', entityId: invoice.id, actorId: author.id, actorName: author.name, actorRole: author.role,
        reason: `Trop-perçu remis à ${recipient}.`, details: JSON.stringify({ studentId, invoiceNumber: invoice.invoiceNumber, amount: remaining, refundedOn: refundedOnText, paymentMethod: data.paymentMethod, refundIds: createdIds }) } });
    }, { timeout: 15000 });
    return this.findOne(studentId, { roles: ['COMPTABLE'] });
  }

  async update(id: string, data: any, actor: ActingUser) {
    const author = actorStamp(actor);
    const existing = await this.prisma.student.findUnique({ where: { id }, select: { id: true, parentId: true, dateOfBirth: true, enrollments: { where: { academicYear: { isCurrent: true } }, take: 1, select: { academicYearId: true, classroom: { select: { id: true, name: true, level: true, program: true, registrationFee: true, monthlyTuition: true } } } } } });
    if (!existing) throw new NotFoundException(`Élève avec l'ID ${id} non trouvé`);

    const nextClass = data.classroomId ? await this.prisma.classroom.findUnique({ where: { id: data.classroomId }, select: { program: true } }) : null;
    if (data.classroomId && !nextClass) throw new BadRequestException('Classe sélectionnée introuvable.');
    validateProgramAge(nextClass?.program || existing.enrollments[0]?.classroom?.program, data.dateOfBirth || existing.dateOfBirth);
    const studentData: any = schoolOptions(data);
    studentData.updatedById = author.id;
    studentData.updatedByName = author.name;
    for (const field of ['firstName', 'lastName', 'gender', 'placeOfBirth', 'address', 'bloodGroup', 'status', 'photoUrl']) {
      if (data[field] !== undefined) studentData[field] = data[field];
    }
    if (data.schoolMatricule !== undefined) {
      const value = String(data.schoolMatricule || '').trim();
      if (value.length > 100) throw new BadRequestException('Le matricule école ne peut pas dépasser 100 caractères.');
      if (value && await this.prisma.student.findFirst({ where: { id: { not: id }, schoolMatricule: { equals: value, mode: 'insensitive' } }, select: { id: true } })) {
        throw new ConflictException('Ce matricule historique est déjà attribué à un autre élève.');
      }
      studentData.schoolMatricule = value || null;
    }
    if (data.dateOfBirth !== undefined) studentData.dateOfBirth = new Date(data.dateOfBirth);

    if (Object.keys(studentData).length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM "Student" WHERE id = ${id} FOR UPDATE`);
        const current = await tx.student.findUnique({ where: { id }, include: { enrollments: { where: { academicYear: { isCurrent: true } }, take: 1, include: { classroom: true } } } });
        if (!current) throw new NotFoundException('Élève introuvable.');
        if (await tx.studentDeparture.findUnique({ where: { studentId: id } })) throw new BadRequestException('Ce dossier est conservé après un départ et ne peut plus être modifié ici.');
        const enrollment = current.enrollments[0];
        const classroom = data.classroomId ? await tx.classroom.findUnique({ where: { id: data.classroomId } }) : enrollment?.classroom;
        const next = { ...current, ...studentData };
        validatePersonalOptions(next);
        const billingChanged = Boolean(data.classroomId) || ['eveningClasses','hairCare','pharmacyKit'].some(key => data[key] !== undefined && (current[key] || false) !== (next[key] || false));
        if (billingChanged) validateOptionsForClass(next, classroom);
        if (billingChanged && enrollment && classroom) {
          // Lock invoices before reading their paid amounts: simultaneous cash receipts remain safe.
          await tx.$queryRaw(Prisma.sql`SELECT id FROM "Invoice" WHERE "studentId" = ${id} AND "academicYearId" = ${enrollment.academicYearId} AND type = 'REGISTRATION' FOR UPDATE`);
          const invoices = await tx.invoice.findMany({ where: { studentId: id, academicYearId: enrollment.academicYearId, type: InvoiceType.REGISTRATION, cancelledAt: null } });
          if (invoices.length > 1) throw new BadRequestException('Plusieurs factures d’inscription existent : faites vérifier le dossier avant de changer les options.');
          const invoice = invoices[0];
          if (invoice) {
            const adjustment = registrationAdjustment(current, next, enrollment.classroom, classroom, invoice);
            const discountAmount = Number(invoice.discountAmount || 0);
            const grossAmount = adjustment.registrationFee;
            const amount = grossAmount - discountAmount;
            if (amount < invoice.paidAmount || amount < 0) throw new BadRequestException('La modification ferait passer le montant dû sous les paiements encaissés. Une régularisation comptable est nécessaire.');
            const balance = amount - invoice.paidAmount;
            await tx.invoice.update({ where: { id: invoice.id }, data: { grossAmount, amount, balance, registrationOptions: adjustment.registrationOptions,
              status: balance === 0 ? InvoiceStatus.PAID : invoice.paidAmount > 0 ? InvoiceStatus.PARTIAL : InvoiceStatus.UNPAID } });
          }
        }
        if (data.parentData) {
          const parentData: any = {};
          for (const field of ['firstName', 'lastName', 'phone', 'email', 'address', 'profession', 'relation']) {
            if (data.parentData[field] !== undefined) {
              const value = typeof data.parentData[field] === 'string' ? data.parentData[field].trim() : data.parentData[field];
              if (['firstName', 'lastName', 'phone'].includes(field) && !value) continue;
              parentData[field] = value || null;
            }
          }
          if (current.parentId) {
            if (parentData.email !== undefined) parentData.email = normalizeEmail(parentData.email);
            await tx.parent.update({ where: { id: current.parentId }, data: parentData });
          } else if (parentData.firstName && parentData.phone) {
            if (parentData.email !== undefined) parentData.email = normalizeEmail(parentData.email);
            const parent = await findOrCreateParent(tx, parentData);
            studentData.parentId = parent.id;
          }
        }
        if (Array.isArray(data.guardians)) {
          const primaryParentId = studentData.parentId || current.parentId;
          const guardianRows: Array<{ parentId: string; relation: string; isPrimary: boolean }> = [];
          if (primaryParentId) guardianRows.push({ parentId: primaryParentId, relation: data.parentData?.relation || 'Parent', isPrimary: true });
          for (const guardian of data.guardians) {
            let guardianParentId = guardian.parentId;
            if (!guardianParentId && guardian.data?.firstName?.trim() && guardian.data?.phone?.trim()) {
              const relation = guardian.relation || guardian.data.relation || 'Guardian';
              const parent = await findOrCreateParent(tx, { ...guardian.data, lastName: guardian.data.lastName?.trim() || next.lastName, relation, email: normalizeEmail(guardian.data.email) } as any);
              guardianParentId = parent.id;
            }
            if (guardianParentId && !guardianRows.some(row => row.parentId === guardianParentId)) guardianRows.push({ parentId: guardianParentId, relation: guardian.relation || guardian.data?.relation || 'Guardian', isPrimary: false });
          }
          if (!guardianRows.length) throw new BadRequestException('Renseignez au moins un père, une mère ou un tuteur légal.');
          await tx.studentGuardian.deleteMany({ where: { studentId: id } });
          await tx.studentGuardian.createMany({ data: guardianRows.map(row => ({ ...row, studentId: id })) });
        }

        await tx.student.update({ where: { id }, data: studentData });
        if (data.classroomId && classroom) {
          await tx.enrollment.upsert({ where: { studentId_academicYearId: { studentId: id, academicYearId: classroom.academicYearId } },
            update: { classroomId: classroom.id, status: 'REGISTERED', registeredById: author.id, registeredByName: author.name, registeredByRole: author.role },
            create: { studentId: id, classroomId: classroom.id, academicYearId: classroom.academicYearId, status: 'REGISTERED', registeredById: author.id, registeredByName: author.name, registeredByRole: author.role } });
        }
      });
    }

    return this.findOne(id, { roles: ['ADMIN', 'DIRECTEUR'] });
  }

  async enroll(data: { studentId: string; classroomId: string; academicYearId: string }, actor: ActingUser) {
    const author = actorStamp(actor);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Student" WHERE id = ${data.studentId} FOR UPDATE`);
      const [student, classroom] = await Promise.all([
        tx.student.findUnique({ where: { id: data.studentId }, select: { dateOfBirth: true, karate: true, fullDay: true, supplies: true } }),
        tx.classroom.findUnique({ where: { id: data.classroomId } }),
      ]);
      if (!student || !classroom) throw new NotFoundException('Élève ou classe introuvable.');
      if (classroom.academicYearId !== data.academicYearId) throw new BadRequestException('La classe ne correspond pas à l’année scolaire.');
      validateProgramAge(classroom.program, student.dateOfBirth);
      validateOptionsForClass(student, classroom);
      if (await tx.studentDeparture.findUnique({ where: { studentId: data.studentId } })) throw new BadRequestException('Cet élève a quitté l’établissement.');
      return tx.enrollment.upsert({
        where: { studentId_academicYearId: { studentId: data.studentId, academicYearId: data.academicYearId } },
        update: { classroomId: data.classroomId, status: 'REGISTERED', registeredById: author.id, registeredByName: author.name, registeredByRole: author.role },
        create: { ...data, status: 'REGISTERED', registeredById: author.id, registeredByName: author.name, registeredByRole: author.role },
      });
    });
  }

  async remove(id: string) {
    // No financial or school history may disappear through a dossier deletion.
    throw new BadRequestException('La suppression des dossiers est désactivée. Utilisez Départs et remboursements pour conserver l’historique.');
  }
}
