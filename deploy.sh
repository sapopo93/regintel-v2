#!/usr/bin/env bash
# deploy.sh — Single-command production deploy for RegIntel v2
# Usage: bash deploy.sh
#
# Safe to run from SSH, CI, or locally on the server.
# Idempotent: can be re-run without side effects.

set -euo pipefail

echo "==> Pulling latest code from main..."
git pull origin main

echo "==> Installing dependencies..."
pnpm install --frozen-lockfile

echo "==> Running database migrations..."
cd apps/api
pnpm db:deploy
cd ../..

echo "==> Building web app..."
cd apps/web
pnpm build
cd ../..

echo "==> Reloading PM2 processes..."
pm2 reload ecosystem.config.cjs

echo "==> Deploy complete. Checking process status..."
pm2 list
