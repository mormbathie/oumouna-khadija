import { t } from "../i18n/index";
import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { usersApi } from '../services/api';

export const PasswordPage: React.FC = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (newPassword !== confirmPassword) { setError(t("The new passwords do not match.")); return; }
    if (newPassword === currentPassword) { setError(t("Choose a different new password.")); return; }
    setSaving(true);
    try {
      await usersApi.changeOwnPassword(currentPassword, newPassword, totp);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage(t("Your password has been changed."));
      window.location.assign('/profile');
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || t("Unable to save changes."));
    } finally {
      setSaving(false);
    }
  };

  return <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
    <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900"><KeyRound className="h-5 w-5 text-amber-700" />{t("Change my password")}</h2>
    <p className="mt-1 text-sm text-slate-500">{t("Enter your current password to protect your account.")}</p>
    <form onSubmit={submit} className="mt-6 space-y-4">
      <label className="block text-sm font-medium text-slate-700">{t("Current password")}<input required type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-3" /></label>
      <label className="block text-sm font-medium text-slate-700">{t("New password")}<input required minLength={8} type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-3" /></label>
      <label className="block text-sm font-medium text-slate-700">{t("Confirm new password")}<input required minLength={8} type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-3" /></label>
      <label className="block text-sm font-medium">{t('Authenticator code (if enabled)')}<input value={totp} onChange={e => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" className="mt-1 w-full rounded-lg border p-3" /></label>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{message}</p>}
      <button disabled={saving} className="w-full rounded-lg bg-amber-700 px-4 py-3 font-semibold text-white disabled:opacity-50">{saving ? t("Updating…") : t("Change my password")}</button>
    </form>
  </div>;
};
