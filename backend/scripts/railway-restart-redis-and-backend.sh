#!/usr/bin/env bash
# Restart Redis and redeploy backend on Railway so workers and dashboard jobs run again.
# Requires: Railway CLI installed and project linked (e.g. run from backend/ with railway link).
# Usage: from repo root, ./backend/scripts/railway-restart-redis-and-backend.sh
#        or from backend/, ./scripts/railway-restart-redis-and-backend.sh

set -e

if ! command -v railway &>/dev/null; then
  echo "Railway CLI not found. Install it from https://docs.railway.app/develop/cli and run 'railway link' from the backend directory."
  exit 1
fi

cd "$(dirname "$0")/.."

echo "Restarting Redis..."
railway service restart -s Redis -y

echo "Redeploying backend..."
railway service redeploy -s ivan-reseller-backend -y

echo "Done. Check Control Center (Redis and Workers should turn ok after the backend finishes deploying)."
