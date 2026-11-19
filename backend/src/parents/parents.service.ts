import { findOrCreateParent } from './parent-identity';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { whatsappNumber } from '../notifications/whatsapp-templates';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { normalizeEmail } from '../common/email';

@Injectable()
export class ParentsService {
  constructor(private prisma: PrismaService, private readonly documents: DocumentsService) {}

  async findAll(search?: string) {
    const where = search
      ? {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    return this.prisma.parent.findMany({
      where,
      include: {
        accounts: { select: { username: true, mustChangePassword: true }, take: 1 },
        students: {
          include: {
            enrollments: {
              include: { classroom: true },
            },
            invoices: {
              select: { amount: true, paidAmount: true, balance: true, status: true },
            },
          },
        },
      },
      orderBy: { lastName: 'asc' },
    });
  }

  async findOne(id: string) {
    const parent = await this.prisma.parent.findUnique({
      where: { id },
      include: {
        students: {
          include: {
            enrollments: {
              include: { classroom: true, academicYear: true },
            },
            invoices: {
              include: { payments: true },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    });

    if (!parent) {
      throw new NotFoundException(`Parent avec l'ID ${id} non trouvé`);
    }

    return parent;
  }

  async create(data: {
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
    address?: string;
    profession?: string;
    relation?: string;
    whatsappPhone?: string;
    whatsappOptOut?: boolean;
  }) {
    return this.prisma.$transaction(tx => findOrCreateParent(tx, { ...data, ...this.whatsappFields(data) } as any));
  }

  private whatsappFields(data: any) {
    const result: { whatsappPhone?: string | null; whatsappOptOut?: boolean } = {};
    if (data.whatsappPhone !== undefined) {
      const value = String(data.whatsappPhone || '').trim();
      if (value && !whatsappNumber(value)) throw new BadRequestException('Numéro WhatsApp invalide : indiquez un mobile sénégalais (77…, 78…, 76…, 70…, 75…) ou un numéro international commençant par +.');
      result.whatsappPhone = value || null;
    }
    if (data.whatsappOptOut !== undefined) {
      if (typeof data.whatsappOptOut !== 'boolean') throw new BadRequestException('Préférence WhatsApp invalide.');
      result.whatsappOptOut = data.whatsappOptOut;
    }
    return result;
  }

  async update(id: string, data: any) {
    return this.prisma.parent.update({
      where: { id },
      data: { ...data, ...this.whatsappFields(data), ...(data.email !== undefined ? { email: normalizeEmail(data.email) } : {}) },
    });
  }

  async remove(id: string) {
    const documents = await this.prisma.parentDocument.findMany({ where: { parentId: id }, select: { storageKey: true } });
    const removed = await this.prisma.parent.delete({ where: { id } });
    await this.documents.removeStoredFiles(documents.map((document) => document.storageKey));
    return removed;
  }
}
