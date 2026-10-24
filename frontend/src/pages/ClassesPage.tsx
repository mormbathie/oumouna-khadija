import { programs, programFor } from '../config/school';
import { t } from "../i18n/index";
import React, { useEffect, useState } from 'react';
import {
  Settings,
  BookOpen,
  School,
  Plus,
  Users,
  CheckCircle2,
  Pencil,
  X
} from 'lucide-react';
import { classesApi } from '../services/api';
import { useAuth } from '../auth/AuthContext';

const defaultProgram = programs[0];
const emptyClassForm = () => ({
  name: '', level: defaultProgram.levels[0], capacity: 25,
  monthlyTuition: defaultProgram.monthlyTuition,
  registrationFee: defaultProgram.registrationFee,
  teacherId: '', program: defaultProgram.id,
});

export const ClassesPage: React.FC = () => {
  const { hasRole } = useAuth();
  const canManage = hasRole(['ADMIN', 'DIRECTEUR']);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showClassModal, setShowClassModal] = useState(false);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [savingClass, setSavingClass] = useState(false);
  const [classForm, setClassForm] = useState(emptyClassForm);

  // Subject Modal
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [subName, setSubName] = useState('');
  const [subCode, setSubCode] = useState('');
  const [subCoeff, setSubCoeff] = useState(1.0);

  const loadData = async () => {
    try {
      setLoading(true);
      const [cls, subs, teacherList] = await Promise.all([
        classesApi.getAll(), classesApi.getSubjects(), canManage ? classesApi.getTeachers() : Promise.resolve([]),
      ]);
      setClasses(cls);
      setSubjects(subs);
      setTeachers(teacherList);
    } catch (err) {
      console.error('Failed to load classes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAssignTeacher = async (classId: string, teacherId: string) => {
    try {
      await classesApi.update(classId, { teacherId: teacherId || null });
      await loadData();
    } catch (err: any) {
      alert(t("Impossible d’affecter l’enseignant : {0}", [err.response?.data?.message || err.message]));
    }
  };

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: subName,
        code: subCode,
        coefficient: Number(subCoeff),
      };
      if (editingSubjectId) await classesApi.updateSubject(editingSubjectId, payload);
      else await classesApi.createSubject(payload);
      setShowSubjectModal(false);
      setEditingSubjectId(null);
      setSubName('');
      setSubCode('');
      setSubCoeff(1.0);
      await loadData();
    } catch (err: any) {
      alert(t("Error: {0}", [err.response?.data?.message || err.message]));
    }
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingClass(true);
    try {
      const payload = {
        ...classForm,
        name: classForm.name.trim(),
        capacity: Number(classForm.capacity),
        monthlyTuition: Number(classForm.monthlyTuition),
        registrationFee: Number(classForm.registrationFee),
        teacherId: classForm.teacherId || null,
      };
      if (editingClassId) await classesApi.update(editingClassId, payload);
      else await classesApi.create(payload);
      setShowClassModal(false);
      setEditingClassId(null);
      setClassForm(emptyClassForm());
      await loadData();
    } catch (err: any) {
      alert(t("Error creating the class: ") + (err.response?.data?.message || err.message));
    } finally {
      setSavingClass(false);
    }
  };

  const editClass = (classroom: any) => {
    setEditingClassId(classroom.id);
    setClassForm({ name: classroom.name, level: classroom.level, capacity: classroom.capacity, monthlyTuition: classroom.monthlyTuition, registrationFee: classroom.effectiveRegistrationFee ?? classroom.registrationFee, teacherId: classroom.teacherId || '', program: classroom.program || programFor(classroom).id });
    setShowClassModal(true);
  };

  const editSubject = (subject: any) => {
    setEditingSubjectId(subject.id);
    setSubName(subject.name);
    setSubCode(subject.code);
    setSubCoeff(subject.coefficient);
    setShowSubjectModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{t("Classes & Subjects Taught")}</h2>
          <p className="text-xs text-slate-500">
            Préscolaire, Tahfiz et enseignement franco-arabe</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && <button
            onClick={() => { setEditingClassId(null); setClassForm(emptyClassForm()); setShowClassModal(true); }}
            className="inline-flex items-center space-x-2 bg-white hover:bg-amber-50 text-amber-700 border border-amber-200 px-4 py-2.5 rounded-xl font-medium text-sm transition"
          >
            <School className="w-4 h-4" />
            <span>{t("Create a class")}</span>
          </button>}
          {canManage && <button
            onClick={() => { setEditingSubjectId(null); setSubName(''); setSubCode(''); setSubCoeff(1); setShowSubjectModal(true); }}
            className="inline-flex items-center space-x-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            <span>{t("Add a Subject")}</span>
          </button>}
        </div>
      </div>

      {/* Primary Classes Cards */}
      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">
          Classes et groupes de l’institut</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {classes.length === 0 ? (
            <div className="md:col-span-2 lg:col-span-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-8 text-center">
              <School className="w-8 h-8 text-amber-600 mx-auto mb-3" />
              <p className="font-semibold text-slate-800">{t("No classes have been created yet.")}</p>
              <p className="text-xs text-slate-500 mt-1">{t("Create a class before assigning students.")}</p>
              {canManage && <button
                type="button"
                onClick={() => setShowClassModal(true)}
                className="mt-4 inline-flex items-center space-x-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-xs font-semibold"
              >
                <Plus className="w-4 h-4" />
                <span>{t("Create the first class")}</span>
              </button>}
            </div>
          ) : classes.map((c) => (
            <div
              key={c.id}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition space-y-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold bg-amber-50 text-amber-800 px-2 py-0.5 rounded">
                  {t("Niveau")}{c.level}
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  {c._count?.enrollments || 0} / {c.capacity} {t("Students")}</span>
              </div>

              <div>
                <h4 className="font-bold text-base text-slate-800">{c.name}</h4>
                <p className="text-xs text-slate-500">
                  {t("Class teacher:")}{c.teacher ? `${c.teacher.firstName} ${c.teacher.lastName}` : t("No teacher assigned")}
                </p>
              </div>
              {canManage && <button type="button" onClick={() => editClass(c)} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-50"><Pencil className="h-3.5 w-3.5" />{t("Edit class")}</button>}

              {canManage && <label className="block text-xs font-medium text-slate-600">{t("Assign a teacher")}<select value={c.teacherId || ''} onChange={(event) => void handleAssignTeacher(c.id, event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"><option value="">{t("No teacher")}</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.firstName} {teacher.lastName} · {teacher.email}</option>)}</select></label>}

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">{t("Initial amount:")}</span>
                  <span className="font-bold text-slate-800">{(c.effectiveRegistrationFee ?? c.registrationFee).toLocaleString()} {t("FCFA")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t("Monthly tuition:")}</span>
                  <span className="font-bold text-amber-700">{c.monthlyTuition.toLocaleString()} {t("FCFA / mois")}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Subjects Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-800">{t("Subjects and Coefficients")}</h3>
          <span className="text-xs text-slate-500">{subjects.length} {t("subjects configured")}</span>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100/60 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
            <tr>
              <th className="px-5 py-3">{t("Code")}</th>
              <th className="px-4 py-3">{t("Subject")}</th>
              <th className="px-4 py-3 text-center">{t("Coefficient Officiel")}</th>
              <th className="px-5 py-3 text-right">{t("Actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {subjects.map((sub) => (
              <tr key={sub.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-mono font-bold text-amber-800">{sub.code}</td>
                <td className="px-4 py-3 font-semibold text-slate-800">{sub.name}</td>
                <td className="px-4 py-3 text-center font-bold text-slate-700">{sub.coefficient}</td>
                <td className="px-5 py-3 text-right">
                  {canManage ? <button type="button" onClick={() => editSubject(sub)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-amber-800 hover:bg-amber-50"><Pencil className="h-3 w-3" />{t("Edit")}</button> : <span className="inline-flex items-center gap-1 text-amber-800"><CheckCircle2 className="h-3 w-3" />{t("Active")}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal: Create a class */}
      {showClassModal && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-800">{editingClassId ? t("Edit class") : t("Create a class")}</h3>
                <p className="text-xs text-slate-500 mt-1">{t("The class will belong to the current school year.")}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowClassModal(false)}
                className="text-slate-400 hover:bg-slate-100 p-1 rounded-lg"
                aria-label={t("Close")}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateClass} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="font-medium text-slate-700 block mb-1">{t("Class name *")}</label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    placeholder="Ex : CI A"
                    value={classForm.name}
                    onChange={(e) => setClassForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="sm:col-span-2"><label className="mb-1 block font-medium text-slate-700">{t('School programme')}</label><select value={classForm.program} onChange={e=>{ const plan=programs.find(p=>p.id===e.target.value)!; setClassForm(prev=>({...prev,program:plan.id,level:plan.levels.includes(prev.level)?prev.level:plan.levels[0],registrationFee:plan.registrationFee,monthlyTuition:plan.monthlyTuition})); }} className="w-full rounded-lg border border-slate-200 bg-white p-2.5">{programs.map(p=><option key={p.id} value={p.id}>{t(p.label)} · {t(p.hours)}</option>)}</select><p className="mt-1 text-xs text-slate-500">{t('Selecting a programme fills in its published fees. You may adjust them before saving.')}</p></div>
                <div>
                  <label className="font-medium text-slate-700 block mb-1">{t("Niveau *")}</label>
                  <select
                    required
                    value={classForm.level}
                    onChange={(e) => setClassForm((prev) => ({ ...prev, level: e.target.value }))}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                  >
                    {programs.find(program => program.id === classForm.program)?.levels.map(level => <option key={level} value={level}>{level}</option>)}
                  </select>
                </div>

                <div>
                  <label className="font-medium text-slate-700 block mb-1">{t("Effectif maximal *")}</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={classForm.capacity}
                    onChange={(e) => setClassForm((prev) => ({ ...prev, capacity: Number(e.target.value) }))}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="font-medium text-slate-700 block mb-1">{t("Enseignant responsable")}</label>
                  <select value={classForm.teacherId} onChange={(e) => setClassForm((prev) => ({ ...prev, teacherId: e.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 focus:ring-2 focus:ring-amber-500">
                    <option value="">{t("Affecter plus tard")}</option>
                    {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.firstName} {teacher.lastName} · {teacher.email}</option>)}
                  </select>
                  {teachers.length === 0 && <p className="mt-1 text-[11px] text-slate-400">{t("Create a user with the Teacher role in User Management.")}</p>}
                </div>

                <div>
                  <label className="font-medium text-slate-700 block mb-1">{t("Initial amount to invoice (FCFA)")}</label>
                  <input
                    type="number"
                    min="0"
                    value={classForm.registrationFee}
                    onChange={(e) => setClassForm((prev) => ({ ...prev, registrationFee: Number(e.target.value) }))}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="font-medium text-slate-700 block mb-1">{t("Monthly tuition (FCFA)")}</label>
                  <input
                    type="number"
                    min="0"
                    value={classForm.monthlyTuition}
                    onChange={(e) => setClassForm((prev) => ({ ...prev, monthlyTuition: Number(e.target.value) }))}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <p className="text-[11px] text-slate-500">
                {t("If there is no school year yet, it will be created with the first class.")}</p>

              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowClassModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
                >
                  {t("Cancel")}</button>
                <button
                  type="submit"
                  disabled={savingClass}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium shadow-md disabled:opacity-50"
                >
                  {savingClass ? t("Saving…") : editingClassId ? t("Save") : t("Create class")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Subject */}
      {showSubjectModal && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-800">{editingSubjectId ? t("Edit subject") : t("Add subject")}</h3>
              <button onClick={() => setShowSubjectModal(false)} className="text-slate-400 hover:bg-slate-100 p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubject} className="p-6 space-y-4 text-xs">
              <div>
                <label className="font-medium text-slate-700 block mb-1">{t("Subject name *")}</label>
                <input
                  type="text"
                  required
                  placeholder={t("Example: Science")}
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="font-medium text-slate-700 block mb-1">{t("Short code *")}</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: EVEIL"
                  value={subCode}
                  onChange={(e) => setSubCode(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="font-medium text-slate-700 block mb-1">{t("Coefficient *")}</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="10"
                  required
                  value={subCoeff}
                  onChange={(e) => setSubCoeff(Number(e.target.value))}
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowSubjectModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
                >
                  {t("Cancel")}</button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium shadow-md"
                >
                  {editingSubjectId ? t("Save") : t("Add")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
