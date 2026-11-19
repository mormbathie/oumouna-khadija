export const QURAN_CIRCLES = [
  'حلقة الإمام أبوبكر سل',
  'حلقة الحاج سعيد لوم',
  'حلقة الحاجة زينب جه',
  'حلقة السيد عثمان لوم',
  'حلقة عائشة أبوبكر سل',
  'حلقة علي ابن أبي طالب رضي الله عنه',
  'حلقة خديجة بنت خويلد رضي الله عنها',
] as const;

export function quranCircleValue(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  const circle = String(value || '').trim();
  if (!circle) return null;
  if (!(QURAN_CIRCLES as readonly string[]).includes(circle)) {
    throw new Error('Halkha coranique invalide.');
  }
  return circle;
}
