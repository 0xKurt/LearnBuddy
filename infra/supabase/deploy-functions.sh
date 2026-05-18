#!/usr/bin/env bash
# Deploy all Edge Functions in this folder to the configured Supabase project.
# Doc 02 §observability + Doc 09 §DSGVO.
#
# Usage:
#   SUPABASE_PROJECT_REF=abcdefghijklm ./infra/supabase/deploy-functions.sh
#
# Or (CI-friendly) export SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF and
# call it from the project root.
#
# The four functions deployed are scheduled by `0011_pg_cron_schedule.sql`.

set -euo pipefail

if ! command -v supabase >/dev/null 2>&1; then
  echo "supabase CLI not found. Install it: https://supabase.com/docs/guides/cli" >&2
  exit 1
fi

if [[ -z "${SUPABASE_PROJECT_REF:-}" ]]; then
  echo "Set SUPABASE_PROJECT_REF to the project's reference id." >&2
  exit 1
fi

cd "$(dirname "$0")/functions"

for fn in photo-wipe dsgvo-export-worker dsgvo-delete-executor reconcile-revenuecat; do
  if [[ ! -d "$fn" ]]; then
    echo "skip: $fn (directory missing)"
    continue
  fi
  echo "→ deploying $fn"
  supabase functions deploy "$fn" --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt
done

echo "✔ all functions deployed. cron schedule lives in migration 0011."
