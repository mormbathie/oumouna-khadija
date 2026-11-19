# Premier déploiement sur le VPS OVH

Ce déploiement héberge le frontend React, l'API NestJS, PostgreSQL et Keycloak
sur le VPS `57.131.160.254`. Caddy fournit HTTPS et conserve ses certificats
dans un volume persistant. Vercel pourra être configuré ultérieurement.

| Élément | Valeur |
| --- | --- |
| Application | `https://assakina-school.com` |
| API | `https://assakina-school.com/api` |
| Santé de l'API | `https://assakina-school.com/api/health` |
| Authentification | `https://auth.assakina-school.com` |
| Dossier sur le VPS | `/opt/oumou-salamat` |

Le domaine `assakina-school.com` et le sous-domaine `auth.assakina-school.com`
doivent avoir un enregistrement DNS vers `57.131.160.254`. Caddy obtient
et renouvelle les certificats [HTTPS automatiquement](https://caddyserver.com/docs/automatic-https).
Le premier déploiement utilisait des adresses temporaires `sslip.io`.
La migration conserve les comptes, les bases et les secrets existants.

## Migration du domaine existant

Après une sauvegarde complète et la validation du DNS, transférer les sources
de la version choisie, puis exécuter sur le VPS :

```bash
cd /opt/oumou-salamat
sudo python3 deploy/migrate-domain.py --app-host assakina-school.com --auth-host auth.assakina-school.com
set -a; . deploy/production.env; set +a
sudo --preserve-env=APP_VERSION docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d --no-build --no-deps --wait --wait-timeout 300 keycloak caddy
```

Ce script sauvegarde les configurations privées dans
`/var/backups/oumou-salamat/config/`, conserve les mots de passe, met à jour les
origines et redirections du client existant, et applique les durées de session.
Il ne réimporte pas le realm et ne crée pas de comptes de démonstration.
Les nouvelles images du frontend doivent utiliser `https://auth.assakina-school.com`.

Déploiement vérifié le 2 octobre 2026 : six conteneurs sains, certificat HTTPS
valide, page de connexion affichée dans le navigateur, connexion administrateur,
tableau de bord et gestion des utilisateurs fonctionnels. Un upload PNG de plus
de 1 Mo a été envoyé, téléchargé à l'identique puis supprimé avec sa fiche
temporaire. La première sauvegarde des deux bases et des documents est valide.

## Configuration de production

`docker-compose.vps.yml` complète le Compose local. Seul Caddy publie les ports
web 80 et 443. Les autres ports restent sur `127.0.0.1`, et la base Keycloak
reste sur le réseau Docker. L'API reçoit les requêtes directement depuis Caddy,
avec le protocole HTTPS correct ; les uploads sont autorisés jusqu'à 12 Mo
au niveau des proxies, pour les fichiers de 10 Mo acceptés par l'API.

Le script `deploy/bootstrap.py` génère sur le VPS :

- `.env` avec des secrets distincts pour les deux bases et l'administration Keycloak ;
- `deploy/realm.production.json` avec un seul utilisateur applicatif `admin`,
  le rôle `ADMIN`, un mot de passe unique et les origines HTTPS exactes ;
- `deployment-access.txt` avec l'accès initial à l'application.

Ces fichiers sont privés et exclus du dépôt. Le script préserve les secrets
existants lors d'une relance ; il refuse les configurations partielles ou un
changement de noms de domaine. Il ne charge aucune donnée de démonstration.
La création de la première classe initialise automatiquement l'année scolaire.

Keycloak 24 utilise une URL HTTPS publique fixe pour l'issuer JWT et une URL
Docker interne pour les appels du backend. Le Compose VPS supprime les anciennes
options hostname qui entreraient en conflit avec cette URL.
Voir la [configuration hostname de Keycloak 24](https://raw.githubusercontent.com/keycloak/keycloak/24.0.5/docs/guides/server/hostname.adoc).
La console d'administration Keycloak n'est pas exposée par Caddy ; la gestion
des utilisateurs se fait dans l'application avec le compte administrateur.

La session renouvelable est configurée avec 26 heures d'inactivité et une durée
maximale de 7 jours dans le realm Keycloak. Les nouveaux realms reçoivent ces
valeurs depuis `keycloak/realm-export.json` et `deploy/bootstrap.py`. Un realm
déjà importé conserve ses anciens réglages : après validation locale et lors
d'une future mise à jour du VPS, appliquer aussi les quatre paramètres au realm
existant via l'outil d'administration Keycloak. Exemple dans le conteneur
Keycloak, avec les identifiants d'administration déjà fournis par Compose :

```bash
docker compose exec -T keycloak sh -ec '/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user "$KEYCLOAK_ADMIN" --password "$KEYCLOAK_ADMIN_PASSWORD" >/dev/null && /opt/keycloak/bin/kcadm.sh update realms/oumou-salamat -s ssoSessionIdleTimeout=93600 -s ssoSessionMaxLifespan=604800 -s clientSessionIdleTimeout=93600 -s clientSessionMaxLifespan=604800'
```

Sur le VPS, ajouter `-f docker-compose.yml -f docker-compose.vps.yml` à la
commande Compose et l'exécuter uniquement pendant la mise à jour approuvée.

## Accès initial

Dans ta session SSH sur le VPS, afficher les identifiants :

```bash
sudo cat /opt/oumou-salamat/deployment-access.txt
```

Le compte applicatif est `admin`. Son mot de passe est distinct de celui de
l'administration Keycloak, et les comptes de test du README local ne sont pas
importés. Les données scolaires de l'environnement local ne sont pas transférées.

## Images de production et mises à jour

Les tests sur `main` précèdent la publication des seules images applicatives
`mormbathie/oumou-salamat-backend` et `mormbathie/oumou-salamat-frontend` sur
Docker Hub. Chaque image porte le SHA complet du commit source ; le frontend est
construit avec `/api` et l'URL HTTPS publique de Keycloak. Le workflow requiert
les secrets GitHub `DOCKERHUB_USERNAME` et `DOCKERHUB_TOKEN`. Les PR et `develop`
ne publient aucune image. Le VPS ne construit plus les images applicatives.

`deploy/production.env` contient la version désirée, sous la forme
`APP_VERSION=<SHA complet>`. Ce fichier suivi par Git est mis à jour uniquement
après vérification des deux images sur Docker Hub. Il ne contient aucun secret.
Le script `deploy/deploy-vps.sh` est lancé sur le VPS après avoir récupéré le
commit du manifeste. Il vérifie Compose et les fichiers privés existants, exige
une nouvelle sauvegarde complète, tire les deux images, puis recrée uniquement
le backend et le frontend. Il attend les six healthchecks, vérifie les IDs des
images réellement exécutées, `/api/health` et la page HTML servie publiquement.
Une erreur arrête la procédure ; elle ne supprime aucun volume.

Le dossier actuel du VPS est un instantané sans répertoire `.git`. Depuis une
copie locale propre du dépôt, transférer le commit choisi sans supprimer les
fichiers privés du serveur :

```bash
git archive --format=tar HEAD | ssh ubuntu@57.131.160.254 'sudo tar -xf - -C /opt/oumou-salamat'
```

Le transfert ne supprime pas les fichiers du VPS absents de Git. Vérifier avant
chaque transfert que `deploy/production.env` pointe vers deux images déjà
publiées sur Docker Hub. Ensuite, dans une session SSH :

```bash
cd /opt/oumou-salamat
sudo bash deploy/deploy-vps.sh
```

Pour revenir à une image précédente, changer `APP_VERSION` dans
`deploy/production.env` vers le SHA précédent dont les deux images existent
encore sur Docker Hub, committer ce changement sur `main`, transférer le nouveau
commit avec la commande `git archive` ci-dessus puis relancer
`sudo bash deploy/deploy-vps.sh`. Cette opération
effectue une nouvelle sauvegarde. Si le schéma de base a changé, examiner sa
compatibilité avec l'ancien backend avant le retour arrière : le démarrage du
backend applique `prisma db push`.

## Commandes d'exploitation

Toutes les commandes suivantes s'exécutent dans le terminal SSH du VPS :

```bash
cd /opt/oumou-salamat
set -a; . deploy/production.env; set +a
sudo --preserve-env=APP_VERSION docker compose -f docker-compose.yml -f docker-compose.vps.yml ps
sudo --preserve-env=APP_VERSION docker compose -f docker-compose.yml -f docker-compose.vps.yml logs --tail=50 backend keycloak caddy
```

Les données des deux bases et les documents utilisent des volumes persistants.
Ne pas lancer `docker compose down -v` et ne pas rejouer le seed de démonstration.
Le démarrage du backend applique actuellement `prisma db push` : sauvegarder
et revoir toute modification de schéma avant une mise à jour.

## Sauvegardes

`deploy/backup.sh` sauvegarde les deux bases et les documents dans
`/var/backups/oumou-salamat/daily/`, avec des fichiers privés. Seules les deux
sauvegardes complètes les plus récentes sont conservées pour économiser l'espace disque. Seules les sauvegardes complètes sont publiées. Le timer
`oumou-salamat-backup.timer` les lance chaque jour à 02 h, heure de Tunis,
avec un décalage aléatoire maximal de dix minutes.

```bash
sudo systemctl list-timers oumou-salamat-backup.timer
sudo systemctl start oumou-salamat-backup.service
sudo journalctl -u oumou-salamat-backup.service --no-pager -n 20
```

Ces sauvegardes restent sur le disque du VPS. Une copie sur une autre machine
est nécessaire pour conserver les données en cas de perte du VPS.

## Reproduire un premier déploiement

Une fois les sources et le manifeste de version transférés dans un dossier neuf
sur le serveur, et après disponibilité des deux images Docker Hub :

```bash
cd /opt/oumou-salamat
sudo python3 deploy/bootstrap.py --app-host assakina-school.com --auth-host auth.assakina-school.com
sudo docker volume create oumou_salamat_vps_postgres_data
set -a; . deploy/production.env; set +a
sudo --preserve-env=APP_VERSION docker compose -f docker-compose.yml -f docker-compose.vps.yml config --quiet
sudo --preserve-env=APP_VERSION docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d --no-build --wait --wait-timeout 300
```

Pour installer aussi les sauvegardes sur un nouveau serveur :

```bash
cd /opt/oumou-salamat
sudo chmod 700 deploy/backup.sh
sudo install -m 644 deploy/oumou-salamat-backup.service deploy/oumou-salamat-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now oumou-salamat-backup.timer
sudo systemctl start oumou-salamat-backup.service
```

Après activation de la variable GitHub `VPS_AUTO_DEPLOY_ENABLED=true`, chaque
push sur `main` lance les tests, publie les deux images puis déploie ce même SHA.
Les secrets `VPS_SSH_KEY` et `VPS_KNOWN_HOSTS` fournissent une clé dédiée et
l'identité vérifiée du serveur. La clé est limitée par `authorized_keys` à
`/usr/local/bin/assakina-receive-release` ; elle ne donne pas de shell interactif.

Le récepteur accepte uniquement le SHA actuel de `main`, sauvegarde les données,
télécharge l'archive publique du dépôt et préserve les fichiers privés. Il écrit
le SHA publié dans le manifeste **du serveur**, puis lance les vérifications de
`deploy-vps.sh`. Le manifeste Git reste utilisé pour les opérations manuelles :
vérifier sa version avant tout transfert manuel. Désactiver la variable avant
un retour arrière manuel afin de conserver la version choisie.

## Ajouter un domaine ensuite

Créer les enregistrements DNS de l'application et de l'authentification vers
le VPS, puis mettre à jour `.env`, CORS, les origines/redirections du client
Keycloak et l'attribut `frontendUrl` du realm existant. Recréer les services et
vérifier une nouvelle connexion. Conserver les bases, documents et mots de passe.
Le script de bootstrap sert uniquement à initialiser une installation neuve.

## Activer les e-mails avec Zimbra OVH

Le script `deploy/configure-email.py` configure la boîte
`contact@assakina-school.com` dans le service de connexion existant. Il demande
son mot de passe dans un terminal interactif, teste une connexion SMTP chiffrée
vers `smtp.mail.ovh.net:465`, envoie un message de test à cette même boîte puis
enregistre les paramètres. Le secret ne figure ni dans Git ni dans la commande.

```bash
ssh -t ubuntu@57.131.160.254 'sudo python3 /opt/oumou-salamat/deploy/configure-email.py'
```

Vérifier la réception du test dans Zimbra, puis demander un lien depuis
**Mon profil** avec une adresse réelle. Aucun redémarrage n'est nécessaire.
La vérification obligatoire des adresses et le double facteur restent distincts
et ne sont pas activés par ce script.

## Double facteur et récupération de mot de passe

Dans **Mon profil**, les utilisateurs ayant une adresse vérifiée peuvent demander
un e-mail d’activation du deuxième facteur. Le lien configure un authentificateur
TOTP natif ; les nouvelles connexions exigent alors le mot de passe et le code.
Les comptes existants ne sont pas bloqués tant que leur activation n’est pas
terminée. Le changement de mot de passe accepte aussi le code TOTP.

Sur la connexion, **Mot de passe oublié ?** envoie une action UPDATE_PASSWORD
à l’adresse du compte actif. Les liens ont une durée de 15 minutes. Les réponses
restent identiques pour les adresses absentes, désactivées ou limitées. Les
demandes sont limitées à cinq par adresse IP et deux par adresse e-mail en
quinze minutes, en mémoire du processus. Le deuxième facteur est conservé lors
de la récupération du mot de passe. En cas de téléphone perdu, une récupération
d’identité par l’administration est nécessaire ; aucun retrait automatique du
facteur n’est proposé. Les paramètres OTP natifs du realm doivent être conservés.

## Retour arrière en cas d'échec

Avant de remplacer les conteneurs, le script enregistre les IDs exacts des deux
images exécutées et le chemin de la nouvelle sauvegarde complète dans
`deploy/last-release.json`, privé et exclu de Git. Un échec du démarrage, d'un
healthcheck ou des contrôles HTTPS déclenche automatiquement le retour aux
images précédentes. Le pipeline reste en échec, même si le retour arrière réussit.

Le retour arrière vérifie les labels SHA et les IDs des anciennes images, attend
leurs healthchecks et contrôle les accès publics. Il conserve les bases et les
documents. Le backend ancien démarre directement, sans `prisma db push`, pour
préserver les nouvelles colonnes. Cette livraison ajoute uniquement des colonnes
facultatives ou munies de valeurs par défaut ; elle reste compatible avec l'ancien
backend. Une migration destructive future doit faire l'objet d'une autre stratégie.

Pour déclencher manuellement le même retour arrière :

```bash
cd /opt/oumou-salamat
sudo bash deploy/rollback-vps.sh
```

Ne pas restaurer automatiquement une base après que des utilisateurs ont saisi
des données : cela ferait perdre leurs nouvelles actions. La sauvegarde reste
disponible pour une restauration examinée séparément. Après un retour arrière,
ne pas recréer l'ancien backend avec le Compose seul : relancer le script de
retour arrière (qui préserve le schéma) ou publier une version corrigée.

Quatre scénarios sont vérifiés dans la CI avec des services simulés : démarrage
échoué, healthcheck échoué, contrôle public échoué et déploiement réussi.

## Gestion financière, continuité et sauvegarde Google Drive

Voir [les nouvelles fonctions et leur vérification](version-prochaine-suivi.md).
Les sauvegardes externes utilisent rclone crypt ; l’autorisation Google et la
clé de récupération sont privées et exclues de Git. Le timer
`assakina-offsite-backup.timer` copie les sauvegardes à 03 h, heure de Tunis.
`assakina-monitor.timer` vérifie les services toutes les cinq minutes.

```bash
sudo systemctl list-timers assakina-offsite-backup.timer assakina-monitor.timer
sudo systemctl start assakina-offsite-backup.service
sudo python3 /opt/oumou-salamat/deploy/test-restore.py
sudo journalctl -u assakina-monitor.service --no-pager -n 20
```
