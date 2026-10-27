import { school } from '../config/school';
import { getLanguage, locale, roleLabel, statusLabel, t } from '../i18n';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const amount = (value: number) => escape(new Intl.NumberFormat(locale()).format(Number(value) || 0) + ' FCFA');
const date = (value?: string | Date) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleDateString(locale()) : '—';
const field = (label: string, value: unknown) => `<div class="field"><span>${escape(t(label))}</span><strong>${escape(value || '—')}</strong></div>`;

// Shared A4 layout: identical financial information on both detachable copies.
export function financialPrintHtml(invoice: any, payment?: any, refund?: any) {
  const student = invoice.student || {}, parent = student.parent || {};
  const title = refund ? t('Justificatif de remboursement') : payment ? t('SCHOOL PAYMENT RECEIPT') : t('Invoice');
  const number = refund?.refundNumber || payment?.paymentNumber || invoice.invoiceNumber;
  const methods: Record<string, string> = { CASH: t('Cash'), WAVE: 'Wave', ORANGE_MONEY: 'Orange Money', BANK_TRANSFER: t('Bank transfer'), CHECK: t('Check') };
  const classroom = student.enrollments?.find((enrollment: any) => enrollment.academicYearId === invoice.academicYearId)?.classroom?.name || student.enrollments?.[0]?.classroom?.name || '—';
  const cancelled = !!invoice.cancelledAt;
  const copy = (label: string) => `<article class="copy">
    <header><img src="${escape(new URL(school.logo, window.location.origin).href)}" alt="${escape(school.shortName)}"><div class="school"><h1>${escape(school.name)}</h1><p>${escape(school.address)}</p><p>${escape(school.phones.join(' / '))}</p><p>${escape(school.email)} · ${escape(school.website)}</p></div><span class="copy-label">${escape(t(label))}</span></header>
    <div class="heading"><h2>${escape(title)}</h2><span>${escape(t('Année scolaire'))} ${escape(invoice.academicYear?.name || school.year)}</span></div>
    <div class="metadata">${field(refund ? 'Référence du remboursement' : payment ? 'Receipt number' : 'Invoice number', number)}${field(refund ? 'Date du remboursement' : payment ? 'Payment date' : 'Date d’émission', date(refund?.refundedOn || payment?.paymentDate || invoice.createdAt))}</div>
    <section class="identity"><div>${field('Student', `${student.firstName || ''} ${student.lastName || ''}`)}${field('Student ID', student.matricule)}${field('Class', classroom)}</div><div>${field('Parent / payer', `${parent.firstName || ''} ${parent.lastName || ''}`.trim())}${field('Phone', parent.phone)}${field(payment ? 'Invoice number' : 'Due date', payment ? invoice.invoiceNumber : date(invoice.dueDate))}</div></section>
    <section class="purpose"><span>${escape(t('Description'))}</span><strong>${escape(refund ? (refund.reason.length > 200 ? refund.reason.slice(0, 197) + '…' : refund.reason) : invoice.title || '—')}</strong></section>
    ${payment ? `<div class="metadata">${field('Payment method', methods[refund?.paymentMethod || payment.paymentMethod] || payment.paymentMethod)}${field(refund ? 'Reçu initial' : 'Référence', refund ? payment.paymentNumber : payment.reference)}</div><div class="received"><span>${escape(t(refund ? 'Montant remboursé' : 'Amount received'))}</span><strong>${amount(refund?.amount || payment.amount)}</strong></div>` : ''}
    ${invoice.discountAmount > 0 ? `<section class="discount"><strong>${escape(invoice.discountType === 'SOCIAL_CASE' ? 'Cas social' : 'Réduction accordée')}</strong><span>Montant normal : ${amount(invoice.grossAmount || invoice.amount + invoice.discountAmount)} · Réduction : −${amount(invoice.discountAmount)} · Montant net : ${amount(invoice.amount)}</span><small>${escape(invoice.discountReason || '')}${invoice.discountApprovedByName ? ` · Validée par ${escape(invoice.discountApprovedByName)}` : ''}${invoice.discountRefundDue > invoice.discountRefundedAmount ? ` · Trop-perçu à rendre : ${amount(invoice.discountRefundDue - invoice.discountRefundedAmount)}` : ''}${invoice.discountRefundedAmount > 0 ? ` · Remboursé : ${amount(invoice.discountRefundedAmount)}` : ''}</small></section>` : ''}
    ${refund ? `<p>${escape(t('Bénéficiaire'))} : <strong>${escape(refund.recipient)}</strong> · ${escape(t(refund.mode === 'ALREADY_PAID_REGULARIZATION' ? 'Déjà effectué — régularisation' : 'Remboursement remis et enregistré'))}</p><p>${escape(t('Les montants de facture ci-dessous sont historiques. Le remboursement ne crée pas une nouvelle dette.'))}</p>` : ''}<section class="totals"><div><span>${escape(t('Invoice amount'))}</span><strong>${amount(invoice.amount)}</strong></div><div><span>${escape(t('Total paid'))}</span><strong>${amount(invoice.paidAmount)}</strong></div><div class="balance"><span>${escape(t('Balance due'))}</span><strong>${amount(invoice.balance)}</strong></div></section>
    <div class="status"><span>${escape(t('Invoice status'))} : <strong>${escape(cancelled ? t('Annulée') : statusLabel(invoice.status))}</strong></span><span>${escape(t(refund ? 'Remboursement enregistré par' : payment ? 'Payment recorded by' : 'Created by'))} : <strong>${escape((refund ? refund.actorName : payment ? payment.receivedBy : invoice.createdByName) || '—')}</strong>${(refund ? refund.actorRole : payment ? payment.receivedByRole : invoice.createdByRole) ? ' · ' + escape(roleLabel(refund ? refund.actorRole : payment ? payment.receivedByRole : invoice.createdByRole)) : ''}</span></div>
    <section class="signatures"><div>${escape(t('Parent / payer signature'))}</div><div>${escape(t('School office stamp and signature'))}</div></section>
    <footer>${escape(t(payment ? 'Please keep this receipt as proof of payment.' : 'Cette facture ne constitue pas un reçu de paiement.'))}</footer>
  </article>`;
  return `<!doctype html><html lang="${getLanguage()}" dir="${getLanguage() === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${escape(title)} · ${escape(number)}</title><style>
    @page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}body{margin:0;color:#172c25;font:10px/1.35 Arial,Helvetica,sans-serif;background:#fff}
    .sheet{width:194mm;margin:auto;display:grid;grid-template-rows:136mm 9mm 136mm}.copy{height:136mm;padding:4mm 5mm;border:1px solid #b8c9c1;border-radius:3mm;display:flex;flex-direction:column;gap:.8mm;break-inside:avoid;page-break-inside:avoid}
    header{display:flex;align-items:center;gap:3mm;border-bottom:1.5px solid #166534;padding-bottom:2mm}header img{width:18mm;height:18mm;object-fit:contain;flex-shrink:0}.school{flex:1}h1{font-size:12px;text-transform:uppercase;margin:0 0 1mm;color:#14532d}header p{margin:0;font-size:9px}.copy-label{max-width:28mm;padding:2mm;border:1px solid #166534;border-radius:1mm;font-size:9px;font-weight:bold;text-align:center;color:#14532d}
    .heading,.metadata{display:flex;justify-content:space-between;gap:4mm;align-items:start}.heading{align-items:center;padding:1mm 0}h2{font-size:13px;margin:0;color:#14532d}.heading>span{font-size:9px}.metadata>.field{flex:1}.metadata>.field:last-child{text-align:end}.field{display:flex;flex-direction:column;gap:.4mm;min-width:0}.field>span,.purpose>span,.totals span{font-size:9px;color:#52685d}.field strong{overflow-wrap:anywhere}
    .identity{display:grid;grid-template-columns:1fr 1fr;gap:5mm;padding:1.5mm 3mm;border:1px solid #d7e2dc;border-radius:1.5mm}.identity>div{display:grid;gap:1mm}.purpose{display:flex;flex-direction:column;border-bottom:1px solid #d7e2dc;padding:1mm 0 2mm;overflow-wrap:anywhere}
    .received{display:flex;justify-content:space-between;align-items:center;border:1.5px solid #166534;border-radius:1.5mm;padding:2mm 3mm;color:#14532d}.received strong{font-size:15px}.discount{display:flex;flex-direction:column;gap:.5mm;padding:1.5mm 2mm;border:1px solid #d6b85b;background:#fff9df;border-radius:1.5mm;color:#5f4b0b}.discount small{font-size:8px}.totals{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #b8c9c1;border-radius:1.5mm}.totals>div{padding:1.5mm;display:flex;flex-direction:column;gap:1mm}.totals>div+div{border-inline-start:1px solid #b8c9c1}.totals strong{font-size:12px}.balance strong{color:#14532d}
    .status{display:flex;justify-content:space-between;gap:4mm;font-size:9px;overflow-wrap:anywhere}.status>span{flex:1}.signatures{margin-top:auto;display:grid;grid-template-columns:1fr 1fr;gap:8mm;min-height:12mm;font-size:9px;text-align:center}.signatures>div{border-top:1px solid #94aaa0;padding-top:1.5mm}footer{font-size:8px;color:#52685d;text-align:center}.cut{display:flex;align-items:center;justify-content:center;gap:3mm;color:#64748b;font-size:8px}.cut:before,.cut:after{content:'';flex:1;border-top:1px dashed #94a3b8}
    @media screen{body{background:#e8eeeb;padding:8mm}.sheet{background:#fff;box-shadow:0 2px 14px #bbc8c0}}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.sheet{margin:0}}
    .refund-print .sheet{grid-template-rows:135mm 9mm 135mm}.refund-print .copy{height:135mm;gap:.5mm;font-size:9.5px;line-height:1.2}.refund-print .copy>p{margin:0;overflow-wrap:anywhere}.refund-print .signatures{min-height:10mm}.refund-print .purpose{padding:.5mm 0 1mm}.refund-print .identity>div{gap:.5mm}.refund-print .heading h2{font-size:12px}
  </style></head><body class="${refund ? 'refund-print' : ''}"><main class="sheet">${copy('Exemplaire parent')}<div class="cut">✂ ${escape(t('Découper suivant les pointillés'))}</div>${copy('Exemplaire comptabilité')}</main><script>window.addEventListener('load',function(){window.focus();window.print()});</script></body></html>`;
}

export function printFinancialDocument(invoice: any, payment?: any) {
  const w = window.open('', '_blank', 'width=900,height=850');
  if (!w) { window.alert(t('Allow pop-ups to print the receipt.')); return; }
  w.opener = null;
  w.document.open(); w.document.write(financialPrintHtml(invoice, payment)); w.document.close();
}

export function printRefundReceipt(refund: any) {
  const w = window.open('', '_blank', 'width=900,height=850');
  if (!w) { window.alert(t('Allow pop-ups to print the receipt.')); return; }
  w.opener = null;
  w.document.open(); w.document.write(financialPrintHtml(refund.payment.invoice, refund.payment, refund)); w.document.close();
}
