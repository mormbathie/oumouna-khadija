jest.mock('../documents/documents.service', () => ({ DocumentsService: class {} }));
import { StudentsService } from './students.service';

describe('Registration adjustments preserve recorded receipts', () => {
  const actor = { userId: 'admin', username: 'admin', roles: ['ADMIN'] };
  function setup(amount=100000, paidAmount=80000) {
    const current:any = { id:'child', dateOfBirth:new Date('2023-01-01'), supplies:false, karate:false, fullDay:false, enrollments:[{id:'enrollment',academicYearId:'year',classroomId:'class',classroom:{id:'class',level:'CI',program:'ELEMENTARY',registrationFee:40000,monthlyTuition:15000}}] };
    const invoice:any = {id:'initial',amount,paidAmount,balance:amount-paidAmount,status:'PARTIAL'};
    const payments = [{id:'receipt',amount:paidAmount,reference:'original',paymentDate:'2026-10-01'}];
    const tx:any = {studentDeparture:{findUnique:jest.fn(async()=>null)},$queryRaw:jest.fn(),student:{findUnique:jest.fn(async()=>current),update:jest.fn(async({data})=>Object.assign(current,data))},classroom:{findUnique:jest.fn()},enrollment:{upsert:jest.fn()},invoice:{findMany:jest.fn(async()=>[invoice]),update:jest.fn(async({data})=>Object.assign(invoice,data))}};
    const prisma:any = {student:{findUnique:jest.fn(async()=>current)},classroom:{findUnique:jest.fn()},$transaction:jest.fn(async fn=>fn(tx))};
    const service = new StudentsService(prisma,{} as any);jest.spyOn(service,'findOne').mockResolvedValue({} as any);
    return {service,invoice,payments,current,tx};
  }
  it('keeps transport out of the registration invoice and preserves collected payments',async()=>{
    const {service,invoice,payments}=setup();const original=JSON.stringify(payments);
    await service.update('child',{transportZone:1},actor);
    expect(invoice).toMatchObject({amount:100000,paidAmount:80000,balance:20000,status:'PARTIAL'});
    expect(JSON.stringify(payments)).toBe(original);
    await service.update('child',{transportZone:1},actor);
    expect(invoice.amount).toBe(100000);
  });
  it('does not reprice an unrelated profile edit',async()=>{
    const {service,tx}=setup();await service.update('child',{firstName:'Updated'},actor);expect(tx.invoice.update).not.toHaveBeenCalled();
  });
  it('reprices an unpaid registration invoice when the class is corrected',async()=>{
    const {service,invoice,tx}=setup(40000,0);
    const corrected={id:'cm2',academicYearId:'year',name:'CM2',level:'CM2',program:'ELEMENTARY',registrationFee:53000,monthlyTuition:15000};
    (service as any).prisma.classroom.findUnique.mockResolvedValue(corrected);
    tx.classroom.findUnique.mockResolvedValue(corrected);
    await service.update('child',{classroomId:'cm2'},actor);
    expect(invoice).toMatchObject({grossAmount:53000,amount:53000,balance:53000,status:'UNPAID'});
    expect(tx.enrollment.upsert).toHaveBeenCalledWith(expect.objectContaining({update:expect.objectContaining({classroomId:'cm2'})}));
  });
  it('repairs a stale unpaid amount when the already-selected class is saved again',async()=>{
    const {service,invoice,tx,current}=setup(40000,0);
    const cm2={...current.enrollments[0].classroom,registrationFee:53000};
    current.enrollments[0].classroom=cm2;
    (service as any).prisma.classroom.findUnique.mockResolvedValue(cm2);
    tx.classroom.findUnique.mockResolvedValue(cm2);
    await service.update('child',{classroomId:'class'},actor);
    expect(invoice).toMatchObject({grossAmount:53000,amount:53000,balance:53000,status:'UNPAID'});
  });
  it('rejects reducing a due amount below the amount already received',async()=>{
    const {service,current,tx}=setup(110000,110000);current.enrollments[0].classroom.program='PRESCHOOL';current.enrollments[0].classroom.level='MS';current.eveningClasses=true;const invoice=(await tx.invoice.findMany())[0];invoice.registrationOptions=JSON.stringify({eveningClasses:true});
    await expect(service.update('child',{eveningClasses:false},actor)).rejects.toThrow('régularisation');expect(tx.student.update).not.toHaveBeenCalled();
  });
  it('refuses an ambiguous dossier with two registration invoices',async()=>{
    const {service,tx}=setup();tx.invoice.findMany.mockResolvedValue([{id:'one'},{id:'two'}]);await expect(service.update('child',{eveningClasses:true},actor)).rejects.toThrow('Plusieurs');expect(tx.student.update).not.toHaveBeenCalled();
  });
});

describe('Director registration discounts', () => {
  const actor = { userId: 'director', username: 'direction', firstName: 'Awa', roles: ['DIRECTEUR'] };
  const setup = (invoiceOverrides: any = {}) => {
    const invoice: any = { id: 'invoice', invoiceNumber: 'FAC-1', studentId: 'student', type: 'REGISTRATION', amount: 50000, grossAmount: null, discountAmount: 0, paidAmount: 0, balance: 50000, status: 'UNPAID', cancelledAt: null, ...invoiceOverrides };
    const tx: any = { $queryRaw: jest.fn(), invoice: { findFirst: jest.fn(async () => invoice), update: jest.fn(async ({ data }) => Object.assign(invoice, data)) }, businessAudit: { create: jest.fn() } };
    const prisma: any = { $transaction: jest.fn(async fn => fn(tx)) };
    const service = new StudentsService(prisma, {} as any);
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'student' } as any);
    return { service, invoice, tx };
  };

  it('stores the normal amount and invoices only the discounted balance', async () => {
    const { service, invoice, tx } = setup();
    await service.applyRegistrationDiscount('student', { invoiceId: 'invoice', amount: 15000, type: 'SOCIAL_CASE', reason: 'Situation sociale validée par la direction.' }, actor);
    expect(invoice).toMatchObject({ grossAmount: 50000, discountAmount: 15000, discountType: 'SOCIAL_CASE', amount: 35000, paidAmount: 0, balance: 35000, status: 'UNPAID', discountApprovedByName: 'Awa' });
    expect(tx.businessAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'REGISTRATION_DISCOUNT_APPROVED', actorRole: 'DIRECTEUR' }) });
  });

  it('records a parent refund due when a reduction is granted after payment', async () => {
    const { service, invoice } = setup({ paidAmount: 50000, balance: 0, status: 'PAID' });
    await service.applyRegistrationDiscount('student', { invoiceId: 'invoice', amount: 10000, type: 'DISCOUNT', reason: 'Réduction exceptionnelle autorisée.' }, actor);
    expect(invoice).toMatchObject({ amount: 40000, paidAmount: 50000, balance: 0, status: 'PAID', discountRefundDue: 10000 });
  });

  it('locks a reduction after its refund has begun', async () => {
    const { service, tx } = setup({ discountAmount: 10000, discountRefundedAmount: 10000 });
    await expect(service.applyRegistrationDiscount('student', { invoiceId: 'invoice', amount: 12000, type: 'DISCOUNT', reason: 'Réduction exceptionnelle autorisée.' }, actor)).rejects.toThrow('déjà été enregistré');
    expect(tx.invoice.update).not.toHaveBeenCalled();
  });

  it('rejects an undocumented or excessive reduction', async () => {
    const { service } = setup();
    await expect(service.applyRegistrationDiscount('student', { invoiceId: 'invoice', amount: 50001, type: 'DISCOUNT', reason: 'Réduction exceptionnelle autorisée.' }, actor)).rejects.toThrow('dépasser');
    await expect(service.applyRegistrationDiscount('student', { invoiceId: 'invoice', amount: 1000, type: 'SOCIAL_CASE', reason: 'court' }, actor)).rejects.toThrow('justification');
  });
});
