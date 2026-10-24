#!/usr/bin/env python3
"""Create fresh VPS credentials and a production Keycloak import exactly once.

Run with sudo from the deployed project. Secrets remain in protected files; this
script never connects to databases, imports users, or loads demonstration data.
"""

import argparse
import copy
import json
import os
from pathlib import Path
import re
import secrets
import sys


REALM_NAME = "oumouna-khadija"
CLIENT_ID = "oumouna-khadija-app"
APP_ADMIN = "admin"
KEYCLOAK_ADMIN = "kcadmin"


def hostname(value):
    """Accept DNS names only, so generated dotenv values cannot contain code."""
    value = value.lower()
    labels = value.split(".")
    valid_label = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?")
    if (
        len(value) > 253
        or len(labels) < 2
        or any(not valid_label.fullmatch(label) for label in labels)
        or all(label.isdigit() for label in labels)
    ):
        raise argparse.ArgumentTypeError(
            "use a DNS hostname without https://, port, path or whitespace"
        )
    return value


def production_realm(template, app_host, auth_host, password):
    if template.get("realm") != REALM_NAME:
        raise ValueError("the Keycloak template has an unexpected realm name")
    app_clients = [
        client
        for client in template.get("clients", [])
        if client.get("clientId") == CLIENT_ID
    ]
    if len(app_clients) != 1:
        raise ValueError("the Keycloak template must contain one application client")
    role_names = {
        role.get("name") for role in template.get("roles", {}).get("realm", [])
    }
    if "ADMIN" not in role_names:
        raise ValueError("the Keycloak template does not define the ADMIN role")

    # Keep only configuration fields. This excludes exported demo users,
    # federated identities, groups, sessions, SMTP passwords and client secrets.
    realm = {
        "realm": REALM_NAME,
        "enabled": True,
        "displayName": template.get("displayName", "Institut Oumouna Khadija"),
        "sslRequired": "external",
        "registrationAllowed": False,
        "internationalizationEnabled": True,
        "supportedLocales": ["fr", "en", "ar"],
        "defaultLocale": "fr",
        "loginWithEmailAllowed": True,
        "duplicateEmailsAllowed": False,
        "bruteForceProtected": True,
        "resetPasswordAllowed": False,
        "editUsernameAllowed": False,
        "ssoSessionIdleTimeout": template.get("ssoSessionIdleTimeout", 93600),
        "ssoSessionMaxLifespan": template.get("ssoSessionMaxLifespan", 604800),
        "clientSessionIdleTimeout": template.get("clientSessionIdleTimeout", 93600),
        "clientSessionMaxLifespan": template.get("clientSessionMaxLifespan", 604800),
        "attributes": {"frontendUrl": f"https://{auth_host}"},
        "roles": {"realm": copy.deepcopy(template["roles"]["realm"])},
    }
    client_template = app_clients[0]
    realm["clients"] = [
        {
            "clientId": CLIENT_ID,
            "name": client_template.get("name", "Institut Oumouna Khadija"),
            "enabled": True,
            "clientAuthenticatorType": "client-secret",
            "publicClient": True,
            "standardFlowEnabled": True,
            "implicitFlowEnabled": False,
            # The application has a password login form using this grant.
            "directAccessGrantsEnabled": True,
            "serviceAccountsEnabled": False,
            "fullScopeAllowed": True,
            "rootUrl": f"https://{app_host}",
            "baseUrl": f"https://{app_host}/",
            "redirectUris": [f"https://{app_host}/*"],
            "webOrigins": [f"https://{app_host}"],
            "attributes": {"post.logout.redirect.uris": f"https://{app_host}/*"},
        }
    ]
    realm["users"] = [
        {
            "username": APP_ADMIN,
            "enabled": True,
            "email": "admin@localhost.invalid",
            "emailVerified": False,
            "firstName": "Administrateur",
            "lastName": "Institut Oumouna Khadija",
            "requiredActions": [],
            "credentials": [
                {"type": "password", "value": password, "temporary": False}
            ],
            "realmRoles": ["ADMIN"],
        }
    ]
    return realm


def environment(app_host, auth_host, passwords):
    postgres_password, keycloak_db_password, keycloak_admin_password = passwords
    values = {
        "APP_HOST": app_host,
        "AUTH_HOST": auth_host,
        "POSTGRES_VOLUME_NAME": "oumouna_khadija_vps_postgres_data",
        "POSTGRES_BIND_ADDRESS": "127.0.0.1",
        "POSTGRES_PORT": "5434",
        "KEYCLOAK_BIND_ADDRESS": "127.0.0.1",
        "KEYCLOAK_PORT": "8080",
        "BACKEND_BIND_ADDRESS": "127.0.0.1",
        "BACKEND_PORT": "3001",
        "FRONTEND_BIND_ADDRESS": "127.0.0.1",
        "FRONTEND_PORT": "5173",
        "POSTGRES_USER": "postgres",
        "POSTGRES_PASSWORD": postgres_password,
        "POSTGRES_DB": "oumouna_khadija_db",
        "DATABASE_URL": (
            f"postgresql://postgres:{postgres_password}"
            "@postgres:5432/oumouna_khadija_db?schema=public"
        ),
        "KEYCLOAK_DB_USER": "keycloak",
        "KEYCLOAK_DB_PASSWORD": keycloak_db_password,
        "KEYCLOAK_ADMIN": KEYCLOAK_ADMIN,
        "KEYCLOAK_ADMIN_PASSWORD": keycloak_admin_password,
        "KEYCLOAK_HOSTNAME": auth_host,
        "KEYCLOAK_HOSTNAME_PORT": "443",
        "KEYCLOAK_HOSTNAME_STRICT": "true",
        "KEYCLOAK_HOSTNAME_STRICT_HTTPS": "true",
        "KEYCLOAK_PUBLIC_URL": f"https://{auth_host}",
        "CORS_ORIGINS": f"https://{app_host}",
    }
    return "# Generated for the first VPS deployment; keep this file private.\n" + "".join(
        f"{key}={value}\n" for key, value in values.items()
    )


def exists(path):
    return path.exists() or path.is_symlink()


def preserve_existing(env_path, realm_path, access_path, app_host, auth_host):
    paths = (env_path, realm_path, access_path)
    existing = [path for path in paths if exists(path)]
    if not existing:
        return False
    if len(existing) != len(paths) or any(
        path.is_symlink() or not path.is_file() for path in existing
    ):
        raise ValueError(
            "deployment configuration already exists or is incomplete; preserved "
            "all existing files. Check .env, deploy/realm.production.json and "
            "deployment-access.txt before continuing"
        )
    configured_hosts = {}
    for line in env_path.read_text(encoding="utf-8").splitlines():
        key, separator, value = line.partition("=")
        if separator and key in {"APP_HOST", "AUTH_HOST"}:
            configured_hosts[key] = value
    if configured_hosts != {"APP_HOST": app_host, "AUTH_HOST": auth_host}:
        raise ValueError(
            "existing .env uses other or missing hostnames; preserved all secrets. "
            "A hostname migration must update the existing configuration explicitly"
        )
    print("Deployment files already exist: preserved all credentials and users.")
    return True


def write_private(path, content, created_paths, mode=0o600, group=None):
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(path, flags, 0o600)
    created_paths.append(path)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        handle.write(content)
        handle.flush()
        os.fsync(handle.fileno())
        if group is not None:
            os.fchown(handle.fileno(), -1, group)
        os.fchmod(handle.fileno(), mode)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app-host", required=True, type=hostname)
    parser.add_argument("--auth-host", required=True, type=hostname)
    arguments = parser.parse_args()
    if arguments.app_host == arguments.auth_host:
        parser.error("application and authentication must use separate hostnames")

    root = Path(__file__).resolve().parent.parent
    env_path = root / ".env"
    realm_path = root / "deploy" / "realm.production.json"
    access_path = root / "deployment-access.txt"
    created_paths = []
    smtp_file = root / 'deploy/smtp.private.json'
    try:
        if preserve_existing(
            env_path, realm_path, access_path, arguments.app_host, arguments.auth_host
        ):
            if not smtp_file.exists():
                write_private(smtp_file, '{}\n', created_paths)
            return 0
        template = json.loads(
            (root / "keycloak" / "realm-export.json").read_text(encoding="utf-8")
        )
        generated_passwords = []
        while len(generated_passwords) < 4:
            password = secrets.token_hex(32)
            if password not in generated_passwords:
                generated_passwords.append(password)
        app_password = generated_passwords[3]
        realm = production_realm(
            template, arguments.app_host, arguments.auth_host, app_password
        )
        access = (
            f"Application: https://{arguments.app_host}\n"
            f"Identifiant: {APP_ADMIN}\n"
            f"Mot de passe: {app_password}\n\n"
            "Gardez ce fichier prive. Aucun compte de demonstration n'a ete importe.\n"
            "Administration Keycloak: acces prive, non expose sur Internet\n"
            f"Identifiant Keycloak distinct: {KEYCLOAK_ADMIN}\n"
            "Le mot de passe Keycloak est conserve dans .env.\n"
        )
        write_private(access_path, access, created_paths)
        # The production Compose override grants Keycloak supplementary group
        # 1000, allowing import without making the initial password world-readable.
        is_root = os.geteuid() == 0
        write_private(
            realm_path,
            json.dumps(realm, ensure_ascii=False, indent=2) + "\n",
            created_paths,
            mode=0o640 if is_root else 0o600,
            group=1000 if is_root else None,
        )
        if not smtp_file.exists():
            write_private(smtp_file, '{}\n', created_paths)
        # Write .env last as the marker for a complete bootstrap.
        write_private(
            env_path,
            environment(arguments.app_host, arguments.auth_host, generated_passwords[:3]),
            created_paths,
        )
    except (OSError, ValueError, TypeError, KeyError) as error:
        for path in reversed(created_paths):
            path.unlink(missing_ok=True)
        print(f"Bootstrap failed: {error}", file=sys.stderr)
        return 1

    print("Created protected .env, realm import and deployment-access.txt.")
    print("No demo data seeded. The first classroom creates the current academic year.")
    print("Read deployment-access.txt privately on the VPS for application credentials.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
