import { useState } from 'react';
import { KeyRound, MessageCircle, ShieldCheck, X } from 'lucide-react';
import { parentsApi } from '../services/api';
import { useAuth } from '../auth/AuthContext';
import { CopyButton } from './WhatsAppLinks';
import { school } from '../config/school';

// 221771234567 → "77 123 45 67"
export const displayPhone = (digits: string) => digits.startsWith('221') && digits.length === 12
  ? digits.slice(3).replace(/^(\d{2})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4') : '+' + digits;

// Same rule as the server: Senegalese mobiles (7x) or international numbers written with "+".
export function whatsappDigits(raw: unknown): string | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const international = value.startsWith('+') || value.startsWith('00');
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!international && digits.length === 9) digits = '221' + digits;
  if (digits.startsWith('221')) return /^2217\d{8}$/.test(digits) ? digits : null;
  return international && /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

type Credentials = { username: string; temporaryPassword: string; reset: boolean };

function CredentialsModal({ parent, credentials, onClose }: { parent: any; credentials: Credentials; onClose: () => void }) {
  const phone = whatsappDigits(parent.whatsappPhone) || credentials.username;
  const message = `Bonjour ${parent.firstName} ${parent.lastName},\n\n${credentials.reset ? 'Voici votre nouveau mot de passe provisoire pour l’espace parents' : 'Votre accès à l’espace parents est prêt'} de l’${school.name}.\n\nAdresse : ${window.location.origin}\nIdentifiant : votre numéro ${displayPhone(credentials.username)}\nMot de passe provisoire : ${credentials.temporaryPassword}\n\nÀ la première connexion, vous choisirez votre propre mot de passe. Vous y retrouverez les notes, absences, factures et reçus de vos enfants.\n\n${school.name}`;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true">
    <div className="max-h-[90vh] w-full max-w-md space-y-4 overflow-auto rounded-2xl bg-white p-5 text-sm shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex items-center gap-2 font-bold text-slate-800"><ShieldCheck className="h-5 w-5 text-green-600"/>{credentials.reset ? 'Nouveau mot de passe provisoire' : 'Accès parent créé'}</h3>
        <button type="button" onClick={onClose} aria-label="Fermer" className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5"/></button>
      </div>
      <div className="space-y-2 rounded-xl bg-slate-50 p-4">
        <p>Identifiant : <b className="font-mono">{displayPhone(credentials.username)}</b></p>
        <p>Mot de passe provisoire : <b className="select-all font-mono text-lg tracking-wider">{credentials.temporaryPassword}</b></p>
      </div>
      <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Ce mot de passe ne sera plus affiché. Transmettez-le maintenant au parent ; il devra le remplacer à sa première connexion.</p>
      <div className="flex flex-wrap gap-2">
        <a href={`https://wa.me/${phone}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700"><MessageCircle className="h-4 w-4"/>Envoyer sur WhatsApp ({displayPhone(phone)})</a>
        <CopyButton text={message}/>
      </div>
    </div>
  </div>;
}

/** Parent-portal access on a parent card: create it, issue a new temporary password, enable or disable it. */
export function ParentAccess({ parent, onChanged }: { parent: any; onChanged: () => void }) {
  const { hasRole } = useAuth();
  const canDisable = hasRole(['ADMIN', 'DIRECTEUR']);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (requestError: any) { setError(requestError.response?.data?.message || 'Action impossible.'); }
    finally { setBusy(false); }
  };
  const create = () => {
    if (!window.confirm(`Créer l’accès à l’espace parents pour ${parent.firstName} ${parent.lastName} ? L’identifiant sera son numéro de portable.`)) return;
    void run(async () => { const result = await parentsApi.createAccount(parent.id); setCredentials({ ...result, reset: false }); });
  };
  const reset = () => {
    if (!window.confirm('Générer un nouveau mot de passe provisoire ? L’ancien ne fonctionnera plus.')) return;
    void run(async () => { const result = await parentsApi.resetAccountPassword(parent.id); setCredentials({ ...result, reset: true }); });
  };
  const toggle = () => {
    const enabled = !status?.enabled;
    if (!window.confirm(enabled ? 'Réactiver l’accès de ce parent ?' : 'Désactiver l’accès de ce parent ? Il ne pourra plus se connecter.')) return;
    void run(async () => { await parentsApi.setAccountEnabled(parent.id, enabled); setStatus({ ...status, enabled }); });
  };
  const account = parent.account ?? parent.accounts?.[0];
  return <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/60 p-2">
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-[11px] font-semibold text-slate-600"><KeyRound className="h-3.5 w-3.5 text-amber-600"/>Espace parents</span>
      {!account && <button type="button" disabled={busy} onClick={create} className="rounded bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50">Créer l’accès parent</button>}
    </div>
    {account && <>
      <p className="text-[11px] text-slate-600">Identifiant : <b className="font-mono">{displayPhone(account.username)}</b> · {account.mustChangePassword ? <span className="text-amber-700">en attente de première connexion</span> : <span className="text-green-700">mot de passe personnel choisi</span>}{status && status.enabled === false && <span className="font-semibold text-rose-700"> · désactivé</span>}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={reset} className="rounded border px-2 py-1 text-[11px]">Nouveau mot de passe</button>
        {canDisable && (status ? <button type="button" disabled={busy} onClick={toggle} className={`rounded border px-2 py-1 text-[11px] ${status.enabled ? 'text-rose-700' : 'text-green-700'}`}>{status.enabled ? 'Désactiver' : 'Réactiver'}</button>
          : <button type="button" disabled={busy} onClick={() => void run(async () => setStatus(await parentsApi.account(parent.id)))} className="rounded border px-2 py-1 text-[11px]">Activer / désactiver…</button>)}
      </div>
    </>}
    {error && <p className="text-[11px] text-rose-700">{error}</p>}
    {/* The parent list is refreshed only after closing: refreshing re-mounts the cards and would hide the password. */}
    {credentials && <CredentialsModal parent={parent} credentials={credentials} onClose={() => { setCredentials(null); onChanged(); }}/>}
  </div>;
}
