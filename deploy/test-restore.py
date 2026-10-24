#!/usr/bin/env python3
"""Restore the latest completed backup into disposable databases, never live DBs."""
import gzip, json, os, re, subprocess, sys, tarfile, uuid
from pathlib import Path

def run(container, arguments, stdin=None):
    command = ['docker','exec','-i',container,'sh','-c','exec "$@"','sh',*arguments]
    return subprocess.run(command, stdin=stdin, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

def restore(container, archive):
    name = 'assakina_restore_test_' + uuid.uuid4().hex
    assert re.fullmatch(r'assakina_restore_test_[0-9a-f]{32}',name)
    # Query only the username; the existing PostgreSQL environment supplies credentials.
    user = subprocess.check_output(['docker','exec',container,'sh','-c','printf "%s" "$POSTGRES_USER"'],text=True)
    result = run(container,['createdb','-U',user,name])
    if result.returncode: raise RuntimeError('Cannot create isolated restoration database.')
    try:
        command=['docker','exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U',user,'-d',name]
        process=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        try:
            with gzip.open(archive,'rb') as dump:
                while chunk := dump.read(1024*1024): process.stdin.write(chunk)
        except BrokenPipeError:
            pass
        finally:
            try: process.stdin.close()
            except BrokenPipeError: pass
        if process.wait() != 0: raise RuntimeError('Isolated SQL restore failed; no live database was modified.')
        result=run(container,['psql','-X','-At','-U',user,'-d',name,'-c',"SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"])
        if result.returncode or int(result.stdout.strip()) < 1: raise RuntimeError('Restored database contains no tables.')
        return int(result.stdout.strip())
    finally:
        if run(container,['dropdb','-U',user,'--if-exists',name]).returncode:
            raise RuntimeError('Isolated restore database needs cleanup: '+name)

def main():
    if os.geteuid()!=0: raise SystemExit('Run as root on the VPS.')
    root=Path('/var/backups/oumouna-khadija/daily')
    backups=sorted(p for p in root.iterdir() if p.is_dir() and not p.is_symlink() and (p/'.complete').is_file())
    if not backups: raise SystemExit('No completed backup exists.')
    backup=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else backups[-1]
    if not backup.is_relative_to(root.parent) or not (backup/'.complete').is_file(): raise RuntimeError('A completed backup under the private backup root is required.')
    counts={name:restore(container,backup/file) for name,container,file in [
        ('school','oumouna_khadija_postgres','postgres.sql.gz'),('accounts','oumouna_khadija_keycloak_postgres','keycloak.sql.gz')]}
    count=0
    with tarfile.open(backup/'school-documents.tar.gz','r:gz') as archive:
        for member in archive:
            if member.name.startswith('/') or '..' in Path(member.name).parts or member.issym() or member.islnk(): raise RuntimeError('Unsafe document archive.')
            if member.isfile():
                count+=1
                with archive.extractfile(member) as stream:
                    while stream.read(1024*1024): pass
    config_archive=backup/'deployment-config.tar.gz'
    config_count=0
    if config_archive.exists():
        with tarfile.open(config_archive,'r:gz') as archive:
            names=set()
            for member in archive:
                if member.name.startswith('/') or '..' in Path(member.name).parts or member.issym() or member.islnk(): raise RuntimeError('Unsafe configuration archive.')
                if member.isfile():
                    names.add(member.name);config_count+=1
                    with archive.extractfile(member) as stream:
                        while stream.read(1024*1024): pass
            if not {'.env','deployment-access.txt','deploy/realm.production.json','deploy/production.env'}.issubset(names):raise RuntimeError('Configuration archive incomplete.')
    report={'backup':backup.name,'database_tables':counts,'documents':count,'configuration_files':config_count,'successful':True}
    target=Path('/var/backups/oumouna-khadija/restore-test.json')
    fd=os.open(str(target)+'.tmp',os.O_CREAT|os.O_TRUNC|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w') as f: json.dump(report,f)
    os.replace(str(target)+'.tmp',target)
    print(json.dumps(report))

if __name__=='__main__':
    try: main()
    except Exception as error: raise SystemExit(type(error).__name__+': '+str(error))
