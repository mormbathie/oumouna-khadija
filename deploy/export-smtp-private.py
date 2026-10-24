#!/usr/bin/env python3
"""Export the existing SMTP configuration locally on VPS. Never print secrets."""
import json, os, subprocess
from pathlib import Path
if os.geteuid() != 0:
    raise SystemExit('Run as root on VPS.')
root = Path('/opt/oumouna-khadija')
sql = "SELECT COALESCE(json_object_agg(c.name,c.value),'{}'::json) FROM realm_smtp_config c JOIN realm r ON r.id=c.realm_id WHERE r.name='oumouna-khadija';"
command = ['docker','exec','oumouna_khadija_keycloak_postgres','sh','-c','exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "$1"','sh',sql]
result = subprocess.run(command, capture_output=True, text=True)
if result.returncode:
    raise SystemExit('Cannot read SMTP configuration; no credentials were displayed.')
settings = json.loads(result.stdout)
if not settings.get('password') or not settings.get('host'):
    raise SystemExit('SMTP configuration incomplete.')
target = root / 'deploy/smtp.private.json'
fd = os.open(str(target)+'.tmp', os.O_WRONLY|os.O_CREAT|os.O_TRUNC, 0o600)
with os.fdopen(fd,'w') as f:
    json.dump(settings,f)
os.replace(str(target)+'.tmp',target)
print('Private SMTP configuration prepared, no credentials displayed.')
