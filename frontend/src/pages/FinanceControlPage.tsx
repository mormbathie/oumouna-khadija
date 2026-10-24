import { useEffect, useState } from 'react';
import api, { financesApi } from '../services/api';
import { useAuth } from '../auth/AuthContext';

const money = (value: number) => `${Number(value || 0).toLocaleString('fr-FR')} F CFA`;
export function FinanceControlPage() {
  const { hasRole } = useAuth();
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
  return <div className="space-y-6 p-4 sm:p-6">
    <h1 className="text-2xl font-bold text-slate-800">Contrôle financier et clôture de caisse</h1>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {planInvoice && <form className="space-y-3 rounded-xl border bg-white p-5" onSubmit={e=>{e.preventDefault();void act(async()=>{await api.post(`/finance-control/invoices/${planInvoice.id}/installments`,{installments:planRows.map(row=>({dueDate:row.dueDate,amount:Number(row.amount)}))});setPlanInvoice(null);});}}><h2 className="font-semibold">Échéancier — {planInvoice.invoiceNumber}</h2><p>Le total doit correspondre au reste à payer : {money(planInvoice.balance)}. Les paiements seront déduits des premières échéances.</p>{planRows.map((row,index)=><div key={index} className="flex flex-wrap gap-2"><input aria-label={`Date échéance ${index+1}`} required type="date" value={row.dueDate} onChange={e=>setPlanRows(planRows.map((item,i)=>i===index?{...item,dueDate:e.target.value}:item))} className="rounded border p-2"/><input aria-label={`Montant échéance ${index+1}`} required type="number" min="1" step="1" value={row.amount} onChange={e=>setPlanRows(planRows.map((item,i)=>i===index?{...item,amount:e.target.value}:item))} className="rounded border p-2"/><button type="button" onClick={()=>setPlanRows(planRows.filter((_,i)=>i!==index))}>Retirer</button></div>)}<button type="button" disabled={planRows.length>=24} onClick={()=>setPlanRows([...planRows,{dueDate:day,amount:''}])} className="rounded border px-3 py-2">Ajouter une échéance</button><button disabled={busy||!planRows.length} className="ml-2 rounded bg-amber-600 px-3 py-2 text-white">Enregistrer</button><button type="button" onClick={()=>setPlanInvoice(null)} className="ml-2">Fermer</button></form>}
    {reminder && <section className="space-y-3 rounded-xl border bg-white p-5"><h2 className="font-semibold">Vérifier la relance avant l’envoi</h2><p>Destinataire : <strong>{reminder.email}</strong></p><p>{reminder.subject}</p><pre className="whitespace-pre-wrap font-sans text-sm">{reminder.text}</pre><button disabled={busy} onClick={()=>{if(window.confirm(`Envoyer cette relance à ${reminder.email} ?`))void act(async()=>{await api.post(`/finance-control/invoices/${reminder.id}/reminder`,{approved:true,approvalToken:reminder.approvalToken});setReminder(null);});}} className="rounded bg-amber-600 px-3 py-2 text-white">Valider et envoyer</button><button onClick={()=>setReminder(null)} className="ml-3">Fermer</button>{reminder.history.map((row:any)=><p key={row.id} className="text-sm">{new Date(row.createdAt).toLocaleString('fr-FR')} — {row.actorName} — {({SENT:'Accepté par le serveur e-mail',SENDING:'Envoi en cours',UNKNOWN:'Envoi non confirmé'} as any)[row.status] || row.status}</p>)}</section>}
    <section className="space-y-4 rounded-xl border bg-white p-5">
      <h2 className="text-lg font-semibold">Caisse du jour</h2>
      <label>Date <input type="date" value={day} onChange={e => setDay(e.target.value)} className="rounded border p-2" /></label>
      {cash && <><p>Encaissements bruts : <strong>{money(cash.gross)}</strong> — Remboursements : <strong>{money(cash.totalRefunded)}</strong> — Net : <strong>{money(cash.total)}</strong> — Espèces attendues : <strong>{money(cash.expectedCash)}</strong></p>
      <div className="grid gap-4 sm:grid-cols-2"><div><h3>Par mode de paiement</h3>{Object.entries(cash.byMethod).map(([method, amount]) => <p key={method}>{({ CASH: 'Espèces', BANK_TRANSFER: 'Virement', MOBILE_MONEY: 'Paiement mobile', CHECK: 'Chèque' } as any)[method] || method} : {money(amount as number)}</p>)}</div>
      <div><h3>Par caissier</h3>{Object.entries(cash.byCashier).map(([id, row]: [string, any]) => <p key={id}>{row.name} : {money(row.total)}</p>)}</div></div>
      {cash.closing ? <p className="font-semibold text-amber-700">Journée clôturée par {cash.closing.actorName}. Écart : {money(cash.closing.difference)}.</p> : hasRole(['ADMIN', 'DIRECTEUR']) && <form className="flex flex-wrap gap-3" onSubmit={e => { e.preventDefault(); if (window.confirm('Clôturer cette journée ? Les paiements sur cette date seront ensuite bloqués.')) void act(() => api.post('/finance-control/cash/close', { day, countedCash: Number(counted), notes })); }}>
      <input aria-label="Espèces comptées" type="number" min="0" step="1" required value={counted} onChange={e => setCounted(e.target.value)} placeholder="Espèces comptées" className="rounded border p-2" />
      <input aria-label="Justification" value={notes} maxLength={1000} onChange={e => setNotes(e.target.value)} placeholder="Justification obligatoire en cas d’écart" className="min-w-64 flex-1 rounded border p-2" />
      <button disabled={busy} className="rounded bg-amber-600 px-4 py-2 text-white disabled:opacity-50">Valider la clôture</button></form>}</>}
    </section>
    <section className="space-y-3 rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">Annuler une écriture</h2><p>Annulez d’abord les paiements d’une facture. Une annulation exige un motif et conserve l’écriture originale.</p>
      {invoices.map(invoice => <div key={invoice.id} className="space-y-2 border-t py-3"><div className="flex flex-wrap items-center justify-between gap-2"><span>{invoice.student?.firstName} {invoice.student?.lastName} — {invoice.invoiceNumber} — {invoice.title} — {money(invoice.amount)}</span><button disabled={busy || invoice.paidAmount > 0} onClick={() => cancel('invoices', invoice.id)} className="rounded border px-3 py-1 text-red-700 disabled:opacity-40">Annuler la facture</button></div>
        {invoice.balance > 0 && <div className="flex gap-3"><button disabled={busy} onClick={()=>openPlan(invoice)} className="rounded border px-3 py-1">Échéancier</button><button disabled={busy} onClick={()=>openReminder(invoice)} className="rounded border px-3 py-1">Préparer une relance e-mail</button></div>}
        {invoice.payments?.map((payment: any) => <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{payment.paymentNumber} — {money(payment.amount)} — {payment.receivedBy} {payment.cancelledAt ? `— Annulé par ${payment.cancelledByName} : ${payment.cancellationReason}` : ''}</span>{!payment.cancelledAt && <button disabled={busy} onClick={() => cancel('payments', payment.id)} className="rounded border px-3 py-1 text-red-700">Annuler ce paiement</button>}</div>)}
      </div>)}
    </section>
    <section className="space-y-2 rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">Factures annulées</h2>{cancelled.map(row=><p key={row.id}>{row.invoiceNumber} — {row.student.firstName} {row.student.lastName} — {money(row.amount)} — Annulée par {row.cancelledByName} : {row.cancellationReason}</p>)}</section>
    <section className="space-y-2 rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">Historique des clôtures</h2>{history.map(row => <p key={row.id}>{row.day} — {row.actorName} — Espèces comptées : {money(row.countedCash)} — Écart : {money(row.difference)} {row.notes && `— ${row.notes}`}</p>)}</section>
  </div>;
}
