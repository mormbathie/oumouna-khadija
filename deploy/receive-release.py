#!/usr/bin/env python3
"""Restricted SSH deployment entry point: accept only the current main commit."""
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request


def main():
    command = os.environ.get('SSH_ORIGINAL_COMMAND', '').strip()
    if not command and len(sys.argv) == 2:
        command = sys.argv[1]
    if os.geteuid() != 0 or not re.fullmatch(r'[0-9a-f]{40}', command):
        raise SystemExit('A full release SHA is required.')
    sha = command
    repository = 'mormbathie/oumouna-khadija'
    request = urllib.request.Request(f'https://api.github.com/repos/{repository}/git/ref/heads/main', headers={'User-Agent': 'Oumouna-Khadija-deployer'})
    with urllib.request.urlopen(request, timeout=30) as response:
        head = json.load(response)['object']['sha']
    if sha != head:
        raise SystemExit('This release is not the current main commit; deployment stopped.')
    root = Path('/opt/oumouna-khadija')
    subprocess.run(['systemctl', 'start', 'oumouna-khadija-backup.service'], check=True)
    with tempfile.TemporaryDirectory(prefix='oumouna-khadija-release-') as directory:
        archive = Path(directory) / 'release.tar.gz'
        with urllib.request.urlopen(f'https://codeload.github.com/{repository}/tar.gz/{sha}', timeout=90) as response, archive.open('wb') as handle:
            total = 0
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > 100 * 1024 * 1024:
                    raise SystemExit('Release archive exceeds the size limit.')
                handle.write(chunk)
        staging = Path(directory) / 'sources'
        staging.mkdir()
        with tarfile.open(archive) as tar:
            members = tar.getmembers()
            if not members:
                raise SystemExit('Empty archive.')
            prefix = PurePosixPath(members[0].name).parts[0]
            size = 0
            for member in members:
                parts = PurePosixPath(member.name).parts
                if not parts or parts[0] != prefix or '..' in parts or member.name.startswith('/') or not (member.isfile() or member.isdir()):
                    raise SystemExit('Invalid archive member.')
                relative = '/'.join(parts[1:])
                if relative in {'.env', 'deployment-access.txt', 'deploy/realm.production.json'} or relative.startswith('.git/'):
                    raise SystemExit('Private configuration must not appear in a release.')
                size += member.size
                if size > 300 * 1024 * 1024:
                    raise SystemExit('Expanded release exceeds the size limit.')
            tar.extractall(staging, filter='data')
        for source in (staging / prefix).rglob('*'):
            destination = root / source.relative_to(staging / prefix)
            if destination.is_symlink():
                raise SystemExit('Refusing to overwrite a symbolic link.')
            if source.is_dir():
                destination.mkdir(parents=True, exist_ok=True)
            else:
                shutil.copy2(source, destination)
    (root / 'deploy/production.env').write_text('APP_VERSION=' + sha + '\n')
    subprocess.run(['bash', str(root / 'deploy/deploy-vps.sh')], cwd=root, check=True)
    print('Release deployed:', sha)


if __name__ == '__main__':
    main()
