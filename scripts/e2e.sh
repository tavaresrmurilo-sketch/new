#!/usr/bin/env bash
# E2E: banco dedicado + build de produção isolado (.next-e2e) + Playwright (mobile e desktop).
# Uso: npm run test:e2e   (variáveis opcionais: E2E_DATABASE_URL, E2E_PORT)
set -euo pipefail
cd "$(dirname "$0")/.."

export E2E_DATABASE_URL="${E2E_DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/mixtour_e2e?schema=public}"
export DATABASE_URL="$E2E_DATABASE_URL"
export E2E_PORT="${E2E_PORT:-3100}"
export APP_URL="http://localhost:$E2E_PORT"
export NEXT_PUBLIC_APP_URL="$APP_URL"
export AUTH_SECRET="${AUTH_SECRET:-e2e-secret-e2e-secret-e2e-secret-0123456789}"
export ADMIN_EMAIL="admin@e2e.mixtour.test" ADMIN_PASSWORD="Admin-E2E-Mixtour-2026" ADMIN_NAME="Admin E2E"
export EMAIL_PROVIDER=none GEOCODER=none STORAGE_DRIVER=local STORAGE_LOCAL_DIR=./storage/e2e-uploads
export STRIPE_SECRET_KEY="" STRIPE_WEBHOOK_SECRET="" CRON_SECRET="e2e-cron-secret"
export NEXT_PUBLIC_MAP_STYLE_DARK=blank NEXT_PUBLIC_MAP_STYLE_LIGHT=blank
export NEXT_DIST_DIR=.next-e2e

# recria o banco de E2E (requer psql)
DB_NAME="$(echo "$E2E_DATABASE_URL" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')"
ADMIN_URL="$(echo "$E2E_DATABASE_URL" | sed -E "s#/${DB_NAME}(\?.*)?\$#/postgres#")"
psql "$ADMIN_URL" -q -c "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE)" -c "CREATE DATABASE \"$DB_NAME\""
npx prisma migrate deploy >/dev/null
npx tsx prisma/seed.ts
rm -rf ./storage/e2e-uploads

if [ "${E2E_SKIP_BUILD:-}" != "1" ]; then
  npx next build
fi
npx playwright test "$@"
