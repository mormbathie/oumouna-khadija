import catalogData from './catalog.json';

export type Language = 'fr' | 'en' | 'ar';
const catalog: Record<string, Record<Language, string>> = catalogData;
const aliases = new Map<string, string>();
for (const [key, entry] of Object.entries(catalog)) {
  aliases.set(entry.fr, key);
  aliases.set(entry.en, key);
}
const supported: Language[] = ['fr', 'en', 'ar'];
export function getLanguage(): Language {
  const stored = localStorage.getItem('school_language');
  return supported.includes(stored as Language) ? stored as Language : 'fr';
}
export function initializeLanguage() {
  const language = getLanguage();
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
}
export function setLanguage(language: Language) {
  if (!supported.includes(language) || language === getLanguage()) return;
  localStorage.setItem('school_language', language);
  window.location.reload();
}
export function t(key: string, values: unknown[] = []): string {
  const entry = catalog[key] || catalog[aliases.get(key) || ''];
  const message = entry?.[getLanguage()] ?? key;
  return message.replace(/\{(\d+)\}/g, (_, index: string) => String(values[Number(index)] ?? ''));
}
export function locale() {
  return { fr: 'fr-FR', en: 'en-GB', ar: 'ar-u-ca-gregory' }[getLanguage()];
}
export function translateMessage(message: string): string {
  if (typeof message !== 'string') return message;
  if (/keycloak/i.test(message)) return t('An error occurred.');
  return t(message);
}
export function roleLabel(role: string) {
  const labels: Record<string, string> = { ADMIN: 'Administrateur', DIRECTEUR: 'Directeur', COMPTABLE: 'Comptable', ENSEIGNANT: 'Enseignant', PARENT: 'Parent', CONTROLEUR_PRESENCE: 'Attendance officer', SURVEILLANT_INTERNAT: 'Boarding supervisor' };
  return t(labels[role] || role);
}
export function statusLabel(status: string) {
  const labels: Record<string, string> = { PRESENT: 'Present', ABSENT: 'Absent', LATE: 'Late', EXCUSED: 'Excused', PAID: 'Paid', PARTIAL: 'Partially paid', UNPAID: 'Unpaid', OVERDUE: 'Overdue' };
  return t(labels[status] || status);
}
export function modelLabel(model: string) {
  const labels: Record<string, string> = { AcademicYear: 'School years', Parent: 'Parents', Subject: 'Subjects', Student: 'Students', Classroom: 'Classes', Enrollment: 'Enrollments', Grade: 'Grades', ReportCard: 'Report cards', Invoice: 'Invoices', Payment: 'Payments', Attendance: 'Student attendance', StaffAttendance: 'Teacher Attendance', SchoolHoliday: 'Holidays', SchoolCalendarSettings: 'Calendar settings', StudentDocument: 'Student documents', ParentDocument: 'Parent documents' };
  return t(labels[model] || model);
}
