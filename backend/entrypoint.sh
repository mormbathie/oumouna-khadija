#!/bin/sh
set -e

echo "⏳ Attente de la base de données PostgreSQL..."
until node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.\$connect().then(() => { console.log('ok'); process.exit(0); }).catch(() => process.exit(1));
" 2>/dev/null; do
  echo "   PostgreSQL pas encore prêt — nouvelle tentative dans 3s..."
  sleep 3
done

echo "✅ Base de données accessible."

echo "🔄 Application du schéma Prisma..."
node prisma/apply-financial-options.cjs
npx --no-install prisma db push --skip-generate
node prisma/apply-class-fees.cjs

echo "ℹ️  Les données de démonstration ne sont jamais rejouées au démarrage."
echo "   Pour une base locale vide, lancez le seed manuellement depuis backend/."

echo "🚀 Démarrage NestJS sur le port ${PORT:-3001}..."
exec node --require ./dist/src/telemetry.js dist/src/main.js
