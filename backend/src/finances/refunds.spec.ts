jest.mock('../documents/documents.service', () => ({ DocumentsService: class {} }));
jest.mock('../auth/guards/jwt-auth.guard', () => ({ JwtAuthGuard: class {} }));
import { Reflector } from '@nestjs/core';
import { RefundsController } from './refunds.controller';
import { RefundsService, operationDate } from './refunds.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { StudentsService } from '../students/students.service';

describe('Refund and departure permissions', () => {
  it('restricts both writes to ADMIN and permits finance staff to read', () => {
    const reflector = new Reflector();
    expect(reflector.get(ROLES_KEY, RefundsController)).toEqual(['ADMIN','DIRECTEUR','COMPTABLE']);
    for (const method of ['create','depart'] as const) expect(reflector.get(ROLES_KEY, RefundsController.prototype[method])).toEqual(['ADMIN']);
  });
  it.each(['DIRECTEUR','COMPTABLE','PARENT','ENSEIGNANT','CONTROLEUR_PRESENCE'])('blocks %s before any write', async role => {
    const db: any = { $transaction: jest.fn() }; const service = new RefundsService(db); const actor = { userId:'test', username:'test',roles:[role] };
    await expect(service.create({} as any,actor)).rejects.toMatchObject({status:403});
    await expect(service.depart('student',{} as any,actor)).rejects.toMatchObject({status:403});
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('rejects invalid and future dates', () => {
    for (const value of ['2026-02-30','not-a-date','2999-01-01']) expect(() => operationDate(value)).toThrow();
  });
  it('lets only the administrator delete a dossier, after retyping its matricule', async () => {
    const tx: any = { $queryRaw: jest.fn(), student: { findUnique: jest.fn(async () => ({ id: 'student', matricule: 'OK-2026-0001', firstName: 'A', lastName: 'B', documents: [], invoices: [], enrollments: [] })), delete: jest.fn() },
      refund: { findMany: jest.fn(async () => []), deleteMany: jest.fn() }, studentDeparture: { deleteMany: jest.fn() }, paymentInstallment: { deleteMany: jest.fn() },
      paymentReminder: { deleteMany: jest.fn() }, whatsAppMessageLog: { deleteMany: jest.fn() }, businessAudit: { create: jest.fn() } };
    const db: any = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
    const service = new StudentsService(db, { removeStoredFiles: jest.fn(async () => undefined) } as any);
    const reason = 'Dossier créé en double par erreur';
    await expect(service.remove('student', { confirmMatricule: 'OK-2026-0001', reason }, { userId: 'd', username: 'dir', roles: ['DIRECTEUR'] })).rejects.toThrow('administrateur');
    await expect(service.remove('student', { confirmMatricule: 'OK-2026-9999', reason }, { userId: 'a', username: 'admin', roles: ['ADMIN'] })).rejects.toThrow('ne correspond pas');
    expect(tx.student.delete).not.toHaveBeenCalled();
    await service.remove('student', { confirmMatricule: 'ok-2026-0001', reason }, { userId: 'a', username: 'admin', roles: ['ADMIN'] });
    expect(tx.student.delete).toHaveBeenCalledWith({ where: { id: 'student' } });
    expect(tx.businessAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'STUDENT_DELETED', reason, actorRole: 'ADMIN' }) });
  });
});
