#!/usr/bin/env bash
# Independent supervision stack. Existing school containers and volumes stay running.
set -euo pipefail
umask 077
if (( EUID != 0 )); then echo 'Run with sudo.' >&2; exit 1; fi
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
target=/opt/assakina-observability
docker network inspect oumouna-khadija_oumou_net >/dev/null
mkdir -p "$target"
cp -R "$source_dir/pours" "$target/"
cp "$source_dir/agent.compose.yaml" "$target/agent.compose.yaml"
docker compose -f "$target/pours/deployment/compose.yaml" config --quiet
docker compose -f "$target/pours/deployment/compose.yaml" up -d
python3 "$source_dir/refresh-agent.py"
echo 'Supervision started. Use the SSH tunnel documented in docs/supervision-signoz.md.'
