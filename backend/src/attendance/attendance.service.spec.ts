import { AttendanceService } from './attendance.service';
import { AttendanceStatus } from '@prisma/client';

describe('AttendanceService QR check-in', () => {
  const classroomId = '00000000-0000-4000-8000-000000000001';
  const studentId = '00000000-0000-4000-8000-000000000002';
  const enrollment = {
    classroomId,
    classroom: { id: classroomId, name: 'CP A' },
    academicYear: { isCurrent: true },
  };
  const student = {
    id: studentId,
    matricule: 'OS-2026-0001',
    firstName: 'Awa',
    lastName: 'Test',
    status: 'ACTIVE',
    enrollments: [enrollment],
  };

  function setup() {
    const prisma: any = {
      student: { findUnique: jest.fn().mockResolvedValue(student) },
      attendance: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(({ data }) => Promise.resolve({ id: 'attendance-id', ...data })),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      classroom: { findUnique: jest.fn(), findMany: jest.fn() },
      enrollment: { findMany: jest.fn() },
    };
    return { prisma, service: new AttendanceService(prisma) };
  }

  it('records the first scan as present with an arrival timestamp', async () => {
    const { prisma, service } = setup();

    const result = await service.scanStudent('OKATT1:' + studentId);

    expect(prisma.attendance.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        studentId,
        classroomId,
        status: AttendanceStatus.PRESENT,
        checkInAt: expect.any(Date),
      }),
    }));
    expect(result.duplicate).toBe(false);
    expect(result.classroom).toEqual(enrollment.classroom);
    expect(result.attendance.checkInAt).toBeInstanceOf(Date);
  });

  it('does not overwrite the first arrival time on a duplicate scan', async () => {
    const { prisma, service } = setup();
    const firstArrival = new Date('2026-10-01T07:15:00.000Z');
    prisma.attendance.findUnique.mockResolvedValue({
      id: 'attendance-id',
      status: AttendanceStatus.PRESENT,
      checkInAt: firstArrival,
    });

    const result = await service.scanStudent(studentId);

    expect(result.duplicate).toBe(true);
    expect(result.attendance.checkInAt).toEqual(firstArrival);
    expect(prisma.attendance.create).not.toHaveBeenCalled();
    expect(prisma.attendance.updateMany).not.toHaveBeenCalled();
  });

  it('records students without a scan as absent when the roll call is closed', async () => {
    const { prisma, service } = setup();
    prisma.classroom.findUnique.mockResolvedValue({
      id: classroomId,
      name: 'CP A',
      level: 'CP',
      enrollments: [
        { studentId, student: { id: studentId, firstName: 'Awa', lastName: 'Test', matricule: 'OS-2026-0001' } },
      ],
    });
    prisma.attendance.createMany.mockResolvedValue({ count: 1 });

    const result = await service.finalizeScan(classroomId, '2026-10-01');

    expect(prisma.attendance.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ studentId, classroomId, status: AttendanceStatus.ABSENT })],
      skipDuplicates: true,
    }));
    expect(result.absencesRecorded).toBe(1);
    expect(result.summary.absent).toBe(1);
  });

  it('rejects malformed QR payloads', async () => {
    const { prisma, service } = setup();

    await expect(service.scanStudent('not-a-student', classroomId)).rejects.toThrow('QR code invalide');
    expect(prisma.student.findUnique).not.toHaveBeenCalled();
  });

  it('closes every current-year class without requiring a class selection', async () => {
    const { prisma, service } = setup();
    prisma.classroom.findMany.mockResolvedValue([{ id: 'class-a' }, { id: 'class-b' }]);
    const finalize = jest.spyOn(service, 'finalizeScan').mockResolvedValueOnce({ absencesRecorded: 2 } as any).mockResolvedValueOnce({ absencesRecorded: 1 } as any);

    await expect(service.finalizeAllScans('2026-10-02')).resolves.toEqual({ classroomsFinalized: 2, absencesRecorded: 3 });
    expect(prisma.classroom.findMany).toHaveBeenCalledWith({ where: { academicYear: { isCurrent: true } }, select: { id: true } });
    expect(finalize).toHaveBeenNthCalledWith(1, 'class-a', '2026-10-02');
    expect(finalize).toHaveBeenNthCalledWith(2, 'class-b', '2026-10-02');
  });
});
