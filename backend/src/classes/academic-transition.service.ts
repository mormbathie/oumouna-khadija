import { Prisma } from '@prisma/client';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { actorStamp, ActingUser } from '../audit/actor';
import { validateOptionsForClass } from '../school/school-options';

@Injectable()
export class AcademicTransitionService {
  constructor(private readonly prisma: PrismaService) {}
  async prepare(data: { name: string; startDate: string; endDate: string }, actor: ActingUser) {
    const author = actorStamp(actor);
    if (!/^\d{4}-\d{4}$/.test(data.name || '') || Number(data.name.slice(5)) !== Number(data.name.slice(0,4)) + 1) throw new BadRequestException('Année attendue au format 2027-2028.');
    if (![data.startDate,data.endDate].every(value => { const date = new Date(value); return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value; })) throw new BadRequestException('Dates invalides.');
    const startDate = new Date(data.startDate), endDate = new Date(data.endDate);
    if (![startDate,endDate].every(date=>Number.isFinite(date.getTime())) || startDate >= endDate) throw new BadRequestException('Dates de début et fin invalides.');
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261010)`;
      const current = await tx.academicYear.findFirst({ where: { isCurrent: true }, include: { classrooms: true } });
      if (!current) throw new BadRequestException('Aucune année scolaire active.');
      if (startDate <= current.endDate) throw new BadRequestException('La nouvelle année doit commencer après la fin de l’année actuelle.');
      if (await tx.academicYear.findUnique({ where: { name: data.name } })) throw new BadRequestException('Cette année existe déjà. Sélectionnez-la dans la liste.');
      const year = await tx.academicYear.create({ data: { name: data.name, startDate, endDate, isCurrent: false } });
      for (const room of current.classrooms) await tx.classroom.create({ data: {
        academicYearId: year.id, name: room.name, level: room.level, capacity: room.capacity,
        program: room.program, monthlyTuition: room.monthlyTuition, registrationFee: room.registrationFee, reenrollmentFee: room.reenrollmentFee, teacherId: room.teacherId,
      } });
      await tx.businessAudit.create({ data: { action: 'ACADEMIC_YEAR_PREPARED', entityId: year.id, actorId: author.id, actorName: author.name, actorRole: author.role, details: JSON.stringify({ sourceYearId: current.id, copiedClasses: current.classrooms.length }) } });
      return year;
    });
  }
  async preview(yearId: string) {
    const year = await this.prisma.academicYear.findUnique({ where: { id: yearId }, include: { classrooms: true } });
    if (!year) throw new NotFoundException('Année introuvable.');
    const students = await this.prisma.student.findMany({ where: { status: 'ACTIVE' }, select: { id: true, firstName: true, lastName: true, matricule: true, enrollments: { include: { classroom: true }, orderBy: { enrollmentDate: 'desc' }, take: 1 } } });
    const enrollments = await this.prisma.enrollment.findMany({ where: { academicYearId: yearId } });
    return { year, students, enrollments };
  }
  async enroll(yearId: string, rows: { studentId: string; classroomId: string }[], actor: ActingUser) {
    const author = actorStamp(actor);
    if (!Array.isArray(rows) || !rows.length || rows.length > 1000 || rows.some(row=>!row || typeof row.studentId !== 'string' || typeof row.classroomId !== 'string') || new Set(rows.map(row=>row.studentId)).size !== rows.length) throw new BadRequestException('Sélection d’élèves invalide ou répétée.');
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261010)`;
      const year = await tx.academicYear.findUnique({ where: { id: yearId } });
      if (!year || year.isCurrent) throw new BadRequestException('Sélectionnez une année préparée, non active.');
      for (const row of [...rows].sort((a,b)=>a.studentId.localeCompare(b.studentId))) {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM "Student" WHERE id = ${row.studentId} FOR UPDATE`);
        const [student,room] = await Promise.all([tx.student.findUnique({ where: { id: row.studentId } }), tx.classroom.findUnique({ where: { id: row.classroomId } })]);
        if (!student || student.status !== 'ACTIVE' || room?.academicYearId !== yearId) throw new BadRequestException('Élève actif ou classe de l’année cible introuvable.');
        validateOptionsForClass(student,room);
        await tx.enrollment.upsert({ where: { studentId_academicYearId: { studentId: row.studentId, academicYearId: yearId } }, update: { classroomId: row.classroomId, status: 'REGISTERED', registeredById: author.id, registeredByName: author.name, registeredByRole: author.role }, create: { ...row, academicYearId: yearId, status: 'REGISTERED', registeredById: author.id, registeredByName: author.name, registeredByRole: author.role } });
      }
      await tx.businessAudit.create({ data: { action: 'ACADEMIC_YEAR_REENROLLED', entityId: yearId, actorId: author.id, actorName: author.name, actorRole: author.role, details: JSON.stringify({ enrollments: rows }) } });
      return { enrolled: rows.length };
    }, { timeout: 30000 });
  }
  async activate(yearId: string, actor: ActingUser) {
    const author = actorStamp(actor);
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261010)`;
      const year = await tx.academicYear.findUnique({ where: { id: yearId } });
      if (!year) throw new NotFoundException('Année introuvable.');
      if (year.isCurrent) return year;
      const previous = await tx.academicYear.findFirst({ where: { isCurrent: true } });
      if (previous && year.startDate <= previous.endDate) throw new BadRequestException('L’année cible doit être postérieure à l’année actuelle.');
      if (!await tx.enrollment.count({ where: { academicYearId: yearId } })) throw new BadRequestException('Réinscrivez au moins un élève avant d’activer cette année.');
      await tx.academicYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
      const updated = await tx.academicYear.update({ where: { id: yearId }, data: { isCurrent: true } });
      await tx.businessAudit.create({ data: { action: 'ACADEMIC_YEAR_ACTIVATED', entityId: yearId, actorId: author.id, actorName: author.name, actorRole: author.role, details: JSON.stringify({ previousYearId: previous?.id }) } });
      return updated;
    });
  }
}
