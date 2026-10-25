#!/usr/bin/env bash
# Apply the Git-tracked production SHA to an existing VPS installation.
set -euo pipefail
umask 077

if (( EUID != 0 )); then
  printf 'Run this script with sudo on the VPS.\n' >&2
  exit 1
fi
project_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd -- "$project_root"
for private_file in .env deployment-access.txt deploy/realm.production.json; do
  if [[ ! -s "$private_file" ]]; then
    printf 'Required existing production file is missing: %s\n' "$private_file" >&2
    exit 1
  fi
done
if [[ ! -f deploy/smtp.private.json ]]; then
  python3 deploy/export-smtp-private.py
fi
version_line=$(cat deploy/production.env)
if [[ ! "$version_line" =~ ^APP_VERSION=([0-9a-f]{40})$ ]]; then
  printf 'deploy/production.env must contain one full Git SHA.\n' >&2
  exit 1
fi
export APP_VERSION="${BASH_REMATCH[1]}"

compose=(docker compose --project-directory "$project_root" -f docker-compose.yml -f docker-compose.vps.yml)
"${compose[@]}" config --quiet
"${compose[@]}" config --format json | python3 -c '
import json, os, sys
config = json.load(sys.stdin)
sha = os.environ["APP_VERSION"]
services = config["services"]
for name in ("backend", "frontend"):
    expected = f"mormbathie/oumouna-khadija-{name}:{sha}"
    actual = services[name].get("image")
    if actual != expected or services[name].get("build"):
        raise SystemExit(f"Unexpected build or image for {name}: {actual}")
required = {"postgres_data", "keycloak_postgres_data", "school_documents", "caddy_data", "caddy_config"}
if not required.issubset(config["volumes"]):
    raise SystemExit("A required persistent volume is missing from Compose")
'

# Never bootstrap, seed, remove volumes, or replace the existing private files.
for service in postgres keycloak-postgres keycloak backend frontend caddy; do
  container_id=$("${compose[@]}" ps -q "$service")
  if [[ -z "$container_id" || "$(docker inspect -f '{{.State.Running}}' "$container_id")" != true ]]; then
    printf 'Existing service is not running: %s\n' "$service" >&2
    exit 1
  fi
done

backup_root=/var/backups/oumouna-khadija/daily
marker=$(mktemp)
trap 'rm -f -- "$marker"' EXIT
printf 'Starting mandatory backup before changing application containers.\n'
systemctl start oumouna-khadija-backup.service
journalctl -u oumouna-khadija-backup.service --no-pager -n 30
if ! find "$backup_root" -mindepth 2 -maxdepth 2 -name .complete -type f -newer "$marker" -print -quit | grep -q .; then
  printf 'No newly completed backup was found; deployment stopped.\n' >&2
  exit 1
fi

backup_path=$(find "$backup_root" -mindepth 2 -maxdepth 2 -name .complete -type f -newer "$marker" -printf '%h\n' | sort | tail -n 1)
gzip -t "$backup_path/postgres.sql.gz" "$backup_path/keycloak.sql.gz"
tar -tzf "$backup_path/school-documents.tar.gz" >/dev/null

for name in backend frontend; do
  image="mormbathie/oumouna-khadija-$name:$APP_VERSION"
  docker pull "$image"
  revision=$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")
  if [[ "$revision" != "$APP_VERSION" ]]; then
    printf 'Image revision mismatch for %s\n' "$image" >&2
    exit 1
  fi
done

# Record the exact currently running image IDs, independently of the new manifest.
python3 - "$backup_path" <<'PYROLLBACK'
import datetime, json, re, subprocess, sys
from pathlib import Path
images = {}
versions = []
for name in ('backend', 'frontend'):
    info = json.loads(subprocess.check_output(['docker', 'inspect', 'oumouna_khadija_' + name]))[0]
    images[name] = info['Image']
    revision = subprocess.check_output(['docker', 'image', 'inspect', '-f', '{{index .Config.Labels "org.opencontainers.image.revision"}}', info['Image']], text=True).strip()
    if not re.fullmatch('[0-9a-f]{40}', revision):
        raise SystemExit('Previous image has no valid source revision; deployment stopped.')
    versions.append(revision)
if versions[0] != versions[1]:
    raise SystemExit('Previous application images differ in revision; deployment stopped.')
state = {'version': versions[0], 'images': images, 'backup': sys.argv[1], 'recorded_at': datetime.datetime.now(datetime.timezone.utc).isoformat()}
Path('deploy/last-release.json').write_text(json.dumps(state, indent=2) + '\n')
PYROLLBACK
rollback_armed=true
served_html=''
finish_deployment() {
  result=$?
  trap - EXIT
  if (( result != 0 )) && [[ "$rollback_armed" == true ]]; then
    printf 'Deployment failed; restoring previous application images.\n' >&2
    if bash "$project_root/deploy/rollback-vps.sh"; then
      printf 'Previous release restored and checked. Deployment remains failed.\n' >&2
    else
      printf 'ROLLBACK FAILED: manual intervention required; state is in deploy/last-release.json.\n' >&2
    fi
  fi
  rm -f -- "$marker" "${served_html:-}"
  exit "$result"
}
trap finish_deployment EXIT

# The authentication service keeps Keycloak security while presenting the
# school's own end-user pages for activation and password actions.
"${compose[@]}" up -d --no-build --no-deps --wait --wait-timeout 180 keycloak
python3 deploy/apply-keycloak-theme.py

# Only stateless application containers are recreated below; databases and Caddy stay in place.
if ! "${compose[@]}" up -d --no-build --no-deps --wait --wait-timeout 300 backend frontend; then
  # Capture startup diagnostics from the new containers even when healthchecks fail.
  if [[ -f /opt/assakina-observability/agent.compose.yaml ]]; then
    python3 "$PWD/deploy/observability/refresh-agent.py" || true
  fi
  exit 1
fi
"${compose[@]}" ps
for service in postgres keycloak-postgres keycloak backend frontend caddy; do
  container_id=$("${compose[@]}" ps -q "$service")
  health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$container_id")
  if [[ "$health" != healthy ]]; then
    printf 'Service %s is %s, not healthy.\n' "$service" "$health" >&2
    exit 1
  fi
done
for name in backend frontend; do
  container_id=$("${compose[@]}" ps -q "$name")
  actual=$(docker inspect -f '{{.Image}}' "$container_id")
  expected=$(docker image inspect -f '{{.Id}}' "mormbathie/oumouna-khadija-$name:$APP_VERSION")
  if [[ "$actual" != "$expected" ]]; then
    printf 'Running %s image differs from the selected tag.\n' "$name" >&2
    exit 1
  fi
done

app_url=https://gestion.oumounakhadidja-academie.com
curl --fail --silent --show-error --retry 5 --retry-delay 2 "$app_url/api/health" > /dev/null
frontend_id=$("${compose[@]}" ps -q frontend)
served_html=$(mktemp)

curl --fail --silent --show-error --header 'Cache-Control: no-cache' "$app_url/?deploy=$APP_VERSION" > "$served_html"
if ! docker exec "$frontend_id" cat /usr/share/nginx/html/index.html | cmp -s - "$served_html"; then
  printf 'Public frontend HTML differs from the running image.\n' >&2
  exit 1
fi
"${compose[@]}" logs --tail=50 backend frontend keycloak caddy
rollback_armed=false
printf 'Production application is healthy at Git SHA %s.\n' "$APP_VERSION"

# Observability is optional and independent from school data. Refresh replaced log paths.
if [[ -f /opt/assakina-observability/agent.compose.yaml ]]; then
  python3 "$PWD/deploy/observability/refresh-agent.py" || printf 'Telemetry refresh requires attention.\n' >&2
fi
