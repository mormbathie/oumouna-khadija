import { PROGRAMS, LEVELS, schoolFees, optionTariffs } from '../school/school-options';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class ClassesService {
  constructor(private prisma: PrismaService, private readonly users: UsersService) {}

  private pedagogicalOrder<T extends { level: string; name?: string }>(classes: T[]) {
    const levels = ['TPS', 'PS', 'MS', 'GS', 'CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'];
    return classes.sort((a, b) => {
      const left = levels.indexOf(String(a.level).toUpperCase());
      const right = levels.indexOf(String(b.level).toUpperCase());
      return (left < 0 ? 999 : left) - (right < 0 ? 999 : right) || String(a.name || '').localeCompare(String(b.name || ''), 'fr');
    });
  }

  async findAll(requester?: any) {
    const roles: string[] = requester?.roles || [];
    const managesAll = roles.includes('ADMIN') || roles.includes('DIRECTEUR');
    if (roles.includes('CONTROLEUR_PRESENCE') && !managesAll && !roles.includes('ENSEIGNANT')) {
      return this.pedagogicalOrder(await this.prisma.classroom.findMany({
        where: { academicYear: { isCurrent: true } },
        select: {
          id: true,
          name: true,
          level: true,
          academicYear: { select: { id: true, name: true } },
          _count: { select: { enrollments: { where: { status: 'REGISTERED', student: { status: 'ACTIVE' } } } } },
        },
        orderBy: { level: 'asc' },
      }));
    }
    if (roles.includes('ENSEIGNANT') && !managesAll) {
      if (!requester.email) return [];
      const assignedClasses = await this.prisma.classroom.findMany({
        where: { academicYear: { isCurrent: true }, teacher: { is: { email: requester.email } } },
        include: {
          academicYear: true,
          teacher: { select: { id: true, firstName: true, lastName: true, email: true } },
          _count: { select: { enrollments: { where: { status: 'REGISTERED', student: { status: 'ACTIVE' } } } } },
        },
        orderBy: { level: 'asc' },
      });
      return this.pedagogicalOrder(assignedClasses.map(classroom => ({ ...classroom, effectiveRegistrationFee: schoolFees({}, classroom).registrationFee })));
    }
    const classrooms = await this.prisma.classroom.findMany({
      where: { academicYear: { isCurrent: true } },
      include: {
        academicYear: true,
        teacher: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        _count: {
          select: { enrollments: { where: { status: 'REGISTERED', student: { status: 'ACTIVE' } } } },
        },
      },
      orderBy: { level: 'asc' },
    });
    return this.pedagogicalOrder(classrooms.map(classroom => ({ ...classroom, effectiveRegistrationFee: schoolFees({}, classroom).registrationFee })));
  }

  async currentYear() { return this.prisma.academicYear.findFirst({ where: { isCurrent: true }, select: { id: true, name: true } }); }

  async findOne(id: string, requester?: any) {
    const roles: string[] = requester?.roles || [];
    const isTeacher = roles.includes('ENSEIGNANT') && !roles.includes('ADMIN') && !roles.includes('DIRECTEUR');
    const classroom = await this.prisma.classroom.findUnique({
      where: { id },
      include: {
        academicYear: true,
        teacher: true,
        enrollments: {
          include: {
            student: {
              include: {
                parent: isTeacher
                  ? { select: { id: true, firstName: true, lastName: true, phone: true, relation: true } }
                  : true,
              },
            },
          },
        },
      },
    });

    if (!classroom) {
      throw new NotFoundException(`Classe avec l'ID ${id} non trouvée`);
    }
    if (isTeacher && classroom.teacher?.email !== requester.email) {
      throw new NotFoundException(`Classe avec l'ID ${id} non trouvée`);
    }

    return { ...classroom, effectiveRegistrationFee: schoolFees({}, classroom).registrationFee };
  }

  async getTeachers() {
    // Sync existing Keycloak accounts so teachers can be assigned immediately.
    const keycloakUsers = await this.users.findAll();
    const activeTeacherEmails = keycloakUsers
      .filter((user) => user.enabled && user.roles.includes('ENSEIGNANT') && user.email)
      .map((user) => user.email.toLowerCase());
    if (activeTeacherEmails.length === 0) return [];
    return this.prisma.user.findMany({
      where: { role: 'ENSEIGNANT', email: { in: activeTeacherEmails } },
      select: { id: true, username: true, firstName: true, lastName: true, email: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async create(data: {
    name: string;
    level: string;
    capacity?: number;
    monthlyTuition?: number;
    registrationFee?: number;
    academicYearId?: string;
    teacherId?: string;
    program?: string;
  }) {
    if (typeof data.name !== 'string' || !data.name.trim()) throw new BadRequestException('Le nom de la classe est obligatoire.');
    if (!LEVELS.includes(data.level)) throw new BadRequestException('Niveau invalide.');
    if (data.program && !PROGRAMS.includes(data.program)) throw new BadRequestException('Formule scolaire invalide.');
    for (const field of ['capacity','monthlyTuition','registrationFee'] as const) if (data[field] !== undefined && (!Number.isFinite(data[field]) || data[field]! < (field === 'capacity' ? 1 : 0) || (field === 'capacity' && !Number.isInteger(data[field])))) throw new BadRequestException('Tarif ou effectif invalide.');
    const academicYear = data.academicYearId
      ? await this.prisma.academicYear.findUnique({ where: { id: data.academicYearId } })
      : await this.getOrCreateCurrentAcademicYear();

    if (!academicYear) {
      throw new NotFoundException('Année scolaire introuvable');
    }

    return this.prisma.classroom.create({
      data: {
        name: data.name.trim(),
        level: data.level,
        program: data.program || null,
        capacity: data.capacity ?? 30,
        monthlyTuition: data.monthlyTuition ?? 25000,
        registrationFee: data.registrationFee ?? (data.level === 'CI' ? optionTariffs.elementaryRegistration : 50000),
        academicYearId: academicYear.id,
        teacherId: data.teacherId,
      },
      include: { academicYear: true, teacher: true },
    });
  }

  private async getOrCreateCurrentAcademicYear() {
    const currentYear = await this.prisma.academicYear.findFirst({
      where: { isCurrent: true },
      orderBy: { startDate: 'desc' },
    });

    if (currentYear) {
      return currentYear;
    }

    const today = new Date();
    const startYear = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
    const name = String(startYear) + '-' + String(startYear + 1);

    return this.prisma.academicYear.upsert({
      where: { name },
      update: { isCurrent: true },
      create: {
        name,
        startDate: new Date(Date.UTC(startYear, 8, 1)),
        endDate: new Date(Date.UTC(startYear + 1, 5, 30)),
        isCurrent: true,
      },
    });
  }

  async update(id: string, data: any) {
    const classroom = await this.prisma.classroom.findUnique({ where: { id }, select: { id: true } });
    if (!classroom) throw new NotFoundException('Classe introuvable.');
    const update: any = {};
    if (data.name !== undefined) {
      if (typeof data.name !== 'string' || !data.name.trim()) throw new BadRequestException('Le nom de la classe est obligatoire.');
      update.name = data.name.trim();
    }
    if (data.level !== undefined) {
      if (!LEVELS.includes(data.level)) throw new BadRequestException('Niveau invalide.');
      update.level = data.level;
    }
    for (const field of ['capacity', 'monthlyTuition', 'registrationFee'] as const) {
      if (data[field] !== undefined) {
        const value = Number(data[field]);
        if (!Number.isFinite(value) || value < (field === 'capacity' ? 1 : 0) || (field === 'capacity' && !Number.isInteger(value))) {
          throw new BadRequestException(`${field} est invalide.`);
        }
        update[field] = value;
      }
    }
    if (data.program !== undefined) {
      if (data.program !== null && !PROGRAMS.includes(data.program)) throw new BadRequestException('Formule scolaire invalide.');
      update.program = data.program;
    }
    if (data.teacherId !== undefined) {
      if (data.teacherId) {
        const teacher = await this.prisma.user.findFirst({ where: { id: data.teacherId, role: 'ENSEIGNANT' }, select: { id: true } });
        if (!teacher) throw new BadRequestException('Enseignant introuvable.');
      }
      update.teacherId = data.teacherId || null;
    }
    return this.prisma.classroom.update({
      where: { id },
      data: update,
    });
  }

  async getAcademicYears() {
    return this.prisma.academicYear.findMany({
      orderBy: { startDate: 'desc' },
    });
  }

  async getSubjects() {
    return this.prisma.subject.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async createSubject(data: { name: string; code: string; coefficient?: number; level?: string }) {
    if (!data.name?.trim() || !data.code?.trim()) throw new BadRequestException('Le nom et le code de la matière sont obligatoires.');
    const coefficient = Number(data.coefficient ?? 1);
    if (!Number.isFinite(coefficient) || coefficient <= 0) throw new BadRequestException('Coefficient invalide.');
    return this.prisma.subject.create({
      data: {
        name: data.name.trim(),
        code: data.code.trim().toUpperCase(),
        coefficient,
        level: data.level,
      },
    });
  }

  async updateSubject(id: string, data: { name?: string; code?: string; coefficient?: number; level?: string | null }) {
    const subject = await this.prisma.subject.findUnique({ where: { id }, select: { id: true } });
    if (!subject) throw new NotFoundException('Matière introuvable.');
    const update: any = {};
    if (data.name !== undefined) {
      if (!data.name?.trim()) throw new BadRequestException('Le nom de la matière est obligatoire.');
      update.name = data.name.trim();
    }
    if (data.code !== undefined) {
      if (!data.code?.trim()) throw new BadRequestException('Le code de la matière est obligatoire.');
      update.code = data.code.trim().toUpperCase();
    }
    if (data.coefficient !== undefined) {
      const coefficient = Number(data.coefficient);
      if (!Number.isFinite(coefficient) || coefficient <= 0) throw new BadRequestException('Coefficient invalide.');
      update.coefficient = coefficient;
    }
    if (data.level !== undefined) update.level = data.level || null;
    return this.prisma.subject.update({ where: { id }, data: update });
  }
}
