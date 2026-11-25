import { useEffect, useState } from 'react';
import api, { financesApi, notificationsApi } from '../services/api';
import { useAuth } from '../auth/AuthContext';
import { WhatsAppModal } from '../components/WhatsAppLinks';
import { useFeatures } from '../auth/FeaturesContext';

const money = (value: number) => `${Number(value || 0).toLocaleString('fr-FR')} F CFA`;
export function FinanceControlPage() {
  const { hasRole } = useAuth();
  const whatsappEnabled = useFeatures().isEnabled('whatsapp');
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [cash, setCash] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [planInvoice, setPlanInvoice] = useState<any>(null);
  const [planRows, setPlanRows] = useState<{dueDate:string;amount:string}[]>([]);
  const [reminder, setReminder] = useState<any>(null);
  const [whatsappReminder, setWhatsappReminder] = useState<any>(null);
  const [cancelled, setCancelled] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const [preview, list, closings, archive] = await Promise.all([api.get('/finance-control/cash', { params: { day } }), financesApi.getInvoices(), api.get('/finance-control/cash/history'), api.get('/finance-control/invoices/cancelled')]);
      setCash(preview.data); setInvoices(list); setHistory(closings.data); setCancelled(archive.data); setError('');
    } catch (e: any) { setError(e.response?.data?.message || 'Chargement impossible.'); }
  };
  useEffect(() => { void load(); }, [day]);
  const act = async (fn: () => Promise<any>) => {
    setBusy(true); setError('');
    try { await fn(); await load(); } catch (e: any) { setError(e.response?.data?.message || 'Action impossible.'); }
    finally { setBusy(false); }
  };
  const cancel = (kind: string, id: string) => {
    const reason = window.prompt('Motif de l’annulation (10 caractères minimum). L’écriture restera dans l’historique.');
    if (!reason) return;
    void act(() => api.post(`/finance-control/${kind}/${id}/cancel`, { reason }));
  };
  const openPlan = (invoice: any) => void act(async () => {
    const rows = (await api.get(`/finance-control/invoices/${invoice.id}/installments`)).data;
    setPlanInvoice(invoice);
    setPlanRows(rows.filter((row: any) => row.remaining > 0).length ? rows.filter((row: any) => row.remaining > 0).map((row: any) => ({dueDate: row.dueDate.slice(0,10), amount: String(row.remaining)})) : [{dueDate: invoice.dueDate.slice(0,10), amount: String(invoice.balance)}]);
  });
  const openReminder = (invoice: any) => void act(async () => {
    const [preview, history] = await Promise.all([api.get(`/finance-control/invoices/${invoice.id}/reminder`), api.get(`/finance-control/invoices/${invoice.id}/reminders`)]);
    setReminder({id:invoice.id,...preview.data,history:history.data});
  });
  const openWhatsappReminder = (invoice: any) => void act(async () => setWhatsappReminder(await notificationsApi.reminder(invoice.id)));
  const card = 'rounded-2xl border border-stone-200 bg-white p-5 shadow-sm';
  const btn = 'inline-flex items-center justify-center gap-1 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-40';
  const danger = 'inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40';
  const primary = 'inline-flex items-center justify-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50';
  const methodLabel = (method: string) => ({ CASH: 'Espèces', BANK_TRANSFER: 'Virement', MOBILE_MONEY: 'Paiement mobile', WAVE: 'Wave', ORANGE_MONEY: 'Orange Money', CHECK: 'Chèque' } as any)[method] || method;
  return <div className="mx-auto max-w-6xl space-y-5 text-sm">
    <div><h2 className="text-xl font-bold text-stone-900">Contrôle financier et clôture de caisse</h2><p className="text-stone-500">Caisse du jour, annulations tracées, échéanciers et relances.</p></div>
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800">{error}</p>}
    {whatsappReminder && <WhatsAppModal message={whatsappReminder} onClose={()=>setWhatsappReminder(null)}/>}
    {planInvoice && <form className={`${card} space-y-3 border-amber-200`} onSubmit={e=>{e.preventDefault();void act(async()=>{await api.post(`/finance-control/invoices/${planInvoice.id}/installments`,{installments:planRows.map(row=>({dueDate:row.dueDate,amount:Number(row.amount)}))});setPlanInvoice(null);});}}>
      <h3 className="font-bold text-stone-900">Échéancier — {planInvoice.invoiceNumber}</h3>
      <p className="text-stone-600">Le total doit correspondre au reste à payer : <b>{money(planInvoice.balance)}</b>. Les paiements seront déduits des premières échéances.</p>
      {planRows.map((row,index)=><div key={index} className="flex flex-wrap items-center gap-2"><span className="w-6 text-xs font-semibold text-stone-400">{index+1}.</span><input aria-label={`Date échéance ${index+1}`} required type="date" value={row.dueDate} onChange={e=>setPlanRows(planRows.map((item,i)=>i===index?{...item,dueDate:e.target.value}:item))} className="px-3 py-2"/><input aria-label={`Montant échéance ${index+1}`} required type="number" min="1" step="1" value={row.amount} onChange={e=>setPlanRows(planRows.map((item,i)=>i===index?{...item,amount:e.target.value}:item))} className="w-36 px-3 py-2" placeholder="Montant"/><button type="button" className={danger} onClick={()=>setPlanRows(planRows.filter((_,i)=>i!==index))}>Retirer</button></div>)}
      <div className="flex flex-wrap gap-2"><button type="button" disabled={planRows.length>=24} onClick={()=>setPlanRows([...planRows,{dueDate:day,amount:''}])} className={btn}>Ajouter une échéance</button><button disabled={busy||!planRows.length} className={primary}>Enregistrer</button><button type="button" onClick={()=>setPlanInvoice(null)} className={btn}>Fermer</button></div>
    </form>}
    {reminder && <section className={`${card} space-y-3 border-amber-200`}><h3 className="font-bold text-stone-900">Vérifier la relance avant l’envoi</h3><p>Destinataire : <strong>{reminder.email}</strong></p><p className="font-semibold">{reminder.subject}</p><pre className="whitespace-pre-wrap rounded-lg bg-stone-50 p-3 font-sans text-sm">{reminder.text}</pre>
      <div className="flex gap-2"><button disabled={busy} onClick={()=>{if(window.confirm(`Envoyer cette relance à ${reminder.email} ?`))void act(async()=>{await api.post(`/finance-control/invoices/${reminder.id}/reminder`,{approved:true,approvalToken:reminder.approvalToken});setReminder(null);});}} className={primary}>Valider et envoyer</button><button onClick={()=>setReminder(null)} className={btn}>Fermer</button></div>
      {reminder.history.map((row:any)=><p key={row.id} className="text-xs text-stone-500">{new Date(row.createdAt).toLocaleString('fr-FR')} — {row.actorName} — {({SENT:'Accepté par le serveur e-mail',SENDING:'Envoi en cours',UNKNOWN:'Envoi non confirmé'} as any)[row.status] || row.status}</p>)}</section>}

    <section className={`${card} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-base font-bold text-stone-900">Caisse du jour</h3><label className="flex items-center gap-2 text-stone-600">Date <input type="date" value={day} onChange={e => setDay(e.target.value)} className="px-3 py-2" /></label></div>
      {cash && <>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{([['Encaissements bruts', cash.gross, 'text-stone-900'], ['Remboursements', cash.totalRefunded, 'text-rose-700'], ['Net encaissé', cash.total, 'text-emerald-700'], ['Espèces attendues', cash.expectedCash, 'text-amber-700']] as [string, number, string][]).map(([label, value, color]) => <div key={label} className="rounded-xl border border-stone-100 bg-stone-50/70 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p><p className={`mt-1 text-lg font-bold ${color}`}>{money(value)}</p></div>)}</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-stone-500">Par mode de paiement</h4>{Object.entries(cash.byMethod).map(([method, amount]) => <p key={method} className="flex justify-between border-b border-stone-100 py-1.5"><span>{methodLabel(method)}</span><b>{money(amount as number)}</b></p>)}{!Object.keys(cash.byMethod).length && <p className="text-stone-400">Aucun encaissement.</p>}</div>
          <div><h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-stone-500">Par caissier</h4>{Object.entries(cash.byCashier).map(([id, row]: [string, any]) => <p key={id} className="flex justify-between border-b border-stone-100 py-1.5"><span>{row.name}</span><b>{money(row.total)}</b></p>)}{!Object.keys(cash.byCashier).length && <p className="text-stone-400">Aucun encaissement.</p>}</div>
        </div>
        {cash.closing ? <p className="rounded-xl bg-amber-50 p-3 font-semibold text-amber-800">Journée clôturée par {cash.closing.actorName}. Écart : {money(cash.closing.difference)}.</p> : hasRole(['ADMIN', 'DIRECTEUR']) && <form className="flex flex-wrap gap-2 border-t border-stone-100 pt-4" onSubmit={e => { e.preventDefault(); if (window.confirm('Clôturer cette journée ? Les paiements sur cette date seront ensuite bloqués.')) void act(() => api.post('/finance-control/cash/close', { day, countedCash: Number(counted), notes })); }}>
          <input aria-label="Espèces comptées" type="number" min="0" step="1" required value={counted} onChange={e => setCounted(e.target.value)} placeholder="Espèces comptées" className="w-44 px-3 py-2" />
          <input aria-label="Justification" value={notes} maxLength={1000} onChange={e => setNotes(e.target.value)} placeholder="Justification obligatoire en cas d’écart" className="min-w-64 flex-1 px-3 py-2" />
          <button disabled={busy} className={primary}>Valider la clôture</button></form>}
      </>}
    </section>

    <section className={`${card} space-y-3`}>
      <div><h3 className="text-base font-bold text-stone-900">Factures, annulations et relances</h3><p className="text-stone-500">Annulez d’abord les paiements d’une facture. Une annulation exige un motif et conserve l’écriture originale.</p></div>
      <ul className="divide-y divide-stone-100">{invoices.map(invoice => <li key={invoice.id} className="space-y-2 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0"><p className="font-semibold text-stone-900">{invoice.student?.firstName} {invoice.student?.lastName} <span className="font-normal text-stone-500">· {invoice.title}</span></p><p className="truncate font-mono text-xs text-stone-400">{invoice.invoiceNumber}</p></div>
          <div className="text-right"><p className="font-bold text-stone-900">{money(invoice.amount)}</p>{invoice.balance > 0 ? <p className="text-xs font-semibold text-amber-700">Reste {money(invoice.balance)}</p> : <p className="text-xs font-semibold text-emerald-700">Soldée</p>}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {invoice.balance > 0 && <><button disabled={busy} onClick={()=>openPlan(invoice)} className={btn}>Échéancier</button><button disabled={busy} onClick={()=>openReminder(invoice)} className={btn}>Relance e-mail</button>{whatsappEnabled && <button disabled={busy} onClick={()=>openWhatsappReminder(invoice)} className={`${btn} border-emerald-200 text-emerald-700 hover:bg-emerald-50`}>Relance WhatsApp</button>}</>}
          <button disabled={busy || invoice.paidAmount > 0} title={invoice.paidAmount > 0 ? 'Annulez d’abord ses paiements' : undefined} onClick={() => cancel('invoices', invoice.id)} className={danger}>Annuler la facture</button>
        </div>
        {invoice.payments?.length > 0 && <ul className="space-y-1 rounded-xl bg-stone-50 p-2">{invoice.payments.map((payment: any) => <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
          <span className={payment.cancelledAt ? 'text-stone-400 line-through' : 'text-stone-700'}>{payment.paymentNumber} · <b>{money(payment.amount)}</b> · {payment.receivedBy}</span>
          {payment.cancelledAt ? <span className="text-stone-500">Annulé par {payment.cancelledByName} : {payment.cancellationReason}</span> : <button disabled={busy} onClick={() => cancel('payments', payment.id)} className={danger}>Annuler ce paiement</button>}
        </li>)}</ul>}
      </li>)}</ul>
      {!invoices.length && <p className="text-stone-400">Aucune facture.</p>}
    </section>

    <div className="grid gap-5 lg:grid-cols-2">
      <section className={card}><h3 className="mb-2 text-base font-bold text-stone-900">Factures annulées</h3><ul className="divide-y divide-stone-100">{cancelled.map(row=><li key={row.id} className="py-2"><p className="font-semibold">{row.student.firstName} {row.student.lastName} · {money(row.amount)}</p><p className="text-xs text-stone-500">{row.invoiceNumber} · annulée par {row.cancelledByName} : {row.cancellationReason}</p></li>)}</ul>{!cancelled.length && <p className="text-stone-400">Aucune facture annulée.</p>}</section>
      <section className={card}><h3 className="mb-2 text-base font-bold text-stone-900">Historique des clôtures</h3><ul className="divide-y divide-stone-100">{history.map(row => <li key={row.id} className="flex flex-wrap justify-between gap-2 py-2"><span><b>{row.day}</b> · {row.actorName}{row.notes ? <span className="block text-xs text-stone-500">{row.notes}</span> : null}</span><span className="text-right">Comptées {money(row.countedCash)}<span className={`block text-xs font-semibold ${row.difference ? 'text-rose-700' : 'text-emerald-700'}`}>Écart {money(row.difference)}</span></span></li>)}</ul>{!history.length && <p className="text-stone-400">Aucune clôture.</p>}</section>
    </div>
  </div>;
}
