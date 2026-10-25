import { cashDay, openCashDay } from './cash-day';
import { schoolFees, optionTariffs } from '../school/school-options';
import { Inject, Injectable, NotFoundException, BadRequestException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, InvoiceStatus, InvoiceType, PaymentMethod } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ActingUser, actorStamp } from '../audit/actor';
import { FINANCIAL_PDF, SCHOOL_MAIL } from './mail.tokens';
import type { MailSender, PdfCreator } from './mail.tokens';

@Injectable()
export class FinancesService {
  constructor(private prisma: PrismaService, @Optional() @Inject(SCHOOL_MAIL) private readonly mail?: MailSender, @Optional() @Inject(FINANCIAL_PDF) private readonly pdf?: PdfCreator) {}

  private async emailDocument(invoice: any, payment?: any) {
    const email = invoice?.student?.parent?.email?.trim();
    if (!email) return { sent: false, reason: 'NO_PARENT_EMAIL' };
    if (!this.mail || !this.pdf) throw new ServiceUnavailableException('Service e-mail indisponible.');
    const kind = payment ? 'reçu' : 'facture';
    const reference = payment?.paymentNumber || invoice.invoiceNumber;
    const content = await this.pdf.create(invoice, payment);
    await this.mail.send(email, `${kind === 'reçu' ? 'Reçu' : 'Facture'} ${reference} — Institut Oumouna Khadija`,
      `Bonjour,\n\nVeuillez trouver en pièce jointe ${kind} ${reference} concernant ${invoice.student.firstName} ${invoice.student.lastName}.\n\nInstitut Oumouna Khadija`,
      [{ filename: `${kind}-${reference}.pdf`, content, contentType: 'application/pdf' }]);
    return { sent: true, recipient: email };
  }

  async emailInvoice(id: string) { return this.emailDocument(await this.getInvoice(id)); }

  async emailReceipt(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { invoice: { include: { student: { include: { parent: true, enrollments: { include: { classroom: true } } } }, academicYear: true, payments: { orderBy: { paymentDate: 'desc' } } } } } });
    if (!payment || payment.cancelledAt || payment.invoice.cancelledAt) throw new NotFoundException('Reçu introuvable ou annulé.');
    return this.emailDocument(payment.invoice, payment);
  }

  async getInvoices(params: {
    studentId?: string;
    classroomId?: string;
    status?: string;
    type?: string;
    academicYearId?: string;
    category?: string;
  }) {
    const { studentId, classroomId, status, type, academicYearId, category } = params;

    const where: any = { cancelledAt: null };

    if (category) where.category = category;
    if (studentId) where.studentId = studentId;
    if (status) where.status = status as InvoiceStatus;
    if (type) where.type = type as InvoiceType;
    if (academicYearId) where.academicYearId = academicYearId;

    if (classroomId) {
      where.student = {
        enrollments: {
          some: { classroomId },
        },
      };
    }

    return this.prisma.invoice.findMany({
      where,
      include: {
        student: {
          include: {
            parent: true,
            enrollments: {
              include: { classroom: true },
              take: 1,
            },
          },
        },
        payments: {
          orderBy: { paymentDate: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getInvoice(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        student: {
          include: {
            parent: true,
            enrollments: {
              include: { classroom: true },
            },
          },
        },
        payments: {
          orderBy: { paymentDate: 'desc' },
        },
        academicYear: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Facture avec l'ID ${id} non trouvée`);
    }

    return invoice;
  }

  async createInvoice(data: {
    studentId: string;
    academicYearId?: string;
    title: string;
    type: InvoiceType;
    amount: number;
    dueDate: string | Date;
  }, actor: ActingUser) {
    const author = actorStamp(actor);
    let academicYearId = data.academicYearId;
    if (!academicYearId) {
      const currentYear = await this.prisma.academicYear.findFirst({
        where: { isCurrent: true },
      });
      academicYearId = currentYear?.id;
    }

    if (!academicYearId) {
      throw new BadRequestException('Année académique non définie');
    }

    const year = new Date().getFullYear();
    const invoiceNumber = `FAC-${year}-${randomUUID().toUpperCase()}`;

    return this.prisma.invoice.create({
      data: {
        invoiceNumber,
        studentId: data.studentId,
        academicYearId,
        title: data.title,
        type: data.type,
        amount: data.amount,
        paidAmount: 0,
        balance: data.amount,
        dueDate: new Date(data.dueDate),
        status: InvoiceStatus.UNPAID,
        createdById: author.id,
        createdByName: author.name,
        createdByRole: author.role,
      },
      include: { student: true },
    });
  }

  async recordPayment(data: {
    invoiceId: string;
    amount: number;
    paymentMethod: PaymentMethod;
    reference?: string;
    notes?: string;
    paymentDate?: string | Date;
  }, actor: ActingUser) {
    const author = actorStamp(actor);
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: data.invoiceId },
    });

    if (!invoice) {
      throw new NotFoundException(`Facture avec l'ID ${data.invoiceId} introuvable`);
    }

    if (data.paymentDate && !Number.isFinite(new Date(data.paymentDate).getTime())) throw new BadRequestException('Date de paiement invalide.');
    if (!Object.values(PaymentMethod).includes(data.paymentMethod)) throw new BadRequestException('Mode de paiement invalide.');
    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      throw new BadRequestException('Le montant du paiement doit être un nombre supérieur à zéro');
    }

    if (invoice.cancelledAt) throw new BadRequestException('Cette facture est annulée.');
    if (data.amount > invoice.balance) {
      throw new BadRequestException(
        `Le montant (${data.amount}) dépasse le solde restant (${invoice.balance})`,
      );
    }

    const year = new Date().getFullYear();
    const paymentNumber = 'REC-' + year + '-' + randomUUID().slice(0, 8).toUpperCase();

    const result = await this.prisma.$transaction(async (tx) => {
      await openCashDay(tx, cashDay(data.paymentDate ? new Date(data.paymentDate) : new Date()));
      const updated = await tx.invoice.updateMany({
        where: { id: invoice.id, cancelledAt: null, balance: { gte: data.amount } },
        data: {
          paidAmount: { increment: data.amount },
          balance: { decrement: data.amount },
        },
      });

      if (updated.count !== 1) {
        throw new BadRequestException('Le solde de cette facture a changé. Actualisez la page avant de réessayer.');
      }

      const payment = await tx.payment.create({
        data: {
          paymentNumber,
          invoiceId: invoice.id,
          amount: data.amount,
          paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
          paymentMethod: data.paymentMethod,
          reference: data.reference,
          receivedBy: author.name,
          receivedById: author.id,
          receivedByRole: author.role,
          notes: data.notes,
        },
      });

      const include = {
        student: {
          include: {
            parent: true,
            enrollments: { include: { classroom: true } },
          },
        },
        payments: { orderBy: { paymentDate: 'desc' as const } },
        academicYear: true,
      };
      const updatedInvoice = await tx.invoice.findUnique({ where: { id: invoice.id }, include });
      if (!updatedInvoice) throw new NotFoundException('Facture introuvable après l’enregistrement du paiement.');

      const status = updatedInvoice.balance <= 0
        ? InvoiceStatus.PAID
        : updatedInvoice.paidAmount > 0
          ? InvoiceStatus.PARTIAL
          : InvoiceStatus.UNPAID;
      const invoiceWithStatus = await tx.invoice.update({
        where: { id: invoice.id },
        data: { status },
        include,
      });

      return { ...invoiceWithStatus, createdPayment: payment };
    });
    let emailDelivery: any = { sent: false, reason: 'NO_PARENT_EMAIL' };
    try { emailDelivery = await this.emailDocument(result, result.createdPayment); }
    catch { emailDelivery = { sent: false, reason: 'DELIVERY_FAILED' }; }
    return { ...result, emailDelivery };
  }

  async settleBatch(data: {
    invoices: { id: string; balance: number }[];
    paymentMethod: PaymentMethod;
    reference?: string;
    notes?: string;
  }, actor: ActingUser) {
    if (!Array.isArray(data.invoices) || !data.invoices.length || data.invoices.length > 1000) {
      throw new BadRequestException('Sélectionnez entre 1 et 1 000 factures.');
    }
    if (!Object.values(PaymentMethod).includes(data.paymentMethod)) throw new BadRequestException('Mode de paiement invalide.');
    if (data.invoices.some(item => !item || typeof item.id !== 'string' || !item.id || !Number.isSafeInteger(item.balance) || item.balance <= 0)
      || new Set(data.invoices.map(item => item.id)).size !== data.invoices.length) {
      throw new BadRequestException('Sélection de factures invalide.');
    }
    if ([data.reference, data.notes].some(value => value !== undefined && (typeof value !== 'string' || value.length > 1000))) {
      throw new BadRequestException('Référence ou notes invalides (1 000 caractères maximum).');
    }
    const author = actorStamp(actor);
    const paymentDate = new Date();
    const batchId = randomUUID();
    return this.prisma.$transaction(async tx => {
      await openCashDay(tx, cashDay(paymentDate));
      const payments: { invoiceId: string; paymentId: string; paymentNumber: string; amount: number }[] = [];
      // Stable order and exact approved balances prevent stale selections and double payment.
      for (const item of [...data.invoices].sort((a, b) => a.id.localeCompare(b.id))) {
        const updated = await tx.invoice.updateMany({
          where: { id: item.id, cancelledAt: null, balance: item.balance },
          data: { paidAmount: { increment: item.balance }, balance: 0, status: InvoiceStatus.PAID },
        });
        if (updated.count !== 1) throw new BadRequestException('Une facture a changé ou est déjà réglée. Aucun paiement du lot n’a été enregistré. Actualisez la page.');
        const payment = await tx.payment.create({ data: {
          invoiceId: item.id, amount: item.balance, paymentDate, paymentMethod: data.paymentMethod,
          paymentNumber: 'REC-' + paymentDate.getFullYear() + '-' + randomUUID().toUpperCase(),
          reference: data.reference, notes: data.notes,
          receivedBy: author.name, receivedById: author.id, receivedByRole: author.role,
        } });
        payments.push({ invoiceId: item.id, paymentId: payment.id, paymentNumber: payment.paymentNumber, amount: item.balance });
      }
      const total = payments.reduce((sum, payment) => sum + payment.amount, 0);
      await tx.businessAudit.create({ data: {
        action: 'PAYMENT_BATCH_SETTLED', entityId: batchId,
        actorId: author.id, actorName: author.name, actorRole: author.role,
        details: JSON.stringify({ payments, total, paymentMethod: data.paymentMethod }),
      } });
      return { batchId, count: payments.length, total, payments };
    }, { timeout: 30000 });
  }

  async generateTuitionInvoicesForClass(data: {
    classroomId: string;
    monthName: string;
    dueDate: string | Date;
    academicYearId?: string;
  }, actor: ActingUser) {
    const author = actorStamp(actor);
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: data.classroomId },
      include: {
        enrollments: {
          where: { status: 'REGISTERED', student: { status: 'ACTIVE' } },
          include: { student: true },
        },
      },
    });

    if (!classroom) {
      throw new NotFoundException(`Classe avec l'ID ${data.classroomId} non trouvée`);
    }

    let academicYearId = data.academicYearId || classroom.academicYearId;
    const year = new Date().getFullYear();
    let createdCount = 0;

    for (const enrollment of classroom.enrollments) {
      const created = await this.prisma.$transaction(async tx => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM "Student" WHERE id = ${enrollment.studentId} FOR UPDATE`);
        const active = await tx.student.findUnique({ where: { id: enrollment.studentId } });
        const registered = await tx.enrollment.findUnique({ where: { id: enrollment.id } });
        if (!active || active.status !== 'ACTIVE' || registered?.status !== 'REGISTERED') return false;
        const title = `Scolarité ${data.monthName} - ${classroom.name}`;
        if (await tx.invoice.findFirst({ where: { studentId: enrollment.studentId, academicYearId, title, cancelledAt: null } })) return false;
        await tx.invoice.create({ data: {
          invoiceNumber: `FAC-${year}-${randomUUID().toUpperCase()}`, studentId: enrollment.studentId, academicYearId, title,
          type: InvoiceType.TUITION, amount: schoolFees(active, classroom).monthlyTuition, paidAmount: 0,
          balance: schoolFees(active, classroom).monthlyTuition, dueDate: new Date(data.dueDate), status: InvoiceStatus.UNPAID,
          createdById: author.id, createdByName: author.name, createdByRole: author.role,
        } });
        return true;
      });
      if (created) createdCount++;
    }

    return {
      message: `${createdCount} factures générées pour la classe ${classroom.name}`,
      createdCount,
    };
  }

  async createActivityInvoice(data: { studentId: string; category: string; month?: string }, actor: ActingUser) {
    const author = actorStamp(actor);
    if (!['KIMONO', 'KARATE'].includes(data.category)) throw new BadRequestException('Catégorie invalide.');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Student" WHERE id = ${data.studentId} FOR UPDATE`);
      const student = await tx.student.findUnique({ where: { id: data.studentId }, include: {
        enrollments: { where: { academicYear: { isCurrent: true }, status: 'REGISTERED' }, take: 1, include: { classroom: true, academicYear: true } },
      } });
      const enrollment = student?.enrollments[0];
      if (!student || !enrollment || student.status !== 'ACTIVE') throw new BadRequestException('Élève actif inscrit requis.');
      if (['TPS', 'PS'].includes(enrollment.classroom.level)) throw new BadRequestException('Karaté et Kimono interdits en TPS et PS.');
      if (data.category === 'KARATE' && !student.karate) throw new BadRequestException('L’option Karaté doit être active.');
      if (data.category === 'KARATE' && (!data.month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(data.month))) throw new BadRequestException('Mois requis au format AAAA-MM.');
      const billingKey = `${data.category}:${student.id}:${enrollment.academicYearId}:${data.category === 'KARATE' ? data.month : 'once'}`;
      const amount = data.category === 'KIMONO' ? optionTariffs.kimono : optionTariffs.karateMonthly;
      // The unique key protects concurrent submissions, not only clicks in the UI.
      return tx.invoice.upsert({ where: { billingKey }, update: {}, create: {
        billingKey, category: data.category, studentId: student.id, academicYearId: enrollment.academicYearId,
        invoiceNumber: 'FAC-' + new Date().getFullYear() + '-' + randomUUID().slice(0, 12).toUpperCase(),
        title: data.category === 'KIMONO' ? 'Vente Kimono' : `Karaté ${data.month}`,
        type: InvoiceType.OTHER, amount, paidAmount: 0, balance: amount, dueDate: new Date(), status: InvoiceStatus.UNPAID,
        createdById: author.id, createdByName: author.name, createdByRole: author.role,
      }, include: { student: true, payments: { orderBy: { paymentDate: 'desc' } } } });
    });
  }

  async getFinancialStats(academicYearId?: string) {
    const where: any = { cancelledAt: null, ...(academicYearId ? { academicYearId } : {}) };

    const invoices = await this.prisma.invoice.findMany({
      where,
      select: {
        amount: true,
        paidAmount: true,
        balance: true,
        status: true,
        type: true,
      },
    });

    const totalInvoiced = invoices.reduce((acc, curr) => acc + curr.amount, 0);
    const grossCollected = invoices.reduce((acc, curr) => acc + curr.paidAmount, 0);
    const refundSum = await this.prisma.refund.aggregate({ where: academicYearId ? { payment: { invoice: { academicYearId } } } : {}, _sum: { amount: true } });
    const totalRefunded = refundSum._sum.amount || 0;
    const totalCollected = grossCollected - totalRefunded;
    const totalOutstanding = invoices.reduce((acc, curr) => acc + curr.balance, 0);
    const recoveryRate = totalInvoiced > 0 ? (grossCollected / totalInvoiced) * 100 : 0;

    const byStatus = {
      PAID: invoices.filter((i) => i.status === InvoiceStatus.PAID).length,
      PARTIAL: invoices.filter((i) => i.status === InvoiceStatus.PARTIAL).length,
      UNPAID: invoices.filter((i) => i.status === InvoiceStatus.UNPAID).length,
      OVERDUE: invoices.filter((i) => i.status === InvoiceStatus.OVERDUE).length,
    };

    const recentPayments = await this.prisma.payment.findMany({
      where: { cancelledAt: null, ...(academicYearId ? { invoice: { academicYearId } } : {}) },
      take: 10,
      orderBy: { paymentDate: 'desc' },
      include: {
        invoice: {
          include: {
            student: true,
          },
        },
      },
    });

    return {
      totalInvoiced,
      totalCollected, grossCollected, totalRefunded,
      totalOutstanding,
      recoveryRate: Math.round(recoveryRate * 10) / 10,
      invoiceCount: invoices.length,
      byStatus,
      recentPayments,
    };
  }
}
