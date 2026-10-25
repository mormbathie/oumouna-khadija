import { createLucideIcon, LayoutDashboard, GraduationCap, ContactRound, UsersRound, CalendarRange, CalendarClock, ReceiptText, ShieldCheck, ChartColumnIncreasing, Fingerprint, BookOpenCheck, ClipboardCheck, ScanQrCode, School, UserRoundCog, ArrowLeftRight, Landmark, CircleUserRound, KeyRound } from 'lucide-react';

// A kimono collar, sleeves and belt: a distinct symbol for the school uniform sale.
const KimonoIcon = createLucideIcon('Kimono', [
  ['path', { d: 'm8 3-5 3-2 6 4 2 1-3v10h12V11l1 3 4-2-2-6-5-3', key: 'body' }],
  ['path', { d: 'm8 3 4 6 4-6M9 5l6 10M15 5l-6 10M6 15h12M10 17l-2 4M14 17l2 4', key: 'collar-belt' }],
]);
const KarateIcon = createLucideIcon('Karate', [
  ['circle', { cx: '15', cy: '4', r: '2', key: 'head' }],
  ['path', { d: 'm13 8-3 5 4 3 2 6M10 13l-4 8M13 8l4 3 5-1M13 8 8 7 4 3M14 16l6-3', key: 'stance' }],
]);
export const navigationVisuals = {
  '/': { icon: LayoutDashboard, color: 'text-sky-300 bg-sky-400/10 border-sky-400/15', light: 'text-sky-700 bg-sky-50 border-sky-100' },
  '/students': { icon: GraduationCap, color: 'text-amber-300 bg-amber-400/10 border-amber-400/15', light: 'text-amber-700 bg-amber-50 border-amber-100' },
  '/parents': { icon: ContactRound, color: 'text-stone-300 bg-stone-400/10 border-stone-400/15', light: 'text-stone-700 bg-stone-50 border-stone-100' },
  '/parent-portal': { icon: UsersRound, color: 'text-stone-300 bg-stone-400/10 border-stone-400/15', light: 'text-stone-700 bg-stone-50 border-stone-100' },
  '/academic-transition': { icon: CalendarRange, color: 'text-indigo-300 bg-indigo-400/10 border-indigo-400/15', light: 'text-indigo-700 bg-indigo-50 border-indigo-100' },
  '/kimono': { icon: KimonoIcon, color: 'text-orange-300 bg-orange-400/10 border-orange-400/15', light: 'text-orange-700 bg-orange-50 border-orange-100' },
  '/karate': { icon: KarateIcon, color: 'text-orange-300 bg-orange-400/10 border-orange-400/15', light: 'text-orange-700 bg-orange-50 border-orange-100' },
  '/finances': { icon: ReceiptText, color: 'text-amber-300 bg-amber-400/10 border-amber-400/15', light: 'text-amber-700 bg-amber-50 border-amber-100' },
  '/refunds': { icon: ReceiptText, color: 'text-rose-300 bg-rose-400/10 border-rose-400/15', light: 'text-rose-700 bg-rose-50 border-rose-100' },
  '/finance-control': { icon: ShieldCheck, color: 'text-amber-300 bg-amber-400/10 border-amber-400/15', light: 'text-amber-700 bg-amber-50 border-amber-100' },
  '/registration-report': { icon: ChartColumnIncreasing, color: 'text-amber-300 bg-amber-400/10 border-amber-400/15', light: 'text-amber-700 bg-amber-50 border-amber-100' },
  '/teacher-badge': { icon: Fingerprint, color: 'text-cyan-300 bg-cyan-400/10 border-cyan-400/15', light: 'text-cyan-700 bg-cyan-50 border-cyan-100' },
  '/grades': { icon: BookOpenCheck, color: 'text-violet-300 bg-violet-400/10 border-violet-400/15', light: 'text-violet-700 bg-violet-50 border-violet-100' },
  '/attendance': { icon: ClipboardCheck, color: 'text-cyan-300 bg-cyan-400/10 border-cyan-400/15', light: 'text-cyan-700 bg-cyan-50 border-cyan-100' },
  '/attendance/scan': { icon: ScanQrCode, color: 'text-cyan-300 bg-cyan-400/10 border-cyan-400/15', light: 'text-cyan-700 bg-cyan-50 border-cyan-100' },
  '/classes': { icon: School, color: 'text-amber-300 bg-amber-400/10 border-amber-400/15', light: 'text-amber-700 bg-amber-50 border-amber-100' },
  '/users': { icon: UserRoundCog, color: 'text-rose-300 bg-rose-400/10 border-rose-400/15', light: 'text-rose-700 bg-rose-50 border-rose-100' },
  '/staff-attendance': { icon: CalendarClock, color: 'text-cyan-300 bg-cyan-400/10 border-cyan-400/15', light: 'text-cyan-700 bg-cyan-50 border-cyan-100' },
  '/data-transfer': { icon: ArrowLeftRight, color: 'text-rose-300 bg-rose-400/10 border-rose-400/15', light: 'text-rose-700 bg-rose-50 border-rose-100' },
  '/school-information': { icon: Landmark, color: 'text-rose-300 bg-rose-400/10 border-rose-400/15', light: 'text-rose-700 bg-rose-50 border-rose-100' },
  '/profile': { icon: CircleUserRound, color: 'text-slate-300 bg-slate-400/10 border-slate-400/15', light: 'text-slate-700 bg-slate-100 border-slate-200' },
  '/password': { icon: KeyRound, color: 'text-slate-300 bg-slate-400/10 border-slate-400/15', light: 'text-slate-700 bg-slate-100 border-slate-200' },
} as const;
export const navigationCategories = [
  { id: 'overview', label: 'Vue d’ensemble', routes: ['/'] },
  { id: 'school', label: 'Scolarité & familles', routes: ['/students', '/parents', '/parent-portal', '/classes', '/grades', '/academic-transition'] },
  { id: 'finance', label: 'Comptabilité', routes: ['/finances', '/refunds', '/registration-report', '/finance-control'] },
  { id: 'activities', label: 'Activités & équipements', routes: ['/karate', '/kimono'] },
  { id: 'attendance', label: 'Présences & personnel', routes: ['/attendance', '/attendance/scan', '/staff-attendance', '/teacher-badge'] },
  { id: 'administration', label: 'Administration', routes: ['/users', '/data-transfer', '/school-information'] },
  { id: 'account', label: 'Mon compte', routes: ['/profile'] },
];
