# ─────────────────────────────────────────────
# Stage 1 : Build React avec Vite
# ─────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Adresses publiques accessibles depuis le navigateur, définies au build
ARG VITE_API_URL=/api
ARG VITE_KEYCLOAK_URL=http://localhost:8080
ARG VITE_KEYCLOAK_REALM=oumouna-khadija
ARG VITE_KEYCLOAK_CLIENT_ID=oumouna-khadija-app

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL
ENV VITE_KEYCLOAK_REALM=$VITE_KEYCLOAK_REALM
ENV VITE_KEYCLOAK_CLIENT_ID=$VITE_KEYCLOAK_CLIENT_ID

RUN npm run build

# ─────────────────────────────────────────────
# Stage 2 : Serveur Nginx
# ─────────────────────────────────────────────
FROM nginx:1.27-alpine AS production
ARG APP_REVISION=unknown
LABEL org.opencontainers.image.revision=$APP_REVISION

# Copie des fichiers buildés
COPY --from=builder /app/dist /usr/share/nginx/html

# Configuration Nginx personnalisée
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
