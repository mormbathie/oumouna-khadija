import { useState } from 'react';
import { Check, Copy, MessageCircle, X } from 'lucide-react';
import { notificationsApi } from '../services/api';

export type WhatsAppRecipient = {
  parentId: string; parentName: string; relation: string | null; phone: string; url: string;
  studentId?: string; students?: string[]; lastOpenedAt: string | null; lastOpenedBy: string | null; openCount: number;
};
export type WhatsAppMessage = { kind: string; referenceId: string; studentId?: string; title?: string; text: string; recipients: WhatsAppRecipient[] };

const openedLabel = (recipient: WhatsAppRecipient) => recipient.lastOpenedAt
  ? `Déjà ouvert${recipient.lastOpenedBy ? ` par ${recipient.lastOpenedBy}` : ''} le ${new Date(recipient.lastOpenedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}${recipient.openCount > 1 ? ` (${recipient.openCount} fois)` : ''}`
  : '';

/** One button per parent: opens WhatsApp with the message already written; the staff member presses "send". */
export function WhatsAppRecipients({ message, compact = false }: { message: WhatsAppMessage; compact?: boolean }) {
  const [recipients, setRecipients] = useState(message.recipients);
  const open = (recipient: WhatsAppRecipient) => {
    setRecipients(current => current.map(row => row.phone === recipient.phone
      ? { ...row, lastOpenedAt: new Date().toISOString(), lastOpenedBy: 'vous', openCount: row.openCount + 1 } : row));
    // The link opens immediately; the log is best effort and never blocks the message.
    void notificationsApi.logOpened({ kind: message.kind, referenceId: message.referenceId, phone: recipient.phone,
      studentId: recipient.studentId || message.studentId, parentId: recipient.parentId, message: message.text }).catch(() => undefined);
  };
  if (!recipients.length) return <p className="text-xs italic text-amber-700">Aucun numéro WhatsApp valide pour ce parent (ou il refuse les messages). Vérifiez sa fiche dans « Parents ».</p>;
  return <ul className={compact ? 'flex flex-wrap gap-2' : 'space-y-2'}>
    {recipients.map(recipient => <li key={recipient.phone} className={compact ? '' : 'flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-2'}>
      {!compact && <span className="text-sm"><b className="text-slate-800">{recipient.parentName}</b>{recipient.relation && <span className="text-slate-500"> · {recipient.relation}</span>}<span className="block font-mono text-xs text-slate-500">+{recipient.phone}</span>{recipient.students && recipient.students.length > 0 && <span className="block text-xs text-slate-500">{recipient.students.join(', ')}</span>}</span>}
      <span className="flex flex-col items-start gap-1">
        <a href={recipient.url} target="_blank" rel="noopener noreferrer" onClick={() => open(recipient)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${recipient.lastOpenedAt ? 'bg-green-700/70 hover:bg-green-700' : 'bg-green-600 hover:bg-green-700'}`}
          title={`Ouvrir WhatsApp pour +${recipient.phone}`}>
          {recipient.lastOpenedAt ? <Check className="h-3.5 w-3.5"/> : <MessageCircle className="h-3.5 w-3.5"/>}{compact ? recipient.parentName : 'Ouvrir WhatsApp'}
        </a>
        {recipient.lastOpenedAt && <span className="text-[11px] text-slate-500">{openedLabel(recipient)}</span>}
      </span>
    </li>)}
  </ul>;
}

export function CopyButton({ text, label = 'Copier le message' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" onClick={() => void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}
    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
    {copied ? <Check className="h-3.5 w-3.5 text-green-600"/> : <Copy className="h-3.5 w-3.5"/>}{copied ? 'Copié' : label}
  </button>;
}

/** Modal showing a prepared message (receipt, reminder) with one WhatsApp button per parent. */
export function WhatsAppModal({ message, onClose }: { message: WhatsAppMessage; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true">
    <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-auto rounded-2xl bg-white p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex items-center gap-2 font-bold text-slate-800"><MessageCircle className="h-5 w-5 text-green-600"/>{message.title || 'Message WhatsApp'}</h3>
        <button type="button" onClick={onClose} aria-label="Fermer" className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5"/></button>
      </div>
      <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{message.text}</p>
      <div className="flex justify-end"><CopyButton text={message.text}/></div>
      <WhatsAppRecipients message={message}/>
      <p className="text-xs text-slate-500">WhatsApp s’ouvre avec le message déjà écrit : vérifiez-le, modifiez-le si besoin, puis appuyez sur « Envoyer ». Aucun frais, aucun envoi automatique.</p>
    </div>
  </div>;
}
