import os
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MOCK_DOCKER = '#!/usr/bin/env bash\nprintf "fixture"\n'


class BackupRetentionTests(unittest.TestCase):
    def test_keeps_only_two_latest_completed_backups(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            backups = root / 'backups'
            (root / 'deploy').mkdir()
            (root / 'bin').mkdir()
            backups.mkdir()
            text = (ROOT / 'deploy' / 'backup.sh').read_text()
            # The test copy alone bypasses root; the real backup keeps its root check.
            text = text.replace('if (( EUID != 0 )); then', 'if false; then')
            text = text.replace('backup_root=/var/backups/oumouna-khadija/daily', f'backup_root={backups}')
            (root / 'deploy' / 'backup.sh').write_text(text)
            docker = root / 'bin' / 'docker'
            docker.write_text(MOCK_DOCKER)
            docker.chmod(0o755)

            old = [f'2026-11-1{day}T02-00-00Z-{day}' for day in range(1, 6)]
            for name in old:
                (backups / name).mkdir()
                for file in ('postgres.sql.gz', 'keycloak.sql.gz', 'school-documents.tar.gz', '.complete'):
                    (backups / name / file).write_text('x')
            (backups / '2026-11-16T02-00-00Z-99').mkdir()  # incomplete: no marker
            (backups / 'manual-copy').mkdir()  # unrecognized name

            env = {**os.environ, 'PATH': str(root / 'bin') + ':' + os.environ['PATH']}
            result = subprocess.run(['bash', 'deploy/backup.sh'], cwd=root, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

            remaining = sorted(path.name for path in backups.iterdir() if not path.name.startswith('.'))
            completed = [name for name in remaining if (backups / name / '.complete').is_file()]
            self.assertEqual(len(completed), 2)
            self.assertIn(old[-1], completed)  # previous backup kept for safety
            self.assertIn('2026-11-16T02-00-00Z-99', remaining)
            self.assertIn('manual-copy', remaining)
            for name in old[:-1]:
                self.assertNotIn(name, remaining)


if __name__ == '__main__':
    unittest.main()
