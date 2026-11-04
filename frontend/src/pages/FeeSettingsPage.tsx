import React, { useEffect, useMemo, useState } from 'react';
import { Save, RefreshCw, BadgeDollarSign } from 'lucide-react';
import api from '../services/api';
import { latinDigits } from '../utils/latinNumericInputs';

type FeeRow = {
  id: string;
  name: string;
  level: string;
  registrationFee: number;
  reenrollmentFee: number;
  monthlyTuition: number;
};

const money = (value: number) => `${Number(value || 0).toLocaleString('fr-FR')} FCFA`;
const numeric = (value: string) => Math.max(0, Math.round(Number(latinDigits(value).replace(/[^0-9]/g, '')) || 0));

export const FeeSettingsPage: React.FC = () => {
  const [rows, setRows] = useState<FeeRow[]>([]);
  const [initial, setInitial] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const snapshot = (value: FeeRow[]) => JSON.stringify(value.map(({ id, registrationFee, reenrollmentFee, monthlyTuition }) => ({ id, registrationFee, reenrollmentFee, monthlyTuition })));
  const dirty = useMemo(() => snapshot(rows) !== initial, [rows, initial]);
  const load = async () => {
    setLoading(true); setError('');
    try {
      const data = (await api.get<FeeRow[]>('/classes')).data;
      const normalized = data.map(row => ({ ...row, reenrollmentFee: Number(row.reenrollmentFee ?? 60000) }));
      setRows(normalized); setInitial(snapshot(normalized));
    } catch (e: any) { setError(e.response?.data?.message || 'Impossible de charger les tarifs.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const change = (id: string, field: 'registrationFee'|'reenrollmentFee'|'monthlyTuition', value: string) => setRows(current => current.map(row => row.id === id ? { ...row, [field]: numeric(value) } : row));
  const save = async () => {
    setSaving(true); setError(''); setMessage('');
    try {
      const data = (await api.put<FeeRow[]>('/classes/fees', { classes: rows.map(({ id, registrationFee, reenrollmentFee, monthlyTuition }) => ({ id, registrationFee, reenrollmentFee, monthlyTuition })) })).data;
      const normalized = data.map(row => ({ ...row, reenrollmentFee: Number(row.reenrollmentFee ?? 60000) }));
      setRows(normalized); setInitial(snapshot(normalized)); setMessage('Les tarifs ont été enregistrés. Ils s’appliquent aux nouvelles opérations.');
    } catch (e: any) { setError(e.response?.data?.message || 'Impossible d’enregistrer les tarifs.'); }
    finally { setSaving(false); }
  };
  if (loading) return <div className="flex min-h-48 items-center justify-center text-slate-500"><RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Chargement des tarifs…</div>;
  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="flex items-center gap-3"><span className="rounded-xl bg-amber-100 p-2 text-amber-800"><BadgeDollarSign /></span><h1 className="text-2xl font-black text-slate-900">Paramètres des tarifs</h1></div><p className="mt-2 max-w-3xl text-sm text-slate-600">Gérez les montants de l’année scolaire courante. Cette page est réservée à l’administrateur.</p></div>
      <button type="button" disabled={!dirty || saving} onClick={() => void save()} className="flex min-h-11 items-center gap-2 rounded-xl bg-amber-700 px-5 font-bold text-white shadow disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Enregistrement…' : 'Enregistrer les tarifs'}</button>
    </header>
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><b>Important :</b> les factures déjà créées et les paiements déjà encaissés ne sont pas modifiés. Les changements concernent les prochaines factures.</div>
    <div className="hidden overflow-hidden rounded-2xl border bg-white shadow-sm md:block"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-4">Classe</th><th className="p-4">Inscription</th><th className="p-4">Réinscription</th><th className="p-4">Mensualité</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t"><td className="p-4 font-bold text-slate-800">{row.name}<span className="ml-2 text-xs font-normal text-slate-400">{row.level}</span></td>{(['registrationFee','reenrollmentFee','monthlyTuition'] as const).map(field => <td key={field} className="p-3"><input aria-label={`${field} ${row.name}`} inputMode="numeric" pattern="[0-9]*" value={row[field]} onChange={e => change(row.id, field, e.target.value)} className="w-full rounded-lg border border-slate-200 p-2.5 tabular-nums focus:border-amber-500 focus:outline-none"/><span className="mt-1 block text-xs text-slate-400">{money(row[field])}</span></td>)}</tr>)}</tbody></table></div>
    <div className="space-y-3 md:hidden">{rows.map(row => <article key={row.id} className="rounded-2xl border bg-white p-4 shadow-sm"><h2 className="font-bold text-slate-900">{row.name} <span className="text-xs font-normal text-slate-400">{row.level}</span></h2><div className="mt-3 grid gap-3">{([['registrationFee','Inscription'],['reenrollmentFee','Réinscription'],['monthlyTuition','Mensualité']] as const).map(([field,label]) => <label key={field} className="text-xs font-semibold text-slate-600">{label}<input inputMode="numeric" pattern="[0-9]*" value={row[field]} onChange={e => change(row.id, field, e.target.value)} className="mt-1 w-full rounded-lg border p-3 text-base tabular-nums"/><span className="mt-1 block font-normal text-slate-400">{money(row[field])}</span></label>)}</div></article>)}</div>
    {!rows.length && <p className="rounded-xl border bg-white p-5 text-slate-500">Aucune classe n’est configurée pour l’année courante.</p>}
  </div>;
};
