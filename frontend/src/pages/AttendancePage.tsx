import { t } from "../i18n/index";
import React, { useEffect, useState } from 'react';
import {
  CalendarCheck,
  CheckCircle,
  XCircle,
  Clock,
  HelpCircle,
  Save,
  Check,
  Calendar,
  Filter,
  Users
} from 'lucide-react';
import { attendanceApi, classesApi } from '../services/api';

export const AttendancePage: React.FC = () => {
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0],
  );

  const [sheetData, setSheetData] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    classesApi.getAll().then((cls) => {
      setClasses(cls);
      if (cls.length > 0) setSelectedClass(cls[0].id);
    });
  }, []);

  const loadAttendanceSheet = async () => {
    if (!selectedClass) return;
    try {
      setLoading(true);
      setSavedSuccess(false);
      const res = await attendanceApi.getSheet(selectedClass, selectedDate);
      setSheetData(res);
      setRecords(res.students || []);
    } catch (err) {
      console.error('Failed to load attendance sheet:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttendanceSheet();
  }, [selectedClass, selectedDate]);

  const handleStatusChange = (studentId: string, newStatus: string) => {
    setRecords((prev) =>
      prev.map((r) => (r.studentId === studentId ? { ...r, status: newStatus } : r)),
    );
  };

  const handleReasonChange = (studentId: string, reason: string) => {
    setRecords((prev) =>
      prev.map((r) => (r.studentId === studentId ? { ...r, reason } : r)),
    );
  };

  const handleJustifiedChange = (studentId: string, justified: boolean) => {
    setRecords((prev) =>
      prev.map((r) => (r.studentId === studentId ? { ...r, justified } : r)),
    );
  };

  const handleMarkAllPresent = () => {
    setRecords((prev) => prev.map((r) => ({ ...r, status: 'PRESENT' })));
  };

  const handleSaveAttendance = async () => {
    try {
      setLoading(true);
      await attendanceApi.saveSheet({
        classroomId: selectedClass,
        date: selectedDate,
        records: records.map((r) => ({
          studentId: r.studentId,
          status: r.status,
          reason: r.reason,
          justified: r.justified,
          remarks: r.remarks,
        })),
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      loadAttendanceSheet();
    } catch (err: any) {
      alert(t("Erreur d'enregistrement: {0}", [err.message]));
    } finally {
      setLoading(false);
    }
  };

  // Summary counts
  const total = records.length;
  const presentCount = records.filter((r) => r.status === 'PRESENT').length;
  const absentCount = records.filter((r) => r.status === 'ABSENT').length;
  const lateCount = records.filter((r) => r.status === 'LATE').length;
  const excusedCount = records.filter((r) => r.status === 'EXCUSED').length;
  const attendanceRate = total > 0 ? Math.round(((presentCount + lateCount) / total) * 100) : 100;

  return (
    <div className="space-y-6">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{t("Attendance Register")}</h2>
          <p className="text-xs text-slate-500">
            {t("Daily attendance by class, absence reasons, and attendance rates")}</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleMarkAllPresent}
            className="px-3.5 py-2 border border-amber-300 bg-amber-50 text-amber-800 rounded-xl text-xs font-semibold hover:bg-amber-100 transition"
          >
            {t("Tout marquer Present")}</button>
          <button
            onClick={handleSaveAttendance}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md transition"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{t("Save attendance")}</span>
          </button>
        </div>
      </div>

      {savedSuccess && (
        <div className="bg-amber-100 border border-amber-300 text-amber-800 p-3 rounded-xl text-xs flex items-center space-x-2">
          <CheckCircle className="w-4 h-4 text-amber-600" />
          <span>{t("Attendance saved successfully.")}</span>
        </div>
      )}

      {/* Selectors & KPI Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Class and Date */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">{t("Selected class:")}</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 font-medium focus:ring-2 focus:ring-amber-500"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">{t("Attendance date:")}</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 font-medium focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        {/* Counters */}
        <div className="md:col-span-2 bg-white p-4 rounded-xl border border-slate-200 shadow-xs grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">{t("Total Students")}</span>
            <span className="text-2xl font-black text-slate-800">{total}</span>
          </div>

          <div className="bg-amber-50 p-3 rounded-lg border border-amber-100">
            <span className="text-[10px] uppercase font-bold text-amber-600 block">{t("Present")}</span>
            <span className="text-2xl font-black text-amber-700">{presentCount}</span>
          </div>

          <div className="bg-rose-50 p-3 rounded-lg border border-rose-100">
            <span className="text-[10px] uppercase font-bold text-rose-600 block">{t("Absents")}</span>
            <span className="text-2xl font-black text-rose-700">{absentCount}</span>
          </div>

          <div className="bg-amber-50 p-3 rounded-lg border border-amber-100">
            <span className="text-[10px] uppercase font-bold text-amber-600 block">{t("Attendance rate")}</span>
            <span className="text-2xl font-black text-amber-700">{attendanceRate}%</span>
          </div>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">{t("N°")}</th>
                <th className="px-4 py-3.5">{t("Student ID & name")}</th>
                <th className="px-4 py-3.5">{t("Attendance status")}</th>
                <th className="px-4 py-3.5">{t("Motif de l'absence / Remarque")}</th>
                <th className="px-4 py-3.5 text-center">{t("Excused")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-400">
                    {t("Loading attendance sheet…")}</td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-400">
                    {t("No students enrolled in this class.")}</td>
                </tr>
              ) : (
                records.map((r, idx) => (
                  <tr
                    key={r.studentId}
                    className={`transition ${
                      r.status === 'ABSENT'
                        ? 'bg-rose-50/40'
                        : r.status === 'LATE'
                        ? 'bg-amber-50/40'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <td className="px-5 py-3.5 text-slate-400 font-mono">{idx + 1}</td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-800">
                        {r.student?.firstName} {r.student?.lastName}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">{r.student?.matricule}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center space-x-1.5">
                        <button
                          type="button"
                          onClick={() => handleStatusChange(r.studentId, 'PRESENT')}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                            r.status === 'PRESENT'
                              ? 'bg-amber-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {t("Present")}</button>
                        <button
                          type="button"
                          onClick={() => handleStatusChange(r.studentId, 'ABSENT')}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                            r.status === 'ABSENT'
                              ? 'bg-rose-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {t("Absent")}</button>
                        <button
                          type="button"
                          onClick={() => handleStatusChange(r.studentId, 'LATE')}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                            r.status === 'LATE'
                              ? 'bg-amber-500 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {t("En Late")}</button>
                        <button
                          type="button"
                          onClick={() => handleStatusChange(r.studentId, 'EXCUSED')}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                            r.status === 'EXCUSED'
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {t("Excused")}</button>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <input
                        type="text"
                        placeholder={r.status === 'PRESENT' ? 'R.A.S.' : 'Motif d\'absence...'}
                        value={r.reason || ''}
                        onChange={(e) => handleReasonChange(r.studentId, e.target.value)}
                        className="w-full text-xs p-1.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-amber-500 bg-white"
                      />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={r.justified || false}
                        onChange={(e) => handleJustifiedChange(r.studentId, e.target.checked)}
                        disabled={r.status === 'PRESENT'}
                        className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
