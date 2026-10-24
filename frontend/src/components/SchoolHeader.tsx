import { school } from '../config/school';
export function SchoolHeader({title,year}: {title?:string;year?:string}) {
  return <header className="school-letterhead border-b-2 border-amber-700 pb-4 text-center">
    <img src={school.logo} alt={school.name} className="mx-auto mb-2 h-24 w-44 object-contain" />
    <h2 className="text-sm font-black uppercase tracking-wide text-amber-950">{school.name}</h2>
    <p className="mt-1 text-xs text-slate-600">{school.address}</p>
    <p className="text-xs text-slate-600">{school.phones.join(' / ')}</p>
    <p className="text-[10px] text-slate-500">{school.email} · {school.website}</p>
    {year && <p className="mt-2 text-xs font-semibold">{year}</p>}
    {title && <h3 className="mt-3 rounded-lg bg-amber-700 py-2 text-sm font-bold uppercase tracking-wide text-white">{title}</h3>}
  </header>;
}
