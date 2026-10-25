import { t, roleLabel } from "../i18n/index";
import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Pencil, Plus, RefreshCw, ShieldCheck, ShieldOff, Trash2, UserCog, X } from 'lucide-react';
import { usersApi } from '../services/api';
import { useAuth } from '../auth/AuthContext';

interface ManagedUser {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  enabled: boolean;
  roles: string[];
}

const emptyForm = { username: '', email: '', firstName: '', lastName: '', role: 'ENSEIGNANT' };
const roleOptions = [
  { value: 'ADMIN', label: t("Administrateur") },
  { value: 'DIRECTEUR', label: t("Directeur") },
  { value: 'COMPTABLE', label: t("Comptable") },
  { value: 'ENSEIGNANT', label: t("Enseignant") },
  { value: 'PARENT', label: 'Parent' },
  { value: 'CONTROLEUR_PRESENCE', label: t("Attendance officer") },
];

function errorMessage(error: any) {
  const message = error?.response?.data?.message;
  return Array.isArray(message) ? message.join(', ') : message || error?.message || t("An error occurred.");
}

export const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetUser, setResetUser] = useState<ManagedUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editForm, setEditForm] = useState({ email: '', firstName: '', lastName: '', role: 'ENSEIGNANT' });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setUsers(await usersApi.getAll());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await usersApi.create(form);
      setModalOpen(false);
      setForm(emptyForm);
      setSuccess("Compte créé. Un lien d’activation et de création du mot de passe a été envoyé par e-mail.");
      await loadUsers();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleUser = async (managedUser: ManagedUser) => {
    setError('');
    setSuccess('');
    try {
      await usersApi.setEnabled(managedUser.id, !managedUser.enabled);
      setSuccess(t("The account {0} is now {1}.", [managedUser.username, managedUser.enabled ? 'disabled' : 'enabled']));
      await loadUsers();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const deleteUser = async (managedUser: ManagedUser) => {
    if (!window.confirm(t("Permanently delete the account for {0}?", [managedUser.username]))) return;
    setError('');
    setSuccess('');
    try {
      await usersApi.delete(managedUser.id);
      setSuccess(t("The account {0} was deleted.", [managedUser.username]));
      await loadUsers();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const submitReset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!resetUser) return;
    setSaving(true);
    setError('');
    try {
      await usersApi.resetPassword(resetUser.id, resetPassword);
      setSuccess(t("A new password was set for {0}. Ask the user to change it after signing in.", [resetUser.username]));
      setResetUser(null);
      setResetPassword('');
    } catch (err) {
      setError(errorMessage(err));
    } finally { setSaving(false); }
  };

  const sendPasswordLink = async (managedUser: ManagedUser) => {
    setError(''); setSuccess('');
    try { await usersApi.sendPasswordReset(managedUser.id); setSuccess(`Lien de changement de mot de passe envoyé à ${managedUser.email}.`); }
    catch (err) { setError(errorMessage(err)); }
  };

  const openEdit = (managedUser: ManagedUser) => {
    setEditingUser(managedUser);
    setEditForm({ email: managedUser.email, firstName: managedUser.firstName, lastName: managedUser.lastName, role: managedUser.roles.find((role) => roleOptions.some((option) => option.value === role)) || 'ENSEIGNANT' });
    setError('');
  };

  const submitEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingUser) return;
    setSaving(true);
    setError('');
    try {
      await usersApi.update(editingUser.id, editForm);
      setEditingUser(null);
      setSuccess(t("The account {0} was updated.", [editingUser.username]));
      await loadUsers();
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{t("User Management")}</h2>
          <p className="text-xs text-slate-500">{t("Manage user accounts and roles")}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void loadUsers()} disabled={loading} className="inline-flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-3 py-2.5 rounded-xl text-sm hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {t("Refresh")}</button>
          <button onClick={() => { setError(''); setModalOpen(true); }} className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium">
            <Plus className="w-4 h-4" /> {t("Create a user")}</button>
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {success && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{success}</div>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-800"><UserCog className="w-4 h-4 text-amber-700" /> {t("User accounts")}</div>
          <span className="text-xs text-slate-500">{users.length} {t("user(s)")}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100/60 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider">
              <tr><th className="px-5 py-3">{t("User")}</th><th className="px-4 py-3">{t("E-mail")}</th><th className="px-4 py-3">{t("Role(s)")}</th><th className="px-4 py-3">{t("Status")}</th><th className="px-5 py-3 text-right">{t("Actions")}</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-500">{t("Loading accounts…")}</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-500">{t("No users found.")}</td></tr>
              ) : users.map((managedUser) => {
                const isCurrentUser = managedUser.id === currentUser?.userId;
                return (
                  <tr key={managedUser.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <div className="font-semibold text-slate-800">{managedUser.firstName} {managedUser.lastName}</div>
                      <div className="text-xs text-slate-500">{managedUser.username}{isCurrentUser ? t(" · You") : ''}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{managedUser.email || '—'}<span className={`mt-1 block text-[11px] font-medium ${managedUser.emailVerified ? 'text-amber-700' : 'text-amber-700'}`}>{managedUser.emailVerified ? t("Verified email") : t("Unverified email")}</span></td>
                    <td className="px-4 py-3"><div className="flex flex-wrap gap-1">
                      {managedUser.roles.length ? managedUser.roles.map((role) => <span key={role} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">{roleLabel(role)}</span>) : <span className="text-xs text-slate-400">{t("No application role")}</span>}
                    </div></td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${managedUser.enabled ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-700'}`}>
                        {managedUser.enabled ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldOff className="w-3.5 h-3.5" />}
                        {managedUser.enabled ? t("Active") : t("Disabled")}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openEdit(managedUser)} title={t("Edit account")} aria-label={t("Edit {0}", [managedUser.username])} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => void sendPasswordLink(managedUser)} title="Envoyer un lien de changement de mot de passe" aria-label={t("Reset password for {0}", [managedUser.username])} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100"><KeyRound className="h-4 w-4" /></button>
                        <button onClick={() => void toggleUser(managedUser)} disabled={isCurrentUser && managedUser.enabled}
                          title={managedUser.enabled ? t("Disable") : t("Enable")}
                          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40" aria-label={`${managedUser.enabled ? t("Disable") : t("Enable")} ${managedUser.username}`}>
                          {managedUser.enabled ? <ShieldOff className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                        </button>
                        <button onClick={() => void deleteUser(managedUser)} disabled={isCurrentUser}
                          title={t("Delete")} className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-40" aria-label={t("Delete {0}", [managedUser.username])}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {resetUser && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
        <form onSubmit={submitReset} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
          <h3 className="font-bold text-slate-900">{t("Password for")}{resetUser.username}</h3>
          <p className="mt-1 text-sm text-slate-500">{t("Give the new password to the user and ask them to change it after signing in.")}</p>
          <label className="mt-4 block text-sm font-medium text-slate-700">{t("Temporary password")}<input required minLength={8} type="password" autoComplete="new-password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-3" /></label>
          {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setResetUser(null)} className="rounded-lg border px-4 py-2 text-sm">{t("Cancel")}</button><button disabled={saving} className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? t("Saving…") : t("Save")}</button></div>
        </form>
      </div>}

      {editingUser && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
        <form onSubmit={submitEdit} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
          <div className="flex items-center justify-between"><h3 className="font-bold text-slate-900">{t("Edit")}{editingUser.username}</h3><button type="button" onClick={() => setEditingUser(null)} aria-label={t("Close")} className="rounded-lg p-2 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
          <label className="block text-sm font-medium text-slate-700">{t("First name")}<input required value={editForm.firstName} onChange={(event) => setEditForm({ ...editForm, firstName: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-3" /></label>
          <label className="block text-sm font-medium text-slate-700">{t("Last name")}<input required value={editForm.lastName} onChange={(event) => setEditForm({ ...editForm, lastName: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-3" /></label>
          <label className="block text-sm font-medium text-slate-700">{t("E-mail")}<input required type="email" value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-3" /></label>
          <label className="block text-sm font-medium text-slate-700">{t("Role")}<select value={editForm.role} onChange={(event) => setEditForm({ ...editForm, role: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-3">{roleOptions.filter((option) => editingUser.id !== currentUser?.userId || option.value === 'ADMIN').map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditingUser(null)} className="rounded-lg border px-4 py-2 text-sm">{t("Cancel")}</button><button disabled={saving} className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? t("Saving…") : t("Save")}</button></div>
        </form>
      </div>}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div><h3 className="font-bold text-slate-800">{t("Create a user")}</h3><p className="text-xs text-slate-500 mt-1">{t("The account will be created for the school.")}</p></div>
              <button onClick={() => setModalOpen(false)} aria-label={t("Close")} className="p-2 text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={createUser} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="text-xs font-medium text-slate-700">{t("Username *")}<input required autoComplete="off" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm" /></label>
                <label className="text-xs font-medium text-slate-700">{t("Email address *")}<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm" /></label>
                <label className="text-xs font-medium text-slate-700">{t("First name *")}<input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm" /></label>
                <label className="text-xs font-medium text-slate-700">{t("Last name *")}<input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm" /></label>
                <label className="text-xs font-medium text-slate-700">{t("Role *")}<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm">{roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
                <p className="self-end rounded-lg bg-amber-50 p-3 text-xs text-amber-900">L’utilisateur recevra un lien sécurisé pour activer son compte et choisir son mot de passe.</p>
              </div>
              {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">{t("Cancel")}</button>
                <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"><Plus className="w-4 h-4" />{saving ? t("Creating…") : t("Create account")}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
