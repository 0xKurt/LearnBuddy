#!/usr/bin/env sh
# Builds the app for the web against the local dev stack and walks through the
# core loop in Chromium (tests/web). Needs a local Postgres (see docs/architecture.md §Testing).
set -e
cd "$(dirname "$0")/.."
(
  cd apps/mobile
  EXPO_PUBLIC_API_URL=http://localhost:8787 \
  EXPO_PUBLIC_SUPABASE_URL=http://localhost:8787 \
  EXPO_PUBLIC_SUPABASE_ANON_KEY=dev-anon-key \
  npx expo export --platform web --output-dir dist-web
)
npx playwright test "$@"
