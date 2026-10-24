import { DoorBadgeSettings } from '../components/DoorBadgeSettings';
import { t, locale, statusLabel } from "../i18n/index";
import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { staffAttendanceApi } from '../services/api';
import { useAuth } from '../auth/AuthContext';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Dakar', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const errorMessage = (error: any) => error.response?.data?.message || error.message || t("An error occurred.");

export const StaffAttendancePage = () => {
  const { user } = useAuth();
  const isManager = Boolean(user?.roles?.some((role) => ['ADMIN', 'DIRECTEUR'].includes(role)));
  const [date, setDate] = useState(today());
  const [roster, setRoster] = useState<any>(null);
  const [calendar, setCalendar] = useState<any>(null);
  const [punchAction, setPunchAction] = useState<'arrival'|'departure'>('arrival');
  const [code, setCode] = useState('');
  const [cameraActive, setCameraActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayName, setHolidayName] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<any>(null);
  const busyRef = useRef(false);
  const lastScanRef = useRef({ code: '', at: 0 });

  const load = useCallback(async () => {
    try { setRoster(await staffAttendanceApi.list(date)); setCalendar(await staffAttendanceApi.getCalendar()); }
    catch (err) { setError(errorMessage(err)); }
  }, [date]);
  useEffect(() => { void load(); }, [load]);

  const scan = useCallback(async (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const now = Date.now();
    const previous = lastScanRef.current;
    // Every camera frame refreshes the sighting: a held QR code is one scan.
    lastScanRef.current = { code: value, at: now };
    if (busyRef.current || (previous.code === value && now - previous.at < 5000)) return;
    busyRef.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const result = await staffAttendanceApi.scan(value, punchAction);
      const event = result.event === 'arrival' ? t("Arrival recorded") : result.event === 'departure' ? t("Departure recorded") : result.event === 'already-arrived' ? t("Arrivée déjà enregistrée") : t("Attendance already complete");
      setMessage(`${result.teacher.firstName} ${result.teacher.lastName} · ${event}${result.attendance.minutesLate ? t(" · {0} min late", [result.attendance.minutesLate]) : ''}`);
      setCode('');
      await load();
    } catch (err) { setError(errorMessage(err)); }
    finally { busyRef.current = false; setBusy(false); }
  }, [load, punchAction]);

  useEffect(() => {
    if (!cameraActive || !videoRef.current) return;
    let disposed = false;
    const reader = new BrowserMultiFormatReader();
    reader.decodeFromConstraints({ audio: false, video: { facingMode: { ideal: 'environment' } } }, videoRef.current, (result) => {
      if (result) void scan(result.getText());
    }).then((controls) => { if (disposed) controls.stop(); else controlsRef.current = controls; })
      .catch(() => { if (!disposed) { setCameraActive(false); setError(t("Camera unavailable. You can enter the code manually.")); } });
    return () => { disposed = true; controlsRef.current?.stop(); controlsRef.current = null; };
  }, [cameraActive, scan]);

  const finalize = async () => {
    if (!window.confirm(t("Mark teachers without a check-in absent on {0} ?", [date]))) return;
    try { const result = await staffAttendanceApi.finalize(date); setMessage(t("{0} absence records created.", [result.absencesRecorded])); await load(); }
    catch (err) { setError(errorMessage(err)); }
  };

  const saveCalendar = async () => {
    try {
      await staffAttendanceApi.updateCalendar({ ...calendar.settings, restDays: String(calendar.settings.restDays).split(',').filter(Boolean).map(Number) });
      setMessage(t("Calendar saved.")); await load();
    } catch (err) { setError(errorMessage(err)); }
  };

  const addHoliday = async () => {
    try { await staffAttendanceApi.addHoliday(holidayDate, holidayName); setHolidayDate(''); setHolidayName(''); setMessage(t("Holiday saved.")); await load(); }
    catch (err) { setError(errorMessage(err)); }
  };

  return <div className="mx-auto max-w-6xl space-y-5">
    <div><h2 className="text-2xl font-bold">{t("Teacher Attendance")}</h2><p className="text-sm text-slate-600">{t("Scan each teacher’s personal QR code on arrival and departure.")}</p></div>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {message && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{message}</p>}
    {isManager && <DoorBadgeSettings />}
    <label className="block rounded-xl border bg-white p-3">{t('Action du contrôleur')}<select value={punchAction} onChange={e=>setPunchAction(e.target.value as 'arrival'|'departure')} className="ml-3 rounded-lg border p-2"><option value="arrival">{t('Arrivée')}</option><option value="departure">{t('Départ')}</option></select></label>
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex justify-between gap-3"><h3 className="font-bold">{t("Scanner")}</h3><button onClick={() => setCameraActive(!cameraActive)} className="text-sm text-amber-700">{cameraActive ? t("Stop") : t("Start")} {t("the camera")}</button></div>
        <div className="overflow-hidden rounded-xl bg-slate-950"><video ref={videoRef} muted playsInline className={`h-[min(42dvh,360px)] min-h-52 w-full object-contain ${cameraActive ? 'block' : 'hidden'}`} />{!cameraActive && <div className="grid min-h-52 place-items-center text-slate-400">{t("Camera off")}</div>}</div>
        <form onSubmit={(event) => { event.preventDefault(); void scan(code); }} className="mt-3 flex flex-wrap gap-2"><input value={code} onChange={(event) => setCode(event.target.value)} placeholder={t("Teacher code")} className="min-w-0 flex-1 rounded-lg border p-3" /><button disabled={busy} className="rounded-lg bg-amber-700 px-4 py-3 font-semibold text-white">{t("Save")}</button></form>
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">{t("Today’s attendance")}</h3><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-lg border p-2" /></div>
        {roster?.holiday && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm">{t("Holiday:")}{roster.holiday.name}</p>}
        {roster?.isRestDay && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm">{t("Rest day")}</p>}
        <div className="mt-3 max-h-96 overflow-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">{t("Teacher")}</th><th className="p-2">{t("Arrival")}</th><th className="p-2">{t("Departure")}</th><th className="p-2">{t("Status")}</th></tr></thead><tbody>{roster?.teachers?.map((teacher: any) => <tr key={teacher.id} className="border-b"><td className="p-2">{teacher.firstName} {teacher.lastName}</td><td className="p-2">{teacher.attendance?.checkInAt ? new Date(teacher.attendance.checkInAt).toLocaleTimeString(locale()) : '—'}</td><td className="p-2">{teacher.attendance?.checkOutAt ? new Date(teacher.attendance.checkOutAt).toLocaleTimeString(locale()) : '—'}</td><td className="p-2">{teacher.attendance?.status ? statusLabel(teacher.attendance.status) : t("Not checked in")}</td></tr>)}</tbody></table></div>
        {isManager && !roster?.isRestDay && !roster?.holiday && <button onClick={finalize} className="mt-4 rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700">{t("Finalize absences")}</button>}
      </section>
    </div>
    {isManager && calendar && <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-5"><h3 className="font-bold">{t("Work calendar")}</h3><div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="text-sm">{t("Rest days (0=Sunday, 6=Saturday)")}<input value={calendar.settings.restDays} onChange={(event) => setCalendar({ ...calendar, settings: { ...calendar.settings, restDays: event.target.value } })} className="mt-1 w-full rounded-lg border p-2" /></label><label className="text-sm">{t("Start of day")}<input type="time" value={calendar.settings.startTime} onChange={(event) => setCalendar({ ...calendar, settings: { ...calendar.settings, startTime: event.target.value } })} className="mt-1 w-full rounded-lg border p-2" /></label><label className="text-sm">{t("Time zone")}<input value={calendar.settings.timeZone} onChange={(event) => setCalendar({ ...calendar, settings: { ...calendar.settings, timeZone: event.target.value } })} className="mt-1 w-full rounded-lg border p-2" /></label></div><button onClick={saveCalendar} className="mt-3 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white">{t("Save calendar")}</button>
      <h4 className="mt-6 font-semibold">{t("Holidays and closures")}</h4><div className="mt-2 flex flex-wrap gap-2"><input type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} className="rounded-lg border p-2" /><input value={holidayName} onChange={(e) => setHolidayName(e.target.value)} placeholder={t("Holiday name")} className="min-w-0 flex-1 rounded-lg border p-2" /><button onClick={addHoliday} className="rounded-lg bg-amber-700 px-4 py-2 text-white">{t("Add")}</button></div><ul className="mt-3 space-y-1 text-sm">{calendar.holidays.map((holiday: any) => <li key={holiday.id} className="flex justify-between gap-3 border-b py-2"><span>{holiday.date.slice(0, 10)} · {holiday.name}</span><button onClick={() => { void staffAttendanceApi.removeHoliday(holiday.id).then(load).catch((err) => setError(errorMessage(err))); }} className="text-rose-700">{t("Delete")}</button></li>)}</ul>
    </section>}
  </div>;
};
