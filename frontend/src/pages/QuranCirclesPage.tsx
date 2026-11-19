import { useEffect, useMemo, useState } from 'react';
import { CheckSquare2, Search, UsersRound } from 'lucide-react';
import { classesApi, studentsApi } from '../services/api';
import { quranCircles } from '../config/quranCircles';

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500';
const UNASSIGNED = '__UNASSIGNED__';

export function QuranCirclesPage() {
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState('');
  const [circleFilter, setCircleFilter] = useState('');
  const [targetCircle, setTargetCircle] = useState<string>(quranCircles[0]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [studentRows, classRows] = await Promise.all([studentsApi.getAll(), classesApi.getAll()]);
      setStudents(studentRows);
      setClasses(classRows);
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'Impossible de charger les élèves.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return students.filter(student => {
      const classroom = student.enrollments?.[0]?.classroom;
      if (classId && classroom?.id !== classId) return false;
      if (circleFilter === UNASSIGNED && student.quranCircle) return false;
      if (circleFilter && circleFilter !== UNASSIGNED && student.quranCircle !== circleFilter) return false;
      if (!needle) return true;
      return `${student.firstName} ${student.lastName} ${student.matricule} ${student.schoolMatricule || ''} ${student.quranCircle || ''} ${classroom?.name || ''}`.toLocaleLowerCase().includes(needle);
    });
  }, [students, classId, circleFilter, search]);

  const visibleIds = filtered.map(student => student.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
  const toggleOne = (id: string) => setSelectedIds(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleVisible = () => setSelectedIds(current => {
    const next = new Set(current);
    if (allVisibleSelected) visibleIds.forEach(id => next.delete(id)); else visibleIds.forEach(id => next.add(id));
    return next;
  });

  const counts = useMemo(() => {
    const result: Record<string, number> = { [UNASSIGNED]: 0 };
    quranCircles.forEach(circle => { result[circle] = 0; });
    students.forEach(student => { result[student.quranCircle || UNASSIGNED] = (result[student.quranCircle || UNASSIGNED] || 0) + 1; });
    return result;
  }, [students]);

  const assign = async () => {
    if (!selectedIds.size) return;
    const circle = targetCircle === UNASSIGNED ? null : targetCircle;
    const action = circle ? `affecter ${selectedIds.size} élève(s) à « ${circle} »` : `retirer l’affectation de ${selectedIds.size} élève(s)`;
    if (!window.confirm(`Confirmez-vous que vous voulez ${action} ?`)) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await studentsApi.assignQuranCircle({ studentIds: [...selectedIds], quranCircle: circle });
      setNotice(`${result.updatedCount} dossier(s) mis à jour sur ${result.selectedCount} sélectionné(s).`);
      setSelectedIds(new Set());
      await load();
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'Impossible d’enregistrer les affectations.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="mx-auto max-w-7xl space-y-6">
    <div>
      <h2 className="text-xl font-bold text-slate-800">Halkhas coraniques</h2>
      <p className="mt-1 text-sm text-slate-500">Affectez plusieurs élèves à un groupe coranique, indépendamment de leur classe scolaire.</p>
    </div>

    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[...quranCircles, UNASSIGNED].map(circle => {
        const unassigned = circle === UNASSIGNED;
        return <button key={circle} type="button" onClick={() => setCircleFilter(circle)} className={`rounded-xl border p-4 text-left transition ${circleFilter === circle ? 'border-amber-500 bg-amber-50 shadow-sm' : 'border-slate-200 bg-white hover:border-amber-300'}`}>
          <span className="flex items-center justify-between gap-3"><span className={unassigned ? 'text-sm font-semibold text-slate-600' : 'text-sm font-bold text-slate-800'} dir={unassigned ? undefined : 'rtl'}>{unassigned ? 'Élèves non affectés' : circle}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{counts[circle] || 0}</span></span>
        </button>;
      })}
    </section>

    <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:grid-cols-[minmax(220px,1fr)_220px_minmax(260px,1fr)]">
      <label className="relative"><span className="sr-only">Rechercher un élève</span><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nom, matricule, classe ou halkha…" className={`${inputClass} pl-9`}/></label>
      <label><span className="sr-only">Filtrer par classe</span><select value={classId} onChange={event => setClassId(event.target.value)} className={inputClass}><option value="">Toutes les classes</option>{classes.map(classroom => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}</select></label>
      <label><span className="sr-only">Filtrer par halkha</span><select value={circleFilter} onChange={event => setCircleFilter(event.target.value)} className={inputClass} dir="rtl"><option value="">Toutes les halkhas</option><option value={UNASSIGNED}>Non affectés</option>{quranCircles.map(circle => <option key={circle} value={circle}>{circle}</option>)}</select></label>
    </section>

    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={toggleVisible} disabled={!visibleIds.length} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"><CheckSquare2 className="h-4 w-4"/>{allVisibleSelected ? 'Désélectionner les résultats' : 'Sélectionner tous les résultats'}</button><span className="text-sm text-slate-500">{filtered.length} élève(s) affiché(s) · <b>{selectedIds.size} sélectionné(s)</b></span></div>
        <button type="button" onClick={() => { setSearch(''); setClassId(''); setCircleFilter(''); }} className="text-sm font-semibold text-amber-700">Effacer les filtres</button>
      </div>

      <div className="max-h-[55vh] overflow-auto">
        {loading ? <p className="p-8 text-center text-sm text-slate-500">Chargement des élèves…</p> : !filtered.length ? <p className="p-8 text-center text-sm text-slate-500">Aucun élève ne correspond aux filtres.</p> : <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="w-14 px-4 py-3"><input type="checkbox" aria-label="Sélectionner tous les élèves affichés" checked={allVisibleSelected} onChange={toggleVisible}/></th><th className="px-4 py-3">Élève</th><th className="px-4 py-3">Classe scolaire</th><th className="px-4 py-3">Halkha actuelle</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{filtered.map(student => <tr key={student.id} className={selectedIds.has(student.id) ? 'bg-amber-50/60' : 'hover:bg-slate-50'}><td className="px-4 py-3"><input type="checkbox" aria-label={`Sélectionner ${student.firstName} ${student.lastName}`} checked={selectedIds.has(student.id)} onChange={() => toggleOne(student.id)}/></td><td className="px-4 py-3"><b className="text-slate-800">{student.firstName} {student.lastName}</b><p className="font-mono text-xs text-amber-700">{student.matricule}{student.schoolMatricule ? ` · ${student.schoolMatricule}` : ''}</p></td><td className="px-4 py-3 text-slate-600">{student.enrollments?.[0]?.classroom?.name || 'Non affectée'}</td><td className="px-4 py-3"><span className={student.quranCircle ? 'font-semibold text-emerald-700' : 'italic text-slate-400'} dir={student.quranCircle ? 'rtl' : undefined}>{student.quranCircle || 'Non affectée'}</span></td></tr>)}</tbody>
        </table>}
      </div>
    </section>

    <section className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-2xl border border-amber-300 bg-white p-4 shadow-xl sm:flex-row sm:items-end">
      <label className="min-w-0 flex-1 text-sm font-semibold text-slate-700">Affecter la sélection à<select value={targetCircle} onChange={event => setTargetCircle(event.target.value)} className={`${inputClass} mt-1`} dir="rtl"><option value={UNASSIGNED}>Retirer l’affectation</option>{quranCircles.map(circle => <option key={circle} value={circle}>{circle}</option>)}</select></label>
      <button type="button" onClick={() => void assign()} disabled={!selectedIds.size || saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"><UsersRound className="h-4 w-4"/>{saving ? 'Enregistrement…' : `Enregistrer ${selectedIds.size || ''} affectation(s)`}</button>
    </section>
  </div>;
}
