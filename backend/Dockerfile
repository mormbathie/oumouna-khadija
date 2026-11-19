# ─────────────────────────────────────────────
# Stage 1 : Build
# ─────────────────────────────────────────────
FROM node:22-alpine AS builder

# Prisma utilise OpenSSL pour sélectionner et exécuter son moteur natif.
RUN apk add --no-cache openssl

WORKDIR /app

# Copie des manifests et du schéma Prisma
COPY package*.json ./
COPY prisma ./prisma/

# Installation de toutes les dépendances (dev inclus pour le build)
RUN npm ci
RUN ILA_IP_LOCATION_DB=iptoasn-country ILA_AUTO_UPDATE=false ILA_SILENT=true node node_modules/ip-location-api/script/updatedb.cjs

# Génération du client Prisma
RUN npx --no-install prisma generate

# Copie du code source et compilation TypeScript
COPY . .
RUN npm run build

# Ne garder que les dépendances de production (le client Prisma généré, le CLI Prisma
# et les données de géolocalisation restent dans node_modules), sans cache npm.
RUN npm prune --omit=dev && npx --no-install prisma --version && npm cache clean --force

# ─────────────────────────────────────────────
# Stage 2 : Production
# ─────────────────────────────────────────────
FROM node:22-alpine AS production
ARG APP_REVISION=unknown
LABEL org.opencontainers.image.revision=$APP_REVISION

RUN apk add --no-cache openssl

WORKDIR /app

# Dépendances de production déjà préparées et vérifiées dans le stage builder :
# une seule couche, sans cache npm ni copie en double du client Prisma.
COPY package*.json ./
COPY prisma ./prisma/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
ENV ILA_IP_LOCATION_DB=iptoasn-country ILA_AUTO_UPDATE=false ILA_SILENT=true

# Script de démarrage
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["./entrypoint.sh"]
