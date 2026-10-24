import { PrismaClient, Role, Gender, StudentStatus, InvoiceStatus, InvoiceType, PaymentMethod, AttendanceStatus, Term } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Clean existing records in correct order
  await prisma.attendance.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.grade.deleteMany();
  await prisma.reportCard.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.student.deleteMany();
  await prisma.parent.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.classroom.deleteMany();
  await prisma.academicYear.deleteMany();
  await prisma.user.deleteMany();

  // 2. Create Users (matching Keycloak users)
  const adminUser = await prisma.user.create({
    data: {
      username: 'admin',
      email: 'admin@oumounakhadidja-academie.com',
      firstName: 'Mamadou',
      lastName: 'Diallo',
      role: Role.ADMIN,
      phone: '+221 77 123 45 67',
    },
  });

  const comptableUser = await prisma.user.create({
    data: {
      username: 'comptable',
      email: 'comptable@oumounakhadidja-academie.com',
      firstName: 'Fatou',
      lastName: 'Ndiaye',
      role: Role.COMPTABLE,
      phone: '+221 77 234 56 78',
    },
  });

  const teacher1 = await prisma.user.create({
    data: {
      username: 'enseignant',
      email: 'enseignant@oumounakhadidja-academie.com',
      firstName: 'Ibrahima',
      lastName: 'Sow',
      role: Role.ENSEIGNANT,
      phone: '+221 77 345 67 89',
    },
  });

  const teacher2 = await prisma.user.create({
    data: {
      username: 'mariama',
      email: 'mariama.ba@oumounakhadidja-academie.com',
      firstName: 'Mariama',
      lastName: 'Bâ',
      role: Role.ENSEIGNANT,
      phone: '+221 77 456 78 90',
    },
  });

  // 3. Academic Year
  const currentYear = await prisma.academicYear.create({
    data: {
      name: '2026-2027',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2027-07-31'),
      isCurrent: true,
    },
  });

  // 4. Classrooms
  const classesData = [
    { name: 'Petite section', level: 'PS', program: 'PRESCHOOL', capacity: 25, monthlyTuition: 12000, registrationFee: 43000, teacherId: teacher1.id },
    { name: 'Moyenne section', level: 'MS', program: 'PRESCHOOL', capacity: 25, monthlyTuition: 12000, registrationFee: 43000, teacherId: teacher2.id },
    { name: 'Grande section', level: 'GS', program: 'PRESCHOOL', capacity: 25, monthlyTuition: 12000, registrationFee: 43000, teacherId: teacher1.id },
    { name: 'Internat Tahfiz', level: 'TAHFIZ', program: 'DAARA_BOARDING', capacity: 30, monthlyTuition: 91000, registrationFee: 160000, teacherId: teacher2.id },
    { name: 'Internat franco-arabe CI', level: 'CI', program: 'FRANCO_ARAB_BOARDING', capacity: 25, monthlyTuition: 91000, registrationFee: 160000, teacherId: teacher1.id },
    { name: 'Internat franco-arabe CP', level: 'CP', program: 'FRANCO_ARAB_BOARDING', capacity: 25, monthlyTuition: 91000, registrationFee: 160000, teacherId: teacher2.id },
  ];

  const createdClasses: Record<string, any> = {};
  for (const c of classesData) {
    const created = await prisma.classroom.create({
      data: {
        ...c,
        academicYearId: currentYear.id,
      },
    });
    createdClasses[c.level] = created;
  }

  // 5. Subjects (Matières de l'enseignement primaire)
  const subjectsData = [
    { name: 'Français (Lecture & Écriture)', code: 'FRANCAIS', coefficient: 3.0 },
    { name: 'Mathématiques (Calcul & Géométrie)', code: 'MATHS', coefficient: 3.0 },
    { name: 'Éveil Scientifique & Techno (IST)', code: 'EVEIL', coefficient: 2.0 },
    { name: 'Histoire & Géographie', code: 'HIST_GEO', coefficient: 1.5 },
    { name: 'Éducation Civique & Morale', code: 'CIVISME', coefficient: 1.0 },
    { name: 'Arts Plastiques & Dessin', code: 'DESSIN', coefficient: 1.0 },
    { name: 'Éducation Physique et Sportive (EPS)', code: 'EPS', coefficient: 1.0 },
  ];

  const createdSubjects: Record<string, any> = {};
  for (const s of subjectsData) {
    const created = await prisma.subject.create({ data: s });
    createdSubjects[s.code] = created;
  }

  // 6. Parents
  const parentsData = [
    { firstName: 'Abdoulaye', lastName: 'Diop', phone: '+221 77 555 11 22', email: 'abdoulaye.diop@gmail.com', address: 'Almadies, Dakar', profession: 'Ingénieur Télécom', relation: 'Père' },
    { firstName: 'Aminata', lastName: 'Fall', phone: '+221 78 666 33 44', email: 'aminata.fall@yahoo.fr', address: 'Mermoz, Dakar', profession: 'Médecin Pédiatre', relation: 'Mère' },
    { firstName: 'Cheikh', lastName: 'Sarr', phone: '+221 76 777 55 66', email: 'cheikh.sarr@hotmail.com', address: 'Ouakam, Dakar', profession: 'Commerçant', relation: 'Père' },
    { firstName: 'Awa', lastName: 'Gueye', phone: '+221 70 888 77 88', email: 'awa.gueye@gmail.com', address: 'Sacré-Cœur 3, Dakar', profession: 'Professeure', relation: 'Mère' },
    { firstName: 'Moussa', lastName: 'Kane', phone: '+221 77 999 99 00', email: 'moussa.kane@orange.sn', address: 'Yoff, Dakar', profession: 'Avocat', relation: 'Père' },
  ];

  const createdParents: any[] = [];
  for (const p of parentsData) {
    const parent = await prisma.parent.create({ data: p });
    createdParents.push(parent);
  }

  // 7. Students (Élèves)
  const studentsData = [
    { matricule: 'OK-2026-0001', firstName: 'Seydina', lastName: 'Diop', gender: Gender.MALE, dateOfBirth: new Date('2022-04-12'), placeOfBirth: 'Dakar', parentId: createdParents[0].id, level: 'PS' },
    { matricule: 'OK-2026-0002', firstName: 'Khadija', lastName: 'Diop', gender: Gender.FEMALE, dateOfBirth: new Date('2021-09-20'), placeOfBirth: 'Dakar', parentId: createdParents[0].id, level: 'MS' },
    { matricule: 'OK-2026-0003', firstName: 'Omar', lastName: 'Fall', gender: Gender.MALE, dateOfBirth: new Date('2019-02-15'), placeOfBirth: 'Saint-Louis', parentId: createdParents[1].id, level: 'TAHFIZ' },
  ];

  const createdStudents: any[] = [];
  for (const s of studentsData) {
    const { level, ...data } = s;
    const student = await prisma.student.create({ data });
    const targetClass = createdClasses[level];

    // Create Enrollment
    await prisma.enrollment.create({
      data: {
        studentId: student.id,
        classroomId: targetClass.id,
        academicYearId: currentYear.id,
        status: 'REGISTERED',
      },
    });

    createdStudents.push({ student, targetClass });
  }

  // 8. Invoices & Payments (Factures et Versements)
  let invCount = 1;
  let payCount = 1;

  for (const item of createdStudents) {
    const { student, targetClass } = item;

    // Inscription Invoice
    const regInvoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `FAC-2026-${String(invCount++).padStart(4, '0')}`,
        studentId: student.id,
        academicYearId: currentYear.id,
        title: `Frais d'inscription & Tenue scolaire 2026-2027`,
        type: InvoiceType.REGISTRATION,
        amount: targetClass.registrationFee,
        paidAmount: targetClass.registrationFee,
        balance: 0,
        dueDate: new Date('2026-10-15'),
        status: InvoiceStatus.PAID,
      },
    });

    // Payment for registration
    await prisma.payment.create({
      data: {
        paymentNumber: `REC-2026-${String(payCount++).padStart(4, '0')}`,
        invoiceId: regInvoice.id,
        amount: targetClass.registrationFee,
        paymentDate: new Date('2026-10-02'),
        paymentMethod: PaymentMethod.WAVE,
        reference: `WAVE-TRX-${Math.floor(100000 + Math.random() * 900000)}`,
        receivedBy: comptableUser.firstName + ' ' + comptableUser.lastName,
        notes: 'Paiement intégral inscription',
      },
    });

    // Tuition October Invoice
    const isPaid = Math.random() > 0.3;
    const paidAmt = isPaid ? targetClass.monthlyTuition : (Math.random() > 0.5 ? 15000 : 0);
    const balance = targetClass.monthlyTuition - paidAmt;
    const status = balance === 0 ? InvoiceStatus.PAID : (paidAmt > 0 ? InvoiceStatus.PARTIAL : InvoiceStatus.UNPAID);

    const tuitionInvoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `FAC-2026-${String(invCount++).padStart(4, '0')}`,
        studentId: student.id,
        academicYearId: currentYear.id,
        title: `Scolarité Mois d'Octobre 2026`,
        type: InvoiceType.TUITION,
        amount: targetClass.monthlyTuition,
        paidAmount: paidAmt,
        balance: balance,
        dueDate: new Date('2026-10-10'),
        status: status,
      },
    });

    if (paidAmt > 0) {
      await prisma.payment.create({
        data: {
          paymentNumber: `REC-2026-${String(payCount++).padStart(4, '0')}`,
          invoiceId: tuitionInvoice.id,
          amount: paidAmt,
          paymentDate: new Date('2026-10-08'),
          paymentMethod: PaymentMethod.CASH,
          receivedBy: comptableUser.firstName + ' ' + comptableUser.lastName,
          notes: status === InvoiceStatus.PARTIAL ? 'Versement partiel' : 'Paiement mensuel comptant',
        },
      });
    }
  }

  // 9. Grades (Notes) for Students in CE1
  const ce1Students = createdStudents.filter(s => s.targetClass.level === 'CE1');
  const ce1Class = createdClasses['CE1'];

  for (const item of ce1Students) {
    const s = item.student;
    // Notes Français
    await prisma.grade.create({
      data: {
        studentId: s.id,
        classroomId: ce1Class.id,
        academicYearId: currentYear.id,
        subjectId: createdSubjects['FRANCAIS'].id,
        term: Term.TRIMESTRE_1,
        score: Math.round((12 + Math.random() * 6) * 10) / 10,
        maxScore: 20,
        coefficient: 3.0,
        examType: 'COMPOSITION',
        remarks: 'Bonne participation',
      },
    });

    // Notes Maths
    await prisma.grade.create({
      data: {
        studentId: s.id,
        classroomId: ce1Class.id,
        academicYearId: currentYear.id,
        subjectId: createdSubjects['MATHS'].id,
        term: Term.TRIMESTRE_1,
        score: Math.round((11 + Math.random() * 7) * 10) / 10,
        maxScore: 20,
        coefficient: 3.0,
        examType: 'COMPOSITION',
        remarks: 'Bon raisonnement',
      },
    });

    // Notes Éveil
    await prisma.grade.create({
      data: {
        studentId: s.id,
        classroomId: ce1Class.id,
        academicYearId: currentYear.id,
        subjectId: createdSubjects['EVEIL'].id,
        term: Term.TRIMESTRE_1,
        score: Math.round((13 + Math.random() * 5) * 10) / 10,
        maxScore: 20,
        coefficient: 2.0,
        examType: 'COMPOSITION',
        remarks: 'Élève curieux et appliqué',
      },
    });

    // Report Card
    const avg = Math.round((13.5 + Math.random() * 3) * 10) / 10;
    await prisma.reportCard.create({
      data: {
        studentId: s.id,
        classroomId: ce1Class.id,
        academicYearId: currentYear.id,
        term: Term.TRIMESTRE_1,
        overallAverage: avg,
        totalCoeff: 8.0,
        totalScore: Math.round(avg * 8 * 10) / 10,
        totalMaxScore: 160,
        rank: s.matricule.endsWith('0002') ? 1 : 2,
        classAverage: 14.2,
        minAverage: 11.5,
        maxAverage: 17.8,
        appreciation: avg >= 16 ? 'Très Bien - Félicitations' : 'Bien - Tableau d\'Honneur',
        teacherRemarks: 'Excellent travail ce trimestre. Continue ainsi !',
        directorRemarks: 'Félicitations pour ces résultats remarquables.',
      },
    });
  }

  // 10. Attendances (Présences / Absences)
  const today = new Date();
  for (const item of createdStudents) {
    const isAbsent = Math.random() < 0.15;
    const isLate = !isAbsent && Math.random() < 0.1;

    await prisma.attendance.create({
      data: {
        studentId: item.student.id,
        classroomId: item.targetClass.id,
        date: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
        status: isAbsent ? AttendanceStatus.ABSENT : (isLate ? AttendanceStatus.LATE : AttendanceStatus.PRESENT),
        reason: isAbsent ? 'Raison de santé (grippe)' : (isLate ? 'Embouteillages' : null),
        justified: isAbsent ? true : false,
      },
    });
  }

  console.log('✅ Database seeded successfully with realistic primary school data!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
