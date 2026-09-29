#!/usr/bin/env bash
# Bharat Raksha AI — local dev (Docker infra + Next.js)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "▶ Starting Docker (postgres, neo4j, redis, minio, ai)…"
docker compose up -d

echo "▶ Syncing Prisma client + database schema…"
if ! node "$ROOT/node_modules/prisma/build/index.js" generate --schema=packages/database/prisma/schema.prisma 2>/dev/null; then
  echo "   Local prisma generate slow/failed — using Docker fallback…"
  docker run --rm \
    -v "$ROOT/packages/database/prisma/schema.prisma:/schema.prisma:ro" \
    -v "$ROOT/node_modules/.prisma:/host-prisma" \
    node:20-bookworm-slim \
    bash -lc '
      apt-get update -qq && apt-get install -y -qq openssl ca-certificates >/dev/null
      mkdir -p /gen/prisma && cp /schema.prisma /gen/prisma/schema.prisma
      cd /gen && npm init -y >/dev/null 2>&1
      npm install prisma@6.5.0 @prisma/client@6.5.0 >/dev/null 2>&1
      npx prisma generate --schema=prisma/schema.prisma
      rm -rf /host-prisma/client && mkdir -p /host-prisma/client
      cp -R node_modules/.prisma/client/* /host-prisma/client/
    '
fi

export DATABASE_URL="${DATABASE_URL:-postgresql://bharatraksha:bharatraksha_secret@localhost:5432/bharatraksha?schema=public}"
node "$ROOT/node_modules/prisma/build/index.js" db push --schema=packages/database/prisma/schema.prisma --accept-data-loss 2>/dev/null \
  || docker run --rm --network bharatraksha-ai_default \
    -v "$ROOT/packages/database/prisma:/prisma:ro" \
    -e DATABASE_URL="postgresql://bharatraksha:bharatraksha_secret@bharat-raksha-postgres:5432/bharatraksha?schema=public" \
    node:20-bookworm-slim \
    bash -lc 'apt-get update -qq && apt-get install -y -qq openssl ca-certificates >/dev/null && cd /tmp && npm init -y >/dev/null 2>&1 && npm install prisma@6.5.0 >/dev/null 2>&1 && npx prisma db push --schema=/prisma/schema.prisma --accept-data-loss --skip-generate'

export NEXTAUTH_URL="${NEXTAUTH_URL:-http://localhost:3000}"
export AUTH_TRUST_HOST=true

echo "▶ Starting web on http://localhost:3000"
exec npm run dev
