import { AccountDossier } from '../components/AccountDossier';
import { t, locale, statusLabel } from "../i18n/index";
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { staffAttendanceApi, usersApi } from '../services/api';
import { useAuth } from '../auth/AuthContext';

type Profile = { username: string; firstName: string; lastName: string; email: string; phone: string; emailVerified: boolean };

export const ProfilePage = () => {
  const { user } = useAuth();
  const isTeacher = Boolean(user?.roles?.includes('ENSEIGNANT'));
  const [profile, setProfile] = useState<Profile | null>(null);
  const [twoFactor, setTwoFactor] = useState<boolean | null>(null);
  useEffect(() => { void usersApi.twoFactorStatus().then(value => setTwoFactor(value.enabled)).catch(() => setTwoFactor(null)); }, []);
  const enableTwoFactor = async () => {
    setError(''); setMessage('');
    try { await usersApi.enableTwoFactor(); setMessage(t('An activation link has been sent. Open it to scan the QR code with your authenticator app.')); }
    catch (err: any) { setError(err.response?.data?.message || t('Unable to complete the operation.')); }
  };
  const [history, setHistory] = useState<any>(null);
  const [qr, setQr] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void usersApi.getOwnProfile().then(setProfile).catch((err) => setError(err.response?.data?.message || t("Profile unavailable.")));
    if (isTeacher) {
      void staffAttendanceApi.myCard().then((card) => QRCode.toDataURL(card.code, { width: 240, margin: 2 })).then(setQr).catch(() => {});
      void staffAttendanceApi.myHistory().then(setHistory).catch(() => {});
    }
  }, [isTeacher]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const updated = await usersApi.updateOwnProfile(profile);
      setProfile(updated);
      setMessage(t("Profile saved. Sign in again to update your name in the menu."));
    } catch (err: any) { setError(err.response?.data?.message || t("Unable to save changes.")); }
    finally { setSaving(false); }
  };

  const verify = async () => {
    setError(''); setMessage('');
    try { await usersApi.requestEmailVerification(); setMessage(t("Verification email requested. Check your inbox.")); }
    catch (err: any) { setError(err.response?.data?.message || t("Unable to send email. SMTP must be configured.")); }
  };

  return <div className="mx-auto max-w-4xl space-y-6">
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <h2 className="text-xl font-bold text-slate-900">{t("My Profile")}</h2>
      {profile && <form onSubmit={save} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">{t("First name")}<input required value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} className="mt-1 w-full rounded-lg border p-3" /></label>
        <label className="text-sm font-medium">{t("Last name")}<input required value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} className="mt-1 w-full rounded-lg border p-3" /></label>
        <label className="text-sm font-medium">{t("Email address")}<input required type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} className="mt-1 w-full rounded-lg border p-3" /></label>
        <label className="text-sm font-medium">{t("Phone")}<input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} className="mt-1 w-full rounded-lg border p-3" /></label>
        <div className="sm:col-span-2 text-sm">{t("Email:")}<strong className={profile.emailVerified ? 'text-amber-700' : 'text-amber-700'}>{profile.emailVerified ? t("verified") : t("not verified")}</strong>{!profile.emailVerified && <button type="button" onClick={verify} className="ml-3 text-amber-700 underline">{t("Send verification link")}</button>}</div>
        <div className="sm:col-span-2 flex flex-wrap gap-3"><button disabled={saving} className="rounded-lg bg-amber-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{saving ? t("Saving…") : t("Save profile")}</button><Link to="/password" className="rounded-lg border border-slate-300 px-5 py-3 font-semibold">{t("Change my password")}</Link></div>
      </form>}
      <section className="mt-6 border-t pt-5">
        <h3 className="font-bold">{t('Two-factor authentication')}</h3>
        <p className="mt-2 text-sm text-slate-600">{t('Use an authenticator app to get a temporary code when signing in. Keep access to your phone; contact the school if it is lost.')}</p>
        <p className="mt-2 text-sm">{twoFactor === null ? t('Status unavailable') : twoFactor ? t('Enabled') : t('Not enabled')}</p>
        {twoFactor === false && <button onClick={enableTwoFactor} disabled={!profile?.emailVerified} className="mt-3 rounded-lg bg-amber-700 px-4 py-3 text-white disabled:opacity-50">{t('Activate with an authenticator app')}</button>}
        {!profile?.emailVerified && <p className="mt-2 text-sm text-amber-700">{t('Verify your email address before enabling two-factor authentication.')}</p>}
      </section>
      {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{message}</p>}
    </div>
    <AccountDossier isTeacher={isTeacher} />
    {isTeacher && <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <h3 className="text-lg font-bold">{t("My attendance")}</h3>
      <p className="mt-1 text-sm text-slate-600">{t("Show this QR code to the attendance officer when you arrive and leave.")}</p>
      {qr && <img src={qr} alt={t("My attendance QR code")} className="mt-4 h-60 w-60 max-w-full" />}
      {history && <>
        <p className="mt-4 text-sm">{t("Present:")}{history.summary.present} {t("· Late:")}{history.summary.late} {t("· Absent:")}{history.summary.absent} {t("· Total lateness:")}{history.summary.minutesLate} {t("min")}</p>
        <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">{t("Date")}</th><th className="p-2">{t("Arrival")}</th><th className="p-2">{t("Departure")}</th><th className="p-2">{t("Status")}</th><th className="p-2">{t("Late")}</th><th className="p-2">{t("Attendance officer")}</th></tr></thead><tbody>{history.records.map((record: any) => <tr key={record.id} className="border-b"><td className="p-2">{record.date.slice(0, 10)}</td><td className="p-2">{record.checkInAt ? new Date(record.checkInAt).toLocaleTimeString(locale()) : '—'}</td><td className="p-2">{record.checkOutAt ? new Date(record.checkOutAt).toLocaleTimeString(locale()) : '—'}</td><td className="p-2">{statusLabel(record.status)}</td><td className="p-2">{record.minutesLate} {t("min")}</td><td className="p-2">{record.checkInByName || '—'}</td></tr>)}</tbody></table></div>
      </>}
    </div>}
  </div>;
};
