#!/bin/sh
set -eu

PRISMA_BIN=${PRISMA_BIN:-/app/node_modules/.bin/prisma}
NEXT_BIN=${NEXT_BIN:-/app/node_modules/next/dist/bin/next}

echo "[entrypoint] Waiting for PostgreSQL..."
node ./scripts/wait-for-db.mjs

echo "[entrypoint] Syncing Prisma schema..."
if [ "${PRISMA_DB_SYNC_MODE:-deploy}" = "deploy" ]; then
  "$PRISMA_BIN" migrate deploy
else
  "$PRISMA_BIN" db push
fi

echo "[entrypoint] Starting Next.js on port ${PORT:-3000}..."
exec node "$NEXT_BIN" start -p "${PORT:-3000}"
