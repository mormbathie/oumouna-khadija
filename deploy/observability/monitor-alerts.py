#!/usr/bin/env python3
"""Low-frequency monitoring with email cooldown; no user data or SMTP secrets in logs."""
import datetime, json, os, shutil, smtplib, ssl, subprocess, time, urllib.request
from email.message import EmailMessage
from pathlib import Path

RECIPIENT='mormbathie98@gmail.com'
ROOT=Path('/opt/oumouna-khadija')
STATE=Path('/var/lib/assakina-monitor/state.json')

def request(base,path,data=None,token=None):
    headers={'Content-Type':'application/json'}
    if token:headers['Authorization']='Bearer '+token
    req=urllib.request.Request(base+path,data=json.dumps(data).encode() if data is not None else None,headers=headers)
    with urllib.request.urlopen(req,timeout=10) as response:return json.load(response)

def recent_errors():
    credentials=json.loads(Path('/opt/assakina-observability/signoz-access.json').read_text())
    base='http://127.0.0.1:3301'
    token=request(base,'/api/v2/sessions/email_password',{key:credentials[key] for key in ['email','password','orgId']})['data']['accessToken']
    now=int(time.time()*1000)
    spec={'name':'A','signal':'logs','source':'','stepInterval':300,'aggregations':[{'expression':'count()'}],
      'filter':{'expression':"service.name = 'as-sakina-backend' AND event = 'http.request'"},
      'groupBy':[{'name':'status_class','fieldContext':'attribute','fieldDataType':'string'}],'limit':10,'disabled':False}
    data=request(base,'/api/v5/query_range',{'start':now-900000,'end':now,'requestType':'time_series','compositeQuery':{'queries':[{'type':'builder_query','spec':spec}]}},token)['data']
    if data.get('errors'):raise RuntimeError('Query failed')
    total=errors=0
    results=data.get('data',data)
    if results.get('errors'):raise RuntimeError('Query failed')
    for result in results.get('results',[]):
        for aggregation in result.get('aggregations',[]):
            for series in aggregation.get('series',[]):
                count=sum(float(row.get('value',0)) for row in series.get('values',[]))
                total+=count
                labels=series.get('labels',{})
                if '5xx' in json.dumps(labels):errors+=count
    return int(total),int(errors)

def check():
    issues=[]
    env=dict(line.split('=',1) for line in (ROOT/'.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
    try:
        with urllib.request.urlopen('https://'+env['APP_HOST'].strip('"\'')+'/api/health',timeout=10) as response:
            if response.status!=200:issues.append('API indisponible')
    except Exception:issues.append('API HTTPS inaccessible')
    names=['backend','frontend','postgres','keycloak','keycloak_postgres','caddy']
    for name in names:
        try:
            data=json.loads(subprocess.check_output(['docker','inspect','oumouna_khadija_'+name],stderr=subprocess.DEVNULL,timeout=10))[0]['State']
            if not data['Running'] or data.get('Health',{}).get('Status','healthy')!='healthy':issues.append('Service dégradé : '+name)
        except Exception:issues.append('Service absent : '+name)
    backups=list(Path('/var/backups/oumouna-khadija/daily').glob('*/.complete'))
    if not backups or time.time()-max(p.stat().st_mtime for p in backups)>30*3600:issues.append('Sauvegarde locale absente ou trop ancienne (>30 heures)')
    if Path('/etc/assakina-backup/rclone.conf').is_file():
        marker=Path('/var/backups/oumouna-khadija/.offsite-last-success')
        if not marker.exists() or time.time()-marker.stat().st_mtime>30*3600:issues.append('Sauvegarde Google Drive non confirmée depuis plus de 30 heures')
    for unit in ['oumouna-khadija-backup.service','assakina-offsite-backup.service']:
        result=subprocess.run(['systemctl','is-failed',unit],capture_output=True,text=True,timeout=10)
        if result.stdout.strip()=='failed':issues.append('Échec du service de sauvegarde : '+unit)
    disk=shutil.disk_usage('/')
    if disk.free/disk.total<0.15:issues.append('Espace disque disponible inférieur à 15 %')
    try:
        total,errors=recent_errors()
        if total>=20 and errors>=3 and errors/total>=0.1:issues.append(f'Erreurs HTTP 5xx élevées : {errors}/{total} requêtes sur 15 minutes')
    except Exception:issues.append('Supervision des erreurs HTTP indisponible')
    return sorted(issues)

def email(subject,text):
    cfg=json.loads((ROOT/'deploy/smtp.private.json').read_text())
    msg=EmailMessage();msg['From']=cfg['from'];msg['To']=RECIPIENT;msg['Subject']=subject;msg.set_content(text)
    if cfg.get('ssl')=='true':
        smtp=smtplib.SMTP_SSL(cfg['host'],int(cfg.get('port',465)),timeout=20,context=ssl.create_default_context())
    else:
        smtp=smtplib.SMTP(cfg['host'],int(cfg.get('port',587)),timeout=20);smtp.starttls(context=ssl.create_default_context())
    with smtp:
        smtp.login(cfg['user'],cfg['password'])
        if smtp.send_message(msg):raise RuntimeError('Email refused')

def main():
    if os.geteuid()!=0:raise SystemExit('Run as root.')
    STATE.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    previous=json.loads(STATE.read_text()) if STATE.exists() else {'issues':[],'last_sent':0}
    issues=check();now=time.time()
    changed=issues!=previous.get('issues',[])
    should_send=(bool(issues) and (changed or now-previous.get('last_sent',0)>3600)) or (not issues and bool(previous.get('issues')))
    if should_send:
        subject='Institut Oumouna Khadija — '+('alerte de supervision' if issues else 'services rétablis')
        text=('Problèmes détectés :\n'+'\n'.join('- '+issue for issue in issues)) if issues else 'Les contrôles de disponibilité, de sauvegarde et de supervision sont revenus à la normale.'
        email(subject,text+'\n\nhttps://oumounakhadidja-academie.com\nHorodatage UTC : '+datetime.datetime.now(datetime.timezone.utc).isoformat())
        previous['last_sent']=now
    previous['issues']=issues
    tmp=Path(str(STATE)+'.tmp');fd=os.open(tmp,os.O_CREAT|os.O_TRUNC|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w') as f:json.dump(previous,f)
    os.replace(tmp,STATE)
    print(json.dumps({'issue_count':len(issues),'email_sent':should_send}))
if __name__=='__main__':
    try:main()
    except Exception as error:raise SystemExit('Monitoring check failed: '+type(error).__name__+' (no credentials displayed).')
