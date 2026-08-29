#!/usr/bin/env bash
# One-command local startup: infra, deps, env, migrations, seed.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Checking prerequisites"
command -v docker >/dev/null || { echo "docker is required"; exit 1; }
command -v pnpm >/dev/null || { echo "pnpm is required"; exit 1; }

if [ ! -f .env ]; then
  echo "==> Creating .env from .env.example"
  cp .env.example .env
fi

echo "==> Starting local infrastructure (postgres, redis, minio)"
docker compose up -d --wait

echo "==> Installing dependencies"
pnpm install

echo "==> Running database migrations"
pnpm db:migrate

echo "==> Seeding development data"
pnpm db:seed

echo ""
echo "Done. Start the stack with:"
echo "  pnpm dev            # all apps via turbo"
echo "Apps: web http://localhost:3000 | api http://localhost:3001 | widget http://localhost:3002"
