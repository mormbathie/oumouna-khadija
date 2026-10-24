import { Download, FileSpreadsheet, FileArchive, Palette, Filter, ShieldCheck } from 'lucide-react';
import { school } from '../config/school';
import { t, modelLabel } from "../i18n/index";
import { useEffect, useState } from 'react';
import { dataTransferApi } from '../services/api';

const messageFrom = (error: any) => error.response?.data?.message || error.message || t("Unable to complete the operation.");

export const DataTransferPage = () => {
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState('Student');
  const [exportModels, setExportModels] = useState<Array<{name:string;label:string;importable:boolean}>>([]);
  const [exportModel, setExportModel] = useState('Student');
  const [scope, setScope] = useState<'all'|'one'>('all');
  const [format, setFormat] = useState<'xlsx'|'csv'>('xlsx');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { void Promise.all([dataTransferApi.models(),dataTransferApi.exportModels()]).then(([models,exports])=>{setModels(models);setExportModels(exports);}).catch((err) => setError(messageFrom(err))); }, []);

  const download = async (format: 'xlsx' | 'csv', selected?: string) => {
    setBusy(true); setError('');
    try {
      const blob = await dataTransferApi.export(format, selected);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `as-sakina-${selected || 'toutes-les-tables'}-${new Date().toISOString().slice(0,10)}.${format === 'csv' && !selected ? 'zip' : format}`; document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url),1000);
    } catch (err: any) {
      if (err.response?.data instanceof Blob) {
        try { const body = JSON.parse(await err.response.data.text()); setError(body.message || messageFrom(err)); }
        catch { setError(messageFrom(err)); }
      } else setError(messageFrom(err));
    }
    finally { setBusy(false); }
  };

  const inspect = async () => {
    if (!file) return;
    setBusy(true); setError(''); setPreview(null); setMessage('');
    try { setPreview(await dataTransferApi.preview(file, file.name.toLowerCase().endsWith('.csv') ? model : undefined)); }
    catch (err) { setError(messageFrom(err)); }
    finally { setBusy(false); }
  };

  const execute = async () => {
    if (!file || !preview || !window.confirm(t("Import {0} rows? Existing records will be kept.", [preview.totalRows]))) return;
    setBusy(true); setError('');
    try {
      const result = await dataTransferApi.import(file, file.name.toLowerCase().endsWith('.csv') ? model : undefined);
      setMessage(t("{0} new rows added.", [result.created.reduce((sum: number, row: any) => sum + row.created, 0)]));
      setPreview(null);
    } catch (err) { setError(messageFrom(err)); }
    finally { setBusy(false); }
  };

  return <div className="mx-auto max-w-3xl space-y-5">
    <div><h2 className="text-2xl font-bold">{t("Data Import and Export")}</h2><p className="mt-1 text-sm text-slate-600">{t('Des exports lisibles, aux couleurs de l’école. Réservé aux administrateurs.')}</p></div>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {message && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{message}</p>}
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-4 border-b border-amber-100 bg-amber-50 p-5 sm:p-6"><img src={school.logo} alt={school.shortName} className="h-16 w-16 shrink-0 rounded-xl bg-white object-contain p-1"/><div><p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{school.shortName}</p><h3 className="mt-1 text-xl font-bold text-amber-950">{t('Préparer mon export')}</h3><p className="mt-1 text-sm text-amber-800">{t('Logo, titres et couleurs dans Excel ; données simples et compatibles dans le CSV.')}</p></div></div>
      <div className="space-y-6 p-5 sm:p-6">
        <fieldset disabled={busy} className="space-y-3"><legend className="font-semibold text-slate-800">{t('1. Choisir les données')}</legend><div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="radio" name="export-scope" value="all" checked={scope==='all'} onChange={()=>setScope('all')}/>{t('Toutes les tables métier')}</label><label className="flex items-center gap-2"><input type="radio" name="export-scope" value="one" checked={scope==='one'} onChange={()=>setScope('one')}/>{t('Une seule table')}</label></div>{scope==='one'&&<label className="block text-sm">{t('Table à exporter')}<select value={exportModel} onChange={e=>setExportModel(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3">{exportModels.map(m=><option key={m.name} value={m.name}>{t(m.label)}{!m.importable?' · '+t('Consultation uniquement'):''}</option>)}</select></label>}</fieldset>
        <fieldset disabled={busy}><legend className="mb-3 font-semibold text-slate-800">{t('2. Choisir le format')}</legend><div className="grid gap-3 sm:grid-cols-2">{([{value:'xlsx',title:'Excel mis en page',description:'Logo et en-têtes, sommaire, filtres, dates et montants formatés.',icon:FileSpreadsheet},{value:'csv',title:'CSV simple',description:scope==='all'?'Une archive ZIP contenant un fichier CSV par table.':'Un fichier CSV UTF-8 pour la table choisie.',icon:FileArchive}] as const).map(item=><label key={item.value} className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${format===item.value?'border-amber-600 bg-amber-50 ring-1 ring-amber-600':'border-slate-200'}`}><input type="radio" name="export-format" value={item.value} checked={format===item.value} onChange={()=>setFormat(item.value)} className="mt-1"/><item.icon className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"/><span><strong className="block text-sm">{t(item.title)}</strong><span className="mt-1 block text-xs leading-relaxed text-slate-600">{t(item.description)}</span></span></label>)}</div></fieldset>
        {format==='xlsx'?<div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600 sm:grid-cols-3"><span className="flex gap-2"><Palette className="h-4 w-4 shrink-0 text-amber-700"/>{t('Présentation aux couleurs de l’école')}</span><span className="flex gap-2"><Filter className="h-4 w-4 shrink-0 text-amber-700"/>{t('En-têtes figés et filtres')}</span><span className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-amber-700"/>{t('Identifiants conservés pour le réimport')}</span></div>:<p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{t('Le CSV ne contient ni logo, ni couleurs, ni mise en page. Choisissez Excel pour un fichier prêt à présenter.')}</p>}
        <p className="text-xs leading-relaxed text-slate-500">{t('Les comptes, secrets, photos de profil et fichiers joints sont exclus. Les registres financiers et les départs sont exportables en consultation uniquement.')}</p>
        <button disabled={busy || !exportModels.length} onClick={()=>void download(format,scope==='one'?exportModel:undefined)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-700 px-5 py-3 font-semibold text-white disabled:opacity-50 sm:w-auto"><Download className="h-4 w-4"/>{busy?t('Préparation du fichier…'):t(scope==='all'&&format==='csv'?'Télécharger les CSV (ZIP)':format==='xlsx'?'Télécharger le fichier Excel':'Télécharger le fichier CSV')}</button>
      </div>
    </section>
    <section className="rounded-2xl bg-white p-5 shadow-sm"><h3 className="font-bold">{t("Import")}</h3><p className="mt-1 text-sm text-slate-500">{t("Import adds missing records. It keeps existing records and stops if a relationship is invalid. User accounts and document files are managed separately.")}</p><input id="data-import-file" type="file" accept=".xlsx,.csv" disabled={busy} onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); }} className="sr-only" /><div className="mt-4 flex flex-wrap items-center gap-3"><label htmlFor="data-import-file" className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm">{t("Choose a file")}</label><span className="text-sm text-slate-500">{file?.name || t("No file selected")}</span></div>{file?.name.toLowerCase().endsWith('.csv')&&<label className="mt-4 block text-sm">{t('Table du fichier CSV')}<select disabled={busy} value={model} onChange={e=>{setModel(e.target.value);setPreview(null);}} className="mt-1 w-full rounded-lg border p-3">{models.map(name=><option key={name} value={name}>{modelLabel(name)}</option>)}</select></label>}<p className="mt-3 text-xs text-slate-500">{t('Pour un ZIP CSV, décompressez les fichiers et importez chaque table séparément. Les registres de consultation ne sont pas importables.')}</p><div className="mt-3 flex flex-wrap gap-3"><button disabled={busy || !file} onClick={inspect} className="rounded-lg border border-amber-600 px-4 py-3 font-semibold text-amber-700 disabled:opacity-50">{t("Preview")}</button>{preview?.totalRows > 0 && <button disabled={busy} onClick={execute} className="rounded-lg bg-amber-700 px-4 py-3 font-semibold text-white">{t("Import missing rows")}</button>}</div>{preview && <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm"><p className="font-semibold">{preview.totalRows} {t("rows to review")}</p><ul className="mt-2 space-y-1">{preview.tables.map((table: any) => <li key={table.model}>{modelLabel(table.model)} : {table.rows}</li>)}</ul>{preview.ignoredTables?.length>0&&<p className="mt-3 text-amber-800">{t('Feuilles de consultation ignorées :')} {preview.ignoredTables.map((name:string)=>t(exportModels.find(m=>m.name===name)?.label||name)).join(', ')}</p>}</div>}</section>
  </div>;
};
