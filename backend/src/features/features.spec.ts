import { Reflector } from '@nestjs/core';
import { FeaturesService } from './features.service';
import { FeatureGuard } from './feature.guard';
import { FEATURE_KEY } from './feature.decorator';

const actor = { userId: 'admin', username: 'admin', roles: ['ADMIN'] };
const prisma = (rows: { key: string; enabled: boolean }[] = []) => ({
  featureFlag: { findMany: jest.fn(async () => rows), upsert: jest.fn() },
  businessAudit: { create: jest.fn() },
  $transaction: jest.fn(async (operations: unknown[]) => operations),
});

describe('Optional modules', () => {
  it('uses defaults, stored choices, and switches sub-features off with their module', async () => {
    const service = new FeaturesService(prisma([{ key: 'boarding', enabled: false }, { key: 'whatsapp', enabled: false }]) as any);
    await service.reload();
    expect(service.isEnabled('grades')).toBe(true);
    expect(service.isEnabled('whatsapp')).toBe(false);
    expect(service.isEnabled('boarding.pocketMoney')).toBe(false);
    expect(service.isEnabled('unknown-feature')).toBe(true);
    const pocket = service.list().find(feature => feature.key === 'boarding.pocketMoney')!;
    expect(pocket).toEqual(expect.objectContaining({ enabled: true, effective: false }));
  });

  it('records each change with its author and rejects unknown modules', async () => {
    const db = prisma();
    const service = new FeaturesService(db as any);
    await service.set('boarding.pocketMoney', false, actor);
    expect(service.isEnabled('boarding.pocketMoney')).toBe(false);
    expect(service.isEnabled('boarding')).toBe(true);
    expect(db.businessAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'FEATURE_DISABLED', entityId: 'boarding.pocketMoney' }) });
    await expect(service.set('payroll', true, actor)).rejects.toThrow('inconnue');
    await expect(service.set('grades', 'yes' as any, actor)).rejects.toThrow('invalide');
  });

  it('refuses the routes of a module that is switched off', async () => {
    const service = new FeaturesService(prisma([{ key: 'boarding.pocketMoney', enabled: false }]) as any);
    await service.reload();
    const reflector = new Reflector();
    const guard = new FeatureGuard(reflector, service);
    const context = (classFeature?: string, handlerFeature?: string) => {
      class Controller {} function handler() {}
      if (classFeature) Reflect.defineMetadata(FEATURE_KEY, classFeature, Controller);
      if (handlerFeature) Reflect.defineMetadata(FEATURE_KEY, handlerFeature, handler);
      return { getClass: () => Controller, getHandler: () => handler } as any;
    };
    expect(guard.canActivate(context('boarding', 'boarding.rollCall'))).toBe(true);
    expect(() => guard.canActivate(context('boarding', 'boarding.pocketMoney'))).toThrow('désactivée');
    expect(guard.canActivate(context())).toBe(true);
  });
});
