import { t, locale } from "../i18n/index";
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import {
  AlertCircle, Camera, CameraOff, Check, CheckCircle2, Clock3, ScanLine,
  ShieldCheck, UserRound, Users, XCircle,
} from 'lucide-react';
import { attendanceApi, classesApi, studentsApi } from '../services/api';

function schoolDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Dakar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function messageFrom(error: any) {
  const message = error?.response?.data?.message || error?.message;
  return Array.isArray(message) ? message.join(', ') : message || 'Une erreur est survenue.';
}

const statusLabels: Record<string, string> = {
  PRESENT: t("Present"),
  ABSENT: 'Absent',
  LATE: t("Late"),
  EXCUSED: t("Excused"),
};

function formatTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Dakar' });
}

export const AttendanceScanPage: React.FC = () => {
  const [classes, setClasses] = useState<any[]>([]);
  const [classroomId, setClassroomId] = useState('');
  const [roster, setRoster] = useState<any>(null);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [cameraActive, setCameraActive] = useState(true);
  const [cameraError, setCameraError] = useState('');
  const [scanError, setScanError] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [lastScan, setLastScan] = useState<any>(null);
  const [lastScanPhoto, setLastScanPhoto] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeMessage, setFinalizeMessage] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<any>(null);
  const inFlightRef = useRef(false);
  const lastCodeRef = useRef({ code: '', at: 0 });
  const today = schoolDate();

  useEffect(() => {
    let active = true;
    classesApi.getAll()
      .then((items) => {
        if (!active) return;
        setClasses(items);
      })
      .catch((error) => setScanError(messageFrom(error)))
      .finally(() => { if (active) setLoadingClasses(false); });
    return () => { active = false; };
  }, []);

  const loadRoster = useCallback(async () => {
    if (!classroomId) {
      setRoster(null);
      return;
    }
    setLoadingRoster(true);
    try {
      setRoster(await attendanceApi.getScanRoster(classroomId, today));
    } catch (error) {
      setScanError(messageFrom(error));
    } finally {
      setLoadingRoster(false);
    }
  }, [classroomId, today]);

  useEffect(() => { void loadRoster(); }, [loadRoster]);

  const processScan = useCallback(async (code: string) => {
    if (!code.trim() || inFlightRef.current) return;
    if (lastCodeRef.current.code === code.trim() && Date.now() - lastCodeRef.current.at < 5000) return;
    lastCodeRef.current = { code: code.trim(), at: Date.now() };
    inFlightRef.current = true;
    setScanBusy(true);
    setScanError('');
    setLastScan(null);
    setFinalizeMessage('');
    try {
      const result = await attendanceApi.scanStudent({ qrCode: code.trim() });
      setLastScan(result);
      setManualCode('');
      setClassroomId(result.classroom.id);
      setRoster(await attendanceApi.getScanRoster(result.classroom.id, today));
    } catch (error) {
      setScanError(messageFrom(error));
    } finally {
      setScanBusy(false);
      inFlightRef.current = false;
    }
  }, [today]);

  useEffect(() => {
    if (!cameraActive || !videoRef.current) return;
    let disposed = false;
    const reader = new BrowserMultiFormatReader();
    setCameraError('');
    reader.decodeFromConstraints({ audio: false, video: { facingMode: { ideal: 'environment' } } }, videoRef.current, (result) => {
      if (result && !inFlightRef.current) void processScan(result.getText());
    }).then((controls) => {
      if (disposed) controls.stop();
      else controlsRef.current = controls;
    }).catch((error: any) => {
      if (disposed) return;
      setCameraError(error?.name === 'NotAllowedError'
        ? t("Allow camera access in your browser, or enter the student ID below.")
        : messageFrom(error));
      setCameraActive(false);
    });
    return () => {
      disposed = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [cameraActive, processScan]);

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    if (lastScan?.student?.id) {
      studentsApi.getPhoto(lastScan.student.id)
        .then((blob) => {
          if (!active) return;
          objectUrl = URL.createObjectURL(blob);
          setLastScanPhoto(objectUrl);
        })
        .catch(() => { if (active) setLastScanPhoto(''); });
    } else setLastScanPhoto('');
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [lastScan?.student?.id]);

  const finalizeAttendance = async () => {
    if (!classroomId || !window.confirm(t("Finalize attendance? Students without a check-in will be marked absent."))) return;
    setFinalizing(true);
    setScanError('');
    setFinalizeMessage('');
    try {
      const result = await attendanceApi.finalizeScan({ classroomId, date: today });
      setRoster(result);
      setFinalizeMessage(result.absencesRecorded + t(" absences recorded. A later scan will update the record and keep the arrival time."));
    } catch (error) {
      setScanError(messageFrom(error));
    } finally {
      setFinalizing(false);
    }
  };

  const finalizeAllAttendance = async () => {
    if (!window.confirm(t("Finalize attendance for every class this school year? Students without a check-in will be marked absent."))) return;
    setFinalizing(true);
    setScanError('');
    setFinalizeMessage('');
    try {
      const result = await attendanceApi.finalizeAllScans(today);
      setFinalizeMessage(t("{0} classes finalized, {1} absences recorded.", [result.classroomsFinalized, result.absencesRecorded]));
      await loadRoster();
    } catch (error) {
      setScanError(messageFrom(error));
    } finally {
      setFinalizing(false);
    }
  };

  const summary = roster?.summary || { total: 0, present: 0, absent: 0, late: 0, excused: 0 };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-amber-700">
            <ScanLine className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-wider">{t("Attendance check")}</span>
          </div>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">{t("Scan students")}</h2>
          <p className="mt-1 text-sm text-slate-500">{t("Show the card to the camera. The student and class are recognized automatically.")}</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <Clock3 className="h-4 w-4 text-amber-600" />
          {new Date(today + 'T12:00:00Z').toLocaleDateString(locale(), { dateStyle: 'full', timeZone: 'Africa/Dakar' })}
        </div>
      </div>

      {scanError && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{scanError}</div>}
      {finalizeMessage && <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{finalizeMessage}</div>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-600">{cameraActive ? t("Camera on · ready to scan") : t("Camera off")}</p>
            <button type="button" onClick={() => { setCameraError(''); setCameraActive((active) => !active); }} disabled={scanBusy} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 sm:w-auto">
              {cameraActive ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
              {cameraActive ? t("Stop camera") : t("Start scanning")}
            </button>
          </div>

          <div className="relative overflow-hidden rounded-xl bg-slate-950">
            <video ref={videoRef} className={'h-[min(42dvh,360px)] min-h-52 w-full object-contain ' + (cameraActive ? 'block' : 'hidden')} muted playsInline />
            {!cameraActive && <div className="grid min-h-52 place-items-center p-6 text-center text-slate-400"><div><Camera className="mx-auto mb-3 h-10 w-10 text-slate-600" /><p className="text-sm">{t("The camera is off")}</p><p className="mt-1 text-xs">{t("Start scanning or enter a student ID.")}</p></div></div>}
            {lastScan && <div role="status" className="absolute inset-x-2 bottom-2 flex items-center gap-2 rounded-lg bg-amber-950/95 p-2 text-white shadow-lg">
              {lastScanPhoto ? <img src={lastScanPhoto} alt="" className="h-11 w-11 shrink-0 rounded-md bg-white object-contain" /> : <UserRound className="h-8 w-8 shrink-0 text-amber-200" />}
              <div className="min-w-0"><p className="truncate text-sm font-bold">{lastScan.student.firstName} {lastScan.student.lastName}</p><p className="text-xs text-amber-100">{lastScan.classroom.name} · {lastScan.duplicate ? t("Already checked in") : t("Attendance recorded")}</p></div>
            </div>}
            {scanBusy && <div className="absolute inset-0 grid place-items-center bg-slate-950/70 text-sm font-semibold text-white">{t("Recording attendance…")}</div>}
          </div>
          {cameraError && <p role="alert" className="text-xs text-amber-700">{cameraError}</p>}

          <form onSubmit={(event) => { event.preventDefault(); void processScan(manualCode); }} className="flex flex-col gap-2 sm:flex-row">
            <input value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="QR code ou matricule (ex. OS-2026-0001)" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
            <button type="submit" disabled={!manualCode.trim() || scanBusy} className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"><Check className="h-4 w-4" />{t("Pointer")}</button>
          </form>

          {lastScan && (
            <div role="status" className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center">
              {lastScanPhoto ? <img src={lastScanPhoto} alt="" className="h-16 w-16 rounded-lg object-contain" /> : <div className="grid h-16 w-16 place-items-center rounded-lg bg-amber-100 text-amber-700"><UserRound className="h-7 w-7" /></div>}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-amber-950">{lastScan.student.firstName} {lastScan.student.lastName}</p>
                <p className="font-mono text-xs text-amber-800">{lastScan.student.matricule} · {lastScan.classroom.name}</p>
                <p className="mt-1 text-xs text-amber-800">{lastScan.duplicate ? t("Already checked in") : t("Attendance recorded")}  {t("at")}{formatTime(lastScan.attendance.checkInAt)}{lastScan.attendance.checkInByName ? t(" · by {0}", [lastScan.attendance.checkInByName]) : ''}</p>
              </div>
              <span className="text-xs font-semibold text-amber-800">{t("Ready for the next scan")}</span>
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div><h3 className="font-bold text-slate-900">{t("Today’s attendance")}</h3><p className="text-xs text-slate-500">{roster?.classroom?.name || t("Scan a card to display its class")}</p></div>
            <button type="button" onClick={() => void loadRoster()} disabled={loadingRoster || !classroomId} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">{loadingRoster ? 'Actualisation…' : 'Actualiser'}</button>
          </div>
          <label className="block text-xs font-semibold text-slate-600">{t("View or finalize a class")}<select value={classroomId} onChange={(event) => setClassroomId(event.target.value)} disabled={loadingClasses || !classes.length} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm">
              <option value="">{t("Select a class to view")}</option>
              {classes.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name} · {classroom._count?.enrollments ?? 0} {t("students")}</option>)}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-3"><span className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-500"><Users className="h-3 w-3" />{t("Total")}</span><b className="mt-1 block text-xl">{summary.total}</b></div>
            <div className="rounded-lg bg-amber-50 p-3"><span className="text-[10px] font-bold uppercase text-amber-700">{t("Present")}</span><b className="mt-1 block text-xl text-amber-800">{summary.present}</b></div>
            <div className="rounded-lg bg-rose-50 p-3"><span className="text-[10px] font-bold uppercase text-rose-700">{t("Absents")}</span><b className="mt-1 block text-xl text-rose-800">{summary.absent}</b></div>
            <div className="rounded-lg bg-amber-50 p-3"><span className="text-[10px] font-bold uppercase text-amber-700">{t("Lates")}</span><b className="mt-1 block text-xl text-amber-800">{summary.late}</b></div>
          </div>

          <div className="max-h-[460px] overflow-auto rounded-lg border border-slate-100">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="px-3 py-2">{t("Student")}</th><th className="px-3 py-2">{t("Status")}</th><th className="px-3 py-2">{t("Arrival")}</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {(roster?.students || []).map((student: any) => <tr key={student.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5"><span className="font-semibold text-slate-800">{student.firstName} {student.lastName}</span><span className="hidden ml-2 font-mono text-[10px] text-slate-400 sm:inline">{student.matricule}</span></td>
                  <td className="px-3 py-2.5"><span className={'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ' + (student.status === 'PRESENT' ? 'bg-amber-100 text-amber-800' : student.status === 'LATE' ? 'bg-amber-100 text-amber-800' : student.status === 'EXCUSED' ? 'bg-sky-100 text-sky-800' : 'bg-rose-100 text-rose-800')}>{student.status === 'PRESENT' ? <CheckCircle2 className="h-3 w-3" /> : student.status === 'ABSENT' ? <XCircle className="h-3 w-3" /> : null}{statusLabels[student.status] || student.status}{student.status === 'ABSENT' && !student.scanned ? t(" · not scanned") : ''}</span></td>
                  <td className="px-3 py-2.5 text-slate-600">{formatTime(student.checkInAt)}</td>
                </tr>)}
                {!loadingRoster && roster?.students?.length === 0 && <tr><td colSpan={3} className="p-5 text-center text-slate-400">{t("No students enrolled in this class.")}</td></tr>}
                {loadingRoster && <tr><td colSpan={3} className="p-5 text-center text-slate-400">{t("Loading attendance…")}</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
            <p className="flex items-start gap-1.5 text-[11px] text-slate-500"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />{t("Students without a scan are marked absent when attendance is finalized.")}</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {classroomId && <button type="button" onClick={() => void finalizeAttendance()} disabled={finalizing || loadingRoster} className="rounded-lg border border-rose-200 px-4 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">{t("Finalize this class")}</button>}
              <button type="button" onClick={() => void finalizeAllAttendance()} disabled={finalizing || !classes.length} className="rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50">{finalizing ? t("Finalizing…") : t("Finalize all classes")}</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
