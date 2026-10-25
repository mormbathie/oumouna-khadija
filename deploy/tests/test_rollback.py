"""Exercise deployment failure paths with isolated fake Docker/HTTP services."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
OLD = 'a' * 40
NEW = 'b' * 40
MOCK = r'''#!/usr/bin/env python3
import json, os, pathlib, sys, gzip, tarfile
root=pathlib.Path(os.environ['QA_ROOT']); args=sys.argv[1:]; kind=pathlib.Path(sys.argv[0]).name
state_file=root/'state.json';state=json.loads(state_file.read_text()); old='a'*40;new='b'*40
ids={'backend':'sha256:'+'1'*64,'frontend':'sha256:'+'2'*64}
newids={'backend':'sha256:'+'3'*64,'frontend':'sha256:'+'4'*64}
if kind=='systemctl':
 p=root/'backups'/'fresh';p.mkdir(parents=True,exist_ok=True);(p/'.complete').write_text('complete');gzip.open(p/'postgres.sql.gz','wb').write(b'fixture');gzip.open(p/'keycloak.sql.gz','wb').write(b'fixture');tarfile.open(p/'school-documents.tar.gz','w:gz').close();sys.exit(0)
if kind=='journalctl':sys.exit(0)
if kind=='curl':
 if state['running']=='new' and os.environ['QA_MODE']=='public':sys.exit(22)
 print('newhtml');sys.exit(0)
if args[:2]==['image','inspect']:
 fmt=args[args.index('-f')+1];image=args[-1];name='backend' if 'backend' in image or image in [ids['backend'],newids['backend']] else 'frontend'
 print((old if image in ids.values() else new) if 'revision' in fmt else newids[name]);sys.exit(0)
if args[0]=='inspect':
 if '-f' not in args:
  name=args[-1].removeprefix('oumouna_khadija_');print(json.dumps([{'Image':ids[name]}]));sys.exit(0)
 fmt=args[args.index('-f')+1];name=args[-1]
 if 'Running' in fmt:print('true')
 elif 'Health' in fmt:print('unhealthy' if state['running']=='new' and os.environ['QA_MODE']=='health' else 'healthy')
 elif '.Image' in fmt:print((ids if state['running']=='old' else newids)[name])
 sys.exit(0)
if args[0]=='pull':sys.exit(0)
if 'config' in args:
 if '--format' in args:print(json.dumps({'services':{name:{'image':f'mormbathie/oumouna-khadija-{name}:{new}'} for name in ids},'volumes':{v:{} for v in ['postgres_data','keycloak_postgres_data','school_documents','caddy_data','caddy_config']}}))
 sys.exit(0)
if 'ps' in args:
 if '-q' in args or '-aq' in args:print(args[-1])
 sys.exit(0)
if 'up' in args:
 if '--pull' in args:
  override=pathlib.Path(args[args.index('-f',args.index('-f',args.index('-f')+1)+1)+1])
  config=json.loads(override.read_text());assert config['services']['backend']['entrypoint']==['node','--require','./dist/src/telemetry.js','dist/src/main.js']
  assert config['services']['backend']['image']==ids['backend']
  state['running']='old';state['rollback']=True
 else:state['running']='new'
 state_file.write_text(json.dumps(state))
 if not state.get('rollback') and os.environ['QA_MODE']=='startup':sys.exit(1)
 sys.exit(0)
if 'exec' in args:print('newhtml');sys.exit(0)
if 'logs' in args:sys.exit(0)
raise SystemExit('Unexpected fake docker invocation: '+repr(args))
'''

class RollbackTests(unittest.TestCase):
    def run_scenario(self, mode):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'deploy').mkdir()
            (root / 'bin').mkdir()
            (root / 'backups').mkdir()
            for name in ('deploy-vps.sh', 'rollback-vps.sh'):
                text = (ROOT / 'deploy' / name).read_text()
                # The test copy alone bypasses root; real deployment retains its root check.
                text = text.replace('if (( EUID != 0 )); then', 'if false; then')
                text = text.replace('(( EUID == 0 )) ||', 'true ||')
                text = text.replace('backup_root=/var/backups/oumouna-khadija/daily', f'backup_root={root}/backups')
                text = text.replace('[[ -f /opt/assakina-observability/agent.compose.yaml ]]', 'false')
                (root / 'deploy' / name).write_text(text)
            (root / 'deploy/apply-keycloak-theme.py').write_text("print('Oumouna Khadija login theme is active.')\n")
            for name in ('.env', 'deployment-access.txt', 'deploy/realm.production.json', 'deploy/smtp.private.json'):
                (root / name).write_text('private fixture')
            (root / 'deploy/production.env').write_text('APP_VERSION=' + NEW + '\n')
            (root / 'state.json').write_text(json.dumps({'running': 'old'}))
            (root / 'database-sentinel').write_text('school data retained')
            for command in ('docker', 'curl', 'systemctl', 'journalctl'):
                target = root / 'bin' / command
                target.write_text(MOCK)
                target.chmod(0o755)
            env = {**os.environ, 'PATH': str(root / 'bin') + ':' + os.environ['PATH'], 'QA_ROOT': str(root), 'QA_MODE': mode}
            result = subprocess.run(['bash', 'deploy/deploy-vps.sh'], cwd=root, env=env, capture_output=True, text=True)
            state = json.loads((root / 'state.json').read_text())
            self.assertEqual((root / 'database-sentinel').read_text(), 'school data retained')
            if mode == 'success':
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertEqual(state['running'], 'new')
                self.assertFalse(state.get('rollback', False))
            else:
                self.assertNotEqual(result.returncode, 0)
                self.assertTrue(state.get('rollback'), result.stdout + result.stderr)
                self.assertEqual(state['running'], 'old')
                self.assertIn('Rollback verified', result.stdout)
                self.assertEqual((root / 'deploy/production.env').read_text(), 'APP_VERSION=' + OLD + '\n')

    def test_failed_startup_restores_images(self): self.run_scenario('startup')
    def test_failed_healthcheck_restores_images(self): self.run_scenario('health')
    def test_failed_public_check_restores_images(self): self.run_scenario('public')
    def test_success_keeps_new_images(self): self.run_scenario('success')

if __name__ == '__main__': unittest.main()
