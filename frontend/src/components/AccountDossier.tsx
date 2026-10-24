import { useEffect, useRef, useState, type ReactNode } from 'react';
import { UserRound } from 'lucide-react';
import { usersApi } from '../services/api';
import { t } from '../i18n';

export function ProfileAvatar({ fallback }: { fallback: ReactNode }) {
  const [photo, setPhoto] = useState('');
  useEffect(() => {
    let url = ''; let active = true;
    const load = async () => {
      try {
        const dossier = await usersApi.getDossier();
        if (!active) return;
        if (url) URL.revokeObjectURL(url);
        url = dossier.hasPhoto ? URL.createObjectURL(await usersApi.profilePhoto()) : '';
        if (active) setPhoto(url); else if (url) URL.revokeObjectURL(url);
      } catch { if (active) setPhoto(''); }
    };
    void load(); window.addEventListener('profile:updated', load);
    return () => { active = false; if (url) URL.revokeObjectURL(url); window.removeEventListener('profile:updated', load); };
  }, []);
  return photo ? <img src={photo} alt={t('Profile photo')} className="h-full w-full rounded-[inherit] object-cover" /> : <>{fallback}</>;
}

const fields = [
  ['address', 'Address', 300], ['city', 'City', 100], ['alternatePhone', 'Alternate phone', 30],
  ['emergencyContactName', 'Emergency contact name', 120], ['emergencyContactPhone', 'Emergency contact phone', 30],
  ['emergencyContactRelationship', 'Relationship to emergency contact', 80],
] as const;
const professional = [['qualifications', 'Qualifications and training', 1000], ['teachingSubjects', 'Subjects and specialties', 300], ['professionalExperience', 'Professional experience', 2000]] as const;

export function AccountDossier({ isTeacher }: { isTeacher: boolean }) {
  const [details, setDetails] = useState<Record<string, string>>({});
  const [hasPhoto, setHasPhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { void usersApi.getDossier().then(d => { setDetails(d.details); setHasPhoto(d.hasPhoto); setLoaded(true); }).catch(() => setError(t('Profile unavailable.'))); }, []);
  const action = async (work: () => Promise<unknown>) => {
    setBusy(true); setError(''); setMessage('');
    try { await work(); window.dispatchEvent(new Event('profile:updated')); setMessage(t('Changes saved.')); }
    catch (err: any) { setError(err.response?.data?.message || err.message || t('Unable to save changes.')); }
    finally { setBusy(false); }
  };
  const upload = (file?: File) => {
    if (!file) return;
    void action(async () => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error(t('Choose a JPEG, PNG or WebP photo under 10 MB.'));
      const bitmap = await createImageBitmap(file).catch(() => { throw new Error(t('Invalid photo.')); });
      const canvas = document.createElement('canvas'); const ratio = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error(t('Invalid photo.'))), 'image/jpeg', 0.85));
      await usersApi.uploadProfilePhoto(new File([blob], 'profile.jpg', { type: 'image/jpeg' })); setHasPhoto(true);
    });
    if (input.current) input.current.value = '';
  };
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
    <h3 className="text-lg font-bold">{t('My personal file')}</h3>
    <p className="mt-2 text-sm text-slate-600">{t('These details are optional. Your role and permissions cannot be changed here.')}</p>
    <div className="my-5 flex flex-wrap items-center gap-4">
      <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-amber-50 text-2xl text-amber-800"><ProfileAvatar fallback={<UserRound className="h-10 w-10" aria-hidden="true" />} /></div>
      <div className="space-y-2"><label className="block text-sm font-semibold" htmlFor="profile-photo">{t('Profile photo')}</label>
        <input ref={input} id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || !loaded} onChange={e => upload(e.target.files?.[0])} className="block max-w-full text-sm" />
        <p className="text-xs text-slate-500">{t('JPEG, PNG or WebP. Photos are resized automatically.')}</p>
        {hasPhoto && <button type="button" disabled={busy} onClick={() => void action(async () => { await usersApi.removeProfilePhoto(); setHasPhoto(false); })} className="text-sm text-rose-700 underline">{t('Remove photo')}</button>}
      </div>
    </div>
    <form onSubmit={e => { e.preventDefault(); void action(() => usersApi.updateDossier(details)); }} className="grid gap-4 sm:grid-cols-2">
      {fields.map(([key, label, max]) => <label key={key} className="text-sm font-medium">{t(label)}<input maxLength={max} type={key.toLowerCase().includes('phone') ? 'tel' : 'text'} value={details[key] || ''} onChange={e => setDetails({ ...details, [key]: e.target.value })} className="mt-1 w-full rounded-lg border p-3" /></label>)}
      {isTeacher && <><h4 className="mt-3 font-bold sm:col-span-2">{t('My teaching background')}</h4>{professional.map(([key, label, max]) => <label key={key} className="text-sm font-medium sm:col-span-2">{t(label)}<textarea rows={3} maxLength={max} value={details[key] || ''} onChange={e => setDetails({ ...details, [key]: e.target.value })} className="mt-1 w-full rounded-lg border p-3" /></label>)}</>}
      <div className="sm:col-span-2"><button disabled={busy || !loaded} className="rounded-lg bg-amber-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? t('Saving…') : t('Save personal file')}</button></div>
    </form>
    {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}{message && <p role="status" className="mt-4 text-sm text-amber-700">{message}</p>}
  </section>;
}
