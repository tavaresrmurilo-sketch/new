#!/usr/bin/env bash
# Hook de início de sessão (Claude Code): deixa o ambiente pronto para rodar o app e os testes.
# Idempotente e silencioso; nunca falha a sessão.
set -u
cd "$(dirname "$0")/.." || exit 0

[ -d node_modules ] || npm install --no-audit --no-fund >/dev/null 2>&1 || true

if command -v pg_isready >/dev/null 2>&1 && ! pg_isready -q 2>/dev/null; then
  (service postgresql start || sudo service postgresql start) >/dev/null 2>&1 || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do pg_isready -q 2>/dev/null && break; sleep 1; done
fi

if pg_isready -q 2>/dev/null; then
  for db in mixtour mixtour_test; do
    PGPASSWORD=postgres psql -h localhost -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" 2>/dev/null | grep -q 1 \
      || PGPASSWORD=postgres psql -h localhost -U postgres -qc "CREATE DATABASE $db" >/dev/null 2>&1 || true
  done
  [ -f .env ] && npx prisma migrate deploy >/dev/null 2>&1 || true
fi
exit 0
