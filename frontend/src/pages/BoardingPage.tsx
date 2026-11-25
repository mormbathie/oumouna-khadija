import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { BedDouble, CalendarCheck, DoorOpen, HeartPulse, LayoutGrid, Plus, RefreshCw, Search, Trash2, Wallet } from 'lucide-react';
import { boardingApi } from '../services/api';
import { useAuth } from '../auth/AuthContext';
import { money } from '../config/school';

type Tab = 'overview' | 'rooms' | 'rollcall' | 'leaves' | 'health' | 'pocket';
const tabs: { id: Tab; label: string; icon: typeof BedDouble }[] = [
  { id: 'overview', label: 'Vue d’ensemble', icon: LayoutGrid },
  { id: 'rooms', label: 'Chambres et lits', icon: BedDouble },
  { id: 'rollcall', label: 'Appel du soir', icon: CalendarCheck },
  { id: 'leaves', label: 'Sorties et visites', icon: DoorOpen },
  { id: 'health', label: 'Santé', icon: HeartPulse },
  { id: 'pocket', label: 'Argent de poche', icon: Wallet },
];
const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500';
const button = 'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:opacity-50';
const primary = `${button} bg-amber-600 text-white hover:bg-amber-700`;
const ghost = `${button} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;
const rollStatuses: Record<string, { label: string; className: string }> = {
  PRESENT: { label: 'Présent', className: 'bg-emerald-600 text-white' },
  ABSENT: { label: 'Absent', className: 'bg-rose-600 text-white' },
  ON_LEAVE: { label: 'En sortie', className: 'bg-sky-600 text-white' },
  SICK: { label: 'Malade', className: 'bg-amber-500 text-white' },
};
const leaveKinds: Record<string, string> = { WEEKEND: 'Week-end', HOLIDAY: 'Vacances', MEDICAL: 'Médicale', FAMILY: 'Familiale', OTHER: 'Autre' };
const errorText = (error: any, fallback: string) => error?.response?.data?.message || fallback;
const today = () => new Date().toISOString().slice(0, 10);
const localDateTime = (date = new Date()) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const dateTimeText = (value?: string | null) => value ? new Date(value).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const name = (student: any) => student ? `${student.firstName} ${student.lastName}` : '—';

function Card({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    {(title || actions) && <div className="mb-4 flex flex-wrap items-center justify-between gap-2">{title && <h3 className="font-bold text-slate-800">{title}</h3>}{actions}</div>}
    {children}
  </section>;
}

function BoarderSelect({ boarders, value, onChange, label = 'Élève interne' }: { boarders: any[]; value: string; onChange: (id: string) => void; label?: string }) {
  return <label className="block text-sm font-medium text-slate-700">{label}
    <select required value={value} onChange={event => onChange(event.target.value)} className={`${input} mt-1`}>
      <option value="">Choisir un élève…</option>
      {boarders.map(student => <option key={student.id} value={student.id}>{student.lastName} {student.firstName} · {student.classroom?.name || ''}</option>)}
    </select>
  </label>;
}

export function BoardingPage() {
  const { hasRole } = useAuth();
  const canManageRooms = hasRole(['ADMIN', 'DIRECTEUR']);
  const [tab, setTab] = useState<Tab>('overview');
  const [boarders, setBoarders] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const loadBoarders = async () => {
    try { setBoarders(await boardingApi.boarders()); } catch (requestError) { setError(errorText(requestError, 'Impossible de charger les internes.')); }
  };
  useEffect(() => { void loadBoarders(); }, []);
  const run = async (action: () => Promise<unknown>, success?: string) => {
    setError(''); setNotice('');
    try { await action(); if (success) setNotice(success); return true; }
    catch (requestError) { setError(errorText(requestError, 'Action impossible.')); return false; }
  };
  const shared = { boarders, run, reloadBoarders: loadBoarders };
  return <div className="mx-auto max-w-7xl space-y-5">
    <div>
      <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800"><BedDouble className="h-6 w-6 text-[#8a7330]"/>Internat</h2>
      <p className="mt-1 text-sm text-slate-500">Les internes sont les élèves inscrits cette année dans une classe d’internat ({boarders.length} élève(s)).</p>
    </div>
    <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => { setTab(id); setError(''); setNotice(''); }}
        className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${tab === id ? 'bg-[#30331f] text-white shadow' : 'text-slate-600 hover:bg-stone-100'}`}><Icon className="h-4 w-4"/>{label}</button>)}
    </nav>
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {tab === 'overview' && <Overview {...shared}/>}
    {tab === 'rooms' && <Rooms {...shared} canManage={canManageRooms}/>}
    {tab === 'rollcall' && <RollCall {...shared}/>}
    {tab === 'leaves' && <Leaves {...shared}/>}
    {tab === 'health' && <Health {...shared}/>}
    {tab === 'pocket' && <Pocket {...shared}/>}
  </div>;
}

type Shared = { boarders: any[]; run: (action: () => Promise<unknown>, success?: string) => Promise<boolean>; reloadBoarders: () => Promise<void> };

function Overview({ boarders }: Shared) {
  const [stats, setStats] = useState<any>(null);
  const [search, setSearch] = useState('');
  useEffect(() => { void boardingApi.overview().then(setStats).catch(() => undefined); }, []);
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return needle ? boarders.filter(student => `${student.firstName} ${student.lastName} ${student.matricule} ${student.classroom?.name || ''} ${student.boardingBed?.room?.name || ''}`.toLocaleLowerCase().includes(needle)) : boarders;
  }, [boarders, search]);
  const tiles = stats ? [
    ['Internes', stats.boarders, `${stats.boys} garçons · ${stats.girls} filles`, 'text-indigo-700'],
    ['Lits libres', stats.freeBeds, `${stats.occupiedBeds} occupés sur ${stats.beds}`, 'text-emerald-700'],
    ['En sortie', stats.onLeave, stats.lateReturns ? `${stats.lateReturns} retour(s) en retard` : 'aucun retard', stats.lateReturns ? 'text-rose-700' : 'text-sky-700'],
    ['Appel de ce soir', stats.rollCall.PRESENT || 0, `présents · ${stats.rollCall.ABSENT || 0} absent(s)`, 'text-slate-800'],
    ['Infirmerie aujourd’hui', stats.healthToday, 'passage(s)', 'text-amber-700'],
    ['Argent de poche gardé', money(stats.pocketMoneyHeld), 'pour tous les internes', 'text-slate-800'],
  ] : [];
  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{tiles.map(([label, value, hint, color]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p><p className="text-xs text-slate-500">{hint}</p></div>)}</div>
    <Card title="Liste des internes" actions={<label className="relative w-full sm:w-72"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nom, classe, chambre…" className={`${input} pl-9`}/></label>}>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
        <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Élève</th><th>Classe</th><th>Lit</th><th>Situation</th><th>Argent de poche</th><th>Contact</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{filtered.map(student => <tr key={student.id}>
          <td className="py-2"><b className="text-slate-800">{name(student)}</b><span className="block font-mono text-xs text-slate-500">{student.matricule}</span></td>
          <td>{student.classroom?.name || '—'}</td>
          <td>{student.boardingBed ? `${student.boardingBed.room.name} · ${student.boardingBed.label}` : <span className="text-amber-700">Sans lit</span>}</td>
          <td>{student.currentLeave ? <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">En sortie · retour {dateTimeText(student.currentLeave.expectedReturnAt)}</span> : <span className="text-xs text-emerald-700">À l’internat</span>}</td>
          <td>{money(student.pocketBalance)}</td>
          <td className="text-xs text-slate-600">{student.emergencyContactPhone || student.parent?.phone || '—'}</td>
        </tr>)}</tbody>
      </table>{!filtered.length && <p className="p-6 text-center text-sm text-slate-500">Aucun interne.</p>}</div>
    </Card>
  </div>;
}

function Rooms({ boarders, run, reloadBoarders, canManage }: Shared & { canManage: boolean }) {
  const [rooms, setRooms] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', building: '', gender: '', beds: '6', supervisorName: '' });
  const load = async () => { try { setRooms(await boardingApi.rooms()); } catch { /* shown by actions */ } };
  useEffect(() => { void load(); }, []);
  const placed = new Set(rooms.flatMap(room => room.beds.map((bed: any) => bed.studentId).filter(Boolean)));
  const unplaced = boarders.filter(student => !placed.has(student.id));
  const after = async () => { await load(); await reloadBoarders(); };
  const assign = (bed: any, room: any, studentId: string) => void run(async () => { await boardingApi.assignBed(bed.id, studentId || null); await after(); });
  return <div className="space-y-5">
    {canManage && <Card title="Nouvelle chambre">
      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" onSubmit={event => { event.preventDefault(); void run(async () => {
        await boardingApi.createRoom({ ...form, gender: form.gender || null, beds: Number(form.beds) }); setForm({ name: '', building: '', gender: '', beds: '6', supervisorName: '' }); await load();
      }, 'Chambre créée.'); }}>
        <input required placeholder="Nom (ex. Chambre 1)" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} className={`${input} lg:col-span-2`}/>
        <input placeholder="Bâtiment" value={form.building} onChange={event => setForm({ ...form, building: event.target.value })} className={input}/>
        <select value={form.gender} onChange={event => setForm({ ...form, gender: event.target.value })} className={input}><option value="">Mixte</option><option value="MALE">Garçons</option><option value="FEMALE">Filles</option></select>
        <input type="number" min={0} max={100} value={form.beds} onChange={event => setForm({ ...form, beds: event.target.value })} className={input} aria-label="Nombre de lits"/>
        <button className={primary}><Plus className="h-4 w-4"/>Créer</button>
        <input placeholder="Surveillant(e) responsable" value={form.supervisorName} onChange={event => setForm({ ...form, supervisorName: event.target.value })} className={`${input} lg:col-span-3`}/>
      </form>
    </Card>}
    {unplaced.length > 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><b>{unplaced.length} interne(s) sans lit :</b> {unplaced.slice(0, 12).map(name).join(', ')}{unplaced.length > 12 ? '…' : ''}</p>}
    {!rooms.length && <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Aucune chambre. {canManage ? 'Créez la première ci-dessus.' : 'La direction doit créer les chambres.'}</p>}
    <div className="grid gap-4 lg:grid-cols-2">{rooms.map(room => {
      const free = room.beds.filter((bed: any) => !bed.studentId).length;
      const candidates = (bed: any) => boarders.filter(student => (!room.gender || student.gender === room.gender) && (!placed.has(student.id) || student.id === bed.studentId));
      return <Card key={room.id} title={`${room.name}${room.building ? ` · ${room.building}` : ''}`} actions={<span className="flex items-center gap-2">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{room.gender === 'MALE' ? 'Garçons' : room.gender === 'FEMALE' ? 'Filles' : 'Mixte'} · {free} libre(s)/{room.beds.length}</span>
        {canManage && <button type="button" title="Supprimer la chambre" onClick={() => { if (window.confirm(`Supprimer ${room.name} ?`)) void run(async () => { await boardingApi.deleteRoom(room.id); await load(); }); }} className="rounded p-1 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4"/></button>}
      </span>}>
        {room.supervisorName && <p className="mb-3 text-xs text-slate-500">Responsable : {room.supervisorName}</p>}
        <ul className="space-y-2">{room.beds.map((bed: any) => <li key={bed.id} className="flex items-center gap-2">
          <span className={`w-16 shrink-0 rounded-md px-2 py-1 text-center text-xs font-semibold ${bed.studentId ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'}`}>{bed.label}</span>
          <select value={bed.studentId || ''} onChange={event => assign(bed, room, event.target.value)} className={`${input} py-1.5`}>
            <option value="">— Lit libre —</option>{candidates(bed).map(student => <option key={student.id} value={student.id}>{student.lastName} {student.firstName} · {student.classroom?.name || ''}</option>)}
          </select>
          {canManage && !bed.studentId && <button type="button" title="Supprimer le lit" onClick={() => void run(async () => { await boardingApi.deleteBed(bed.id); await load(); })} className="rounded p-1 text-slate-400 hover:text-rose-600"><Trash2 className="h-4 w-4"/></button>}
        </li>)}</ul>
        {canManage && <button type="button" onClick={() => { const label = window.prompt('Nom du nouveau lit', `Lit ${room.beds.length + 1}`); if (label) void run(async () => { await boardingApi.addBed(room.id, label); await load(); }); }} className={`${ghost} mt-3`}><Plus className="h-4 w-4"/>Ajouter un lit</button>}
      </Card>;
    })}</div>
  </div>;
}

function RollCall({ run }: Shared) {
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); try { setRows((await boardingApi.rollCall(date)).rows); } catch { setRows([]); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, [date]);
  const set = (id: string, patch: any) => setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row));
  const counts = Object.fromEntries(Object.keys(rollStatuses).map(status => [status, rows.filter(row => row.status === status).length]));
  const missing = rows.filter(row => !row.status).length;
  const save = () => void run(async () => {
    await boardingApi.saveRollCall(date, rows.filter(row => row.status).map(row => ({ studentId: row.id, status: row.status, notes: row.notes })));
    await load();
  }, 'Appel enregistré.');
  return <Card title="Appel du soir" actions={<div className="flex flex-wrap items-center gap-2">
    <input type="date" value={date} max={today()} onChange={event => setDate(event.target.value)} className={`${input} w-auto`}/>
    <button type="button" onClick={() => setRows(current => current.map(row => row.status ? row : { ...row, status: 'PRESENT' }))} className={ghost}>Tous les autres présents</button>
    <button type="button" onClick={save} disabled={!rows.some(row => row.status)} className={primary}>Enregistrer l’appel</button>
  </div>}>
    <p className="mb-3 text-sm text-slate-600">{Object.entries(rollStatuses).map(([status, { label }]) => `${label} : ${counts[status]}`).join(' · ')}{missing ? <b className="text-amber-700"> · {missing} non pointé(s)</b> : ''}</p>
    {loading ? <p className="p-6 text-center text-sm text-slate-500">Chargement…</p> : <ul className="divide-y divide-slate-100">{rows.map(row => <li key={row.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1"><b className="text-slate-800">{name(row)}</b><span className="block text-xs text-slate-500">{row.classroom || ''}{row.boardingBed ? ` · ${row.boardingBed.room.name} ${row.boardingBed.label}` : ''}{row.recordedBy ? ` · pointé par ${row.recordedBy}` : ''}</span></div>
      <div className="flex flex-wrap gap-1">{Object.entries(rollStatuses).map(([status, { label, className }]) => <button key={status} type="button" onClick={() => set(row.id, { status })}
        className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${row.status === status ? className : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{label}</button>)}</div>
      <input value={row.notes || ''} onChange={event => set(row.id, { notes: event.target.value })} placeholder="Remarque" maxLength={300} className={`${input} sm:w-48`}/>
    </li>)}</ul>}
    {!loading && !rows.length && <p className="p-6 text-center text-sm text-slate-500">Aucun interne.</p>}
  </Card>;
}

function Leaves({ boarders, run, reloadBoarders }: Shared) {
  const [leaves, setLeaves] = useState<any[]>([]);
  const [visits, setVisits] = useState<any[]>([]);
  const [showAll, setShowAll] = useState(false);
  const blankLeave = () => ({ studentId: '', kind: 'WEEKEND', departedAt: localDateTime(), expectedReturnAt: localDateTime(new Date(Date.now() + 2 * 86400000)), pickupName: '', pickupRelation: '', pickupPhone: '', notes: '' });
  const [leave, setLeave] = useState(blankLeave());
  const [visit, setVisit] = useState({ studentId: '', visitorName: '', relation: '', phone: '', notes: '' });
  const load = async () => { try { const [a, b] = await Promise.all([boardingApi.leaves(showAll ? {} : { open: 'true' }), boardingApi.visits()]); setLeaves(a); setVisits(b); } catch { /* shown by actions */ } };
  useEffect(() => { void load(); }, [showAll]);
  const late = (row: any) => !row.returnedAt && new Date(row.expectedReturnAt) < new Date();
  return <div className="grid gap-5 lg:grid-cols-2">
    <Card title="Nouvelle sortie">
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); void run(async () => {
        await boardingApi.createLeave({ ...leave, departedAt: new Date(leave.departedAt).toISOString(), expectedReturnAt: new Date(leave.expectedReturnAt).toISOString() });
        setLeave(blankLeave()); await load(); await reloadBoarders();
      }, 'Sortie enregistrée.'); }}>
        <div className="sm:col-span-2"><BoarderSelect boarders={boarders.filter(student => !student.currentLeave)} value={leave.studentId} onChange={studentId => setLeave({ ...leave, studentId })}/></div>
        <label className="text-sm font-medium text-slate-700">Type<select value={leave.kind} onChange={event => setLeave({ ...leave, kind: event.target.value })} className={`${input} mt-1`}>{Object.entries(leaveKinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">Récupéré par<input required value={leave.pickupName} onChange={event => setLeave({ ...leave, pickupName: event.target.value })} className={`${input} mt-1`} placeholder="Nom complet"/></label>
        <label className="text-sm font-medium text-slate-700">Lien<input value={leave.pickupRelation} onChange={event => setLeave({ ...leave, pickupRelation: event.target.value })} className={`${input} mt-1`} placeholder="Père, mère, oncle…"/></label>
        <label className="text-sm font-medium text-slate-700">Téléphone<input value={leave.pickupPhone} onChange={event => setLeave({ ...leave, pickupPhone: event.target.value })} className={`${input} mt-1`}/></label>
        <label className="text-sm font-medium text-slate-700">Départ<input type="datetime-local" required value={leave.departedAt} onChange={event => setLeave({ ...leave, departedAt: event.target.value })} className={`${input} mt-1`}/></label>
        <label className="text-sm font-medium text-slate-700">Retour prévu<input type="datetime-local" required value={leave.expectedReturnAt} onChange={event => setLeave({ ...leave, expectedReturnAt: event.target.value })} className={`${input} mt-1`}/></label>
        <input value={leave.notes} onChange={event => setLeave({ ...leave, notes: event.target.value })} placeholder="Notes (motif, autorisation…)" className={`${input} sm:col-span-2`}/>
        <button className={`${primary} sm:col-span-2`}>Enregistrer la sortie</button>
      </form>
    </Card>
    <Card title={showAll ? 'Toutes les sorties' : 'Élèves actuellement en sortie'} actions={<button type="button" onClick={() => setShowAll(!showAll)} className={ghost}>{showAll ? 'Seulement en cours' : 'Historique'}</button>}>
      <ul className="space-y-2">{leaves.map(row => <li key={row.id} className={`rounded-xl border p-3 text-sm ${late(row) ? 'border-rose-200 bg-rose-50' : 'border-slate-100'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-slate-800">{name(row.student)}</b>
          {row.returnedAt ? <span className="text-xs text-emerald-700">Rentré le {dateTimeText(row.returnedAt)}</span>
            : <button type="button" onClick={() => void run(async () => { await boardingApi.returnLeave(row.id); await load(); await reloadBoarders(); }, 'Retour enregistré.')} className={`${button} bg-emerald-600 py-1 text-xs text-white hover:bg-emerald-700`}>Retour à l’internat</button>}</div>
        <p className="text-xs text-slate-600">{leaveKinds[row.kind] || row.kind} · parti le {dateTimeText(row.departedAt)} avec {row.pickupName}{row.pickupRelation ? ` (${row.pickupRelation})` : ''}{row.pickupPhone ? ` · ${row.pickupPhone}` : ''}</p>
        <p className={`text-xs ${late(row) ? 'font-semibold text-rose-700' : 'text-slate-500'}`}>Retour prévu : {dateTimeText(row.expectedReturnAt)}{late(row) ? ' — en retard' : ''}</p>
        {row.notes && <p className="text-xs text-slate-500">{row.notes}</p>}
      </li>)}</ul>
      {!leaves.length && <p className="p-4 text-center text-sm text-slate-500">Aucune sortie.</p>}
    </Card>
    <Card title="Noter une visite">
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); void run(async () => { await boardingApi.createVisit(visit); setVisit({ studentId: '', visitorName: '', relation: '', phone: '', notes: '' }); await load(); }, 'Visite enregistrée.'); }}>
        <div className="sm:col-span-2"><BoarderSelect boarders={boarders} value={visit.studentId} onChange={studentId => setVisit({ ...visit, studentId })}/></div>
        <input required placeholder="Visiteur" value={visit.visitorName} onChange={event => setVisit({ ...visit, visitorName: event.target.value })} className={input}/>
        <input placeholder="Lien" value={visit.relation} onChange={event => setVisit({ ...visit, relation: event.target.value })} className={input}/>
        <input placeholder="Téléphone" value={visit.phone} onChange={event => setVisit({ ...visit, phone: event.target.value })} className={input}/>
        <input placeholder="Notes" value={visit.notes} onChange={event => setVisit({ ...visit, notes: event.target.value })} className={input}/>
        <button className={`${primary} sm:col-span-2`}>Enregistrer la visite</button>
      </form>
    </Card>
    <Card title="Dernières visites"><ul className="divide-y divide-slate-100 text-sm">{visits.slice(0, 30).map(row => <li key={row.id} className="py-2"><b>{name(row.student)}</b> · {row.visitorName}{row.relation ? ` (${row.relation})` : ''}<span className="block text-xs text-slate-500">{dateTimeText(row.visitedAt)}{row.notes ? ` · ${row.notes}` : ''}</span></li>)}</ul>{!visits.length && <p className="p-4 text-center text-sm text-slate-500">Aucune visite.</p>}</Card>
  </div>;
}

function Health({ boarders, run }: Shared) {
  const [rows, setRows] = useState<any[]>([]);
  const blank = () => ({ studentId: '', occurredAt: localDateTime(), reason: '', care: '', medication: '', parentNotified: false });
  const [form, setForm] = useState(blank());
  const load = async () => { try { setRows(await boardingApi.health()); } catch { /* shown by actions */ } };
  useEffect(() => { void load(); }, []);
  const selected = boarders.find(student => student.id === form.studentId);
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
    <Card title="Passage à l’infirmerie">
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); void run(async () => { await boardingApi.createHealth({ ...form, occurredAt: new Date(form.occurredAt).toISOString() }); setForm(blank()); await load(); }, 'Passage enregistré.'); }}>
        <BoarderSelect boarders={boarders} value={form.studentId} onChange={studentId => setForm({ ...form, studentId })}/>
        {selected?.healthNotes && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900"><b>Dossier santé :</b> {selected.healthNotes}</p>}
        <label className="block text-sm font-medium text-slate-700">Date et heure<input type="datetime-local" required value={form.occurredAt} onChange={event => setForm({ ...form, occurredAt: event.target.value })} className={`${input} mt-1`}/></label>
        <input required placeholder="Motif (fièvre, blessure…)" value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value })} className={input}/>
        <textarea placeholder="Soins donnés" value={form.care} onChange={event => setForm({ ...form, care: event.target.value })} className={input} rows={2}/>
        <input placeholder="Médicaments (nom, dose)" value={form.medication} onChange={event => setForm({ ...form, medication: event.target.value })} className={input}/>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.parentNotified} onChange={event => setForm({ ...form, parentNotified: event.target.checked })}/>Parent prévenu</label>
        <button className={`${primary} w-full`}>Enregistrer</button>
      </form>
    </Card>
    <Card title="Registre de santé"><ul className="space-y-2">{rows.map(row => <li key={row.id} className="rounded-xl border border-slate-100 p-3 text-sm">
      <div className="flex flex-wrap justify-between gap-2"><b className="text-slate-800">{name(row.student)}</b><span className="text-xs text-slate-500">{dateTimeText(row.occurredAt)} · {row.actorName}</span></div>
      <p className="text-slate-700">{row.reason}</p>
      {(row.care || row.medication) && <p className="text-xs text-slate-600">{row.care}{row.care && row.medication ? ' · ' : ''}{row.medication}</p>}
      <p className={`text-xs ${row.parentNotified ? 'text-emerald-700' : 'text-amber-700'}`}>{row.parentNotified ? 'Parent prévenu' : 'Parent non prévenu'}</p>
    </li>)}</ul>{!rows.length && <p className="p-4 text-center text-sm text-slate-500">Aucun passage enregistré.</p>}</Card>
  </div>;
}

function Pocket({ boarders, run, reloadBoarders }: Shared) {
  const [studentId, setStudentId] = useState('');
  const [account, setAccount] = useState<any>(null);
  const [form, setForm] = useState({ kind: 'DEPOSIT' as 'DEPOSIT' | 'WITHDRAWAL', amount: '', label: '' });
  const load = async (id = studentId) => { if (!id) { setAccount(null); return; } try { setAccount(await boardingApi.pocketMoney(id)); } catch { setAccount(null); } };
  useEffect(() => { void load(); }, [studentId]);
  const ranked = [...boarders].sort((a, b) => b.pocketBalance - a.pocketBalance).filter(student => student.pocketBalance > 0);
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
    <Card title="Compte d’un interne">
      <BoarderSelect boarders={boarders} value={studentId} onChange={setStudentId}/>
      {account && <div className="mt-4 space-y-4">
        <p className="text-sm text-slate-600">Solde disponible : <b className="text-2xl text-slate-900">{money(account.balance)}</b></p>
        <form className="grid gap-2 sm:grid-cols-[auto_8rem_minmax(0,1fr)_auto]" onSubmit={event => { event.preventDefault(); void run(async () => {
          await boardingApi.recordPocketMoney({ studentId, kind: form.kind, amount: Number(form.amount), label: form.label }); setForm({ ...form, amount: '', label: '' }); await load(); await reloadBoarders();
        }, form.kind === 'DEPOSIT' ? 'Dépôt enregistré.' : 'Retrait enregistré.'); }}>
          <select value={form.kind} onChange={event => setForm({ ...form, kind: event.target.value as any })} className={input}><option value="DEPOSIT">Dépôt</option><option value="WITHDRAWAL">Retrait</option></select>
          <input required type="number" min={1} step={1} placeholder="Montant" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} className={input}/>
          <input required placeholder={form.kind === 'DEPOSIT' ? 'Déposé par…' : 'Motif (achat, sortie…)'} value={form.label} onChange={event => setForm({ ...form, label: event.target.value })} className={input}/>
          <button className={primary}>Valider</button>
        </form>
        <ul className="divide-y divide-slate-100 text-sm">{account.entries.map((entry: any) => <li key={entry.id} className="flex justify-between gap-2 py-2">
          <span>{entry.label}<span className="block text-xs text-slate-500">{dateTimeText(entry.createdAt)} · {entry.actorName}</span></span>
          <b className={entry.amount > 0 ? 'text-emerald-700' : 'text-rose-700'}>{entry.amount > 0 ? '+' : ''}{money(entry.amount)}</b></li>)}</ul>
        {!account.entries.length && <p className="text-sm text-slate-500">Aucune opération.</p>}
        <p className="text-xs text-slate-500">Une erreur se corrige par une opération inverse : l’historique n’est jamais modifié.</p>
      </div>}
    </Card>
    <Card title="Soldes en garde" actions={<button type="button" onClick={() => void reloadBoarders()} className={ghost}><RefreshCw className="h-4 w-4"/></button>}>
      <ul className="divide-y divide-slate-100 text-sm">{ranked.map(student => <li key={student.id}><button type="button" onClick={() => setStudentId(student.id)} className="flex w-full justify-between py-2 text-left hover:text-amber-700"><span>{name(student)}</span><b>{money(student.pocketBalance)}</b></button></li>)}</ul>
      {!ranked.length && <p className="p-4 text-center text-sm text-slate-500">Aucun argent en garde.</p>}
    </Card>
  </div>;
}
