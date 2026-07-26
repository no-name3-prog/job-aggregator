#!/usr/bin/env bash
# Same steps as GitHub Actions (local).
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-all}"
export JOB_RETENTION_DAYS="${JOB_RETENTION_DAYS:-15}"

echo "==> mode=$MODE retentionDays=$JOB_RETENTION_DAYS"
if [[ "$MODE" == "all" || "$MODE" == "general-only" ]]; then
  npm run ingest
fi
if [[ "$MODE" == "all" || "$MODE" == "de-only" ]]; then
  npm run ingest:de
fi
if [[ -n "${MONGODB_URI:-}" ]]; then
  echo "==> syncing to Mongo (+ prune in sync)"
  npm run sync:jobs
else
  echo "==> MONGODB_URI not set — JSON only"
fi

echo "==> prune stale JSON + store"
npm run prune:jobs

mkdir -p data
node -e '
const fs=require("fs");
fs.writeFileSync("data/ci-status.json", JSON.stringify({
  lastCiIngestAt: new Date().toISOString(),
  local: true,
  hasMongo: Boolean(process.env.MONGODB_URI),
  retentionDays: Number(process.env.JOB_RETENTION_DAYS || 15),
}, null, 2) + "\n");
'
echo "Done. Check data/ and data/data-engineer/"
