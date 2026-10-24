#!/usr/bin/env python3
"""Remove obsolete application image tags, keeping all container images and rollback.
Run on VPS with sudo; defaults to preview. --apply also prunes unused build cache.
No volumes, containers or database data are removed.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

def output(*args):
    return subprocess.check_output(['docker', *args], text=True)
state = json.loads(Path('/opt/oumouna-khadija/deploy/last-release.json').read_text())
protected = set(state['images'].values())
for image in protected:
    output('image','inspect',image)
containers = output('ps','-aq').split()
if containers:
    protected.update(c['Image'] for c in json.loads(output('inspect', *containers)))
refs = output('images','--format','{{.Repository}}:{{.Tag}}').splitlines()
remove=[]
for ref in refs:
    if not re.fullmatch(r'mormbathie/oumouna-khadija-(backend|frontend):[a-f0-9]{40}|oumouna-khadija-(backend|frontend):latest',ref):
        continue
    image = json.loads(output('image','inspect',ref))[0]['Id']
    if image not in protected:
        remove.append(ref)
print(json.dumps({'obsolete_application_tags':len(remove),'rollback_version':state['version'],'protected_images':len(protected)}))
if '--apply' in sys.argv:
    for ref in remove:
        subprocess.run(['docker','image','rm',ref],check=True)
    subprocess.run(['docker','builder','prune','--all','--force'],check=True)
    # Verify the exact saved rollback images remain available.
    for image in state['images'].values():
        output('image','inspect',image)
else:
    print('Preview only. Add --apply to execute.')
