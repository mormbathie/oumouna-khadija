import { BadRequestException } from '@nestjs/common';
export const PROGRAMS = ['PRESCHOOL','ELEMENTARY','FULL_DAY','DAARA_DAY','DAARA_BOARDING','FRANCO_ARAB_BOARDING'];
export const LEVELS = ['PS','MS','GS','TAHFIZ','CI','CP','CE1','CE2','CM1','CM2'];
const ITEMS = ['BIRTH_CERTIFICATE','STUDENT_PHOTOS','VACCINATION_BOOK','BOARDING_KIT','SCHOOL_SUPPLIES'];
export function schoolOptions(data: Record<string, unknown>) {
  const result: Record<string, any> = {};
  if (data.transportZone !== undefined) {
    if (data.transportZone !== null && ![1].includes(data.transportZone as number)) throw new BadRequestException('Option de transport invalide.');
    result.transportZone = data.transportZone;
  }
  for (const key of ['karate','eveningClasses','fullDay','supplies']) if (data[key] !== undefined) {
    if (typeof data[key] !== 'boolean') throw new BadRequestException('Option scolaire invalide.');
    result[key] = data[key];
  }
  for (const key of ['emergencyContactName','emergencyContactPhone','healthNotes','schoolItemsProvided']) if (data[key] !== undefined) {
    if (data[key] !== null && typeof data[key] !== 'string') throw new BadRequestException('Renseignement scolaire invalide.');
    const value = String(data[key] || '').trim();
    if (value.length > (key === 'healthNotes' ? 2000 : 400)) throw new BadRequestException('Renseignement trop long.');
    if (key === 'schoolItemsProvided' && value.split(',').filter(Boolean).some(item => !ITEMS.includes(item))) throw new BadRequestException('Pièce du dossier invalide.');
    result[key] = value || null;
  }
  return result;
}
export function validateProgramAge(_program: string | null | undefined, birth: string | Date) {
  const date = new Date(birth);
  if (!Number.isFinite(date.getTime()) || date > new Date()) throw new BadRequestException('Date de naissance invalide.');
}
export const optionTariffs = { elementaryRegistration: 160000, supplies: 0, karateRegistration: 0, karateMonthly: 4000, snack: 10000, kimono: 10000, fullDayRegistration: 43000, elementaryFullDaySupplement: 0, fullDayMonthly: 12000, transport: { 1: 12000 } };
export type FeeOptions = { fullDay?: boolean; supplies?: boolean; karate?: boolean; eveningClasses?: boolean; transportZone?: number | null };
export type FeeClass = { level?: string; program?: string | null; registrationFee: number; monthlyTuition: number };
export const elementaryClass = (classroom: FeeClass) => classroom.program === 'ELEMENTARY' || ['CI','CP','CE1','CE2','CM1','CM2'].includes(classroom.level || '');
export function validateOptionsForClass(student: FeeOptions, classroom?: FeeClass | null) {
  if (!classroom) {
    if (student.karate || student.supplies || student.fullDay) throw new BadRequestException('Choisissez une classe pour ces options.');
    return;
  }
  if (student.karate && classroom.program === 'PRESCHOOL') throw new BadRequestException('Le taekwondo concerne l’internat.');
  if (student.supplies && classroom.program !== 'PRESCHOOL') throw new BadRequestException('L’option cantine concerne le préscolaire.');
  if (student.fullDay) throw new BadRequestException('L’option journée continue n’est pas proposée.');
}
export function schoolFees(student: FeeOptions, classroom: FeeClass) {
  const registrationBase = classroom.registrationFee;
  const transport = optionTariffs.transport[student.transportZone || 0] || 0;
  const snack = student.eveningClasses && classroom.program === 'PRESCHOOL' ? optionTariffs.snack : 0;
  const monthlyKarate = student.karate ? optionTariffs.karateMonthly : 0;
  const monthlyCanteen = student.supplies && classroom.program === 'PRESCHOOL' ? 12000 : 0;
  return { registrationFee: registrationBase + snack,
    monthlyTuition: classroom.monthlyTuition + transport + snack + monthlyKarate + monthlyCanteen };
}

// Keep a billing snapshot: legacy transport/karate flags were never charged automatically.
export function registrationAdjustment(current: FeeOptions, next: FeeOptions, previousClass: FeeClass, nextClass: FeeClass,
  invoice: { amount: number; registrationOptions?: string | null }) {
  let billed: FeeOptions;
  if (invoice.registrationOptions) {
    try { billed = JSON.parse(invoice.registrationOptions); }
    catch { throw new BadRequestException('Référence tarifaire illisible : faites vérifier la facture.'); }
    if (!billed || typeof billed !== 'object' || Array.isArray(billed)) throw new BadRequestException('Référence tarifaire invalide.');
    billed = schoolOptions(billed);
  } else {
    billed = { fullDay: Boolean(current.fullDay && invoice.amount === optionTariffs.fullDayRegistration), supplies: false, karate: false, transportZone: null };
  }
  const after = { ...billed };
  for (const key of ['fullDay','supplies','karate','eveningClasses','transportZone'] as const) {
    if ((current[key] || false) !== (next[key] || false)) (after as any)[key] = next[key] ?? (key === 'transportZone' ? null : false);
  }
  return { delta: schoolFees(after, nextClass).registrationFee - schoolFees(billed, previousClass).registrationFee,
    registrationOptions: JSON.stringify(after) };
}
export function registrationSnapshot(student: FeeOptions) {
  return JSON.stringify({ fullDay: !!student.fullDay, supplies: !!student.supplies, karate: !!student.karate, eveningClasses: !!student.eveningClasses, transportZone: student.transportZone ?? null });
}
