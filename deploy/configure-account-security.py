#!/usr/bin/env python3
"""Set user-facing locales without replacing accounts, SMTP or second factors."""
import json
import os
from pathlib import Path
import urllib.parse
import urllib.request


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run with sudo on the VPS.')
    root = Path(__file__).resolve().parent.parent
    env = dict(line.split('=', 1) for line in (root / '.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
    base = 'http://127.0.0.1:' + env.get('KEYCLOAK_PORT', '8080')
    credentials = urllib.parse.urlencode({'client_id': 'admin-cli', 'grant_type': 'password',
        'username': env['KEYCLOAK_ADMIN'], 'password': env['KEYCLOAK_ADMIN_PASSWORD']}).encode()
    with urllib.request.urlopen(urllib.request.Request(base + '/realms/master/protocol/openid-connect/token', data=credentials), timeout=30) as response:
        token = json.load(response)['access_token']
    settings = {'internationalizationEnabled': True, 'supportedLocales': ['fr', 'en', 'ar'], 'defaultLocale': 'fr'}
    request = urllib.request.Request(base + '/admin/realms/oumouna-khadija', data=json.dumps(settings).encode(), method='PUT',
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=30):
        pass
    print('Account e-mails and action screens: French by default, English and Arabic available.')


if __name__ == '__main__':
    main()
