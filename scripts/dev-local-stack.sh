#!/usr/bin/env sh
# Starts Metro so the dev build on a phone talks to the LOCAL test stack — no model money, no
# real data, scripted answers (issue #291, docs/architecture.md §Testing "Dev build against
# the local stack"). Start the stack first, in another terminal:
#
#   pnpm --filter @learnbuddy/api dev:stack        # API + auth stand-in on :8787
#   sh scripts/dev-local-stack.sh                  # Metro on :8081, proven local
#
# What it does, and why each part is needed:
#   - EXPO_NO_DOTENV=1 — Expo reads none of apps/mobile's .env files, so nothing of
#     .env.local (hosted URLs, keys) reaches Metro. The key files stay untouched.
#   - every EXPO_PUBLIC_* the shell carries is dropped, then exactly the local ones are set.
#   - metro.config.js routes `expo/virtual/env` to lib/processEnv.ts: Expo's own dev module
#     bundled .env.local and let it win over the shell even with EXPO_NO_DOTENV=1 — that was
#     the bug (measured on the served bundle, 03.10.2026).
#   - --clear — Metro's transform cache must not hand out an earlier run's bundle.
#   - adb reverse (when a device is connected) — the phone's localhost:8081/8787 reach this
#     machine.
#   - the PROOF: once Metro is up, the Android dev bundle is fetched and read
#     (`client-secrets.cjs local-only`): no .env module, every *_URL on this machine, the API
#     URL exactly the local one, no secret. If that fails, Metro is stopped — a dev build that
#     silently talks to the hosted backend is the failure this script exists to prevent.
#
# Ports and host: LB_API_PORT (8787), LB_METRO_PORT (8081). LB_LOCAL_HOST (localhost) sets the
# host the PHONE uses for the API — keep localhost with adb reverse; a LAN address (e.g. an
# iPhone on Wi-Fi) is accepted by the proof only because it was named here.
set -e
cd "$(dirname "$0")/.."
API_PORT="${LB_API_PORT:-8787}"
METRO_PORT="${LB_METRO_PORT:-8081}"
HOST="${LB_LOCAL_HOST:-localhost}"
ORIGIN="http://$HOST:$API_PORT"

if ! curl -fsS -o /dev/null "http://localhost:$API_PORT/v1/health" 2>/dev/null; then
  echo "dev-local-stack: nothing answers on http://localhost:$API_PORT/v1/health yet —" >&2
  echo "  start it with: pnpm --filter @learnbuddy/api dev:stack (Metro starts anyway)" >&2
fi

if command -v adb >/dev/null 2>&1 && [ "$(adb get-state 2>/dev/null)" = "device" ]; then
  adb reverse "tcp:$METRO_PORT" "tcp:$METRO_PORT" >/dev/null
  adb reverse "tcp:$API_PORT" "tcp:$API_PORT" >/dev/null
  echo "dev-local-stack: adb reverse tcp:$METRO_PORT and tcp:$API_PORT"
fi

# The proof below reads whatever answers on the Metro port: another Metro already listening
# there would be proven instead of this one. So the port must be free.
if curl -fsS -o /dev/null "http://localhost:$METRO_PORT/status" 2>/dev/null; then
  echo "dev-local-stack: port $METRO_PORT is already served (another Metro?) — stop it or set LB_METRO_PORT" >&2
  exit 1
fi

cd apps/mobile
for name in $(env | sed -n 's/^\(EXPO_PUBLIC_[A-Za-z0-9_]*\)=.*/\1/p'); do
  unset "$name"
done
export EXPO_NO_DOTENV=1
export EXPO_PUBLIC_API_URL="$ORIGIN"
export EXPO_PUBLIC_SUPABASE_URL="$ORIGIN"
export EXPO_PUBLIC_SUPABASE_ANON_KEY=dev-anon-key

METRO_PID=$$
PROOF="$(mktemp "${TMPDIR:-/tmp}/lb-dev-bundle.XXXXXX")"
(
  waited=0
  until curl -fsS "http://localhost:$METRO_PORT/status" 2>/dev/null | grep -q running; do
    waited=$((waited + 1))
    kill -0 "$METRO_PID" 2>/dev/null || exit 1
    if [ "$waited" -gt 180 ]; then
      echo "dev-local-stack: Metro did not come up within 180 s — no proof taken" >&2
      kill "$METRO_PID" 2>/dev/null
      exit 1
    fi
    sleep 1
  done
  # The same entry the dev client asks for (monorepo: relative to the workspace root).
  if ! curl -fsS -o "$PROOF" \
    "http://localhost:$METRO_PORT/apps/mobile/index.bundle?platform=android&dev=true&minify=false"; then
    echo "dev-local-stack: could not fetch the dev bundle — stopping Metro" >&2
    kill "$METRO_PID" 2>/dev/null
    exit 1
  fi
  extra=""
  case "$HOST" in localhost | 127.0.0.1 | 10.0.2.2) ;; *) extra="$HOST" ;; esac
  if ! node scripts/client-secrets.cjs local-only "$PROOF" "$ORIGIN" $extra; then
    echo "dev-local-stack: stopping Metro — this bundle would not talk to the local stack" >&2
    kill "$METRO_PID" 2>/dev/null
    rm -f "$PROOF"
    exit 1
  fi
  rm -f "$PROOF"
) &

exec ./node_modules/.bin/expo start --dev-client --clear --port "$METRO_PORT"
