#!/usr/bin/env python3
"""Configure the existing production realm's mailbox using a hidden terminal prompt."""
import datetime
from email.message import EmailMessage
import getpass
import json
import os
from pathlib import Path
import smtplib
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request

MAILBOX = 'contact@oumounakhadidja-academie.com'
DEFAULT_SMTP_HOST = 'mail96.lwspanel.com'


def main():
    if os.geteuid() != 0 or not sys.stdin.isatty():
        raise SystemExit('Run with sudo in an interactive SSH terminal.')
    root = Path(__file__).resolve().parent.parent
    env = dict(line.split('=', 1) for line in (root / '.env').read_text().splitlines()
               if '=' in line and not line.startswith('#'))
    base = 'http://127.0.0.1:' + env.get('KEYCLOAK_PORT', '8080')
    data = urllib.parse.urlencode({
        'grant_type': 'password', 'client_id': 'admin-cli',
        'username': env['KEYCLOAK_ADMIN'], 'password': env['KEYCLOAK_ADMIN_PASSWORD'],
    }).encode()
    with urllib.request.urlopen(urllib.request.Request(
            base + '/realms/master/protocol/openid-connect/token', data=data), timeout=30) as response:
        admin_token = json.load(response)['access_token']
    realm_url = base + '/admin/realms/oumouna-khadija'
    headers = {'Authorization': 'Bearer ' + admin_token, 'Content-Type': 'application/json'}
    with urllib.request.urlopen(urllib.request.Request(realm_url, headers=headers), timeout=30) as response:
        previous = json.load(response).get('smtpServer', {})
    print('Adresse d’envoi : ' + MAILBOX)
    smtp_host = input(f'Serveur SMTP LWS [{DEFAULT_SMTP_HOST}] : ').strip() or DEFAULT_SMTP_HOST
    if not smtp_host or any(character.isspace() for character in smtp_host):
        raise SystemExit('Nom de serveur SMTP invalide ; aucune configuration modifiée.')
    password = getpass.getpass('Mot de passe de la boîte LWS (saisie masquée) : ')
    if not password:
        raise SystemExit('Mot de passe absent ; aucune configuration modifiée.')
    message = EmailMessage()
    message['From'] = 'Institut Oumouna Khadija <' + MAILBOX + '>'
    message['To'] = MAILBOX
    message['Subject'] = 'Institut Oumouna Khadija — test de l’envoi des e-mails'
    message.set_content('Bonjour,\n\nCe message confirme que le serveur de l’application peut envoyer des e-mails avec la boîte de l’école.\n\nInstitut Oumouna Khadija\nhttps://oumounakhadidja-academie.com\n')
    try:
        with smtplib.SMTP_SSL(smtp_host, 465, timeout=30, context=ssl.create_default_context()) as smtp:
            smtp.login(MAILBOX, password)
            refused = smtp.send_message(message)
            if refused:
                raise RuntimeError('Envoi refusé.')
    except (smtplib.SMTPException, OSError, RuntimeError):
        raise SystemExit('Connexion ou envoi SMTP refusé. Vérifiez le mot de passe et l’activation de la boîte. Aucune configuration modifiée.')
    backup = Path('/var/backups/oumouna-khadija/config') / ('email-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    backup.mkdir(parents=True, mode=0o700)
    target = backup / 'previous-smtp.json'
    descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as handle:
        json.dump(previous, handle)
    smtp_settings = {
        'host': smtp_host, 'port': '465', 'ssl': 'true', 'starttls': 'false',
        'auth': 'true', 'user': MAILBOX, 'password': password,
        'from': MAILBOX, 'fromDisplayName': 'Institut Oumouna Khadija', 'replyTo': MAILBOX,
        'envelopeFrom': MAILBOX,
    }
    # Refresh the admin token after the interactive prompt, which can take several minutes.
    with urllib.request.urlopen(urllib.request.Request(
            base + '/realms/master/protocol/openid-connect/token', data=data), timeout=30) as response:
        headers['Authorization'] = 'Bearer ' + json.load(response)['access_token']
    request = urllib.request.Request(realm_url, data=json.dumps({'smtpServer': smtp_settings}).encode(), headers=headers, method='PUT')
    with urllib.request.urlopen(request, timeout=30):
        pass
    with urllib.request.urlopen(urllib.request.Request(realm_url, headers=headers), timeout=30) as response:
        saved = json.load(response)['smtpServer']
    for key in ('host', 'port', 'user', 'from', 'ssl', 'auth'):
        if saved.get(key) != smtp_settings[key]:
            raise SystemExit('La vérification des paramètres enregistrés a échoué.')
    target = root / 'deploy/smtp.private.json'
    descriptor = os.open(str(target) + '.tmp', os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, 'w') as handle:
        json.dump(smtp_settings, handle)
    os.replace(str(target) + '.tmp', target)
    print('Configuration enregistrée et message de test accepté par LWS.')
    print('Vérifiez sa réception, puis testez « Mot de passe oublié » sur la page de connexion.')
    print('Aucun redémarrage requis. La vérification obligatoire et le double facteur ne sont pas activés par ce script.')


if __name__ == '__main__':
    try:
        main()
    except (urllib.error.URLError, KeyError, ValueError):
        raise SystemExit('La configuration a échoué. Aucun identifiant n’a été affiché ; demandez une vérification du serveur.')
