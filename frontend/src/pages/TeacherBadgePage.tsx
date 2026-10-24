import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BrowserMultiFormatReader } from '@zxing/browser';
import api from '../services/api';
import { t, locale, statusLabel } from '../i18n';
function doorCode(value: string) {
  if (/^ASDOOR1:[0-9a-f]{48}$/.test(value)) return value;
  try { const url=new URL(value);if(url.origin===location.origin&&url.pathname==='/teacher-badge'&&/^ASDOOR1:[0-9a-f]{48}$/.test(url.hash.slice(1)))return url.hash.slice(1); } catch { /* invalid QR */ }
  throw new Error(t('Scannez le QR code affiché à la porte de l’école.'));
}
export function TeacherBadgePage() {
  const {hash}=useLocation();const [code,setCode]=useState(''),[action,setAction]=useState<'arrival'|'departure'>('arrival'),[camera,setCamera]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[history,setHistory]=useState<any>(null);
  const video=useRef<HTMLVideoElement>(null),pending=useRef(false),controls=useRef<any>(null);
  const load=()=>api.get('/staff-attendance/me').then(r=>setHistory(r.data)).catch(()=>{});
  useEffect(()=>{void load();},[]);
  useEffect(()=>{if(hash){try{setCode(doorCode(hash.slice(1)));}catch{setError(t('QR code de porte invalide.'));}}},[hash]);
  useEffect(()=>{
    if(!camera||!video.current)return;let disposed=false;const reader=new BrowserMultiFormatReader();
    reader.decodeFromConstraints({audio:false,video:{facingMode:{ideal:'environment'}}},video.current,result=>{if(result&&!disposed){try{setCode(doorCode(result.getText()));setCamera(false);setError('');}catch(e:any){setError(e.message);}}}).then(c=>{if(disposed)c.stop();else controls.current=c;}).catch(()=>{setError(t('Caméra indisponible. Ouvrez le QR code avec la caméra du téléphone.'));setCamera(false);});
    return()=>{disposed=true;controls.current?.stop();controls.current=null;};
  },[camera]);
  const punch=async()=>{
    if(pending.current)return;pending.current=true;setBusy(true);setError('');setMessage('');
    try {
      if(!navigator.onLine)throw new Error(t('Connexion Internet nécessaire.'));
      const validated=doorCode(code);
      if(!navigator.geolocation)throw new Error(t('La localisation est nécessaire pour badger à la porte.'));
      const position=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,()=>reject(new Error(t('Localisation refusée ou indisponible. Activez la position précise ou contactez le contrôleur.'))),{enableHighAccuracy:true,maximumAge:0,timeout:15000}));
      const result=(await api.post('/staff-attendance/door/punch',{code:validated,action,latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy})).data;
      const recorded=['departure','already-complete'].includes(result.event)?result.attendance.checkOutAt:result.attendance.checkInAt;
      setMessage(`${t(result.event==='arrival'?'Arrivée enregistrée':result.event==='departure'?'Départ enregistré':result.event==='already-arrived'?'Arrivée déjà enregistrée':'Pointage déjà terminé')} · ${new Date(recorded).toLocaleTimeString(locale(),{timeZone:'Africa/Dakar'})}`);await load();
    }catch(e:any){setError(e.response?.data?.message||e.message);}finally{pending.current=false;setBusy(false);}
  };
  return <div className="mx-auto max-w-2xl space-y-5"><h1 className="text-xl font-bold">{t('Mon pointage')}</h1><p className="text-sm text-slate-600">{t('À la porte de l’école, scannez le QR code puis confirmez votre arrivée ou votre départ. Votre position sera vérifiée et l’heure du serveur sera enregistrée.')}</p>
    {message&&<p role="status" className="rounded-xl bg-amber-50 p-4 text-amber-900">{message}</p>}{error&&<p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">{error}</p>}
    <section className="space-y-4 rounded-2xl border bg-white p-4"><div className="grid grid-cols-2 gap-3">{(['arrival','departure'] as const).map(value=><button key={value} disabled={busy} aria-pressed={action===value} onClick={()=>setAction(value)} className={`rounded-xl border p-4 font-semibold ${action===value?'border-amber-600 bg-amber-50 text-amber-900':''}`}>{t(value==='arrival'?'Mon arrivée':'Mon départ')}</button>)}</div>
      <button disabled={busy} onClick={()=>setCamera(v=>!v)} className="w-full rounded-xl border px-4 py-3">{t(camera?'Arrêter la caméra':'Scanner le QR de la porte')}</button>
      {camera&&<video ref={video} autoPlay muted playsInline className="h-64 w-full rounded-xl bg-slate-950 object-contain"/>}
      <p className="text-sm text-slate-500">{t(code?'QR code de la porte prêt.':'Aucun QR code scanné.')}</p><button disabled={busy||!code} onClick={()=>void punch()} className="w-full rounded-xl bg-amber-600 p-4 font-semibold text-white disabled:opacity-50">{t(busy?'Vérification de la position…':action==='arrival'?'Confirmer mon arrivée':'Confirmer mon départ')}</button><p className="text-xs text-slate-500">{t('En cas de difficulté, le contrôleur peut toujours vous pointer avec votre carte personnelle.')}</p>
    </section>
    <section className="rounded-2xl border bg-white p-4"><h2 className="font-bold">{t('Mes pointages')}</h2><p className="my-2 text-sm">{t('Retards')}: {history?.summary?.minutesLate||0} min · {t('Absences')}: {history?.summary?.absent||0}</p><div className="space-y-3">{history?.records?.slice(0,60).map((r:any)=><div key={r.id} className="border-t pt-3 text-sm"><p className="font-medium">{new Date(r.date).toLocaleDateString(locale())} · {statusLabel(r.status)}</p><p>{t('Arrivée')}: {r.checkInAt?new Date(r.checkInAt).toLocaleTimeString(locale(),{timeZone:'Africa/Dakar'}):'—'} · {t('Départ')}: {r.checkOutAt?new Date(r.checkOutAt).toLocaleTimeString(locale(),{timeZone:'Africa/Dakar'}):'—'}</p></div>)}</div></section>
  </div>;
}
