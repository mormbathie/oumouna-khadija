import { FinancesService } from './finances.service';

describe('Financial action attribution', () => {
  const actor = { userId: 'keycloak-7', username: 'fatou', firstName: 'Fatou', lastName: 'Diop', roles: ['COMPTABLE'] };

  it('records the authenticated cashier instead of a submitted name', async () => {
    const tx: any = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      cashClosing: { findUnique: jest.fn().mockResolvedValue(null) },
      invoice: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ id: 'invoice', balance: 0, paidAmount: 100 }),
        update: jest.fn().mockResolvedValue({ id: 'invoice', balance: 0, status: 'PAID' }),
      },
      payment: { create: jest.fn().mockResolvedValue({ id: 'payment' }) },
    };
    const prisma: any = {
      invoice: { findUnique: jest.fn().mockResolvedValue({ id: 'invoice', balance: 100 }) },
      $transaction: (callback: (client: any) => unknown) => callback(tx),
    };
    const service = new FinancesService(prisma);
    await service.recordPayment({ invoiceId: 'invoice', amount: 100, paymentMethod: 'CASH', receivedBy: 'Faux nom' } as any, actor);
    expect(tx.payment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ receivedBy: 'Fatou Diop', receivedById: 'keycloak-7', receivedByRole: 'COMPTABLE' }),
    }));
  });

  it('attributes invoices to the authenticated creator', async () => {
    const prisma: any = {
      academicYear: { findFirst: jest.fn().mockResolvedValue({ id: 'year' }) },
      invoice: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({ id: 'invoice' }) },
    };
    const service = new FinancesService(prisma);
    await service.createInvoice({ studentId: 'student', title: 'Scolarité', type: 'TUITION', amount: 100, dueDate: '2026-10-30' }, actor);
    expect(prisma.invoice.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ createdById: 'keycloak-7', createdByName: 'Fatou Diop', createdByRole: 'COMPTABLE' }),
    }));
  });
});

describe('Oumouna Khadija tuition', () => {
  it('uses the class tuition and never reuses the former full-day tariff', async () => {
    const prisma: any = {
      classroom: { findUnique: jest.fn().mockResolvedValue({id:'class',level:'MS',program:'PRESCHOOL',monthlyTuition:15000,registrationFee:50000,academicYearId:'year',enrollments:[{studentId:'full',student:{fullDay:true}},{studentId:'ordinary',student:{fullDay:false}},{studentId:'existing',student:{fullDay:true}}]}) },
      invoice: { findFirst: jest.fn().mockImplementation(({where}:any)=>Promise.resolve(where.studentId==='existing'?{id:'old',amount:15000}:null)),count:jest.fn().mockResolvedValue(0),create:jest.fn().mockResolvedValue({}) },
    };
    prisma.$queryRaw = jest.fn();
    prisma.student = { findUnique: jest.fn(async ({where}: any) => ({ id: where.id, status: 'ACTIVE', fullDay: where.id !== 'ordinary' })) };
    prisma.enrollment = { findUnique: jest.fn(async () => ({ status: 'REGISTERED' })) };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    const service = new FinancesService(prisma);
    const result = await service.generateTuitionInvoicesForClass({classroomId:'class',monthName:'Novembre',dueDate:'2026-11-01'}, {userId:'agent',username:'agent',roles:['ADMIN']});
    expect(prisma.invoice.create.mock.calls.map(([args]:any[])=>[args.data.studentId,args.data.amount,args.data.balance])).toEqual([['full',15000,15000],['ordinary',15000,15000]]);
    expect(result.createdCount).toBe(2);
  });
});

describe('Bulk settlement validation', () => {
  const actor = { userId: 'cashier', username: 'QA', roles: ['COMPTABLE'] };
  it.each([
    { invoices: [], paymentMethod: 'CASH' },
    { invoices: [{ id: 'a', balance: 0 }], paymentMethod: 'CASH' },
    { invoices: [{ id: 'a', balance: 1.5 }], paymentMethod: 'CASH' },
    { invoices: [{ id: 'a', balance: 100 }, { id: 'a', balance: 100 }], paymentMethod: 'CASH' },
    { invoices: [{ id: 'a', balance: 100 }], paymentMethod: 'INVALID' },
    { invoices: [{ id: 'a', balance: 100 }], paymentMethod: 'CASH', notes: 'x'.repeat(1001) },
    { invoices: Array.from({ length: 1001 }, (_, i) => ({ id: String(i), balance: 100 })), paymentMethod: 'CASH' },
  ])('rejects invalid selection before database writes', async data => {
    const prisma: any = { $transaction: jest.fn() };
    await expect(new FinancesService(prisma).settleBatch(data as any, actor)).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
