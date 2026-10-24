#!/usr/bin/env bash
# Daily backups stay on this VPS; copy them to another machine for disaster recovery.
set -euo pipefail
umask 077

if (( EUID != 0 )); then
  printf 'Run this backup script as root.\n' >&2
  exit 1
fi
if (( $# > 1 )); then
  printf 'Usage: %s [project-directory]\n' "$0" >&2
  exit 1
fi

script_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
project_root=${1:-$script_root}
cd -- "$project_root"
project_root=$PWD
version_file="$project_root/deploy/production.env"
if [[ -f "$version_file" ]]; then
  version_line=$(cat -- "$version_file")
  if [[ ! "$version_line" =~ ^APP_VERSION=([0-9a-f]{40})$ ]]; then
    printf 'Invalid production version file.\n' >&2
    exit 1
  fi
  export APP_VERSION="${BASH_REMATCH[1]}"
else
  # Existing installations can still run backups before their first image promotion.
  export APP_VERSION="${APP_VERSION:-0000000000000000000000000000000000000000}"
fi
backup_root=/var/backups/oumouna-khadija/daily
install -d -m 0700 -- "$backup_root"

# Holding this descriptor prevents cron/manual runs from overlapping.
exec 9>"$backup_root/.backup.lock"
if ! flock -n 9; then
  printf 'Another backup is running; skipped.\n'
  exit 0
fi

compose=(docker compose --project-directory "$project_root"
  -f "$project_root/docker-compose.yml" -f "$project_root/docker-compose.vps.yml")
timestamp=$(date -u +'%Y-%m-%dT%H-%M-%SZ')
backup_name="$timestamp-$$"
staging="$backup_root/.$backup_name.incomplete"
mkdir -m 0700 -- "$staging"

cleanup() {
  result=$?
  if (( result != 0 )); then
    # Remove only files created for this failed run, never an application volume.
    rm -f -- "$staging/postgres.sql.gz.tmp" "$staging/keycloak.sql.gz.tmp" \
      "$staging/school-documents.tar.gz.tmp" "$staging/deployment-config.tar.gz.tmp" "$staging/postgres.sql.gz" \
      "$staging/keycloak.sql.gz" "$staging/school-documents.tar.gz" "$staging/deployment-config.tar.gz" \
      "$staging/.complete" || true
    rmdir -- "$staging" 2>/dev/null || true
    printf 'Backup failed; no completed backup was published.\n' >&2
  fi
}
trap cleanup EXIT

# Resolve database names/users inside each container; never source or print .env.
"${compose[@]}" exec -T postgres sh -c \
  'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' </dev/null \
  | gzip > "$staging/postgres.sql.gz.tmp"
"${compose[@]}" exec -T keycloak-postgres sh -c \
  'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' </dev/null \
  | gzip > "$staging/keycloak.sql.gz.tmp"
"${compose[@]}" exec -T backend tar -czf - -C /app uploads \
  </dev/null > "$staging/school-documents.tar.gz.tmp"

# Only include private configuration after the owner explicitly authorizes its encrypted offsite copy.
if [[ -f /etc/assakina-backup/include-private-config ]]; then
  config_files=(.env deployment-access.txt deploy/realm.production.json deploy/production.env)
  for optional in deploy/smtp.private.json deploy/last-release.json; do
    [[ ! -f "$optional" ]] || config_files+=("$optional")
  done
  tar -czf "$staging/deployment-config.tar.gz.tmp" -- "${config_files[@]}"
  mv -- "$staging/deployment-config.tar.gz.tmp" "$staging/deployment-config.tar.gz"
fi

# Publish only after all commands succeeded. The directory rename is atomic.
mv -- "$staging/postgres.sql.gz.tmp" "$staging/postgres.sql.gz"
mv -- "$staging/keycloak.sql.gz.tmp" "$staging/keycloak.sql.gz"
mv -- "$staging/school-documents.tar.gz.tmp" "$staging/school-documents.tar.gz"
printf '%s\n' "$timestamp" > "$staging/.complete"
mv -- "$staging" "$backup_root/$backup_name"
trap - EXIT

# Keep completed backups for seven days. Incomplete/unrecognized directories stay.
while IFS= read -r -d '' old_backup; do
  if [[ -f "$old_backup/.complete" && ! -L "$old_backup/.complete" ]]; then
    if ! rm -f -- "$old_backup/postgres.sql.gz" "$old_backup/keycloak.sql.gz" \
      "$old_backup/school-documents.tar.gz" "$old_backup/deployment-config.tar.gz" "$old_backup/.complete" \
      || ! rmdir -- "$old_backup"; then
      printf 'Could not fully remove expired backup: %s\n' "$old_backup" >&2
    fi
  fi
done < <(find "$backup_root" -mindepth 1 -maxdepth 1 -type d \
  -name '????-??-??T??-??-??Z-*' -mtime +6 -print0)

printf 'Local backup completed: %s\n' "$backup_root/$backup_name"
