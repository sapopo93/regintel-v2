#!/usr/bin/env bash
# deploy.sh — Single-command production deploy for RegIntel v2
# Usage: bash deploy.sh
#
# Safe to run from SSH, CI, or locally on the server.
# Idempotent: can be re-run without side effects.
# Includes post-deploy health check with automatic rollback on failure.

set -euo pipefail

echo "=== RegIntel v2 Deploy ==="

# Save current commit for rollback
PREV_COMMIT=$(git rev-parse HEAD)

echo "[1/7] Pulling latest code from main..."
git pull origin main

echo "[2/7] Installing dependencies..."
pnpm install --frozen-lockfile

echo "[3/7] Running database migrations..."
cd apps/api
pnpm db:deploy
cd ../..

echo "[4/7] Building web app..."
cd apps/web
pnpm build
cd ../..

echo "[5/7] Preparing logs directory..."
mkdir -p logs

echo "[6/7] Reloading PM2 processes..."
pm2 reload ecosystem.config.cjs

echo "[7/7] Post-deploy health check..."
sleep 5
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health || echo "000")
if [ "$HTTP_STATUS" -ne 200 ]; then
  echo "ERROR: Health check failed (HTTP $HTTP_STATUS). Rolling back to $PREV_COMMIT..."
  git checkout "$PREV_COMMIT"
  pnpm install --frozen-lockfile
  cd apps/web && pnpm build && cd ../..
  pm2 reload ecosystem.config.cjs
  echo "ROLLED BACK to $PREV_COMMIT. Investigate the failed deploy."
  exit 1
fi

echo "=== Deploy complete. Health check passed. ==="
pm2 list
