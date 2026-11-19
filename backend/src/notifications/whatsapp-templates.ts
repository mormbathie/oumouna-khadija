// Messages opened in WhatsApp through free "click to chat" links (https://wa.me/...).
// The staff member can still edit the text in WhatsApp before pressing "send".
const SIGNATURE = 'Institut Oumouna Khadija';
export const ANNOUNCEMENT_MAX_LENGTH = 1500;

export function amountText(value: number) {
  return Math.round(Number(value) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function dayText(value: Date | string) {
  const date = new Date(value);
  return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
}

export const messages = {
  attendance: (student: string, classroom: string, late: boolean, day: Date | string) =>
    `Bonjour,\n\nL’${SIGNATURE} vous informe que ${student} (${classroom}) ${late ? 'est arrivé(e) en retard' : 'est absent(e)'} ce ${dayText(day)}.\n\nMerci de nous contacter pour toute justification.\n\n${SIGNATURE}`,
  payment: (student: string, amount: number, title: string, receipt: string, balance: number) =>
    `Bonjour,\n\nNous confirmons la réception de ${amountText(amount)} F CFA pour ${student} (${title}).\nReçu n° ${receipt}.\nReste à payer sur cette facture : ${amountText(balance)} F CFA.\n\nMerci.\n${SIGNATURE}`,
  reminder: (student: string, balance: number, invoiceNumber: string, title: string, dueDate: Date | string) =>
    `Bonjour,\n\nUn solde de ${amountText(balance)} F CFA reste à régler pour ${student} : facture ${invoiceNumber} (${title}), échéance du ${dayText(dueDate)}.\n\nSi vous avez déjà payé, merci de contacter la comptabilité.\n\n${SIGNATURE}`,
  announcement: (text: string) => `${SIGNATURE} — information aux parents\n\n${text}`,
};

/**
 * Returns the international number used by WhatsApp (digits only, no "+"), or null when the
 * number cannot receive WhatsApp. Local Senegalese numbers are mobiles of nine digits starting
 * with 7; other countries must be written with their international prefix.
 */
export function whatsappNumber(raw: unknown): string | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const international = value.startsWith('+') || value.startsWith('00');
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!international && digits.length === 9) digits = '221' + digits;
  if (digits.startsWith('221')) return /^2217\d{8}$/.test(digits) ? digits : null;
  if (!international) return null;
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

export function whatsappLink(phone: string, text: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
