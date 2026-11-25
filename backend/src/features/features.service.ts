import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActingUser, actorStamp } from '../audit/actor';
import { FEATURES, FEATURE_KEYS } from './feature-registry';

@Injectable()
export class FeaturesService implements OnModuleInit {
  private stored = new Map<string, boolean>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() { await this.reload(); }

  async reload() {
    const rows: { key: string; enabled: boolean }[] = await this.prisma.featureFlag.findMany().catch(() => []);
    this.stored = new Map(rows.map(row => [row.key, row.enabled] as const));
  }

  private own(key: string) {
    const feature = FEATURES.find(item => item.key === key);
    return this.stored.get(key) ?? feature?.defaultEnabled ?? true;
  }

  /** A sub-feature is on only while its parent module is on. Unknown keys are never blocked. */
  isEnabled(key: string): boolean {
    const feature = FEATURES.find(item => item.key === key);
    if (!feature) return true;
    return this.own(key) && (!feature.parent || this.isEnabled(feature.parent));
  }

  /** Effective state for every module, used by the interface to hide what is switched off. */
  states() {
    return Object.fromEntries(FEATURES.map(feature => [feature.key, this.isEnabled(feature.key)]));
  }

  list() {
    return FEATURES.map(feature => ({ ...feature, enabled: this.own(feature.key), effective: this.isEnabled(feature.key) }));
  }

  async set(key: string, enabled: unknown, actor: ActingUser) {
    const author = actorStamp(actor);
    if (!FEATURE_KEYS.has(key)) throw new BadRequestException('Fonctionnalité inconnue.');
    if (typeof enabled !== 'boolean') throw new BadRequestException('État invalide.');
    await this.prisma.$transaction([
      this.prisma.featureFlag.upsert({ where: { key }, create: { key, enabled, updatedByName: author.name }, update: { enabled, updatedByName: author.name } }),
      this.prisma.businessAudit.create({ data: { action: enabled ? 'FEATURE_ENABLED' : 'FEATURE_DISABLED', entityId: key, actorId: author.id, actorName: author.name, actorRole: author.role, details: JSON.stringify({ key, enabled }) } }),
    ]);
    this.stored.set(key, enabled);
    return this.list();
  }
}
