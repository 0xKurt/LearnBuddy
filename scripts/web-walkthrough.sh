#!/usr/bin/env sh
# Builds the app for the web against the local dev stack and walks through the
# core loop in Chromium (tests/web). Needs a local Postgres (see docs/architecture.md §Testing).
set -e
cd "$(dirname "$0")/.."
# Ports can be moved out of the way when Metro (8081) or another local server (8787)
# already uses them: LB_WEB_PORT / LB_API_PORT (issue #42).
API_PORT="${LB_API_PORT:-8787}"
export LB_API_PORT="$API_PORT"
# The export must see exactly these values:
#   EXPO_NO_DOTENV — apps/mobile/.env.local points at the real project, and Expo's own
#     dotenv loading wins over the shell (issue #71: the walkthrough signed up against
#     production until this was set).
#   --clear — Metro's transform cache hands out the EXPO_PUBLIC_* values it inlined last
#     time, so without it the run silently talks to the previous port.
#   EXPO_PUBLIC_PRIVACY_URL / _IMPRINT_URL — an export is a RELEASE build, and since issue
#     #130 a release build refuses to start without them (an app children use may not reach a
#     store with no privacy notice and no imprint, and their absence is invisible). Without
#     these two lines the walkthrough sees a blank page and every spec times out — which is
#     the guard working, not a product bug.
# No comments inside the assignment block: a comment between the backslashes breaks the
# continuation, and the command then runs with none of these set (that is how #71 slipped in).
(
  cd apps/mobile
  EXPO_NO_DOTENV=1 \
  EXPO_PUBLIC_API_URL=http://localhost:$API_PORT \
  EXPO_PUBLIC_SUPABASE_URL=http://localhost:$API_PORT \
  EXPO_PUBLIC_SUPABASE_ANON_KEY=dev-anon-key \
  EXPO_PUBLIC_PRIVACY_URL=http://localhost:$API_PORT/datenschutz \
  EXPO_PUBLIC_IMPRINT_URL=http://localhost:$API_PORT/impressum \
  npx expo export --platform web --output-dir dist-web --clear
)
# The exported bundle must talk to the local stack. Metro has handed out a cached bundle
# with stale EXPO_PUBLIC_* values before, and the walkthrough then signed up against the
# real Supabase project (28.09.) — that must fail loudly, not quietly.
if ! grep -q "http://localhost:$API_PORT" apps/mobile/dist-web/_expo/static/js/web/*.js; then
  echo "web-walkthrough: the exported bundle does not point at http://localhost:$API_PORT" >&2
  echo "  (delete apps/mobile/dist-web and .expo, then run again)" >&2
  exit 1
fi

# Nothing secret may be in what the browser downloads (issue #290): an administrator token
# once sat in every locally built bundle under an EXPO_PUBLIC_* name. This reads the finished
# export — the bundle itself, not the source — and fails on a secret-named EXPO_PUBLIC_*
# variable, a JWT with any role but anon, a Supabase secret key, a private key or service
# account (apps/mobile/scripts/client-secrets.cjs). Values are never printed.
node apps/mobile/scripts/client-secrets.cjs scan apps/mobile/dist-web

# A killed run leaves its servers listening, and the next run then reuses them against a
# stale bundle — a white screen that looks like a product bug. On the DEFAULT ports we only
# wait (8081 may be the owner's Metro, 8787 another local server — never kill those); on
# explicitly set LB_* ports they are the walkthrough's own, and a listener there can only be
# a leftover: it is removed.
WEB_PORT="${LB_WEB_PORT:-8081}"
if command -v lsof >/dev/null 2>&1; then
  for port in "$API_PORT" "$WEB_PORT"; do
    holders="$(lsof -ti "tcp:$port" 2>/dev/null || true)"
    [ -z "$holders" ] && continue
    if [ -n "$LB_WEB_PORT$LB_API_PORT" ]; then
      echo "web-walkthrough: clearing leftover server on port $port"
      kill $holders 2>/dev/null || true
      sleep 1
      leftover="$(lsof -ti "tcp:$port" 2>/dev/null || true)"
      [ -n "$leftover" ] && kill -9 $leftover 2>/dev/null || true
    else
      waited=0
      while [ -n "$(lsof -ti "tcp:$port" 2>/dev/null)" ] && [ "$waited" -lt 30 ]; do
        [ "$waited" -eq 0 ] && echo "web-walkthrough: waiting for port $port to be free …"
        sleep 1
        waited=$((waited + 1))
      done
    fi
  done
fi

npx playwright test "$@"
