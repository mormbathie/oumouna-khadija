import { createHash, randomUUID } from 'node:crypto';
import { SchoolMailService } from './school-mail.service';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActingUser, actorStamp } from '../audit/actor';
import { cashDay, dayRange, openCashDay } from './cash-day';
import { Prisma } from '@prisma/client';

@Injectable()
export class FinanceControlService {
  constructor(private readonly prisma: PrismaService, private readonly mail?: SchoolMailService) {}
  private reason(value: unknown) {
    if (typeof value !== 'string' || value.trim().length < 10 || value.trim().length > 1000) throw new BadRequestException('Un motif de 10 à 1 000 caractères est obligatoire.');
    return value.trim();
  }
  async correctPayment(id: string, data: { amount: number; expectedAmount: number; expectedPaidAmount: number; reason: string }, actor: ActingUser) {
    if (!actor.roles?.includes('ADMIN')) throw new ForbiddenException('Seul un administrateur peut corriger un paiement.');
    const reason = this.reason(data?.reason), author = actorStamp(actor);
    if (![data.amount, data.expectedAmount, data.expectedPaidAmount].every(value => Number.isSafeInteger(value) && value > 0)) throw new BadRequestException('Montants entiers positifs requis.');
    return this.prisma.$transaction(async tx => {
      await openCashDay(tx, cashDay(new Date()));
      const original = await tx.payment.findUnique({ where: { id } });
      if (!original) throw new NotFoundException('Paiement introuvable.');
      await openCashDay(tx, cashDay(original.paymentDate));
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Invoice" WHERE id = ${original.invoiceId} FOR UPDATE`);
      const payment = await tx.payment.findUniqueOrThrow({ where: { id } });
      if (await tx.refund.count({ where: { paymentId: id } })) throw new BadRequestException('Ce paiement a un remboursement et ne peut pas être corrigé.');
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: payment.invoiceId } });
      if (payment.cancelledAt || invoice.cancelledAt) throw new BadRequestException('Cette écriture est annulée. Actualisez la page.');
      if (payment.amount !== data.expectedAmount || invoice.paidAmount !== data.expectedPaidAmount) throw new BadRequestException('La situation a changé. Actualisez la page avant de corriger le paiement.');
      if (payment.amount === data.amount) throw new BadRequestException('Le nouveau montant est identique au montant actuel.');
      const paidAmount = invoice.paidAmount - payment.amount + data.amount;
      if (paidAmount < 0 || paidAmount > invoice.amount) throw new BadRequestException('Le montant corrigé dépasse le montant restant de la facture.');
      const correctedAt = new Date();
      await tx.payment.update({ where: { id }, data: { cancelledAt: correctedAt, cancellationReason: reason, cancelledById: author.id, cancelledByName: author.name, cancelledByRole: author.role } });
      const replacement = await tx.payment.create({ data: {
        invoiceId: invoice.id, amount: data.amount, paymentDate: payment.paymentDate, paymentMethod: payment.paymentMethod,
        paymentNumber: 'REC-' + correctedAt.getFullYear() + '-' + randomUUID().toUpperCase(),
        reference: payment.reference, receivedBy: payment.receivedBy, receivedById: payment.receivedById, receivedByRole: payment.receivedByRole,
        notes: `Correction du reçu ${payment.paymentNumber}. ${reason}${payment.notes ? ' — ' + payment.notes : ''}`,
      } });
      const updated = await tx.invoice.update({ where: { id: invoice.id }, data: {
        paidAmount, balance: invoice.amount - paidAmount, status: paidAmount === invoice.amount ? 'PAID' : 'PARTIAL',
      }, include: { academicYear: true, payments: { orderBy: { paymentDate: 'desc' } }, student: { include: { parent: true, enrollments: { include: { classroom: true } } } } } });
      await tx.businessAudit.create({ data: {
        action: 'PAYMENT_CORRECTED', entityId: invoice.id, actorId: author.id, actorName: author.name, actorRole: author.role, reason,
        details: JSON.stringify({ originalPaymentId: payment.id, originalPaymentNumber: payment.paymentNumber, originalAmount: payment.amount,
          replacementPaymentId: replacement.id, replacementPaymentNumber: replacement.paymentNumber, correctedAmount: replacement.amount,
          previousPaidAmount: invoice.paidAmount, paidAmount, balance: updated.balance, originalCashier: payment.receivedBy }),
      } });
      return { ...updated, createdPayment: replacement };
    });
  }
  async correctionHistory(invoiceId: string) {
    return this.prisma.businessAudit.findMany({ where: { entityId: invoiceId, action: 'PAYMENT_CORRECTED' }, orderBy: { createdAt: 'desc' } });
  }
  async cancelPayment(id: string, input: unknown, actor: ActingUser) {
    const reason = this.reason(input), author = actorStamp(actor);
    return this.prisma.$transaction(async tx => {
      await openCashDay(tx, cashDay(new Date()));
      const payment = await tx.payment.findUnique({ where: { id } });
      if (!payment) throw new NotFoundException('Paiement introuvable.');
      await openCashDay(tx, cashDay(payment.paymentDate));
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Invoice" WHERE id = ${payment.invoiceId} FOR UPDATE`);
      const current = await tx.payment.findUniqueOrThrow({ where: { id } });
      if (await tx.refund.count({ where: { paymentId: id } })) throw new BadRequestException('Ce paiement a un remboursement et ne peut pas être annulé.');
      if (current.cancelledAt) return current;
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: current.invoiceId } });
      if (invoice.cancelledAt) throw new BadRequestException('Facture déjà annulée.');
      const paidAmount = invoice.paidAmount - current.amount;
      if (paidAmount < 0) throw new BadRequestException('Solde incohérent : faites vérifier la facture.');
      await tx.invoice.update({ where: { id: invoice.id }, data: { paidAmount, balance: invoice.amount - paidAmount, status: paidAmount === 0 ? 'UNPAID' : 'PARTIAL' } });
      const result = await tx.payment.update({ where: { id }, data: { cancelledAt: new Date(), cancellationReason: reason, cancelledById: author.id, cancelledByName: author.name, cancelledByRole: author.role } });
      await tx.businessAudit.create({ data: { action: 'PAYMENT_CANCELLED', entityId: id, actorId: author.id, actorName: author.name, actorRole: author.role, reason, details: JSON.stringify({ invoiceId: invoice.id, amount: current.amount, paymentNumber: current.paymentNumber }) } });
      return result;
    });
  }
  async cancelInvoice(id: string, input: unknown, actor: ActingUser) {
    const reason = this.reason(input), author = actorStamp(actor);
    return this.prisma.$transaction(async tx => {
      await openCashDay(tx, cashDay(new Date()));
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Invoice" WHERE id = ${id} FOR UPDATE`);
      const invoice = await tx.invoice.findUnique({ where: { id } });
      if (!invoice) throw new NotFoundException('Facture introuvable.');
      if (invoice.cancelledAt) return invoice;
      if (invoice.paidAmount !== 0 || await tx.payment.count({ where: { invoiceId: id, cancelledAt: null } })) throw new BadRequestException('Annulez les paiements de cette facture avant son annulation.');
      const result = await tx.invoice.update({ where: { id }, data: { cancelledAt: new Date(), cancellationReason: reason, cancelledById: author.id, cancelledByName: author.name, cancelledByRole: author.role, billingKey: null, balance: 0 } });
      await tx.businessAudit.create({ data: { action: 'INVOICE_CANCELLED', entityId: id, actorId: author.id, actorName: author.name, actorRole: author.role, reason, details: JSON.stringify({ amount: invoice.amount, invoiceNumber: invoice.invoiceNumber, billingKey: invoice.billingKey }) } });
      return result;
    });
  }
  private async summary(tx: Prisma.TransactionClient, day: string) {
    const payments = await tx.payment.findMany({ where: { paymentDate: dayRange(day), cancelledAt: null }, select: { amount: true, paymentMethod: true, receivedById: true, receivedBy: true } });
    const byMethod: Record<string, number> = {}, byCashier: Record<string, { name: string; total: number }> = {};
    for (const payment of payments) {
      byMethod[payment.paymentMethod] = (byMethod[payment.paymentMethod] || 0) + payment.amount;
      const key = payment.receivedById || payment.receivedBy || 'historique';
      byCashier[key] ||= { name: payment.receivedBy || 'Historique', total: 0 };
      byCashier[key].total += payment.amount;
    }
    const refunds = await tx.refund.findMany({ where: { refundedOn: dayRange(day) }, select: { amount: true, paymentMethod: true, actorId: true, actorName: true } });
    const refundedByMethod: Record<string, number> = {};
    for (const r of refunds) { refundedByMethod[r.paymentMethod] = (refundedByMethod[r.paymentMethod] || 0) + r.amount; }
    const gross = payments.reduce((sum, row) => sum + row.amount, 0), totalRefunded = refunds.reduce((sum, r) => sum + r.amount, 0);
    return { day, count: payments.length, gross, totalRefunded, total: gross - totalRefunded, expectedCash: (byMethod.CASH || 0) - (refundedByMethod.CASH || 0), byMethod, refundedByMethod, byCashier };
  }
  async preview(day: string) {
    dayRange(day);
    return this.prisma.$transaction(async tx => ({ ...await this.summary(tx, day), closing: await tx.cashClosing.findUnique({ where: { day } }) }));
  }
  async close(data: { day: string; countedCash: number; notes?: string }, actor: ActingUser) {
    const author = actorStamp(actor);
    if (!actor.roles?.some(role => ['ADMIN', 'DIRECTEUR'].includes(role))) throw new ForbiddenException('Seul un directeur ou administrateur peut valider la clôture.');
    dayRange(data.day);
    if (data.day > cashDay(new Date())) throw new BadRequestException('Une journée future ne peut pas être clôturée.');
    if (!Number.isFinite(data.countedCash) || data.countedCash < 0) throw new BadRequestException('Montant compté invalide.');
    return this.prisma.$transaction(async tx => {
      await openCashDay(tx, data.day);
      const summary = await this.summary(tx, data.day), difference = data.countedCash - summary.expectedCash;
      const notes = difference !== 0 ? this.reason(data.notes) : data.notes?.trim();
      const closing = await tx.cashClosing.create({ data: { day: data.day, countedCash: data.countedCash, expectedCash: summary.expectedCash, difference, summary: JSON.stringify(summary), notes, actorId: author.id, actorName: author.name, actorRole: author.role } });
      await tx.businessAudit.create({ data: { action: 'CASH_CLOSED', entityId: closing.id, actorId: author.id, actorName: author.name, actorRole: author.role, reason: notes, details: JSON.stringify(summary) } });
      return closing;
    });
  }
  async installments(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Facture introuvable.');
    const rows = await this.prisma.paymentInstallment.findMany({ where: { invoiceId }, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }] });
    if (rows.length && (rows[0].basePaidAmount > invoice.paidAmount || rows.reduce((sum,row)=>sum+row.amount,0) + rows[0].basePaidAmount !== invoice.amount)) return []; // Rebuild a plan after a refund or fee correction.
    let paid = Math.max(0, invoice.paidAmount - (rows[0]?.basePaidAmount || 0));
    return rows.map(row => { const covered = Math.min(row.amount, paid); paid -= covered; return { ...row, remaining: invoice.cancelledAt ? 0 : row.amount - covered }; });
  }
  async saveInstallments(id: string, input: { dueDate: string; amount: number }[], actor: ActingUser) {
    const author = actorStamp(actor);
    if (!Array.isArray(input) || input.length < 1 || input.length > 24) throw new BadRequestException('Prévoyez entre 1 et 24 échéances.');
    for (const row of input) {
      if (!row || typeof row.dueDate !== 'string') throw new BadRequestException('Échéance invalide.');
      dayRange(row.dueDate);
      if (!Number.isFinite(row.amount) || !Number.isInteger(row.amount) || row.amount <= 0) throw new BadRequestException('Montants entiers positifs requis.');
    }
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Invoice" WHERE id = ${id} FOR UPDATE`);
      const invoice = await tx.invoice.findUnique({ where: { id } });
      if (!invoice || invoice.cancelledAt || invoice.balance <= 0) throw new BadRequestException('Facture active avec solde à payer requise.');
      if (input.reduce((sum, row) => sum + row.amount, 0) !== invoice.balance) throw new BadRequestException('Le total des échéances doit égaler le reste à payer.');
      const previous = await tx.paymentInstallment.findMany({ where: { invoiceId: id } });
      await tx.paymentInstallment.deleteMany({ where: { invoiceId: id } });
      await tx.paymentInstallment.createMany({ data: input.map(row => ({ invoiceId: id, dueDate: new Date(row.dueDate + 'T00:00:00Z'), amount: row.amount, basePaidAmount: invoice.paidAmount })) });
      await tx.businessAudit.create({ data: { action: 'PAYMENT_PLAN_SAVED', entityId: id, actorId: author.id, actorName: author.name, actorRole: author.role, details: JSON.stringify({ previous, installments: input, basePaidAmount: invoice.paidAmount }) } });
      return { saved: true };
    });
  }
  async reminderPreview(id: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: { student: { include: { parent: true } } } });
    if (!invoice || invoice.cancelledAt || invoice.balance <= 0) throw new BadRequestException('Facture active avec solde à payer requise.');
    const email = invoice.student.parent?.email;
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BadRequestException('Le parent doit avoir une adresse e-mail valide.');
    const name = `${invoice.student.firstName} ${invoice.student.lastName}`;
    const subject = `Institut Oumouna Khadija — rappel ${invoice.invoiceNumber}`;
    const text = `Bonjour,\n\nUn solde de ${invoice.balance.toLocaleString('fr-FR')} F CFA reste à régler pour ${name}, facture ${invoice.invoiceNumber} (${invoice.title}), échéance ${invoice.dueDate.toISOString().slice(0,10)}.\n\nSi vous avez déjà effectué ce paiement, contactez la comptabilité.\n\nInstitut Oumouna Khadija\nhttps://oumounakhadidja-academie.com`;
    const approvalToken = createHash('sha256').update(JSON.stringify([email, subject, text])).digest('hex');
    return { email, subject, text, approvalToken, balance: invoice.balance, installments: await this.installments(id) };
  }
  async sendReminder(id: string, approved: boolean, actor: ActingUser, approvalToken?: string) {
    if (approved !== true) throw new BadRequestException('Validez l’envoi après avoir vérifié le destinataire et le message.');
    if (!this.mail) throw new BadRequestException('Service e-mail indisponible.');
    const author = actorStamp(actor), preview = await this.reminderPreview(id);
    if (approvalToken !== preview.approvalToken) throw new BadRequestException('Le message ou le destinataire a changé. Vérifiez à nouveau la relance avant l’envoi.');
    const billingKey = `${id}:${cashDay(new Date())}`;
    const attempt = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Invoice" WHERE id = ${id} FOR UPDATE`);
      const latest = await tx.invoice.findUniqueOrThrow({ where: { id } });
      if (latest.cancelledAt || latest.balance !== preview.balance) throw new BadRequestException('Le solde a changé. Vérifiez à nouveau la relance.');
      if (await tx.paymentReminder.findUnique({ where: { billingKey } })) throw new BadRequestException('Une relance a déjà été tentée aujourd’hui pour cette facture. Consultez l’historique avant un nouvel envoi.');
      return tx.paymentReminder.create({ data: { invoiceId: id, billingKey, actorId: author.id, actorName: author.name, actorRole: author.role } });
    });
    try {
      await this.mail.send(preview.email, preview.subject, preview.text);
      await this.prisma.paymentReminder.update({ where: { id: attempt.id }, data: { status: 'SENT', sentAt: new Date() } });
      return { sent: true };
    } catch {
      await this.prisma.paymentReminder.update({ where: { id: attempt.id }, data: { status: 'UNKNOWN', error: 'Envoi non confirmé. Vérifiez la messagerie avant toute nouvelle tentative.' } });
      throw new BadRequestException('L’envoi n’a pas pu être confirmé. Aucun nouvel essai automatique ne sera effectué.');
    }
  }
  async reminderHistory(id: string) { return this.prisma.paymentReminder.findMany({ where: { invoiceId: id }, orderBy: { createdAt: 'desc' }, take: 30 }); }
  async cancelledInvoices() { return this.prisma.invoice.findMany({ where: { cancelledAt: { not: null } }, include: { student: { select: { firstName: true, lastName: true, matricule: true } } }, orderBy: { cancelledAt: 'desc' }, take: 100 }); }
  async history() { return this.prisma.cashClosing.findMany({ orderBy: { day: 'desc' }, take: 100 }); }
}
