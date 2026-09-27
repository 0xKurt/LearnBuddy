#!/usr/bin/env bash
# Deploy checks (docs/architecture.md §Delivery): Vercel config through Vercel's own detector,
# and — when the variables are set — database TLS/region/grants (DATABASE_URL,
# DATABASE_CA_CERT) and a /v1/health smoke of a deploy (LB_DEPLOY_URL).
# Run in CI and before promoting a deploy. See apps/api/scripts/deploy-check.ts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FS_DETECTORS_VERSION="7.7.3"
export LB_FS_DETECTORS_DIR="${LB_FS_DETECTORS_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/lb-fs-detectors-$FS_DETECTORS_VERSION}"

if [ ! -d "$LB_FS_DETECTORS_DIR/node_modules/@vercel/fs-detectors" ]; then
  mkdir -p "$LB_FS_DETECTORS_DIR"
  [ -f "$LB_FS_DETECTORS_DIR/package.json" ] || echo '{"private":true}' >"$LB_FS_DETECTORS_DIR/package.json"
  npm install --prefix "$LB_FS_DETECTORS_DIR" --no-audit --no-fund --silent \
    "@vercel/fs-detectors@$FS_DETECTORS_VERSION"
fi

cd "$ROOT/apps/api"
exec pnpm exec tsx scripts/deploy-check.ts
