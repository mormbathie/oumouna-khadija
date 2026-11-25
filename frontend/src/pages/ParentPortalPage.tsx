import { useEffect, useState } from 'react';
import { CalendarCheck, FileText, GraduationCap, Receipt, UserRound } from 'lucide-react';
import api, { studentsApi } from '../services/api';
import { printInvoice, printSchoolDocument, escapeHtml } from '../utils/schoolDocuments';
import { printPaymentReceipt } from '../utils/receipt';
import { money } from '../config/school';
import { useAuth } from '../auth/AuthContext';

type Tab = 'invoices' | 'attendance' | 'grades' | 'documents';
const tabs: { id: Tab; label: string; icon: typeof Receipt }[] = [
  { id: 'invoices', label: 'Factures et reçus', icon: Receipt },
  { id: 'attendance', label: 'Présences', icon: CalendarCheck },
  { id: 'grades', label: 'Notes et bulletins', icon: GraduationCap },
  { id: 'documents', label: 'Documents', icon: FileText },
];
const attendanceLabels: Record<string, { label: string; className: string }> = {
  PRESENT: { label: 'Présent', className: 'bg-emerald-50 text-emerald-700' },
  ABSENT: { label: 'Absent', className: 'bg-rose-50 text-rose-700' },
  LATE: { label: 'En retard', className: 'bg-amber-50 text-amber-800' },
  EXCUSED: { label: 'Absence justifiée', className: 'bg-sky-50 text-sky-700' },
};
const termLabels: Record<string, string> = { TRIMESTRE_1: '1er trimestre', TRIMESTRE_2: '2e trimestre', TRIMESTRE_3: '3e trimestre' };
const button = 'inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50';

export function ParentPortalPage() {
  const { user } = useAuth();
  const [children, setChildren] = useState<any[]>([]);
  const [student, setStudent] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('invoices');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const select = async (id: string) => {
    setError('');
    try { setStudent(await studentsApi.getOne(id)); }
    catch (e: any) { setError(e.response?.data?.message || 'Dossier indisponible.'); }
  };
  useEffect(() => {
    studentsApi.getAll()
      .then(rows => { setChildren(rows); if (rows.length === 1) void select(rows[0].id); })
      .catch(e => setError(e.response?.data?.message || 'Chargement impossible.'))
      .finally(() => setLoading(false));
  }, []);
  const download = async (doc: any) => {
    try {
      const response = await api.get(`/parent-portal/students/${student.id}/documents/${doc.id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data); const link = document.createElement('a');
      link.href = url; link.download = doc.originalName; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError('Téléchargement impossible.'); }
  };
  const balanceOf = (child: any) => (child.invoices || []).reduce((sum: number, invoice: any) => sum + Number(invoice.balance || 0), 0);
  const invoices = (student?.invoices || []).filter((invoice: any) => !invoice.cancelledAt);

  return <div className="mx-auto max-w-5xl space-y-5">
    <section className="rounded-2xl bg-gradient-to-br from-[#30331f] via-[#3d4128] to-[#6b5b26] p-5 text-white shadow-lg ring-1 ring-[#b3973f]/30 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">Espace parents</p>
      <h2 className="mt-1 text-xl font-bold sm:text-2xl">Bonjour {user?.firstName || ''}</h2>
      <p className="mt-1 text-sm text-white/80">Retrouvez les factures, les présences, les notes et les documents de vos enfants.</p>
    </section>
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {loading ? <p className="p-6 text-center text-sm text-stone-500">Chargement…</p> : !children.length
      ? <p className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-600">Aucun enfant rattaché à votre compte. Contactez le secrétariat pour vérifier le rattachement.</p>
      : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children.map(child => {
        const selected = student?.id === child.id; const balance = balanceOf(child);
        return <button key={child.id} type="button" onClick={() => void select(child.id)}
          className={`flex items-center gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm transition ${selected ? 'border-[#b3973f] ring-2 ring-[#b3973f]/30' : 'border-stone-200 hover:border-[#b3973f]/60'}`}>
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-50 font-bold text-amber-800">{child.firstName?.[0]}{child.lastName?.[0]}</span>
          <span className="min-w-0 flex-1"><b className="block truncate text-stone-900">{child.firstName} {child.lastName}</b><span className="block text-xs text-stone-500">{child.enrollments?.[0]?.classroom?.name || '—'} · {child.matricule}</span>
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${balance > 0 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>{balance > 0 ? `Reste à payer : ${money(balance)}` : 'À jour'}</span></span>
        </button>;
      })}</div>}

    {student && <section className="space-y-4">
      <div className="flex items-center gap-2 text-stone-800"><UserRound className="h-5 w-5 text-[#8a7330]"/><h3 className="text-lg font-bold">{student.firstName} {student.lastName}</h3></div>
      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-stone-200 bg-white p-1 shadow-sm">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setTab(id)}
          className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${tab === id ? 'bg-[#30331f] text-white' : 'text-stone-600 hover:bg-stone-100'}`}><Icon className="h-4 w-4"/>{label}</button>)}
      </nav>
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
        {tab === 'invoices' && <ul className="divide-y divide-stone-100">{invoices.map((invoice: any) => <li key={invoice.id} className="space-y-2 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold text-stone-900">{invoice.title}</p><p className="text-xs text-stone-500">Montant {money(invoice.amount)} · payé {money(invoice.paidAmount)}</p></div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${invoice.balance > 0 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>{invoice.balance > 0 ? `Reste ${money(invoice.balance)}` : 'Payée'}</span></div>
          <div className="flex flex-wrap gap-2"><button className={button} onClick={() => printInvoice({ ...invoice, student })}>Imprimer la facture</button>
            {invoice.payments?.filter((payment: any) => !payment.cancelledAt).map((payment: any) => <button key={payment.id} className={button} onClick={() => printPaymentReceipt({ payment, invoice: { ...invoice, student } })}>Reçu {payment.paymentNumber}</button>)}</div>
        </li>)}{!invoices.length && <p className="text-sm text-stone-500">Aucune facture.</p>}</ul>}

        {tab === 'attendance' && <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">{([['Présences', student.attendanceSummary?.present, 'text-emerald-700'], ['Absences', student.attendanceSummary?.absent, 'text-rose-700'], ['Retards', student.attendanceSummary?.late, 'text-amber-700']] as [string, number, string][]).map(([label, value, color]) => <div key={label} className="rounded-xl bg-stone-50 p-3"><p className={`text-2xl font-bold ${color}`}>{value ?? 0}</p><p className="text-xs text-stone-500">{label}</p></div>)}</div>
          <ul className="divide-y divide-stone-100">{student.attendances?.map((row: any) => { const state = attendanceLabels[row.status] || { label: row.status, className: 'bg-stone-100' }; return <li key={row.id} className="flex items-center justify-between py-2 text-sm"><span>{new Date(row.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}<span className="block text-xs text-stone-500">{row.classroom?.name}</span></span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${state.className}`}>{state.label}</span></li>; })}</ul>
        </div>}

        {tab === 'grades' && <div className="space-y-4">
          {student.reportCards?.length > 0 && <div className="grid gap-3 sm:grid-cols-3">{student.reportCards.map((card: any) => <div key={card.id} className="rounded-xl border border-stone-100 bg-stone-50 p-3">
            <p className="text-xs font-semibold uppercase text-stone-500">{termLabels[card.term] || card.term}</p><p className="text-2xl font-bold text-stone-900">{card.overallAverage}<span className="text-sm font-normal text-stone-500">/20</span></p><p className="text-xs text-stone-500">Rang : {card.rank || '—'}</p>
            <button className={`${button} mt-2`} onClick={() => printSchoolDocument('Bulletin scolaire', `<h3>${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</h3><p>${escapeHtml(card.classroom?.name)} — ${escapeHtml(termLabels[card.term] || card.term)}</p><p>Moyenne : ${escapeHtml(card.overallAverage)}/20 — Rang : ${escapeHtml(card.rank || '—')}</p><p>${escapeHtml(card.appreciation || '')}</p><p>${escapeHtml(card.teacherRemarks || '')}</p><p>${escapeHtml(card.directorRemarks || '')}</p>`)}>Imprimer le bulletin</button>
          </div>)}</div>}
          <ul className="divide-y divide-stone-100">{student.grades?.map((row: any) => <li key={row.id} className="flex items-center justify-between py-2 text-sm"><span>{row.subject?.name}<span className="block text-xs text-stone-500">{termLabels[row.term] || row.term}</span></span><b className="text-stone-900">{row.score}/{row.maxScore}</b></li>)}</ul>
          {!student.grades?.length && !student.reportCards?.length && <p className="text-sm text-stone-500">Aucune note pour le moment.</p>}
        </div>}

        {tab === 'documents' && <div className="flex flex-wrap gap-2">{student.documents?.map((doc: any) => <button key={doc.id} onClick={() => void download(doc)} className={button}><FileText className="h-4 w-4"/>{doc.originalName}</button>)}{!student.documents?.length && <p className="text-sm text-stone-500">Aucun document disponible.</p>}</div>}
      </div>
    </section>}
  </div>;
}
