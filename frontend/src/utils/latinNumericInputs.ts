const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EASTERN_ARABIC = '۰۱۲۳۴۵۶۷۸۹';

export function latinDigits(value: string) {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabicIndex = ARABIC_INDIC.indexOf(digit);
    return String(arabicIndex >= 0 ? arabicIndex : EASTERN_ARABIC.indexOf(digit));
  });
}

const numericTypes = new Set(['number', 'date', 'datetime-local', 'month', 'time', 'tel']);
const isNumericInput = (target: EventTarget | null): target is HTMLInputElement =>
  target instanceof HTMLInputElement && (numericTypes.has(target.type) || ['numeric', 'decimal', 'tel'].includes(target.inputMode));

function configure(input: HTMLInputElement) {
  if (!isNumericInput(input)) return;
  input.lang = 'fr';
  input.dir = 'ltr';
  input.dataset.latinDigits = 'true';
}

export function installLatinNumericInputs() {
  document.querySelectorAll<HTMLInputElement>('input').forEach(configure);
  const observer = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node instanceof HTMLInputElement) configure(node);
    node.querySelectorAll<HTMLInputElement>('input').forEach(configure);
  })));
  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('input', (event) => {
    if (!isNumericInput(event.target)) return;
    configure(event.target);
    const normalized = latinDigits(event.target.value);
    if (normalized !== event.target.value) event.target.value = normalized;
  }, true);

  document.addEventListener('beforeinput', (event) => {
    if (!(event instanceof InputEvent) || !isNumericInput(event.target) || !event.data) return;
    const normalized = latinDigits(event.data);
    if (normalized === event.data) return;
    event.preventDefault();
    const input = event.target;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + normalized + input.value.slice(end);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, true);
}
