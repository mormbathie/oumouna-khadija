#!/usr/bin/env bash
# Restore application images only; preserve databases and document volumes.
set -euo pipefail
umask 077
(( EUID == 0 )) || { echo 'Run with sudo.' >&2; exit 1; }
project_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd -- "$project_root"
state_file=${1:-deploy/last-release.json}
override=$(mktemp --suffix=.json)
trap 'rm -f -- "$override"' EXIT
export APP_VERSION
APP_VERSION=$(python3 - "$state_file" "$override" <<'PY'
import json, re, subprocess, sys
from pathlib import Path
state = json.loads(Path(sys.argv[1]).read_text())
version = state['version']
if not re.fullmatch('[0-9a-f]{40}', version):
    raise SystemExit('Invalid rollback version.')
if not (Path(state['backup']) / '.complete').is_file():
    raise SystemExit('Required completed backup is missing.')
services = {}
for name in ('backend', 'frontend'):
    image = state['images'][name]
    if not re.fullmatch('sha256:[0-9a-f]{64}', image):
        raise SystemExit('Invalid rollback image ID.')
    revision = subprocess.check_output(['docker', 'image', 'inspect', '-f', '{{index .Config.Labels "org.opencontainers.image.revision"}}', image], text=True).strip()
    if revision != version:
        raise SystemExit('Rollback image revision mismatch.')
    services[name] = {'image': image}
# An older Prisma schema must never remove newly added columns during rollback.
services['backend']['entrypoint'] = ['node', '--require', './dist/src/telemetry.js', 'dist/src/main.js']
Path(sys.argv[2]).write_text(json.dumps({'services': services}))
print(version)
PY
)
compose=(docker compose --project-directory "$project_root" -f docker-compose.yml -f docker-compose.vps.yml -f "$override")
"${compose[@]}" config --quiet
"${compose[@]}" up -d --no-build --no-deps --pull never --wait --wait-timeout 300 backend frontend
for name in backend frontend; do
  id=$("${compose[@]}" ps -q "$name")
  expected=$(python3 - "$state_file" "$name" <<'PY'
import json, sys
print(json.load(open(sys.argv[1]))['images'][sys.argv[2]])
PY
)
  [[ $(docker inspect -f '{{.Image}}' "$id") == "$expected" ]] || exit 1
done
curl --fail --silent --show-error --retry 5 --retry-delay 2 https://gestion.oumounakhadidja-academie.com/api/health >/dev/null
curl --fail --silent --show-error https://gestion.oumounakhadidja-academie.com/ >/dev/null
printf 'APP_VERSION=%s\n' "$APP_VERSION" > deploy/production.env
printf 'Rollback verified: %s. Databases and documents preserved.\n' "$APP_VERSION"
if [[ -f /opt/assakina-observability/agent.compose.yaml ]]; then
  python3 deploy/observability/refresh-agent.py || printf 'Telemetry refresh requires attention.\n' >&2
fi
