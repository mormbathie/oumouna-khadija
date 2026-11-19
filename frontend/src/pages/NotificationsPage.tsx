import { useEffect, useState } from 'react';
import { MessageCircle, RefreshCw } from 'lucide-react';
import { classesApi, notificationsApi } from '../services/api';
import { quranCircles } from '../config/quranCircles';
import { useAuth } from '../auth/AuthContext';
import { CopyButton, WhatsAppRecipients } from '../components/WhatsAppLinks';
import type { WhatsAppMessage } from '../components/WhatsAppLinks';

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500';
const MAX_LENGTH = 1500;
const kindLabels: Record<string, string> = { ABSENCE: 'Absence', LATE: 'Retard', PAYMENT: 'Paiement', REMINDER: 'Relance', ANNOUNCEMENT: 'Annonce' };
const errorMessage = (error: any, fallback: string) => error?.response?.data?.message || fallback;
const today = () => new Date().toISOString().slice(0, 10);
type Tab = 'absences' | 'announcement' | 'journal';

export function NotificationsPage() {
  const { hasRole } = useAuth();
  const canAnnounce = hasRole(['ADMIN', 'DIRECTEUR']);
  const [tab, setTab] = useState<Tab>('absences');
  const [error, setError] = useState('');
  const tabs: [Tab, string][] = [['absences', 'Absences du jour'], ...(canAnnounce ? [['announcement', 'Annonce'] as [Tab, string]] : []), ['journal', 'Journal']];
  return <div className="mx-auto max-w-6xl space-y-6">
    <div>
      <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800"><MessageCircle className="h-5 w-5 text-green-600"/>Messages WhatsApp aux parents</h2>
      <p className="mt-1 text-sm text-slate-500">Chaque bouton ouvre WhatsApp avec le message déjà écrit pour le bon parent ; vous n’avez plus qu’à appuyer sur « Envoyer ». Gratuit, depuis le WhatsApp de l’école.</p>
    </div>
    <div className="flex gap-2 border-b border-slate-200">{tabs.map(([id, label]) => <button key={id} type="button" onClick={() => { setTab(id); setError(''); }}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === id ? 'border-green-600 text-green-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{label}</button>)}</div>
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {tab === 'absences' && <AbsencesTab onError={setError}/>}
    {tab === 'announcement' && canAnnounce && <AnnouncementTab onError={setError}/>}
    {tab === 'journal' && <JournalTab onError={setError}/>}
  </div>;
}

function AbsencesTab({ onError }: { onError: (message: string) => void }) {
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<(WhatsAppMessage & { status: string; justified: boolean; student: any; classroom: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true); onError('');
    try { setRows(await notificationsApi.absences(date)); }
    catch (requestError) { onError(errorMessage(requestError, 'Impossible de charger les absences.')); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [date]);
  const pending = rows.filter(row => row.recipients.length && !row.recipients.some(recipient => recipient.lastOpenedAt)).length;
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center gap-3">
      <label className="text-sm text-slate-600">Date <input type="date" value={date} onChange={event => setDate(event.target.value)} className="ml-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"/></label>
      <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"><RefreshCw className="h-4 w-4"/>Actualiser</button>
      {!loading && <span className="text-sm text-slate-500">{rows.length} élève(s) absent(s) ou en retard · <b>{pending} famille(s) à prévenir</b></span>}
    </div>
    <p className="text-xs text-slate-500">La liste vient de l’appel (feuille de présence ou clôture du scan). Faites l’appel avant de prévenir les parents : un élève corrigé en « présent » disparaît de la liste.</p>
    {loading ? <p className="p-8 text-center text-sm text-slate-500">Chargement…</p> : !rows.length ? <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Aucune absence ni aucun retard enregistré pour cette date.</p>
      : <div className="space-y-3">{rows.map(row => <article key={row.referenceId} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 md:flex-row md:items-start md:justify-between">
        <div>
          <b className="text-slate-800">{row.student.firstName} {row.student.lastName}</b>
          <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${row.status === 'LATE' ? 'bg-amber-50 text-amber-800' : 'bg-rose-50 text-rose-700'}`}>{row.status === 'LATE' ? 'En retard' : 'Absent(e)'}</span>
          {row.justified && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Justifié</span>}
          <p className="text-xs text-slate-500">{row.classroom} · {row.student.matricule}</p>
        </div>
        <WhatsAppRecipients key={`${row.referenceId}-${row.recipients.map(r => r.openCount).join()}`} message={row} compact/>
      </article>)}</div>}
  </section>;
}

function AnnouncementTab({ onError }: { onError: (message: string) => void }) {
  const [classes, setClasses] = useState<any[]>([]);
  const [form, setForm] = useState({ audience: 'CLASS', classroomId: '', quranCircle: quranCircles[0] as string, message: '' });
  const [prepared, setPrepared] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void classesApi.getAll().then(setClasses).catch(requestError => onError(errorMessage(requestError, 'Impossible de charger les classes.'))); }, []);
  const change = (patch: Partial<typeof form>) => { setForm({ ...form, ...patch }); setPrepared(null); };
  const prepare = async () => {
    setBusy(true); onError('');
    try {
      setPrepared(await notificationsApi.announcement({ audience: form.audience, message: form.message,
        ...(form.audience === 'CLASS' ? { classroomId: form.classroomId } : {}), ...(form.audience === 'QURAN_CIRCLE' ? { quranCircle: form.quranCircle } : {}) }));
    } catch (requestError) { onError(errorMessage(requestError, 'Impossible de préparer l’annonce.')); }
    finally { setBusy(false); }
  };
  const numbers = prepared ? prepared.recipients.map((recipient: any) => '+' + recipient.phone).join('\n') : '';
  return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-sm font-medium text-slate-700">Destinataires
        <select value={form.audience} onChange={event => change({ audience: event.target.value })} className={`${inputClass} mt-1`}>
          <option value="CLASS">Parents d’une classe</option><option value="QURAN_CIRCLE">Parents d’une halkha coranique</option><option value="ALL">Tous les parents</option>
        </select>
      </label>
      {form.audience === 'CLASS' && <label className="text-sm font-medium text-slate-700">Classe
        <select value={form.classroomId} onChange={event => change({ classroomId: event.target.value })} className={`${inputClass} mt-1`}>
          <option value="">Choisir une classe</option>{classes.map(classroom => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}
        </select>
      </label>}
      {form.audience === 'QURAN_CIRCLE' && <label className="text-sm font-medium text-slate-700">Halkha
        <select value={form.quranCircle} onChange={event => change({ quranCircle: event.target.value })} className={`${inputClass} mt-1`} dir="rtl">
          {quranCircles.map(circle => <option key={circle} value={circle}>{circle}</option>)}
        </select>
      </label>}
    </div>
    <label className="block text-sm font-medium text-slate-700">Message
      <textarea value={form.message} maxLength={MAX_LENGTH} rows={5} onChange={event => change({ message: event.target.value })} className={`${inputClass} mt-1`} placeholder="Ex. : Réunion des parents samedi 23 novembre à 10 h dans la grande salle."/>
      <span className="mt-1 block text-xs text-slate-400">{form.message.length}/{MAX_LENGTH} caractères</span>
    </label>
    <button type="button" disabled={busy || form.message.trim().length < 10} onClick={() => void prepare()} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Préparer les messages</button>
    {prepared && <div className="space-y-3 border-t border-slate-100 pt-4">
      <p className="text-sm"><b>{prepared.label}</b> : {prepared.studentCount} élève(s), <b>{prepared.recipients.length} parent(s) joignable(s)</b> sur WhatsApp.</p>
      {prepared.skippedCount > 0 && <p className="text-sm text-amber-800">{prepared.skippedCount} élève(s) sans numéro WhatsApp valide : {prepared.skippedStudents.join(', ')}{prepared.skippedCount > prepared.skippedStudents.length ? '…' : ''}</p>}
      <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{prepared.text}</p>
      <div className="flex flex-wrap gap-2"><CopyButton text={prepared.text}/><CopyButton text={numbers} label="Copier les numéros"/></div>
      <p className="text-xs text-slate-500">Pour beaucoup de parents, le plus rapide est une <b>liste de diffusion</b> ou un groupe dans WhatsApp Business : copiez le message et les numéros. Sinon, cliquez sur chaque parent ci-dessous ; ceux déjà contactés sont marqués.</p>
      <WhatsAppRecipients key={prepared.referenceId} message={prepared}/>
    </div>}
  </section>;
}

function JournalTab({ onError }: { onError: (message: string) => void }) {
  const [kind, setKind] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const load = async () => {
    try { setRows(await notificationsApi.journal({ kind: kind || undefined })); }
    catch (requestError) { onError(errorMessage(requestError, 'Impossible de charger le journal.')); }
  };
  useEffect(() => { void load(); }, [kind]);
  return <section className="rounded-xl border border-slate-200 bg-white">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4">
      <p className="text-sm text-slate-500">Messages ouverts dans WhatsApp par le personnel (300 derniers).</p>
      <div className="flex gap-2">
        <select aria-label="Filtrer par type" value={kind} onChange={event => setKind(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="">Tous les types</option>{Object.entries(kindLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"><RefreshCw className="h-4 w-4"/>Actualiser</button>
      </div>
    </div>
    <div className="max-h-[60vh] overflow-auto">{!rows.length ? <p className="p-8 text-center text-sm text-slate-500">Aucun message.</p> : <table className="w-full min-w-[800px] text-left text-sm">
      <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Élève / parent</th><th className="px-4 py-3">Message</th><th className="px-4 py-3">Par</th></tr></thead>
      <tbody className="divide-y divide-slate-100">{rows.map(row => <tr key={row.id} className="align-top">
        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{new Date(row.openedAt).toLocaleString('fr-FR')}{row.openCount > 1 && <span className="block">ouvert {row.openCount} fois</span>}</td>
        <td className="px-4 py-3">{kindLabels[row.kind] || row.kind}</td>
        <td className="px-4 py-3">{row.student ? <b className="text-slate-800">{row.student.firstName} {row.student.lastName}</b> : <span className="text-slate-400">—</span>}<span className="block font-mono text-xs text-slate-500">+{row.recipientPhone}</span></td>
        <td className="max-w-md whitespace-pre-wrap px-4 py-3 text-xs text-slate-600">{row.message}</td>
        <td className="px-4 py-3 text-xs text-slate-500">{row.actorName}</td>
      </tr>)}</tbody>
    </table>}</div>
  </section>;
}
