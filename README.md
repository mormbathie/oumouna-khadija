# 🏫 École Institut Oumouna Khadija

Système de gestion scolaire complet pour une école primaire, construit avec **NestJS**, **React**, **PostgreSQL** et **Keycloak**.

---

## ✨ Fonctionnalités

| Module | Description |
|--------|-------------|
| 🔐 **Authentification** | Keycloak (OIDC/JWT) et rôles applicatifs |
| 👨‍🎓 **Élèves** | Inscription, dossier, suivi par classe |
| 👨‍👩‍👧 **Parents** | Gestion des contacts, association aux élèves |
| 🏫 **Classes** | Gestion des salles de CI à CM2, matières |
| 💰 **Finances** | Factures, paiements, reçus imprimables |
| 📝 **Notes** | Saisie des notes, génération des bulletins |
| 📅 **Présences** | Appel quotidien, gestion absences/retards, scan QR avec heure d’arrivée |
| 📊 **Tableau de bord** | KPIs en temps réel |

---

### Scanner QR et contrôle des présences

Chaque dossier élève affiche sa photo, ses informations et un QR téléchargeable. Le QR contient un identifiant interne, sans données personnelles. Depuis **Scanner les QR codes**, la caméra démarre directement : le contrôleur scanne la carte ou saisit le matricule, et la classe est retrouvée automatiquement. Le premier scan inscrit l’élève présent et enregistre son heure d’arrivée ; les scans suivants ne modifient pas cette heure.

Les élèves non pointés apparaissent dans la liste de la classe. À la fin de l’appel, **Clôturer toutes les classes** enregistre leurs absences pour l’année en cours ; il est aussi possible de clôturer une seule classe. Un scan tardif corrige l’absence en présence et conserve l’heure d’arrivée. La caméra du navigateur nécessite localhost ou une connexion HTTPS ; la saisie du matricule reste disponible comme solution de secours.

L’administrateur peut créer un compte avec le rôle **Contrôleur de présence** depuis la gestion des utilisateurs. Les nouveaux déploiements importent ce rôle depuis le realm Keycloak; sur un realm existant, sa création est automatique au premier ajout d’un utilisateur ayant ce rôle.

---

## 🛠️ Stack Technique

| Couche | Technologie |
|--------|-------------|
| **Backend** | NestJS 11, TypeScript, Prisma ORM 6 |
| **Frontend** | React 19, Vite 8, Tailwind CSS v4 |
| **Base de données** | PostgreSQL 16 |
| **Auth** | Keycloak 24.0.5 (OpenID Connect / JWT) |
| **API docs** | Swagger (`/api/docs`) |

---

## 🚀 Démarrage Rapide

### Prérequis
- Docker & Docker Compose
- Node.js 20+
- npm 10+

### 1. Lancer l'infrastructure (PostgreSQL + Keycloak)

```bash
docker-compose up -d
```

> ⏳ Attendez ~30 secondes que Keycloak soit prêt.

Vérifiez que les conteneurs tournent :
```bash
docker ps | grep oumouna_khadija
```

### 2. Backend (NestJS)

```bash
cd backend
npm install

# Créer/migrer la base de données
npx prisma db push

# Insérer les données de test
npx prisma db seed

# Lancer en développement
npm run start:dev
```

Le backend démarre sur **http://localhost:3001**  
Swagger disponible sur **http://localhost:3001/api/docs**

### 3. Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

L'application s'ouvre sur **http://localhost:5173**

---

## 🔑 Accès et Comptes de Test

### Interface web
Ouvrez **http://localhost:5173** dans votre navigateur.

Connectez-vous avec un utilisateur du realm Keycloak `oumouna-khadija`. Les comptes du tableau ci-dessous sont importés lors de la première initialisation de ce realm.

### Comptes Keycloak (Keycloak sur http://localhost:8080)

| Utilisateur | Mot de passe | Rôle |
|-------------|-------------|------|
| `admin` | `admin123` | ADMIN |
| `comptable` | `comptable123` | COMPTABLE |
| `enseignant` | `enseignant123` | ENSEIGNANT |
| `parent` | `parent123` | PARENT |

### Console d'administration Keycloak
- URL : http://localhost:8080
- Login : `admin` / `admin`
- Realm de l'application : `oumouna-khadija` (le realm `master` contient les comptes d'administration Keycloak)
- Pour ajouter `mormbathie98` ou un autre utilisateur, connectez-vous comme `admin`, puis créez-le dans **Utilisateurs** dans l'application.

---

## 📁 Structure du Projet

```
Oumouna Khadija 2027/
├── docker-compose.yml          # PostgreSQL + Keycloak
├── keycloak/
│   └── realm-export.json       # Config Keycloak auto-importée
├── backend/
│   ├── src/
│   │   ├── auth/               # JWT, Guards, Decorators
│   │   ├── classes/            # Gestion des classes
│   │   ├── parents/            # Gestion des parents
│   │   ├── students/           # Gestion des élèves
│   │   ├── finances/           # Factures et paiements
│   │   ├── grades/             # Notes et bulletins
│   │   ├── attendance/         # Présences et absences
│   │   └── dashboard/          # Statistiques globales
│   ├── prisma/
│   │   ├── schema.prisma       # Schéma BDD (13 modèles)
│   │   └── seed.ts             # Données de démonstration
│   └── .env                    # Variables d'environnement
└── frontend/
    └── src/
        ├── auth/               # Keycloak + AuthContext
        ├── components/         # Layout, composants partagés
        ├── pages/              # 8 pages de l'application
        └── services/           # Client API Axios
```

---

## 🔧 Variables d'Environnement

### Backend — `backend/.env`
```env
DATABASE_URL="postgresql://postgres:postgrespassword@localhost:5434/oumouna_khadija_db?schema=public"
KEYCLOAK_AUTH_SERVER_URL="http://localhost:8080"
KEYCLOAK_INTERNAL_URL="http://localhost:8080"
KEYCLOAK_REALM="oumouna-khadija"
KEYCLOAK_CLIENT_ID="oumouna-khadija-app"
NODE_ENV="development"
PORT=3001
```

> ⚠️ PostgreSQL utilise le **port 5434** (5432 et 5433 occupés par d'autres services).

---

## 🏗️ Modèle de Données

```
User ──────────── authentification & rôles
AcademicYear ──── année scolaire (ex: 2026-2027)
Classroom ─────── classes (CI, CP, CE1, CE2, CM1, CM2)
Subject ───────── matières (Maths, Français, etc.)
Parent ────────── parents d'élèves
Student ───────── élèves
  └── Enrollment ── inscription par année/classe
  └── Grade ─────── notes par matière/trimestre
  └── ReportCard ── bulletins générés
  └── Invoice ───── factures de scolarité
      └── Payment ─ paiements effectués
  └── Attendance ── présences quotidiennes
```

---

## 📡 API REST

Tous les endpoints sont préfixés par `/api` :

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `POST` | `/api/auth/login` | Connexion via Keycloak |
| `POST` | `/api/auth/refresh` | Renouvellement de session par cookie sécurisé |
| `GET` | `/api/auth/me` | Profil utilisateur connecté |
| `GET` | `/api/dashboard/summary` | Statistiques globales |
| `GET/POST` | `/api/students` | Liste / création d'élèves |
| `GET/POST` | `/api/parents` | Liste / création de parents |
| `GET/POST` | `/api/classes` | Liste / création de classes |
| `GET/POST` | `/api/finances/invoices` | Factures |
| `GET/POST` | `/api/finances/payments` | Paiements |
| `GET/POST` | `/api/grades` | Notes |
| `GET/POST` | `/api/attendance` | Appel manuel, statistiques et historique |
| `GET` | `/api/attendance/scan/roster/:classroomId` | Liste de pointage QR d’une classe |
| `POST` | `/api/attendance/scan` | Présence et heure du premier scan |
| `POST` | `/api/attendance/scan/finalize` | Clôture de l’appel et enregistrement des absences |
| `POST` | `/api/attendance/scan/finalize-all` | Clôture des classes de l’année en cours |

📖 Documentation complète : **http://localhost:3001/api/docs**

---

## 🛡️ Sécurité et Rôles

| Rôle | Accès |
|------|-------|
| `ADMIN` | Accès total |
| `DIRECTEUR` | Accès total sauf administration système |
| `COMPTABLE` | Finances, tableau de bord |
| `ENSEIGNANT` | Notes, présences, classes |
| `PARENT` | Consultation dossier enfant uniquement |
| `CONTROLEUR_PRESENCE` | Scanner QR, pointer les arrivées et clôturer les absences |

Les rôles sont vérifiés à partir du jeton Keycloak. Aucun mode de connexion sans jeton n'est activé.

---

## 🐛 Dépannage

### Le backend ne démarre pas
```bash
# Vérifier les logs
cd backend && npm run start:dev

# Vérifier la connexion BDD
cd backend && npx prisma studio
```

### Erreur de connexion BDD
```bash
# Vérifier que PostgreSQL tourne
docker ps | grep oumouna_khadija_postgres

# Relancer si nécessaire
docker-compose up -d postgres
```

### Keycloak inaccessible
```bash
docker-compose up -d keycloak
# Attendre 30 secondes puis recharger http://localhost:8080
```

### Persistance et sauvegardes

PostgreSQL réutilise le volume externe `oumounakhadija2027_postgres_data`, créé avant le changement de nom du projet Compose. Les utilisateurs Keycloak sont maintenant stockés dans un volume PostgreSQL persistant distinct. Un redémarrage avec `docker compose up -d` conserve les deux bases. Sur un nouvel hôte, créez le volume externe avant le premier démarrage : `docker volume create ${POSTGRES_VOLUME_NAME:-oumounakhadija2027_postgres_data}`.

Ne lancez pas `docker compose down -v` : l'option `-v` supprime les volumes et les données. Avant une mise en production, configurez `POSTGRES_VOLUME_NAME`, `POSTGRES_PASSWORD`, `KEYCLOAK_DB_PASSWORD` et `KEYCLOAK_ADMIN_PASSWORD` dans un fichier `.env` protégé, utilisez des mots de passe uniques, et placez l'application derrière HTTPS. Préparez et vérifiez des sauvegardes régulières des deux bases.

Le conteneur ne lance jamais le seed de démonstration au démarrage. Pour une base locale vide, lancez-le manuellement :
```bash
cd backend
npx prisma db seed
```

Le seed de démonstration réinitialise ses tables. Ne l'exécutez pas sur une base contenant des données.

## Déploiement et CI/CD

Le [premier déploiement sur le VPS OVH](docs/deploiement-vps.md) héberge le
frontend et les services persistants avec HTTPS sur une adresse temporaire,
sans achat de nom de domaine.

Le workflow GitHub Actions vérifie le frontend et le backend, puis publie le
frontend sur Vercel après réussite des contrôles : `main` pour la production,
`develop` pour une preview. L'activation nécessite les secrets Vercel et la
variable GitHub `VERCEL_DEPLOY_ENABLED=true`.

Suivre le [guide de déploiement](docs/deploiement-vercel.md) pour configurer
Vercel, les variables publiques, CORS et l'hébergement persistant de l'API,
de PostgreSQL, de Keycloak et des documents.
