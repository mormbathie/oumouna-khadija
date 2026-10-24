import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceStatus } from '@prisma/client';
import { ActingUser, actorStamp } from '../audit/actor';

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  private schoolDay(dateStr?: string) {
    if (!dateStr) {
      const now = new Date();
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new BadRequestException('La date doit être au format AAAA-MM-JJ.');
    }
    const day = new Date(dateStr + 'T00:00:00.000Z');
    if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== dateStr) {
      throw new BadRequestException('La date fournie est invalide.');
    }
    return day;
  }

  private async assertTeacherClassroom(classroomId: string, requester: any) {
    const roles: string[] = requester?.roles || [];
    if (!roles.includes('ENSEIGNANT') || roles.includes('ADMIN') || roles.includes('DIRECTEUR')) return;
    const assigned = requester?.email && await this.prisma.classroom.findFirst({
      where: { id: classroomId, teacher: { is: { email: requester.email } } },
      select: { id: true },
    });
    if (!assigned) throw new ForbiddenException('Cette classe ne vous est pas affectée.');
  }

  async getClassAttendanceSheet(classroomId: string, dateStr?: string, requester?: any) {
    await this.assertTeacherClassroom(classroomId, requester);
    const day = this.schoolDay(dateStr);

    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classroomId },
      include: {
        enrollments: {
          where: { status: 'REGISTERED', student: { status: 'ACTIVE' } },
          include: { student: true },
          orderBy: { student: { lastName: 'asc' } },
        },
      },
    });

    if (!classroom) throw new NotFoundException('Classe avec l’ID ' + classroomId + ' introuvable');

    const existingRecords = await this.prisma.attendance.findMany({
      where: { classroomId, date: day },
    });
    const recordMap = new Map(existingRecords.map((record) => [record.studentId, record]));

    const students = classroom.enrollments.map((enrollment) => {
      const existing = recordMap.get(enrollment.studentId);
      return {
        studentId: enrollment.studentId,
        student: enrollment.student,
        status: existing?.status || AttendanceStatus.ABSENT,
        reason: existing?.reason || '',
        justified: existing?.justified || false,
        remarks: existing?.remarks || '',
        checkInAt: existing?.checkInAt || null,
        recordId: existing?.id,
      };
    });

    return { classroomId, className: classroom.name, date: day, students };
  }

  async saveClassAttendanceSheet(data: {
    classroomId: string;
    date?: string;
    records: {
      studentId: string;
      status: AttendanceStatus;
      reason?: string;
      justified?: boolean;
      remarks?: string;
    }[];
  }, requester?: any) {
    if (!data?.classroomId || !Array.isArray(data.records)) {
      throw new BadRequestException('La classe et la liste des présences sont obligatoires.');
    }
    await this.assertTeacherClassroom(data.classroomId, requester);
    const enrolledIds = new Set((await this.prisma.enrollment.findMany({
      where: { classroomId: data.classroomId, status: 'REGISTERED', student: { status: 'ACTIVE' } },
      select: { studentId: true },
    })).map((item) => item.studentId));
    if (data.records.some((record) => !enrolledIds.has(record.studentId))) {
      throw new NotFoundException('La feuille contient un élève qui n’est pas inscrit dans cette classe.');
    }
    const day = this.schoolDay(data.date);

    for (const record of data.records) {
      await this.prisma.attendance.upsert({
        where: {
          studentId_classroomId_date: {
            studentId: record.studentId,
            classroomId: data.classroomId,
            date: day,
          },
        },
        update: {
          status: record.status,
          reason: record.reason,
          justified: record.justified ?? false,
          remarks: record.remarks,
        },
        create: {
          studentId: record.studentId,
          classroomId: data.classroomId,
          date: day,
          status: record.status,
          reason: record.reason,
          justified: record.justified ?? false,
          remarks: record.remarks,
        },
      });
    }

    return this.getClassAttendanceSheet(data.classroomId, data.date, requester);
  }

  async getScanRoster(classroomId: string, dateStr?: string) {
    const day = this.schoolDay(dateStr);
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classroomId },
      select: {
        id: true,
        name: true,
        level: true,
        enrollments: {
          where: { status: 'REGISTERED', student: { status: 'ACTIVE' } },
          select: {
            student: {
              select: { id: true, firstName: true, lastName: true, matricule: true },
            },
          },
          orderBy: { student: { lastName: 'asc' } },
        },
      },
    });
    if (!classroom) throw new NotFoundException('Classe introuvable.');

    const records = await this.prisma.attendance.findMany({
      where: { classroomId, date: day },
      select: { studentId: true, status: true, checkInAt: true, checkInByName: true },
    });
    const attendanceByStudent = new Map(records.map((record) => [record.studentId, record]));
    const students = classroom.enrollments.map(({ student }) => {
      const attendance = attendanceByStudent.get(student.id);
      return {
        ...student,
        status: attendance?.status || AttendanceStatus.ABSENT,
        checkInAt: attendance?.checkInAt || null,
        checkInByName: attendance?.checkInByName || null,
        scanned: Boolean(attendance?.checkInAt),
      };
    });
    const count = (status: AttendanceStatus) => students.filter((student) => student.status === status).length;

    return {
      classroom: { id: classroom.id, name: classroom.name, level: classroom.level },
      date: day.toISOString().slice(0, 10),
      students,
      summary: {
        total: students.length,
        present: count(AttendanceStatus.PRESENT),
        absent: count(AttendanceStatus.ABSENT),
        late: count(AttendanceStatus.LATE),
        excused: count(AttendanceStatus.EXCUSED),
      },
    };
  }

  async scanStudent(qrCode: string, classroomId?: string, actor?: ActingUser) {
    const operator = actor ? actorStamp(actor) : null;
    if (typeof qrCode !== 'string' || !qrCode.trim()) {
      throw new BadRequestException('Le QR code est obligatoire.');
    }

    let code = qrCode.trim();
    if (code.startsWith('OKATT1:')) code = code.slice('OKATT1:'.length);
    else if (code.startsWith('OSATT1:')) code = code.slice('OSATT1:'.length); // anciens badges du clone, pendant la transition locale
    const isMatricule = /^OS-\d{4}-\d{4,}$/i.test(code);
    const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(code);
    if (!isMatricule && !isId) {
      throw new BadRequestException('QR code invalide. Scannez la carte d’identité scolaire.');
    }

    const student = isMatricule
      ? await this.prisma.student.findUnique({
          where: { matricule: code },
          select: {
            id: true, matricule: true, firstName: true, lastName: true, status: true,
            enrollments: {
              where: { status: 'REGISTERED', student: { status: 'ACTIVE' } },
              include: { academicYear: true, classroom: { select: { id: true, name: true } } },
              orderBy: { enrollmentDate: 'desc' },
              take: 10,
            },
          },
        })
      : await this.prisma.student.findUnique({
          where: { id: code },
          select: {
            id: true, matricule: true, firstName: true, lastName: true, status: true,
            enrollments: {
              where: { status: 'REGISTERED', student: { status: 'ACTIVE' } },
              include: { academicYear: true, classroom: { select: { id: true, name: true } } },
              orderBy: { enrollmentDate: 'desc' },
              take: 10,
            },
          },
        });
    if (!student) throw new NotFoundException('Aucun élève ne correspond à ce QR code.');
    if (student.status !== 'ACTIVE') throw new BadRequestException('Cet élève n’est pas actif.');

    const enrollment = student.enrollments.find((item) => item.academicYear.isCurrent) || student.enrollments[0];
    if (!enrollment) throw new BadRequestException('Cet élève n’est inscrit dans aucune classe active.');
    if (classroomId && classroomId !== enrollment.classroomId) {
      throw new BadRequestException('Cet élève n’est pas inscrit dans la classe sélectionnée.');
    }

    const now = new Date();
    const day = this.schoolDay();
    const unique = {
      studentId_classroomId_date: {
        studentId: student.id,
        classroomId: enrollment.classroomId,
        date: day,
      },
    };
    let saved = await this.prisma.attendance.findUnique({ where: unique });
    let duplicate = false;

    if (saved?.checkInAt) {
      duplicate = true;
    } else if (saved) {
      const updated = await this.prisma.attendance.updateMany({
        where: { id: saved.id, checkInAt: null },
        data: { status: AttendanceStatus.PRESENT, checkInAt: now, reason: null, justified: false, ...(operator ? { checkInById: operator.id, checkInByName: operator.name } : {}) },
      });
      duplicate = updated.count === 0;
      saved = await this.prisma.attendance.findUnique({ where: unique });
    } else {
      try {
        saved = await this.prisma.attendance.create({
          data: {
            studentId: student.id,
            classroomId: enrollment.classroomId,
            date: day,
            status: AttendanceStatus.PRESENT,
            checkInAt: now,
            ...(operator ? { checkInById: operator.id, checkInByName: operator.name } : {}),
          },
        });
      } catch (error: any) {
        if (error?.code !== 'P2002') throw error;
        const updated = await this.prisma.attendance.updateMany({
          where: {
            studentId: student.id,
            classroomId: enrollment.classroomId,
            date: day,
            checkInAt: null,
          },
          data: { status: AttendanceStatus.PRESENT, checkInAt: now, reason: null, justified: false, ...(operator ? { checkInById: operator.id, checkInByName: operator.name } : {}) },
        });
        duplicate = updated.count === 0;
        saved = await this.prisma.attendance.findUnique({ where: unique });
      }
    }

    if (!saved) throw new NotFoundException('Le pointage de l’élève n’a pas pu être enregistré.');
    return {
      duplicate,
      student: {
        id: student.id,
        matricule: student.matricule,
        firstName: student.firstName,
        lastName: student.lastName,
      },
      classroom: enrollment.classroom,
      attendance: {
        status: saved.status,
        date: day.toISOString().slice(0, 10),
        checkInAt: saved.checkInAt,
        checkInByName: saved.checkInByName,
      },
    };
  }

  async finalizeScan(classroomId: string, dateStr?: string) {
    if (!classroomId) throw new BadRequestException('La classe est obligatoire.');
    const day = this.schoolDay(dateStr);
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classroomId },
      select: {
        id: true,
        enrollments: {
          where: { status: 'REGISTERED', student: { status: 'ACTIVE' } },
          select: { studentId: true },
        },
      },
    });
    if (!classroom) throw new NotFoundException('Classe introuvable.');

    const result = await this.prisma.attendance.createMany({
      data: classroom.enrollments.map(({ studentId }) => ({
        studentId,
        classroomId,
        date: day,
        status: AttendanceStatus.ABSENT,
      })),
      skipDuplicates: true,
    });
    return {
      ...await this.getScanRoster(classroomId, dateStr),
      absencesRecorded: result.count,
    };
  }

  async finalizeAllScans(dateStr?: string) {
    const classes = await this.prisma.classroom.findMany({
      where: { academicYear: { isCurrent: true } },
      select: { id: true },
    });
    let absencesRecorded = 0;
    for (const classroom of classes) {
      const result = await this.finalizeScan(classroom.id, dateStr);
      absencesRecorded += result.absencesRecorded;
    }
    return { classroomsFinalized: classes.length, absencesRecorded };
  }

  async getAttendanceStats(params: { classroomId?: string; startDate?: string; endDate?: string }, requester?: any) {
    const where: any = {};
    const roles: string[] = requester?.roles || [];
    if (roles.includes('ENSEIGNANT') && !roles.includes('ADMIN') && !roles.includes('DIRECTEUR')) {
      const assigned = await this.prisma.classroom.findMany({
        where: { teacher: { is: { email: requester.email } } }, select: { id: true },
      });
      const ids = assigned.map((item) => item.id);
      if (params.classroomId && !ids.includes(params.classroomId)) {
        throw new ForbiddenException('Cette classe ne vous est pas affectée.');
      }
      where.classroomId = params.classroomId || { in: ids };
    } else if (params.classroomId) where.classroomId = params.classroomId;

    if (params.startDate || params.endDate) {
      where.date = {};
      if (params.startDate) where.date.gte = this.schoolDay(params.startDate);
      if (params.endDate) where.date.lte = this.schoolDay(params.endDate);
    }

    const records = await this.prisma.attendance.findMany({ where });
    const total = records.length;
    const present = records.filter((record) => record.status === AttendanceStatus.PRESENT).length;
    const absent = records.filter((record) => record.status === AttendanceStatus.ABSENT).length;
    const late = records.filter((record) => record.status === AttendanceStatus.LATE).length;
    const excused = records.filter((record) => record.status === AttendanceStatus.EXCUSED).length;
    const justified = records.filter((record) => record.justified).length;
    const rate = total > 0 ? Math.round(((present + late) / total) * 1000) / 10 : 100;

    return {
      totalRecords: total,
      present,
      absent,
      late,
      excused,
      justifiedAbsences: justified,
      attendanceRate: rate,
    };
  }
}
