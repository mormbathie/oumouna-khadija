#!/usr/bin/env bash
# Copy completed backups through an encrypted rclone remote. Never sync/delete live data.
set -euo pipefail
umask 077
(( EUID == 0 )) || { printf 'Run as root.\n' >&2; exit 1; }
config=/etc/assakina-backup/rclone.conf
[[ -s "$config" ]] || { printf 'Google Drive is not connected yet.\n' >&2; exit 1; }
exec 9>/var/backups/oumouna-khadija/.offsite.lock
flock -n 9 || exit 0
backup_root=/var/backups/oumouna-khadija/daily
backup=$(find "$backup_root" -mindepth 2 -maxdepth 2 -name .complete -type f -printf '%h\n' | sort | tail -n 1)
[[ -n "$backup" ]] || { printf 'No completed backup.\n' >&2; exit 1; }
name=$(basename -- "$backup")
[[ "$name" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}Z-[0-9]+$ ]] || exit 1
for file in postgres.sql.gz keycloak.sql.gz school-documents.tar.gz; do
  [[ -s "$backup/$file" ]] || { printf 'Required backup file missing: %s\n' "$file" >&2; exit 1; }
done
gzip -t "$backup/postgres.sql.gz" "$backup/keycloak.sql.gz"
tar -tzf "$backup/school-documents.tar.gz" > /dev/null
rclone --config "$config" copy "$backup" "assakina-crypt:$name" --transfers 1 --checkers 2 --bwlimit 4M --retries 3 --contimeout 20s --timeout 60s --filter '+ *.sql.gz' --filter '+ school-documents.tar.gz' --filter '+ deployment-config.tar.gz' --filter '- *'
rclone --config "$config" check "$backup" "assakina-crypt:$name" --download --one-way --checkers 1 --filter '+ *.sql.gz' --filter '+ school-documents.tar.gz' --filter '+ deployment-config.tar.gz' --filter '- *'
# Publish the remote completion marker only after the encrypted copy was verified.
rclone --config "$config" copyto "$backup/.complete" "assakina-crypt:$name/.complete" --retries 3 --contimeout 20s --timeout 60s
date -u +'%Y-%m-%dT%H:%M:%SZ' > /var/backups/oumouna-khadija/.offsite-last-success.tmp
mv /var/backups/oumouna-khadija/.offsite-last-success.tmp /var/backups/oumouna-khadija/.offsite-last-success
printf 'Encrypted offsite backup verified: %s\n' "$name"
