import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { schoolFees } from '../school/school-options';

export const registrationStates = ['ALL', 'PAID', 'PARTIAL', 'UNPAID', 'OUTSTANDING', 'NOT_INVOICED'];
@Injectable()
export class RegistrationReportService {
  constructor(private readonly prisma: PrismaService) {}
  async report(query: { academicYearId?: string; classroomId?: string; karate?: string; fullDay?: string; status?: string }) {
    for (const value of [query.academicYearId,query.classroomId,query.status]) if (value !== undefined && (typeof value !== 'string' || value.length>100)) throw new BadRequestException('Filtre invalide.');
    for (const option of [query.karate, query.fullDay]) if (option !== undefined && !['true','false',''].includes(option)) throw new BadRequestException('Filtre d’option invalide.');
    const status = query.status || 'ALL';
    if (!registrationStates.includes(status)) throw new BadRequestException('Filtre de règlement invalide.');
    return this.prisma.$transaction(async tx => {
      const year = query.academicYearId ? await tx.academicYear.findUnique({ where: { id: query.academicYearId } }) : await tx.academicYear.findFirst({ where: { isCurrent: true } });
      if (!year) throw new NotFoundException('Année scolaire introuvable.');
      const classes = await tx.classroom.findMany({ where: { academicYearId: year.id }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
      if (query.classroomId && !classes.some(c => c.id === query.classroomId)) throw new BadRequestException('Classe étrangère à l’année sélectionnée.');
      const students = await tx.student.findMany({
        where: {
          ...(query.classroomId ? { enrollments: { some: { academicYearId: year.id, classroomId: query.classroomId } } } : { OR: [{ enrollments: { some: { academicYearId: year.id } } }, { invoices: { some: { academicYearId: year.id, type: 'REGISTRATION', cancelledAt: null } } }] }),
          ...(query.karate ? { karate: query.karate === 'true' } : {}), ...(query.fullDay ? { fullDay: query.fullDay === 'true' } : {}),
        },
        select: { id: true, firstName: true, lastName: true, matricule: true, karate: true, fullDay: true, supplies: true, eveningClasses: true, transportZone: true,
          enrollments: { where: { academicYearId: year.id }, take: 1, select: { classroom: { select: { name: true, level: true, program: true, registrationFee: true, monthlyTuition: true } } } },
          invoices: { where: { academicYearId: year.id, type: 'REGISTRATION', cancelledAt: null }, select: { id: true, invoiceNumber: true, amount: true, paidAmount: true, balance: true, payments: { select: { refunds: { select: { amount: true } } } } } },
        }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
      });
      const rows = students.map(s => {
        const invoiced = s.invoices.reduce((sum, i) => sum + i.amount, 0), paid = s.invoices.reduce((sum,i) => sum + i.paidAmount, 0), balance = s.invoices.reduce((sum,i) => sum + i.balance, 0);
        const refunded = s.invoices.reduce((sum, i) => sum + i.payments.reduce((a,p) => a + p.refunds.reduce((b,r) => b + r.amount,0),0),0);
        const state = !s.invoices.length ? 'NOT_INVOICED' : balance <= 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';
        const classroom = s.enrollments[0]?.classroom;
        return { id: s.id, name: `${s.firstName} ${s.lastName}`, matricule: s.matricule, classroom: classroom?.name || '—', karate: s.karate, fullDay: s.fullDay,
          invoiced, paid: paid - refunded, grossPaid: paid, refunded, balance, status: state, invoiceCount: s.invoices.length,
          unbilledEstimate: !s.invoices.length && classroom ? schoolFees(s, classroom).registrationFee : 0, invoices: s.invoices };
      }).filter(row => status === 'ALL' || (status === 'OUTSTANDING' ? ['PARTIAL','UNPAID'].includes(row.status) : row.status === status));
      const totals = { students: rows.length, invoiced: 0, paid: 0, refunded: 0, grossPaid: 0, balance: 0, unbilledEstimate: 0, counts: { PAID: 0, PARTIAL: 0, UNPAID: 0, NOT_INVOICED: 0 } };
      for (const row of rows) { totals.invoiced += row.invoiced; totals.paid += row.paid; totals.refunded += row.refunded; totals.grossPaid += row.grossPaid; totals.balance += row.balance; totals.unbilledEstimate += row.unbilledEstimate; totals.counts[row.status]++; }
      return { academicYear: { id: year.id, name: year.name }, classes, totals, rows };
    }, { isolationLevel: 'RepeatableRead' });
  }
}
