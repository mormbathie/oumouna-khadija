import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { financesApi, refundsApi, studentsApi } from '../services/api';
import { locale, t } from '../i18n';
import { printRefundReceipt } from '../utils/financialPrint';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Dakar', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const money = (n: number) => Number(n || 0).toLocaleString(locale()) + ' F CFA';
const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white p-3';
export function RefundsPage() {
  const [searchParams] = useSearchParams();
  const { hasRole } = useAuth(); const isAdmin = hasRole('ADMIN');
  const [students, setStudents] = useState<any[]>([]), [refunds, setRefunds] = useState<any[]>([]), [departures, setDepartures] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null), [studentId, setStudentId] = useState(''), [search, setSearch] = useState('');
  const [payments, setPayments] = useState<any[]>([]), [paymentId, setPaymentId] = useState('');
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const pending = useRef(false), paymentRequest = useRef(0);
  const [refundKey, setRefundKey] = useState(() => crypto.randomUUID()), [departureKey, setDepartureKey] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState(''), [reason, setReason] = useState(''), [recipient, setRecipient] = useState('');
  const [date, setDate] = useState(today), [method, setMethod] = useState('CASH'), [mode, setMode] = useState('REFUND_RECORDED'), [confirmed, setConfirmed] = useState(false);
  const [departureDate, setDepartureDate] = useState(today), [departureReason, setDepartureReason] = useState('');
  const student = students.find(s => s.id === studentId), payment = payments.find(p => p.id === paymentId);
  const load = async () => {
    const [s,r,d,totals] = await Promise.all([studentsApi.getAll(), refundsApi.list(), refundsApi.departures(), financesApi.getStats()]);
    setStudents(s); setRefunds(r); setDepartures(d); setStats(totals);
  };
  useEffect(() => { void load().catch(e => setError(e.response?.data?.message || t('Unable to load data.'))).finally(() => setLoading(false)); }, []);
  const loadPayments = async (id: string) => {
    const sequence = ++paymentRequest.current;
    setPayments([]); setPaymentId('');
    if (!id) return;
    try { const rows = await refundsApi.payments(id); if (sequence === paymentRequest.current) setPayments(rows); }
    catch(e: any) { if (sequence === paymentRequest.current) setError(e.response?.data?.message || t('Unable to load data.')); }
  };
  const chooseStudent = (id: string) => {
    setStudentId(id); setAmount(''); setConfirmed(false); setMessage(''); setError(''); setReason(''); setDepartureReason('');
    setRefundKey(crypto.randomUUID()); setDepartureKey(crypto.randomUUID());
    const s = students.find(s => s.id === id); setRecipient(s?.parent ? `${s.parent.firstName} ${s.parent.lastName}` : '');
    void loadPayments(id);
  };
  useEffect(() => { const id = searchParams.get('studentId'); if (id && students.some(s => s.id === id) && !studentId) chooseStudent(id); }, [students]);
  const perform = async (work: () => Promise<void>) => {
    if (pending.current) return; pending.current = true; setBusy(true); setError(''); setMessage('');
    try { await work(); await load(); await loadPayments(studentId); }
    catch(e: any) { setError(e.response?.data?.message || t('Unable to complete the operation.')); }
    finally { pending.current = false; setBusy(false); }
  };
  const submitRefund = (e: React.FormEvent) => {
    e.preventDefault(); if (!payment || !confirmed || !window.confirm(t('Confirmer cet enregistrement ? Aucun versement bancaire ne sera déclenché.'))) return;
    void perform(async () => {
      const row = await refundsApi.create({ paymentId, amount: Number(amount), expectedRefundedAmount: payment.refundedAmount, refundedOn: date, paymentMethod: method, reason, recipient, mode, requestKey: refundKey });
      setRefundKey(crypto.randomUUID()); setAmount(''); setReason(''); setConfirmed(false); setMessage(t('Remboursement enregistré : {0}', [row.refundNumber]));
    });
  };
  const submitDeparture = (e: React.FormEvent) => {
    e.preventDefault(); if (!studentId || !window.confirm(t('Confirmer le départ ? Le dossier et les transactions seront conservés. Les sommes dues ne seront pas annulées.'))) return;
    void perform(async () => { await refundsApi.depart(studentId, { departedOn: departureDate, reason: departureReason, requestKey: departureKey }); setDepartureKey(crypto.randomUUID()); setDepartureReason(''); setMessage(t('Départ enregistré. Le dossier et son historique sont conservés.')); });
  };
  return <div className="mx-auto max-w-6xl space-y-5">
    <header><button type="button" disabled={busy || loading} onClick={() => void perform(async () => {})} className="float-right ml-3 rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-50">{t('Refresh')}</button><h1 className="text-xl font-bold">{t('Départs et remboursements')}</h1><p className="mt-2 text-sm text-slate-600">{t('Les paiements d’origine restent conservés. Un remboursement ne crée pas une nouvelle dette et ne déclenche aucun versement.')}</p></header>
    {loading && <p>{t('Loading…')}</p>}
    <div className="grid gap-3 sm:grid-cols-3">{[['Encaissements bruts',stats?.grossCollected],['Remboursements',stats?.totalRefunded],['Encaissements nets',stats?.totalCollected]].map(([label,value]) => <div key={label} className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">{t(String(label))}</p><strong className="text-xl text-amber-800">{money(Number(value))}</strong></div>)}</div>
    <section className="rounded-xl border bg-white p-5"><h2 className="font-bold">{t('Choisir un dossier')}</h2><div className="mt-3 grid gap-3 sm:grid-cols-2"><label>{t('Search')}<input className={inputClass} value={search} onChange={e => setSearch(e.target.value)} /></label><label>{t('Student')}<select disabled={busy} className={inputClass} value={studentId} onChange={e => chooseStudent(e.target.value)}><option value="">{t('Choose a student')}</option>{students.filter(s => s.id === studentId || `${s.firstName} ${s.lastName} ${s.matricule}`.toLowerCase().includes(search.toLowerCase())).map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} · {s.matricule}{s.departure ? ' · '+t('A quitté l’établissement') : ''}</option>)}</select></label></div>
      {student && <p className="mt-3 text-sm">{student.firstName} {student.lastName} · {student.departure ? t('A quitté l’établissement') : t('Dossier conservé')} · <Link to="/students" className="text-amber-700 underline">{t('Inscriptions & Élèves')}</Link></p>}
    </section>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">{error}</p>}{message && <p role="status" className="rounded-xl bg-amber-50 p-4 text-amber-800">{message}</p>}
    {!isAdmin && <p className="rounded-xl border bg-white p-4 text-sm">{t('Consultation uniquement. Seul l’administrateur peut enregistrer un départ ou un remboursement.')}</p>}
    {isAdmin && student && <div className="grid items-start gap-5 lg:grid-cols-2">
      <form onSubmit={submitRefund} className="space-y-4 rounded-xl border bg-white p-5"><h2 className="font-bold">{t('Enregistrer un remboursement')}</h2>
        <label className="block text-sm">{t('Paiement d’origine')}<select required disabled={busy} className={inputClass} value={paymentId} onChange={e => { setPaymentId(e.target.value); setAmount(''); setConfirmed(false); }}><option value="">{t('Select')}</option>{payments.map(p => <option key={p.id} value={p.id} disabled={p.refundableAmount <= 0}>{p.paymentNumber} · {p.invoice.title} · {t('Disponible')} : {money(p.refundableAmount)}</option>)}</select></label>
        {payment && <p className="rounded-lg bg-amber-50 p-3 text-sm">{t('Reçu initial')} : {money(payment.amount)} · {t('Déjà remboursé')} : {money(payment.refundedAmount)} · {t('Encore remboursable')} : <strong>{money(payment.refundableAmount)}</strong></p>}
        {!payments.length && <p className="text-sm text-slate-500">{t('Aucun paiement actif disponible pour ce dossier.')}</p>}
        <label className="block text-sm">{t('Montant remboursé (F CFA)')}<input required disabled={busy} type="number" min="1" step="1" max={payment?.refundableAmount || 0} className={inputClass} value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label className="block text-sm">{t('Date du remboursement')}<input required disabled={busy} type="date" max={today()} min={payment?.paymentDate?.slice(0,10)} value={date} onChange={e => setDate(e.target.value)} className={inputClass} /></label>
        <label className="block text-sm">{t('Payment method')}<select disabled={busy} value={method} onChange={e => setMethod(e.target.value)} className={inputClass}>{[['CASH','Cash'],['WAVE','Wave'],['ORANGE_MONEY','Orange Money'],['BANK_TRANSFER','Bank transfer'],['CHECK','Check']].map(([key,label])=><option key={key} value={key}>{t(label)}</option>)}</select></label>
        <label className="block text-sm">{t('Type d’enregistrement')}<select disabled={busy} className={inputClass} value={mode} onChange={e => setMode(e.target.value)}><option value="REFUND_RECORDED">{t('Remboursement remis et enregistré')}</option><option value="ALREADY_PAID_REGULARIZATION">{t('Déjà effectué — régularisation')}</option></select></label>
        <label className="block text-sm">{t('Bénéficiaire')}<input required minLength={2} maxLength={150} disabled={busy} value={recipient} onChange={e => setRecipient(e.target.value)} className={inputClass}/></label>
        <label className="block text-sm">{t('Motif du remboursement')}<textarea required minLength={10} maxLength={1000} disabled={busy} value={reason} onChange={e => setReason(e.target.value)} className={inputClass}/></label>
        <label className="flex gap-2 text-sm"><input required type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />{t('Je confirme que cette somme a déjà été remise au bénéficiaire et que cet enregistrement ne déclenche aucun nouveau versement.')}</label>
        <button disabled={busy || !payment || !confirmed} className="rounded-lg bg-amber-700 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? t('Saving…') : t('Valider le remboursement')}</button>
      </form>
      <form onSubmit={submitDeparture} className="space-y-4 rounded-xl border bg-white p-5"><h2 className="font-bold">{t('Enregistrer le départ')}</h2><p className="text-sm text-slate-600">{t('Le dossier, les factures et les paiements restent consultables. Les nouvelles mensualités automatiques et les pointages sont arrêtés. Les dettes existantes restent dues ; aucun remboursement n’est créé automatiquement.')}</p>
        {student.departure ? <p className="text-amber-800">{t('Le départ est déjà enregistré.')}</p> : <><label className="block text-sm">{t('Date du départ')}<input required disabled={busy} type="date" max={today()} value={departureDate} onChange={e => setDepartureDate(e.target.value)} className={inputClass}/></label><label className="block text-sm">{t('Motif du départ')}<textarea required disabled={busy} minLength={10} maxLength={1000} value={departureReason} onChange={e => setDepartureReason(e.target.value)} className={inputClass}/></label><button disabled={busy} className="rounded-lg border border-amber-600 px-4 py-3 font-semibold text-amber-900 disabled:opacity-50">{t('Confirmer le départ')}</button></>}
      </form>
    </div>}
    <section className="space-y-3"><h2 className="font-bold">{t('Historique des remboursements')}</h2><p className="text-xs text-slate-500">{t('500 derniers enregistrements au maximum. Les totaux en haut concernent tous les dossiers.')}</p>{refunds.filter(r => !studentId || r.payment.invoice.student.id === studentId).map(r => <article key={r.id} className="rounded-xl border bg-white p-4"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-bold">{r.payment.invoice.student.firstName} {r.payment.invoice.student.lastName}</h3><p className="break-all text-xs text-slate-500">{r.refundNumber}</p></div><strong className="text-rose-800">−{money(r.amount)}</strong></div><p className="mt-2 text-sm">{new Date(r.refundedOn).toLocaleDateString(locale())} · {r.actorName} · {r.mode === 'ALREADY_PAID_REGULARIZATION' ? t('Déjà effectué — régularisation') : t('Remboursement remis et enregistré')}</p><p className="mt-1 break-words text-sm">{r.reason}</p><p className="text-sm">{t('Bénéficiaire')} : {r.recipient}</p><button onClick={() => printRefundReceipt(r)} className="mt-3 rounded-lg border px-3 py-2 text-sm">{t('Imprimer le justificatif')}</button></article>)}</section>
    <section className="space-y-3"><h2 className="font-bold">{t('Élèves ayant quitté l’établissement')}</h2>{departures.filter(d => !studentId || d.studentId === studentId).map(d => <article key={d.id} className="rounded-xl border bg-white p-4"><h3 className="font-bold">{d.student.firstName} {d.student.lastName} · {d.student.matricule}</h3><p className="text-sm text-amber-800">{t('A quitté l’établissement')} · {new Date(d.departedOn).toLocaleDateString(locale())}</p><p className="text-sm">{d.reason} · {d.actorName}</p><p className="mt-2 text-sm">{t('Reste à payer conservé')} : {money(d.student.invoices.reduce((sum: number,i: any) => sum + i.balance,0))}</p></article>)}</section>
  </div>;
}
