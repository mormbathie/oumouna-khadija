#!/usr/bin/env python3
"""Move an existing deployment to the school domain without replacing its secrets."""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import shutil
import urllib.parse
import urllib.request


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--app-host', required=True)
    parser.add_argument('--auth-host', required=True)
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise SystemExit('Run this script with sudo on the VPS.')
    for host in (args.app_host, args.auth_host):
        if not re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?', host):
            raise SystemExit('Invalid domain name.')
    root = Path(__file__).resolve().parent.parent
    env_path = root / '.env'
    realm_path = root / 'deploy/realm.production.json'
    env_text = env_path.read_text()
    env = dict(line.split('=', 1) for line in env_text.splitlines() if '=' in line and not line.startswith('#'))
    base = f'http://127.0.0.1:{env.get("KEYCLOAK_PORT", "8080")}'
    credentials = urllib.parse.urlencode({
        'grant_type': 'password', 'client_id': 'admin-cli',
        'username': env['KEYCLOAK_ADMIN'], 'password': env['KEYCLOAK_ADMIN_PASSWORD'],
    }).encode()
    with urllib.request.urlopen(urllib.request.Request(base + '/realms/master/protocol/openid-connect/token', data=credentials), timeout=30) as response:
        token = json.load(response)['access_token']

    def request(path, data=None):
        headers = {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}
        body = None if data is None else json.dumps(data).encode()
        req = urllib.request.Request(base + '/admin/realms/oumouna-khadija' + path, data=body, headers=headers, method='GET' if data is None else 'PUT')
        with urllib.request.urlopen(req, timeout=30) as response:
            content = response.read()
            return json.loads(content) if content else None

    realm = request('')
    clients = request('/clients?clientId=oumouna-khadija-app')
    client = next(item for item in clients if item['clientId'] == 'oumouna-khadija-app')
    backup = Path('/var/backups/oumouna-khadija/config') / ('domain-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    backup.mkdir(parents=True, mode=0o700)
    shutil.copy2(env_path, backup / 'environment')
    shutil.copy2(realm_path, backup / 'realm.production.json')
    for name, value in [('realm-settings.json', realm), ('client-settings.json', client)]:
        target = backup / name
        target.write_text(json.dumps(value, ensure_ascii=False, indent=2))
        target.chmod(0o600)
    origin = 'https://' + args.app_host
    auth_url = 'https://' + args.auth_host
    realm_attributes = {**realm.get('attributes', {}), 'frontendUrl': auth_url}
    client_attributes = {**client.get('attributes', {}), 'post.logout.redirect.uris': origin + '/*'}
    request('', {'displayName': 'Institut Oumouna Khadija', 'attributes': realm_attributes,
                 'ssoSessionIdleTimeout': 93600, 'ssoSessionMaxLifespan': 604800,
                 'clientSessionIdleTimeout': 93600, 'clientSessionMaxLifespan': 604800})
    request('/clients/' + client['id'], {'redirectUris': [origin + '/*'], 'webOrigins': [origin], 'attributes': client_attributes})
    changes = {'APP_HOST': args.app_host, 'AUTH_HOST': args.auth_host,
               'KEYCLOAK_HOSTNAME': args.auth_host, 'KEYCLOAK_PUBLIC_URL': auth_url,
               'CORS_ORIGINS': origin}
    lines = []
    for line in env_text.splitlines():
        key = line.split('=', 1)[0]
        lines.append(key + '=' + changes.pop(key) if key in changes else line)
    lines.extend(key + '=' + value for key, value in changes.items())

    def replace_private(path, content):
        stat = path.stat()
        temporary = path.with_name(path.name + '.domain-tmp')
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'w') as handle:
            handle.write(content)
        os.chmod(temporary, stat.st_mode & 0o777)
        os.chown(temporary, stat.st_uid, stat.st_gid)
        os.replace(temporary, path)

    replace_private(env_path, '\n'.join(lines) + '\n')
    private_realm = json.loads(realm_path.read_text())
    private_realm['displayName'] = 'Institut Oumouna Khadija'
    private_realm['attributes'] = {**private_realm.get('attributes', {}), 'frontendUrl': auth_url}
    for entry in private_realm.get('clients', []):
        if entry['clientId'] == 'oumouna-khadija-app':
            entry.update(redirectUris=[origin + '/*'], webOrigins=[origin])
            entry['attributes'] = {**entry.get('attributes', {}), 'post.logout.redirect.uris': origin + '/*'}
    replace_private(realm_path, json.dumps(private_realm, ensure_ascii=False, indent=2) + '\n')
    print('Domain configuration updated; private configuration backup:', backup)
    print('Recreate Keycloak and Caddy, then deploy the verified application images.')


if __name__ == '__main__':
    main()
