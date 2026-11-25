import { useEffect, useState } from 'react';
import { ToggleRight } from 'lucide-react';
import { featuresApi } from '../services/api';
import type { FeatureInfo } from '../services/api';

const order = ['Scolarité', 'Présences', 'Familles', 'Internat', 'Comptabilité', 'Administration'];

function Switch({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: () => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onChange}
    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-40 ${checked ? 'bg-emerald-600' : 'bg-stone-300'}`}>
    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'translate-x-6' : 'translate-x-1'}`}/>
  </button>;
}

/** Administrator page: switch optional modules on or off; data is always kept. */
export function FeaturesPage() {
  const [features, setFeatures] = useState<FeatureInfo[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { featuresApi.list().then(setFeatures).catch(e => setError(e.response?.data?.message || 'Chargement impossible.')); }, []);

  const toggle = async (feature: FeatureInfo) => {
    const enabled = !feature.enabled;
    const children = features.filter(item => item.parent === feature.key);
    const warning = enabled ? `Activer « ${feature.label} » ?`
      : `Désactiver « ${feature.label} » ?\n\nIl disparaîtra des menus et des écrans${children.length ? ', avec ' + children.map(item => item.label).join(', ') : ''}. Aucune donnée n’est supprimée : il suffira de le réactiver pour tout retrouver.`;
    if (!window.confirm(warning)) return;
    setBusy(feature.key); setError(''); setNotice('');
    try {
      setFeatures(await featuresApi.set(feature.key, enabled));
      window.dispatchEvent(new Event('features-changed'));
      setNotice(`« ${feature.label} » ${enabled ? 'activé' : 'désactivé'}.`);
    } catch (e: any) { setError(e.response?.data?.message || 'Modification impossible.'); }
    finally { setBusy(''); }
  };

  const categories = order.filter(category => features.some(feature => feature.category === category));
  return <div className="mx-auto max-w-4xl space-y-5">
    <div>
      <h2 className="flex items-center gap-2 text-xl font-bold text-stone-900"><ToggleRight className="h-6 w-6 text-emerald-600"/>Modules et fonctionnalités</h2>
      <p className="mt-1 text-sm text-stone-500">Activez seulement ce dont l’école a besoin. Un module désactivé disparaît des menus et des écrans, et le serveur refuse ses opérations. Les données sont conservées. Les élèves, parents, classes, factures et utilisateurs restent toujours actifs.</p>
    </div>
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {categories.map(category => <section key={category} className="rounded-2xl border border-stone-200 bg-white p-2 shadow-sm">
      <h3 className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wider text-stone-500">{category}</h3>
      <ul className="divide-y divide-stone-100">{features.filter(feature => feature.category === category).map(feature => {
        const parent = feature.parent ? features.find(item => item.key === feature.parent) : null;
        const blockedByParent = Boolean(parent && !parent.effective);
        return <li key={feature.key} className={`flex items-center gap-4 px-3 py-3 ${feature.parent ? 'pl-8' : ''}`}>
          <div className="min-w-0 flex-1">
            <p className={`font-semibold ${feature.effective ? 'text-stone-900' : 'text-stone-400'}`}>{feature.parent && <span className="mr-1 text-stone-300">↳</span>}{feature.label}</p>
            <p className="text-xs text-stone-500">{feature.description}{blockedByParent ? ` Inactif tant que « ${parent!.label} » est désactivé.` : ''}</p>
          </div>
          <span className={`hidden rounded-full px-2 py-0.5 text-xs font-semibold sm:inline ${feature.effective ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>{feature.effective ? 'Actif' : 'Désactivé'}</span>
          <Switch checked={feature.enabled} disabled={busy === feature.key || blockedByParent} onChange={() => void toggle(feature)} label={feature.label}/>
        </li>;
      })}</ul>
    </section>)}
  </div>;
}
