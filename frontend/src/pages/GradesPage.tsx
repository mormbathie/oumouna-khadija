import { printSchoolDocument, escapeHtml } from '../utils/schoolDocuments';
import { SchoolHeader } from '../components/SchoolHeader';
import { t } from "../i18n/index";
import React, { useEffect, useState } from 'react';
import {
  FileSpreadsheet,
  Award,
  Printer,
  Save,
  CheckCircle2,
  Sparkles,
  School,
  X,
  FileText
} from 'lucide-react';
import { gradesApi, classesApi } from '../services/api';

export const GradesPage: React.FC = () => {
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedTerm, setSelectedTerm] = useState<string>('TRIMESTRE_1');
  const [examType, setExamType] = useState<string>('COMPOSITION');

  // Mode
  const [activeTab, setActiveTab] = useState<'entry' | 'report_cards'>('entry');

  // Data
  const [classDetails, setClassDetails] = useState<any>(null);
  const [gradesInput, setGradesInput] = useState<Record<string, { score: string; remarks: string }>>({});
  const [classReportCards, setClassReportCards] = useState<any[]>([]);
  const [selectedReportCard, setSelectedReportCard] = useState<any>(null);
  const [showReportCardModal, setShowReportCardModal] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    classesApi.getAll().then((cls) => {
      setClasses(cls);
      if (cls.length > 0) setSelectedClass(cls[0].id);
    });
    classesApi.getSubjects().then((subs) => {
      setSubjects(subs);
      if (subs.length > 0) setSelectedSubject(subs[0].id);
    });
  }, []);

  const loadClassData = async () => {
    if (!selectedClass) return;
    try {
      setLoading(true);
      const details = await classesApi.getOne(selectedClass);
      setClassDetails(details);

      // Load existing grades for this class, subject, term
      if (selectedSubject) {
        const existingGrades = await gradesApi.getGrades({
          classroomId: selectedClass,
          subjectId: selectedSubject,
          term: selectedTerm,
        });

        const initialInputs: Record<string, { score: string; remarks: string }> = {};
        for (const enr of details.enrollments || []) {
          const g = existingGrades.find((item: any) => item.studentId === enr.studentId);
          initialInputs[enr.studentId] = {
            score: g ? String(g.score) : '',
            remarks: g?.remarks || '',
          };
        }
        setGradesInput(initialInputs);
      }

      // Load report cards for this class
      try {
        const rcs = await gradesApi.getClassReportCards({
          classroomId: selectedClass,
          term: selectedTerm,
        });
        setClassReportCards(rcs);
      } catch (e) {
        setClassReportCards([]);
      }
    } catch (err) {
      console.error('Error loading class data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClassData();
  }, [selectedClass, selectedSubject, selectedTerm]);

  const handleScoreChange = (studentId: string, value: string) => {
    setGradesInput((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        score: value,
      },
    }));
  };

  const handleRemarksChange = (studentId: string, value: string) => {
    setGradesInput((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        remarks: value,
      },
    }));
  };

  const handleSaveGrades = async () => {
    if (!selectedClass || !selectedSubject) return;

    try {
      const gradesArray = Object.entries(gradesInput)
        .filter(([_, val]) => val.score !== '')
        .map(([studentId, val]) => ({
          studentId,
          score: Number(val.score),
          remarks: val.remarks,
        }));

      if (gradesArray.length === 0) {
        alert(t("Enter at least one grade"));
        return;
      }

      const res = await gradesApi.recordBatch({
        classroomId: selectedClass,
        subjectId: selectedSubject,
        term: selectedTerm,
        examType,
        grades: gradesArray,
      });

      alert(res.message);
      loadClassData();
    } catch (err: any) {
      alert(t("Erreur d'enregistrement: {0}", [err.message]));
    }
  };

  const handleGenerateClassBulletins = async () => {
    try {
      setLoading(true);
      const res = await gradesApi.generateClassReportCards({
        classroomId: selectedClass,
        term: selectedTerm,
      });
      alert(res.message);
      loadClassData();
    } catch (err: any) {
      alert(t("Error: {0}", [err.message]));
    } finally {
      setLoading(false);
    }
  };

  const handleViewBulletin = async (studentId: string) => {
    try {
      setLoading(true);
      const details = await gradesApi.getReportCardDetails({
        studentId,
        classroomId: selectedClass,
        term: selectedTerm,
      });
      setSelectedReportCard(details);
      setShowReportCardModal(true);
    } catch (err: any) {
      alert(t("No report card has been calculated for this student yet. Generate report cards first."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{t("Cahier de Grades & Report Cards Scolaires")}</h2>
          <p className="text-xs text-slate-500">
            {t("Enter grades, calculate averages automatically, and generate report cards")}</p>
        </div>
        <div className="flex items-center space-x-2 bg-slate-200/80 p-1 rounded-xl text-xs font-semibold">
          <button
            onClick={() => setActiveTab('entry')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'entry' ? 'bg-white text-amber-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t("Enter Grades")}</button>
          <button
            onClick={() => setActiveTab('report_cards')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'report_cards' ? 'bg-white text-amber-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t("Bulletins Trimestriels (")}{classReportCards.length})
          </button>
        </div>
      </div>

      {/* Selectors Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div>
          <label className="font-semibold text-slate-600 block mb-1">{t("Class:")}</label>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-medium focus:ring-2 focus:ring-amber-500"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="font-semibold text-slate-600 block mb-1">{t("Trimestre :")}</label>
          <select
            value={selectedTerm}
            onChange={(e) => setSelectedTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-medium focus:ring-2 focus:ring-amber-500"
          >
            <option value="TRIMESTRE_1">{t("1er Trimestre")}</option>
            <option value="TRIMESTRE_2">{t("Second term")}</option>
            <option value="TRIMESTRE_3">{t("Third term")}</option>
          </select>
        </div>

        {activeTab === 'entry' && (
          <>
            <div>
              <label className="font-semibold text-slate-600 block mb-1">{t("Subject :")}</label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-medium focus:ring-2 focus:ring-amber-500"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {t("(Coeff")}{s.coefficient})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-600 block mb-1">{t("Assessment type:")}</label>
              <select
                value={examType}
                onChange={(e) => setExamType(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-medium focus:ring-2 focus:ring-amber-500"
              >
                <option value="COMPOSITION">{t("Composition Trimestrielle")}</option>
                <option value="DEVOIR_1">{t("Devoir N°1")}</option>
                <option value="DEVOIR_2">{t("Devoir N°2")}</option>
                <option value="INTERRO">{t("Quiz / Test")}</option>
              </select>
            </div>
          </>
        )}
      </div>

      {/* Tab 1: Grade Entry */}
      {activeTab === 'entry' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-800">
                {t("Entering grades for:")}{classDetails?.name || t("Class")} • {subjects.find((s) => s.id === selectedSubject)?.name || t("Subject")}
              </h3>
              <p className="text-[11px] text-slate-500">
                {t("Standard grading scale of 20 points")}</p>
            </div>
            <button
              onClick={handleSaveGrades}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md transition"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{t("Save Grades")}</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/60 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">{t("N°")}</th>
                  <th className="px-4 py-3">{t("Student ID & name")}</th>
                  <th className="px-4 py-3 w-40">{t("Note sur 20")}</th>
                  <th className="px-4 py-3">{t("Teacher comments")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classDetails?.enrollments?.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-slate-400">
                      {t("No students enrolled in this class")}</td>
                  </tr>
                ) : (
                  classDetails?.enrollments?.map((enr: any, idx: number) => {
                    const student = enr.student;
                    const gradeVal = gradesInput[student.id]?.score ?? '';
                    const remarksVal = gradesInput[student.id]?.remarks ?? '';

                    return (
                      <tr key={student.id} className="hover:bg-slate-50/80 transition">
                        <td className="px-5 py-3 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          <div>
                            {student.firstName} {student.lastName}
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">{student.matricule}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center space-x-1">
                            <input
                              type="number"
                              min="0"
                              max="20"
                              step="0.25"
                              placeholder="-- / 20"
                              value={gradeVal}
                              onChange={(e) => handleScoreChange(student.id, e.target.value)}
                              className="w-24 p-2 font-bold text-center border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white"
                            />
                            <span className="text-slate-400 font-bold">/ 20</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            placeholder={t("Example: Careful work, good reasoning…")}
                            value={remarksVal}
                            onChange={(e) => handleRemarksChange(student.id, e.target.value)}
                            className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white text-xs"
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Bulletins Trimestriels */}
      {activeTab === 'report_cards' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-800">
                {t("Class report cards:")}{classDetails?.name} ({selectedTerm})
              </h3>
              <p className="text-[11px] text-slate-500">
                {t("Automatically calculate ranks, class averages, and official comments")}</p>
            </div>
            <button
              onClick={handleGenerateClassBulletins}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t("Generate / Recalculate Report Cards")}</span>
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">{t("Rang")}</th>
                  <th className="px-4 py-3">{t("Student")}</th>
                  <th className="px-4 py-3">{t("Overall Average")}</th>
                  <th className="px-4 py-3">{t("Class Average")}</th>
                  <th className="px-4 py-3">{t("Official Comment")}</th>
                  <th className="px-5 py-3 text-right">{t("Actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classReportCards.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400">
                      {t("No report cards for this class and term. Select Generate / Recalculate.")}</td>
                  </tr>
                ) : (
                  classReportCards.map((rc) => (
                    <tr key={rc.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-bold text-xs ${
                          rc.rank === 1 ? 'bg-amber-100 text-amber-800 ring-2 ring-amber-400' :
                          rc.rank === 2 ? 'bg-slate-200 text-slate-800' :
                          rc.rank === 3 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {rc.rank || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {rc.student?.firstName} {rc.student?.lastName}
                      </td>
                      <td className="px-4 py-3 font-bold text-sm text-amber-700">
                        {rc.overallAverage} / 20
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {rc.classAverage ? `${rc.classAverage} / 20` : '-'}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">
                        {rc.appreciation}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => handleViewBulletin(rc.studentId)}
                          className="inline-flex items-center space-x-1 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition"
                        >
                          <FileText className="w-3.5 h-3.5 text-amber-400" />
                          <span>{t("View Report Card")}</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Bulletin Scolaire Imprimable */}
      {showReportCardModal && selectedReportCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto">
            {/* Header / Printable Document */}
            <div id="school-report-card" className="p-8 space-y-6">
              {/* Republic & School Header */}
              <SchoolHeader title={t('BULLETIN DE NOTES')} year={selectedReportCard.academicYear?.name || '2026/2027'} />

              {/* Student Details Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">{t("Student :")}</span>
                  <span className="font-bold text-slate-800">
                    {selectedReportCard.student?.firstName} {selectedReportCard.student?.lastName}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">{t("Matricule :")}</span>
                  <span className="font-mono text-amber-700 font-bold">{selectedReportCard.student?.matricule}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">{t("Class:")}</span>
                  <span className="font-bold text-slate-800">{selectedReportCard.classroom?.name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">{t("Class teacher:")}</span>
                  <span className="font-medium text-slate-700">
                    {selectedReportCard.classroom?.teacher?.firstName ? `${selectedReportCard.classroom.teacher.firstName} ${selectedReportCard.classroom.teacher.lastName}` : '—'}
                  </span>
                </div>
              </div>

              {/* Grades Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase text-[11px]">
                    <tr>
                      <th className="px-4 py-2.5">{t("Subjects Taught")}</th>
                      <th className="px-3 py-2.5 text-center">{t("Coeff")}</th>
                      <th className="px-3 py-2.5 text-center">{t("Moyenne / 20")}</th>
                      <th className="px-3 py-2.5 text-center">{t("Points (Note x Coeff)")}</th>
                      <th className="px-4 py-2.5">{t("Teacher Comments")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedReportCard.subjectBreakdown?.map((sub: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-semibold text-slate-800">{sub.subjectName}</td>
                        <td className="px-3 py-2.5 text-center font-mono">{sub.coefficient}</td>
                        <td className="px-3 py-2.5 text-center font-bold text-amber-700">{sub.average}</td>
                        <td className="px-3 py-2.5 text-center font-mono font-bold text-slate-800">{sub.totalPoints}</td>
                        <td className="px-4 py-2.5 text-slate-600 italic text-[11px]">{sub.appreciation}</td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Footer Totals */}
                  <tfoot className="bg-slate-100 font-bold text-slate-800 border-t border-slate-200">
                    <tr>
                      <td className="px-4 py-2.5 uppercase">{t("OVERALL TOTAL")}</td>
                      <td className="px-3 py-2.5 text-center">{selectedReportCard.totalCoeff || 8}</td>
                      <td className="px-3 py-2.5 text-center text-sm text-amber-800 font-black">
                        {selectedReportCard.overallAverage} / 20
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono">{selectedReportCard.totalScore}</td>
                      <td className="px-4 py-2.5 text-amber-700 font-semibold">{selectedReportCard.appreciation}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Statistics & Ranking */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-center">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">{t("Student Rank")}</span>
                  <span className="text-xl font-black text-amber-700">
                    {selectedReportCard.rank ? `${selectedReportCard.rank}e` : '-'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">{t("Class Average")}</span>
                  <span className="text-base font-bold text-slate-700">{selectedReportCard.classAverage || '-'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">{t("Plus Forte Moyenne")}</span>
                  <span className="text-base font-bold text-amber-600">{selectedReportCard.maxAverage || '-'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">{t("Plus Faible Moyenne")}</span>
                  <span className="text-base font-bold text-rose-500">{selectedReportCard.minAverage || '-'}</span>
                </div>
              </div>

              {/* Remarks and Signatures */}
              <div className="pt-4 grid grid-cols-3 gap-4 text-xs border-t border-slate-200">
                <div className="text-center p-3 border border-slate-200 rounded-xl">
                  <p className="font-bold text-slate-700 mb-10">{t("Visa de l'Enseignant")}</p>
                  <p className="text-[10px] text-slate-300">{t("Signature")}</p>
                </div>
                <div className="text-center p-3 border border-slate-200 rounded-xl">
                  <p className="font-bold text-slate-700 mb-10">{t("Principal’s Approval")}</p>
                  <p className="text-[10px] text-slate-300">{t("Cachet & Signature")}</p>
                </div>
                <div className="text-center p-3 border border-slate-200 rounded-xl">
                  <p className="font-bold text-slate-700 mb-10">{t("Parent’s Signature")}</p>
                  <p className="text-[10px] text-slate-300">{t("Vu et pris connaissance")}</p>
                </div>
              </div>
            </div>

            {/* Modal Controls */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowReportCardModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-xs hover:bg-white"
              >
                {t("Close")}</button>
              <button
                type="button"
                onClick={() => printSchoolDocument(t("Print Report Card"), `<h3>${escapeHtml(selectedReportCard.student?.firstName)} ${escapeHtml(selectedReportCard.student?.lastName)}</h3><p>${escapeHtml(t("Matricule"))}: ${escapeHtml(selectedReportCard.student?.matricule)} · ${escapeHtml(t("Class"))}: ${escapeHtml(selectedReportCard.classroom?.name)}</p><table><thead><tr><th>${escapeHtml(t("Subject"))}</th><th>${escapeHtml(t("Coefficient"))}</th><th>${escapeHtml(t("Average"))}</th><th>${escapeHtml(t("Appreciation"))}</th></tr></thead><tbody>${(selectedReportCard.subjectBreakdown || []).map((s:any)=>`<tr><td>${escapeHtml(s.subjectName)}</td><td>${escapeHtml(s.coefficient)}</td><td>${escapeHtml(s.average)}</td><td>${escapeHtml(s.appreciation)}</td></tr>`).join('')}</tbody></table><p>${escapeHtml(t("Average"))}: ${escapeHtml(selectedReportCard.overallAverage)} / 20</p><p>${escapeHtml(t("Student Rank"))}: ${escapeHtml(selectedReportCard.rank ?? '-')}</p><p>${escapeHtml(t("Class Average"))}: ${escapeHtml(selectedReportCard.classAverage ?? '—')}</p><p>${escapeHtml(selectedReportCard.appreciation)}</p><div class="signatures"><span>${escapeHtml(t("Teacher"))}</span><span>${escapeHtml(t("Principal’s Approval"))}</span><span>${escapeHtml(t("Parent’s Signature"))}</span></div>`, selectedReportCard.academicYear?.name || '2026/2027') }
                className="inline-flex items-center space-x-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-md"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{t("Print Report Card")}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
