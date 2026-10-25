#!/usr/bin/env python3
"""Select the school login theme on the existing production realm."""
import json
import os
from pathlib import Path
import sys
import urllib.parse
import urllib.request

THEME = 'oumouna-khadija'


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run as root on the VPS.')
    root = Path(__file__).resolve().parent.parent
    if not (root / 'keycloak/themes' / THEME / 'login/theme.properties').is_file():
        raise SystemExit('School login theme files are missing.')
    env = dict(line.split('=', 1) for line in (root / '.env').read_text().splitlines()
               if '=' in line and not line.startswith('#'))
    base = 'http://127.0.0.1:' + env.get('KEYCLOAK_PORT', '8080')
    token_data = urllib.parse.urlencode({
        'grant_type': 'password', 'client_id': 'admin-cli',
        'username': env['KEYCLOAK_ADMIN'], 'password': env['KEYCLOAK_ADMIN_PASSWORD'],
    }).encode()
    token_request = urllib.request.Request(base + '/realms/master/protocol/openid-connect/token', data=token_data)
    with urllib.request.urlopen(token_request, timeout=30) as response:
        token = json.load(response)['access_token']
    realm_url = base + '/admin/realms/oumouna-khadija'
    headers = {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}
    with urllib.request.urlopen(urllib.request.Request(realm_url, headers=headers), timeout=30) as response:
        realm = json.load(response)
    desired = {
        'loginTheme': THEME,
        'emailTheme': THEME,
        'internationalizationEnabled': False,
        'defaultLocale': 'fr',
    }
    if any(realm.get(key) != value for key, value in desired.items()):
        update = urllib.request.Request(realm_url, data=json.dumps(desired).encode(), headers=headers, method='PUT')
        with urllib.request.urlopen(update, timeout=30):
            pass
    with urllib.request.urlopen(urllib.request.Request(realm_url, headers=headers), timeout=30) as response:
        saved = json.load(response)
        if any(saved.get(key) != value for key, value in desired.items()):
            raise SystemExit('Keycloak did not save the school themes and French locale.')
    print('Oumouna Khadija login/email themes and French locale are active.')


if __name__ == '__main__':
    try:
        main()
    except (KeyError, OSError, ValueError):
        raise SystemExit('Unable to activate the school login theme.')

