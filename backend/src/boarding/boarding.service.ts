import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Gender, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActingUser, actorStamp } from '../audit/actor';

export const BOARDING_PROGRAMS = ['DAARA_BOARDING', 'FRANCO_ARAB_BOARDING'];
export const ROLL_CALL_STATUSES = ['PRESENT', 'ABSENT', 'ON_LEAVE', 'SICK'] as const;
export const LEAVE_KINDS = ['WEEKEND', 'HOLIDAY', 'MEDICAL', 'FAMILY', 'OTHER'] as const;

// Boarders are the active pupils marked "interne" and enrolled for the current school year.
export const boarderWhere: Prisma.StudentWhereInput = {
  status: 'ACTIVE',
  isBoarder: true,
  departure: { is: null },
  enrollments: { some: { status: 'REGISTERED', academicYear: { isCurrent: true } } },
};

const text = (value: unknown, max: number, label: string, required = false) => {
  const result = String(value ?? '').trim();
  if (required && !result) throw new BadRequestException(`${label} est obligatoire.`);
  if (result.length > max) throw new BadRequestException(`${label} ne peut pas dépasser ${max} caractères.`);
  return result || null;
};
const dateTime = (value: unknown, label: string) => {
  const date = new Date(String(value || ''));
  if (!value || !Number.isFinite(date.getTime())) throw new BadRequestException(`${label} invalide.`);
  return date;
};
const day = (value?: string) => {
  const result = value || new Date().toISOString().slice(0, 10);
  const date = new Date(`${result}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== result) throw new BadRequestException('Date invalide.');
  return date;
};

@Injectable()
export class BoardingService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertBoarder(studentId: string, tx: Prisma.TransactionClient = this.prisma) {
    const student = await tx.student.findFirst({ where: { AND: [{ id: String(studentId || '') }, boarderWhere] }, select: { id: true, gender: true, firstName: true, lastName: true } });
    if (!student) throw new BadRequestException('Cet élève n’est pas un interne actif (régime « Interne », inscrit cette année).');
    return student;
  }

  private balances(studentIds: string[]) {
    return this.prisma.pocketMoneyEntry.groupBy({ by: ['studentId'], where: { studentId: { in: studentIds } }, _sum: { amount: true } })
      .then(rows => new Map(rows.map(row => [row.studentId, row._sum.amount || 0])));
  }

  // ── Overview and boarders ──────────────────────────────────────────────────────

  async overview() {
    const now = new Date();
    const today = day();
    const [boarders, beds, occupied, onLeave, lateReturns, rollCall, pocket, healthToday] = await Promise.all([
      this.prisma.student.groupBy({ by: ['gender'], where: boarderWhere, _count: { _all: true } }),
      this.prisma.boardingBed.count(),
      this.prisma.boardingBed.count({ where: { studentId: { not: null } } }),
      this.prisma.boardingLeave.count({ where: { returnedAt: null, departedAt: { lte: now } } }),
      this.prisma.boardingLeave.count({ where: { returnedAt: null, expectedReturnAt: { lt: now } } }),
      this.prisma.boardingRollCall.groupBy({ by: ['status'], where: { date: today }, _count: { _all: true } }),
      this.prisma.pocketMoneyEntry.aggregate({ _sum: { amount: true } }),
      this.prisma.boardingHealthLog.count({ where: { occurredAt: { gte: today } } }),
    ]);
    const count = (gender?: Gender) => boarders.filter(row => !gender || row.gender === gender).reduce((sum, row) => sum + row._count._all, 0);
    return {
      boarders: count(), boys: count('MALE'), girls: count('FEMALE'),
      beds, occupiedBeds: occupied, freeBeds: beds - occupied, onLeave, lateReturns, healthToday,
      rollCall: Object.fromEntries(rollCall.map(row => [row.status, row._count._all])),
      pocketMoneyHeld: pocket._sum.amount || 0,
    };
  }

  async boarders(search?: string) {
    const where: Prisma.StudentWhereInput = { ...boarderWhere };
    const needle = String(search || '').trim();
    if (needle) where.OR = [
      { firstName: { contains: needle, mode: 'insensitive' } }, { lastName: { contains: needle, mode: 'insensitive' } },
      { matricule: { contains: needle, mode: 'insensitive' } }, { schoolMatricule: { contains: needle, mode: 'insensitive' } },
    ];
    const students = await this.prisma.student.findMany({
      where, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true, matricule: true, firstName: true, lastName: true, gender: true, healthNotes: true, emergencyContactName: true, emergencyContactPhone: true,
        enrollments: { where: { academicYear: { isCurrent: true } }, take: 1, select: { classroom: { select: { id: true, name: true } } } },
        boardingBed: { select: { id: true, label: true, room: { select: { id: true, name: true } } } },
        boardingLeaves: { where: { returnedAt: null }, take: 1, orderBy: { departedAt: 'desc' }, select: { id: true, kind: true, departedAt: true, expectedReturnAt: true, pickupName: true } },
        parent: { select: { firstName: true, lastName: true, phone: true } },
      },
    });
    const balances = await this.balances(students.map(student => student.id));
    return students.map(({ enrollments, boardingLeaves, ...student }) => ({
      ...student, classroom: enrollments[0]?.classroom || null, currentLeave: boardingLeaves[0] || null, pocketBalance: balances.get(student.id) || 0,
    }));
  }

  /** Puts a group of pupils in the boarding house or back to day pupils; day pupils lose their bed. */
  async setBoarders(input: { studentIds?: string[]; isBoarder?: boolean }, actor: ActingUser) {
    const author = actorStamp(actor);
    if (typeof input?.isBoarder !== 'boolean') throw new BadRequestException('Régime invalide.');
    if (!Array.isArray(input.studentIds)) throw new BadRequestException('Sélection d’élèves invalide.');
    const ids = [...new Set(input.studentIds.map(id => String(id || '').trim()).filter(Boolean))];
    if (!ids.length) throw new BadRequestException('Sélectionnez au moins un élève.');
    if (ids.length > 1000) throw new BadRequestException('Vous ne pouvez pas modifier plus de 1 000 élèves à la fois.');
    const isBoarder = input.isBoarder;
    return this.prisma.$transaction(async tx => {
      const students = await tx.student.findMany({
        where: { id: { in: ids }, status: 'ACTIVE', departure: { is: null }, ...(isBoarder ? { enrollments: { some: { status: 'REGISTERED', academicYear: { isCurrent: true } } } } : {}) },
        select: { id: true, isBoarder: true },
      });
      if (students.length !== ids.length) throw new BadRequestException(isBoarder
        ? 'Un ou plusieurs élèves sont introuvables, partis ou non inscrits cette année. Actualisez la liste.'
        : 'Un ou plusieurs élèves sont introuvables ou partis. Actualisez la liste.');
      const changed = students.filter(student => student.isBoarder !== isBoarder).map(student => student.id);
      if (changed.length) {
        await tx.student.updateMany({ where: { id: { in: changed } }, data: { isBoarder, updatedById: author.id, updatedByName: author.name } });
        if (!isBoarder) await tx.boardingBed.updateMany({ where: { studentId: { in: changed } }, data: { studentId: null, assignedAt: null } });
        await tx.businessAudit.createMany({ data: changed.map(entityId => ({ action: 'STUDENT_BOARDING_CHANGED', entityId, actorId: author.id, actorName: author.name, actorRole: author.role,
          details: JSON.stringify({ isBoarder }) })) });
      }
      return { selectedCount: ids.length, updatedCount: changed.length, isBoarder };
    });
  }

  // ── Rooms and beds ─────────────────────────────────────────────────────────────

  rooms() {
    return this.prisma.boardingRoom.findMany({
      orderBy: [{ building: 'asc' }, { name: 'asc' }],
      include: { beds: { orderBy: { label: 'asc' }, include: { student: { select: { id: true, firstName: true, lastName: true, matricule: true, gender: true } } } } },
    });
  }

  private roomData(input: any) {
    // Every room is for boys or for girls: there are no mixed rooms.
    const gender = String(input?.gender || '');
    if (!['MALE', 'FEMALE'].includes(gender)) throw new BadRequestException('Choisissez une chambre de garçons ou de filles.');
    return {
      name: text(input?.name, 80, 'Le nom de la chambre', true)!,
      building: text(input?.building, 80, 'Le bâtiment'),
      supervisorName: text(input?.supervisorName, 120, 'Le surveillant'),
      notes: text(input?.notes, 500, 'Les notes'),
      gender: gender as Gender,
    };
  }

  async createRoom(input: any) {
    const data = this.roomData(input);
    const beds = Number(input?.beds ?? 0);
    if (!Number.isInteger(beds) || beds < 0 || beds > 100) throw new BadRequestException('Nombre de lits invalide (0 à 100).');
    try {
      return await this.prisma.boardingRoom.create({ data: { ...data, beds: { create: Array.from({ length: beds }, (_, index) => ({ label: `Lit ${index + 1}` })) } }, include: { beds: true } });
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('Une chambre porte déjà ce nom.');
      throw error;
    }
  }

  async updateRoom(id: string, input: any) {
    const data = this.roomData(input);
    const room = await this.prisma.boardingRoom.findUnique({ where: { id }, include: { beds: { include: { student: { select: { gender: true } } } } } });
    if (!room) throw new NotFoundException('Chambre introuvable.');
    if (data.gender && room.beds.some(bed => bed.student && bed.student.gender !== data.gender)) throw new BadRequestException('Des élèves de l’autre sexe occupent cette chambre : libérez leurs lits d’abord.');
    try { return await this.prisma.boardingRoom.update({ where: { id }, data }); }
    catch (error: any) { if (error?.code === 'P2002') throw new ConflictException('Une chambre porte déjà ce nom.'); throw error; }
  }

  async deleteRoom(id: string) {
    const occupied = await this.prisma.boardingBed.count({ where: { roomId: id, studentId: { not: null } } });
    if (occupied) throw new BadRequestException('Libérez tous les lits avant de supprimer la chambre.');
    await this.prisma.boardingRoom.delete({ where: { id } }).catch(() => { throw new NotFoundException('Chambre introuvable.'); });
    return { deleted: true };
  }

  async addBed(roomId: string, input: any) {
    const label = text(input?.label, 40, 'Le nom du lit', true)!;
    try { return await this.prisma.boardingBed.create({ data: { roomId, label } }); }
    catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('Ce lit existe déjà dans la chambre.');
      if (error?.code === 'P2003') throw new NotFoundException('Chambre introuvable.');
      throw error;
    }
  }

  async deleteBed(id: string) {
    const bed = await this.prisma.boardingBed.findUnique({ where: { id } });
    if (!bed) throw new NotFoundException('Lit introuvable.');
    if (bed.studentId) throw new BadRequestException('Libérez ce lit avant de le supprimer.');
    await this.prisma.boardingBed.delete({ where: { id } });
    return { deleted: true };
  }

  /** Puts a boarder in a bed (moving them from their previous bed), or frees the bed with studentId = null. */
  async assignBed(bedId: string, input: { studentId?: string | null }) {
    return this.prisma.$transaction(async tx => {
      const bed = await tx.boardingBed.findUnique({ where: { id: bedId }, include: { room: true } });
      if (!bed) throw new NotFoundException('Lit introuvable.');
      if (!input?.studentId) return tx.boardingBed.update({ where: { id: bedId }, data: { studentId: null, assignedAt: null } });
      const student = await this.assertBoarder(input.studentId, tx);
      if (bed.studentId && bed.studentId !== student.id) throw new BadRequestException('Ce lit est déjà occupé : libérez-le d’abord.');
      if (bed.room.gender && bed.room.gender !== student.gender) throw new BadRequestException(`Cette chambre est réservée aux ${bed.room.gender === 'MALE' ? 'garçons' : 'filles'}.`);
      await tx.boardingBed.updateMany({ where: { studentId: student.id, NOT: { id: bedId } }, data: { studentId: null, assignedAt: null } });
      return tx.boardingBed.update({ where: { id: bedId }, data: { studentId: student.id, assignedAt: new Date() } });
    });
  }

  // ── Evening roll call ──────────────────────────────────────────────────────────

  async rollCall(dateStr?: string) {
    const date = day(dateStr);
    const end = new Date(date.getTime() + 86_400_000);
    const [boarders, records, leaves] = await Promise.all([
      this.prisma.student.findMany({ where: boarderWhere, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], select: {
        id: true, firstName: true, lastName: true, matricule: true, gender: true,
        boardingBed: { select: { label: true, room: { select: { name: true } } } },
        enrollments: { where: { academicYear: { isCurrent: true } }, take: 1, select: { classroom: { select: { name: true } } } },
      } }),
      this.prisma.boardingRollCall.findMany({ where: { date } }),
      // A pupil out on an authorised leave that evening is pre-filled "en sortie".
      this.prisma.boardingLeave.findMany({ where: { departedAt: { lt: end }, OR: [{ returnedAt: null }, { returnedAt: { gte: end } }] }, select: { studentId: true } }),
    ]);
    const byStudent = new Map(records.map(record => [record.studentId, record]));
    const away = new Set(leaves.map(leave => leave.studentId));
    return { date: date.toISOString().slice(0, 10), rows: boarders.map(({ enrollments, ...student }) => {
      const record = byStudent.get(student.id);
      return { ...student, classroom: enrollments[0]?.classroom?.name || null, status: record?.status || (away.has(student.id) ? 'ON_LEAVE' : null),
        notes: record?.notes || '', recorded: Boolean(record), recordedBy: record?.actorName || null };
    }) };
  }

  async saveRollCall(input: { date?: string; records?: { studentId: string; status: string; notes?: string }[] }, actor: ActingUser) {
    const author = actorStamp(actor);
    const date = day(input?.date);
    if (date > day()) throw new BadRequestException('L’appel ne peut pas être enregistré pour une date future.');
    const records = Array.isArray(input?.records) ? input.records : [];
    if (!records.length || records.length > 1000) throw new BadRequestException('Aucune présence à enregistrer.');
    for (const record of records) if (!ROLL_CALL_STATUSES.includes(record?.status as any)) throw new BadRequestException('Statut de présence invalide.');
    const ids = [...new Set(records.map(record => String(record.studentId)))];
    const boarders = await this.prisma.student.findMany({ where: { AND: [{ id: { in: ids } }, boarderWhere] }, select: { id: true } });
    if (boarders.length !== ids.length) throw new BadRequestException('La liste contient un élève qui n’est pas interne. Actualisez la page.');
    await this.prisma.$transaction(records.map(record => this.prisma.boardingRollCall.upsert({
      where: { studentId_date: { studentId: String(record.studentId), date } },
      create: { studentId: String(record.studentId), date, status: record.status, notes: text(record.notes, 300, 'La remarque'), actorId: author.id, actorName: author.name },
      update: { status: record.status, notes: text(record.notes, 300, 'La remarque'), actorId: author.id, actorName: author.name },
    })));
    return { saved: records.length };
  }

  // ── Leaves (sorties) and visits ────────────────────────────────────────────────

  leaves(params: { open?: string; studentId?: string }) {
    const where: Prisma.BoardingLeaveWhereInput = {};
    if (params.open === 'true') where.returnedAt = null;
    if (params.studentId) where.studentId = String(params.studentId);
    return this.prisma.boardingLeave.findMany({ where, orderBy: { departedAt: 'desc' }, take: 300,
      include: { student: { select: { id: true, firstName: true, lastName: true, matricule: true } } } });
  }

  async createLeave(input: any, actor: ActingUser) {
    const author = actorStamp(actor);
    const kind = String(input?.kind || '');
    if (!LEAVE_KINDS.includes(kind as any)) throw new BadRequestException('Type de sortie invalide.');
    const departedAt = dateTime(input?.departedAt, 'Date de départ');
    const expectedReturnAt = dateTime(input?.expectedReturnAt, 'Date de retour prévue');
    if (expectedReturnAt <= departedAt) throw new BadRequestException('Le retour prévu doit être après le départ.');
    return this.prisma.$transaction(async tx => {
      const student = await this.assertBoarder(input?.studentId, tx);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'LEAVE:' + student.id}))`;
      if (await tx.boardingLeave.findFirst({ where: { studentId: student.id, returnedAt: null } })) throw new BadRequestException('Cet élève est déjà en sortie : enregistrez d’abord son retour.');
      return tx.boardingLeave.create({ data: {
        studentId: student.id, kind, departedAt, expectedReturnAt,
        pickupName: text(input?.pickupName, 120, 'La personne qui récupère l’élève', true)!,
        pickupRelation: text(input?.pickupRelation, 60, 'Le lien avec l’élève'), pickupPhone: text(input?.pickupPhone, 30, 'Le téléphone'),
        notes: text(input?.notes, 500, 'Les notes'), actorId: author.id, actorName: author.name, actorRole: author.role,
      } });
    });
  }

  async returnLeave(id: string, input: { returnedAt?: string }, actor: ActingUser) {
    const author = actorStamp(actor);
    const returnedAt = input?.returnedAt ? dateTime(input.returnedAt, 'Date de retour') : new Date();
    const leave = await this.prisma.boardingLeave.findUnique({ where: { id } });
    if (!leave) throw new NotFoundException('Sortie introuvable.');
    if (returnedAt < leave.departedAt) throw new BadRequestException('Le retour ne peut pas précéder le départ.');
    const updated = await this.prisma.boardingLeave.updateMany({ where: { id, returnedAt: null }, data: { returnedAt, returnActorName: author.name } });
    if (!updated.count) throw new BadRequestException('Le retour de cette sortie est déjà enregistré.');
    return { returned: true };
  }

  visits(studentId?: string) {
    return this.prisma.boardingVisit.findMany({ where: studentId ? { studentId } : {}, orderBy: { visitedAt: 'desc' }, take: 300,
      include: { student: { select: { id: true, firstName: true, lastName: true, matricule: true } } } });
  }

  async createVisit(input: any, actor: ActingUser) {
    const author = actorStamp(actor);
    const student = await this.assertBoarder(input?.studentId);
    return this.prisma.boardingVisit.create({ data: {
      studentId: student.id, visitorName: text(input?.visitorName, 120, 'Le nom du visiteur', true)!,
      relation: text(input?.relation, 60, 'Le lien avec l’élève'), phone: text(input?.phone, 30, 'Le téléphone'),
      visitedAt: input?.visitedAt ? dateTime(input.visitedAt, 'Date de visite') : new Date(), notes: text(input?.notes, 500, 'Les notes'),
      actorId: author.id, actorName: author.name,
    } });
  }

  // ── Health ─────────────────────────────────────────────────────────────────────

  health(studentId?: string) {
    return this.prisma.boardingHealthLog.findMany({ where: studentId ? { studentId } : {}, orderBy: { occurredAt: 'desc' }, take: 300,
      include: { student: { select: { id: true, firstName: true, lastName: true, matricule: true } } } });
  }

  async createHealth(input: any, actor: ActingUser) {
    const author = actorStamp(actor);
    const student = await this.assertBoarder(input?.studentId);
    return this.prisma.boardingHealthLog.create({ data: {
      studentId: student.id, occurredAt: input?.occurredAt ? dateTime(input.occurredAt, 'Date') : new Date(),
      reason: text(input?.reason, 300, 'Le motif', true)!, care: text(input?.care, 500, 'Les soins'),
      medication: text(input?.medication, 300, 'Les médicaments'), parentNotified: input?.parentNotified === true,
      actorId: author.id, actorName: author.name,
    } });
  }

  // ── Pocket money ───────────────────────────────────────────────────────────────

  async pocketMoney(studentId: string) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId }, select: { id: true, firstName: true, lastName: true, matricule: true } });
    if (!student) throw new NotFoundException('Élève introuvable.');
    const entries = await this.prisma.pocketMoneyEntry.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' }, take: 200 });
    const balance = (await this.prisma.pocketMoneyEntry.aggregate({ where: { studentId }, _sum: { amount: true } }))._sum.amount || 0;
    return { student, balance, entries };
  }

  async recordPocketMoney(input: { studentId?: string; kind?: string; amount?: number; label?: string }, actor: ActingUser) {
    const author = actorStamp(actor);
    const amount = Number(input?.amount);
    if (!Number.isInteger(amount) || amount <= 0 || amount > 1_000_000) throw new BadRequestException('Montant invalide (nombre entier positif).');
    if (!['DEPOSIT', 'WITHDRAWAL'].includes(String(input?.kind))) throw new BadRequestException('Opération invalide.');
    const label = text(input?.label, 200, 'Le motif', true)!;
    return this.prisma.$transaction(async tx => {
      const student = await this.assertBoarder(String(input?.studentId), tx);
      // Serialise operations per pupil so two withdrawals cannot overdraw the balance.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'POCKET:' + student.id}))`;
      const balance = (await tx.pocketMoneyEntry.aggregate({ where: { studentId: student.id }, _sum: { amount: true } }))._sum.amount || 0;
      const signed = input.kind === 'WITHDRAWAL' ? -amount : amount;
      if (balance + signed < 0) throw new BadRequestException(`Solde insuffisant : ${balance} F CFA disponibles.`);
      await tx.pocketMoneyEntry.create({ data: { studentId: student.id, amount: signed, label, actorId: author.id, actorName: author.name, actorRole: author.role } });
      return { balance: balance + signed };
    });
  }
}
