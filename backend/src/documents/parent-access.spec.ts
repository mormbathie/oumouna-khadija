jest.mock('@nestjs/config', () => ({ ConfigService: class ConfigService {} }));
import { DocumentsService } from './documents.service';
import { StudentsService } from '../students/students.service';
import { parentStudentScope } from '../auth/parent-scope';
import { loginIdentifier } from '../auth/auth.service';

describe('Parent portal isolation', () => {
  const noLinkedAccount = { findUnique: jest.fn().mockResolvedValue(null) };

  it('requires a verified email and never retrieves files for unverified accounts', async () => {
    const prisma: any = { user: noLinkedAccount, student: { findFirst: jest.fn() } };
    const service = new DocumentsService(prisma, { get: () => '/tmp' } as any);
    await expect(service.assertParentOwnsStudent('child', { email: 'parent@example.org', emailVerified: false })).rejects.toThrow('Vérifiez');
    expect(prisma.student.findFirst).not.toHaveBeenCalled();
  });

  it('checks both the child ID and the authenticated parent email', async () => {
    const prisma: any = { user: noLinkedAccount, student: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new DocumentsService(prisma, { get: () => '/tmp' } as any);
    await expect(service.assertParentOwnsStudent('other-child', { email: 'parent@example.org', emailVerified: true })).rejects.toThrow('introuvable');
    const where = prisma.student.findFirst.mock.calls[0][0].where;
    expect(where.AND[0]).toEqual({ id: 'other-child' });
    expect(JSON.stringify(where.AND[1])).toContain('parent@example.org');
  });

  it('rejects reading another family dossier', async () => {
    const prisma: any = { user: noLinkedAccount, student: { findUnique: jest.fn().mockResolvedValue({ parent: {}, guardians: [], enrollments: [] }), count: jest.fn().mockResolvedValue(0) } };
    const service = new StudentsService(prisma, {} as any);
    await expect(service.findOne('other-child', { roles: ['PARENT'], email: 'parent@example.org', emailVerified: true })).rejects.toThrow('non trouvé');
    expect(prisma.student.count).toHaveBeenCalledWith({ where: { AND: [{ id: 'other-child' }, expect.any(Object)] } });
  });

  it('limits a phone account to the children of its own parent record', async () => {
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue({ parentId: 'father' }) } };
    const scope = await parentStudentScope(prisma, { userId: 'kc-1', roles: ['PARENT'], email: '221771234567@parents.invalid', emailVerified: true });
    expect(scope).toEqual({ OR: [{ parentId: 'father' }, { guardians: { some: { parentId: 'father' } } }] });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { keycloakId: 'kc-1' }, select: { parentId: true } });
  });

  it('never grants access through the technical address of an unlinked phone account', async () => {
    const prisma: any = { user: noLinkedAccount };
    await expect(parentStudentScope(prisma, { userId: 'kc-2', email: '221771234567@parents.invalid', emailVerified: true })).rejects.toThrow('secrétariat');
  });

  it('accepts the phone number in every usual notation at sign-in', () => {
    for (const value of ['77 123 45 67', '+221 77 123 45 67', '00221771234567', '771234567']) expect(loginIdentifier(value)).toBe('221771234567');
    expect(loginIdentifier('direction')).toBe('direction');
    expect(loginIdentifier(' admin ')).toBe('admin');
  });
});
