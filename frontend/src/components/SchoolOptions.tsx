import { t } from '../i18n';
import { itemLabels, money, programs, transportFees, type SchoolProgram } from '../config/school';
export type SchoolOptionsValue = { supplies?:boolean; fullDay?:boolean; transportZone?: number|null; karate?:boolean; eveningClasses?:boolean; emergencyContactName?:string|null; emergencyContactPhone?:string|null; healthNotes?:string|null; schoolItemsProvided?:string|null };
export function SchoolOptions({value, onChange, program = programs[0], disabled=false}: {value:SchoolOptionsValue;onChange:(v:SchoolOptionsValue)=>void;program?:SchoolProgram;level?:string;allowFullDay?:boolean;disabled?:boolean}) {
  const change = (key:keyof SchoolOptionsValue,v:unknown) => onChange({...value,[key]:v});
  const checked=(value.schoolItemsProvided || '').split(',').filter(Boolean);
  return <section className="space-y-4 rounded-xl border border-amber-100 bg-amber-50/40 p-4">
    <h4 className="text-sm font-bold text-amber-950">{t('School options and information')}</h4>
    <div className="grid gap-3 sm:grid-cols-2">
      {program.id==='PRESCHOOL' && <label className="text-xs font-medium">Transport<select disabled={disabled} value={value.transportZone || ''} onChange={e=>change('transportZone',e.target.value ? Number(e.target.value):null)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2.5"><option value="">Sans transport</option><option value="1">Transport · {money(transportFees[1])}/{t('month')}</option></select></label>}
      <div className="space-y-2 pt-2 text-xs">
        {program.id==='PRESCHOOL' && <label className="flex items-center gap-2"><input type="checkbox" disabled={disabled} checked={Boolean(value.eveningClasses)} onChange={e=>change('eveningClasses',e.target.checked)}/>Goûter · 10 000 F/{t('month')}</label>}
        {program.id==='PRESCHOOL' && <label className="flex items-center gap-2"><input type="checkbox" disabled={disabled} checked={Boolean(value.supplies)} onChange={e=>change('supplies',e.target.checked)}/>Cantine · 12 000 F/{t('month')}</label>}
        {program.id!=='PRESCHOOL' && <label className="flex items-center gap-2"><input type="checkbox" disabled={disabled} checked={Boolean(value.karate)} onChange={e=>change('karate',e.target.checked)}/>Taekwondo · 4 000 F/{t('month')}</label>}
      </div>
      <label className="text-xs font-medium">{t('Emergency contact')}<input disabled={disabled} value={value.emergencyContactName || ''} onChange={e=>change('emergencyContactName',e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2.5"/></label>
      <label className="text-xs font-medium">{t('Emergency telephone')}<input disabled={disabled} type="tel" value={value.emergencyContactPhone || ''} onChange={e=>change('emergencyContactPhone',e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2.5"/></label>
      <label className="text-xs font-medium sm:col-span-2">{t('Health information and allergies')}<textarea disabled={disabled} maxLength={2000} value={value.healthNotes || ''} onChange={e=>change('healthNotes',e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2.5"/></label>
    </div>
    <p className="text-xs text-amber-900">{t('Additional monthly options')}: {money((transportFees[value.transportZone || 0] || 0)+(value.karate ? 4000:0)+(value.eveningClasses ? 10000:0)+(value.supplies ? 12000:0))}. {t('Options are billed separately from tuition.')}</p>
    <div className="space-y-2 border-t border-amber-100 pt-3"><h5 className="text-xs font-bold">Pièces et effets fournis · {t(program.label)}</h5>{program.requiredItems.map(item=><label key={item} className="flex items-center gap-2 text-xs"><input disabled={disabled} type="checkbox" checked={checked.includes(item)} onChange={e=>change('schoolItemsProvided',(e.target.checked ? [...checked,item]:checked.filter(i=>i!==item)).join(','))}/>{t(itemLabels[item])}</label>)}</div>
  </section>;
}
