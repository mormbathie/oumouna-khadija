import { useEffect, useState } from 'react';
import { studentsApi, financesApi } from '../services/api';
import { money } from '../config/school';
import { t, locale } from '../i18n';
import { printInvoice } from '../utils/schoolDocuments';
import { printPaymentReceipt } from '../utils/receipt';

export function ActivityPaymentsPage({ category }: { category: 'KIMONO' | 'KARATE' }) {
  const [students, setStudents] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [studentId, setStudentId] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [historyMonth, setHistoryMonth] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const eligible = (s:any) => s.status==='ACTIVE' && s.enrollments?.some((e:any)=>e.academicYear?.isCurrent && e.status==='REGISTERED' && !['TPS','PS'].includes(e.classroom?.level));
  async function load() {
    const [s, i] = await Promise.all([studentsApi.getAll(), financesApi.getInvoices({category})]);
    setStudents(s); setInvoices(i);
  }
  useEffect(()=>{setStudentId('');setError('');setNotice('');void load().catch(e=>setError(e.response?.data?.message || t('Unable to load payments')));},[category]);
  const selectable = students.filter(s=>(category==='KIMONO' || (eligible(s)&&s.karate)) && `${s.firstName} ${s.lastName} ${s.matricule}`.toLowerCase().includes(search.toLowerCase()));
  const selected = students.find(s=>s.id===studentId);
  async function create(e:React.FormEvent) {
    e.preventDefault();setBusy(true);setError('');setNotice('');
    try { const invoice=await financesApi.activityInvoice({studentId,category,month:category==='KARATE'?month:undefined});await load();setNotice(invoice.paidAmount>0?t('This invoice already has a payment.'):t('Invoice ready. Record the payment below.')); }
    catch(e:any){setError(e.response?.data?.message || t('Unable to create invoice'));}finally{setBusy(false);}
  }
  async function pay(invoice:any) {
    setBusy(true);setError('');setNotice('');
    try {await financesApi.recordPayment({invoiceId:invoice.id,amount:invoice.balance,paymentMethod:method,paymentDate,reference});await load();setNotice(t('Payment recorded'));}
    catch(e:any){setError(e.response?.data?.message || t('Unable to record payment'));}finally{setBusy(false);}
  }
  const history=invoices.filter(i=>(category!=='KARATE' || students.some(s=>s.id===i.studentId && eligible(s) && s.karate)) && (!studentId||i.studentId===studentId)&&(!historyMonth||category!=='KARATE'||i.billingKey?.endsWith(':'+historyMonth)));
  const input='w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm';
  return <div className="mx-auto max-w-6xl space-y-5">
    <h2 className="text-xl font-bold">{t(category==='KIMONO'?'Kimono sales':'Monthly karate payments')}</h2>
    <p className="text-sm text-slate-600">{t(category==='KIMONO'?'Kimono is billed separately from registration. One sale per pupil and school year.':'Only eligible pupils with active karate are shown. One invoice per pupil and month.')} {money(category==='KIMONO'?6000:4000)}</p>
    {error&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-800">{error}</p>}{notice&&<p role="status" className="rounded-lg bg-amber-50 p-3 text-amber-800">{notice}</p>}
    <form onSubmit={create} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
      <label>{t('Search by name or student ID…')}<input className={input} value={search} onChange={e=>{setSearch(e.target.value);setStudentId('');}}/></label>
      <label>{t('Student')}<select required className={input} value={studentId} onChange={e=>setStudentId(e.target.value)}><option value="">{t('Choose a student')}</option>{selectable.map(s=><option key={s.id} value={s.id} disabled={!eligible(s)}>{s.firstName} {s.lastName} · {s.matricule}{!eligible(s)?' · '+t('Not eligible'):''}</option>)}</select></label>
      {category==='KARATE'&&<label>{t('Month')}<input type="month" required className={input} value={month} onChange={e=>setMonth(e.target.value)}/></label>}
      <p className="self-center text-sm">{selected ? t(eligible(selected)?'Eligible':'Not eligible') : t('Select a pupil to check eligibility')}</p>
      <button disabled={busy||!selected||!eligible(selected)} className="rounded-lg bg-amber-700 px-4 py-3 font-semibold text-white disabled:opacity-50">{t('Create or retrieve invoice')}</button>
    </form>
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"><h3 className="font-bold">{t('Payment details')}</h3><div className="grid gap-3 sm:grid-cols-3"><label>{t('Payment date')}<input required type="date" value={paymentDate} onChange={e=>setPaymentDate(e.target.value)} className={input}/></label><label>{t('Payment method')}<select value={method} onChange={e=>setMethod(e.target.value)} className={input}>{['CASH','WAVE','ORANGE_MONEY','BANK_TRANSFER','CHECK'].map(m=><option key={m} value={m}>{t(m)}</option>)}</select></label><label>{t('Reference')}<input value={reference} onChange={e=>setReference(e.target.value)} className={input}/></label></div></section>
    <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">{t('History')}</h3><button onClick={()=>setStudentId('')} className="text-sm text-amber-700 underline">{t('All pupils')}</button>{category==='KARATE'&&<label>{t('Filter by month')}<input type="month" className={input} value={historyMonth} onChange={e=>setHistoryMonth(e.target.value)}/></label>}</div>
      {!history.length&&<p className="rounded-xl bg-white p-5 text-sm text-slate-500">{t('No invoices')}</p>}
      {history.map(invoice=><article key={invoice.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap justify-between gap-3"><div><p className="font-bold">{invoice.student?.firstName} {invoice.student?.lastName}</p><p className="text-sm text-slate-600">{invoice.title} · {invoice.invoiceNumber}</p><p className="text-sm">{t('Invoice amount')}: {money(invoice.amount)} · {t('Total paid')}: {money(invoice.paidAmount)} · {t('Balance due')}: {money(invoice.balance)} · {t(invoice.status)}</p></div><div className="flex flex-wrap items-start gap-2"><button onClick={()=>printInvoice(invoice)} className="rounded-lg border px-3 py-2 text-sm">{t('Print invoice')}</button><button disabled={busy||invoice.balance<=0||!paymentDate} onClick={()=>void pay(invoice)} className="rounded-lg bg-amber-700 px-3 py-2 text-sm text-white disabled:opacity-50">{invoice.balance<=0?t('Paid'):t('Record payment')}</button></div></div><ul className="space-y-2 border-t pt-3">{invoice.payments?.filter((payment: any) => !payment.cancelledAt).map((p:any)=><li key={p.id} className="flex flex-wrap justify-between gap-2 text-sm"><span>{new Date(p.paymentDate).toLocaleDateString(locale())} · {money(p.amount)} · {p.receivedBy}</span><button onClick={()=>printPaymentReceipt({payment:p,invoice})} className="text-amber-700 underline">{t('Receipt')}</button></li>)}</ul></article>)}
    </section>
  </div>;
}
