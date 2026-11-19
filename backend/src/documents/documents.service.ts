import {
  BadRequestException,
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parentStudentScope } from '../auth/parent-scope';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const STUDENT_CATEGORIES = new Set([
  'BIRTH_CERTIFICATE',
  'STUDENT_PHOTO',
  'VACCINATION_BOOK',
  'MEDICAL_CERTIFICATE',
  'PREVIOUS_REPORT',
]);
const PARENT_CATEGORIES = new Set(['NATIONAL_ID_CARD', 'PASSPORT']);
const MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
const MAX_FILE_SIZE = 10 * 1024 * 1024;

@Injectable()
export class DocumentsService {
  private readonly storagePath: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.storagePath = resolve(config.get<string>('DOCUMENTS_STORAGE_PATH') || 'uploads');
  }

  async assertParentOwnsStudent(studentId: string, user: any) {
    const scope = await parentStudentScope(this.prisma, user);
    const row = await this.prisma.student.findFirst({ where: { AND: [{ id: studentId }, scope] }, select: { id: true } });
    if (!row) throw new NotFoundException('Document introuvable.');
  }

  async listStudent(studentId: string) {
    const exists = await this.prisma.student.findUnique({ where: { id: studentId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Élève introuvable.');
    return this.prisma.studentDocument.findMany({
      where: { studentId },
      select: { id: true, studentId: true, category: true, originalName: true, mimeType: true, size: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listParent(parentId: string) {
    const exists = await this.prisma.parent.findUnique({ where: { id: parentId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Parent introuvable.');
    return this.prisma.parentDocument.findMany({
      where: { parentId },
      select: { id: true, parentId: true, category: true, originalName: true, mimeType: true, size: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async uploadStudent(studentId: string, category: string, file: any) {
    if (!STUDENT_CATEGORIES.has(category)) throw new BadRequestException('Type de document élève invalide.');
    const student = await this.prisma.student.findUnique({ where: { id: studentId }, select: { id: true } });
    if (!student) throw new NotFoundException('Élève introuvable.');
    return this.saveFile('student', studentId, category, file);
  }

  async uploadParent(parentId: string, category: string, file: any) {
    if (!PARENT_CATEGORIES.has(category)) throw new BadRequestException('Type de pièce parent invalide.');
    const parent = await this.prisma.parent.findUnique({ where: { id: parentId }, select: { id: true } });
    if (!parent) throw new NotFoundException('Parent introuvable.');
    return this.saveFile('parent', parentId, category, file);
  }

  private async saveFile(ownerType: 'student' | 'parent', ownerId: string, category: string, file: any) {
    if (!file?.buffer) throw new BadRequestException('Sélectionnez un fichier à envoyer.');
    if (file.size > MAX_FILE_SIZE) throw new BadRequestException('Le fichier dépasse la limite de 10 Mo.');
    const extension = MIME_EXTENSIONS[file.mimetype];
    if (!extension) throw new BadRequestException('Formats acceptés : PDF, JPG, PNG et WEBP.');
    if (category === 'STUDENT_PHOTO' && !file.mimetype.startsWith('image/')) {
      throw new BadRequestException('La photo de l’élève doit être une image JPG, PNG ou WEBP.');
    }

    await mkdir(this.storagePath, { recursive: true });
    const storageKey = `${randomUUID()}${extension}`;
    const safeName = String(file.originalname || 'document')
      .replace(/[\\/\\\\]/g, '_')
      .replace(/[\\r\\n\\"]/g, '_')
      .slice(0, 180);
    const destination = join(this.storagePath, storageKey);
    await writeFile(destination, file.buffer, { flag: 'wx', mode: 0o600 });

    try {
      const data = {
        category,
        originalName: safeName || 'document',
        mimeType: file.mimetype,
        size: file.size,
        storageKey,
      };
      const document = ownerType === 'student'
        ? await this.prisma.studentDocument.create({ data: { ...data, studentId: ownerId } })
        : await this.prisma.parentDocument.create({ data: { ...data, parentId: ownerId } });
      return this.publicDocument(document);
    } catch (error) {
      await unlink(destination).catch(() => undefined);
      throw error;
    }
  }

  async studentPhoto(studentId: string) {
    const document = await this.prisma.studentDocument.findFirst({
      where: { studentId, category: 'STUDENT_PHOTO' },
      orderBy: { createdAt: 'desc' },
    });
    if (!document) throw new NotFoundException('Aucune photo d’identité n’est enregistrée pour cet élève.');
    return { ...this.publicDocument(document), buffer: await this.readStored(document.storageKey) };
  }

  async studentFile(studentId: string, documentId: string) {
    const document = await this.prisma.studentDocument.findFirst({ where: { id: documentId, studentId } });
    if (!document) throw new NotFoundException('Document élève introuvable.');
    return { ...this.publicDocument(document), buffer: await this.readStored(document.storageKey) };
  }

  async parentFile(parentId: string, documentId: string) {
    const document = await this.prisma.parentDocument.findFirst({ where: { id: documentId, parentId } });
    if (!document) throw new NotFoundException('Pièce parent introuvable.');
    return { ...this.publicDocument(document), buffer: await this.readStored(document.storageKey) };
  }

  async deleteStudent(studentId: string, documentId: string) {
    const document = await this.prisma.studentDocument.findFirst({ where: { id: documentId, studentId } });
    if (!document) throw new NotFoundException('Document élève introuvable.');
    await this.prisma.studentDocument.delete({ where: { id: documentId } });
    await this.removeStoredFiles([document.storageKey]);
    return { id: documentId, deleted: true };
  }

  async deleteParent(parentId: string, documentId: string) {
    const document = await this.prisma.parentDocument.findFirst({ where: { id: documentId, parentId } });
    if (!document) throw new NotFoundException('Pièce parent introuvable.');
    await this.prisma.parentDocument.delete({ where: { id: documentId } });
    await this.removeStoredFiles([document.storageKey]);
    return { id: documentId, deleted: true };
  }

  async removeStoredFiles(storageKeys: string[]) {
    await Promise.all(storageKeys.map((key) => unlink(join(this.storagePath, key)).catch(() => undefined)));
  }

  private async readStored(storageKey: string) {
    try {
      return await readFile(join(this.storagePath, storageKey));
    } catch {
      throw new NotFoundException('Le fichier associé est introuvable dans le stockage.');
    }
  }

  private publicDocument(document: any) {
    const { storageKey: _storageKey, ...safeDocument } = document;
    return safeDocument;
  }
}
