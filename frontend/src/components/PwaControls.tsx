import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, WifiOff, X } from 'lucide-react';
import { t } from '../i18n';

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
export function PwaControls() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  const [offline, setOffline] = useState(!navigator.onLine);
  const [waiting, setWaiting] = useState<ServiceWorkerRegistration | null>(null);
  const [help, setHelp] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const reloadRequested = useRef(false);
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  useEffect(() => {
    const install = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const complete = () => { setInstalled(true); setPrompt(null); };
    const online = () => setOffline(!navigator.onLine);
    window.addEventListener('beforeinstallprompt', install);
    window.addEventListener('appinstalled', complete);
    window.addEventListener('online', online); window.addEventListener('offline', online);
    return () => {
      window.removeEventListener('beforeinstallprompt', install); window.removeEventListener('appinstalled', complete);
      window.removeEventListener('online', online); window.removeEventListener('offline', online);
    };
  }, []);
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return;
    let active = true;
    let registration: ServiceWorkerRegistration | undefined;
    const changes = new Set<ServiceWorker>();
    const checkWaiting = () => { if (active && registration?.waiting && navigator.serviceWorker.controller) setWaiting(registration); };
    const watch = () => {
      const worker = registration?.installing;
      if (worker) { changes.add(worker); worker.addEventListener('statechange', checkWaiting); }
    };
    const focus = () => { if (navigator.onLine && document.visibilityState === 'visible') void registration?.update().catch(() => {}); };
    const controller = () => { if (reloadRequested.current) window.location.reload(); };
    navigator.serviceWorker.addEventListener('controllerchange', controller);
    window.addEventListener('focus', focus);
    void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(value => {
      if (!active) return;
      registration = value; checkWaiting(); value.addEventListener('updatefound', watch); watch();
    }).catch(() => { /* Installation remains optional if a browser blocks workers. */ });
    return () => {
      active = false; registration?.removeEventListener('updatefound', watch);
      changes.forEach(worker => worker.removeEventListener('statechange', checkWaiting));
      navigator.serviceWorker.removeEventListener('controllerchange', controller); window.removeEventListener('focus', focus);
    };
  }, []);
  const install = async () => {
    if (!prompt) { setHelp(true); return; }
    setInstalling(true);
    try { await prompt.prompt(); const result = await prompt.userChoice; if (result.outcome === 'accepted') setInstalled(true); }
    catch { setHelp(true); }
    finally { setPrompt(null); setInstalling(false); }
  };
  const update = () => {
    if (!waiting?.waiting || !window.confirm(t('Terminez vos opérations et enregistrez vos formulaires avant de mettre à jour. Recharger maintenant ?'))) return;
    reloadRequested.current = true; waiting.waiting.postMessage({ type: 'SKIP_WAITING' });
  };
  const canInstall = !installed && !dismissed && (prompt || ios);
  if (!offline && !waiting && !canInstall && !help) return null;
  return <section aria-label={t('Application mobile')} className="fixed z-40 bottom-24 md:bottom-3 right-3 left-3 sm:left-auto sm:w-96 space-y-2" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
    {offline && <div role="status" className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 shadow-lg"><WifiOff className="h-5 w-5 shrink-0" /><span>{t('Hors connexion : les paiements et pointages nécessitent Internet. Aucune opération ne sera enregistrée hors connexion.')}</span></div>}
    {waiting && <div role="status" className="rounded-xl border border-amber-300 bg-white p-3 shadow-lg"><p className="text-sm text-slate-700">{t('Une nouvelle version est disponible. Terminez vos opérations avant de la charger.')}</p><button onClick={update} className="mt-2 flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm text-white"><RefreshCw className="h-4 w-4" />{t('Mettre à jour')}</button></div>}
    {canInstall && <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-white p-3 shadow-lg"><button disabled={installing || offline} onClick={() => void install()} className="flex items-center gap-2 text-sm font-semibold text-amber-800 disabled:opacity-50"><Download className="h-5 w-5" />{t('Installer l’application')}</button><button aria-label={t('Close')} onClick={() => setDismissed(true)} className="p-2 text-slate-500"><X className="h-4 w-4" /></button></div>}
    {help && <div role="dialog" aria-label={t('Installer l’application')} className="rounded-xl border bg-white p-4 text-sm shadow-lg"><p>{t(ios ? 'Sur iPhone ou iPad, ouvrez ce site dans Safari, touchez Partager, puis Sur l’écran d’accueil.' : 'Ouvrez le menu de votre navigateur, puis choisissez Installer l’application ou Ajouter à l’écran d’accueil si cette option est proposée.')}</p><button onClick={() => setHelp(false)} className="mt-3 font-semibold text-amber-700">{t('Close')}</button></div>}
  </section>;
}
