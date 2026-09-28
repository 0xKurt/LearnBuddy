#!/usr/bin/env sh
# Builds the app for the web against the local dev stack and walks through the
# core loop in Chromium (tests/web). Needs a local Postgres (see docs/architecture.md §Testing).
set -e
cd "$(dirname "$0")/.."
# Ports can be moved out of the way when Metro (8081) or another local server (8787)
# already uses them: LB_WEB_PORT / LB_API_PORT (issue #42).
API_PORT="${LB_API_PORT:-8787}"
export LB_API_PORT="$API_PORT"
(
  cd apps/mobile
  EXPO_PUBLIC_API_URL=http://localhost:$API_PORT \
  EXPO_PUBLIC_SUPABASE_URL=http://localhost:$API_PORT \
  EXPO_PUBLIC_SUPABASE_ANON_KEY=dev-anon-key \
  # --clear: Metro's transform cache keeps the EXPO_PUBLIC_* values it inlined the last
  # time, so without it the walkthrough silently talks to the previous run's API port.
  npx expo export --platform web --output-dir dist-web --clear
)
npx playwright test "$@"
