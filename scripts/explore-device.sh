#!/usr/bin/env sh
# Runs only against a locally configured dev build; never logs into production.
set -eu
. scripts/test-lock.sh
serial=35b1c1c
mkdir -p .cache/explore-device
command -v maestro >/dev/null || { echo 'Maestro is not installed' >&2; exit 2; }
[ -z "$(adb -s "$serial" reverse --list)" ] || { echo 'POCO is in use (ADB forwards exist); no device changes made' >&2; exit 2; }
: "${LB_SMOKE_DEV_APK:?Path to an existing development APK, no native build}"
if lsof -ti tcp:8794 -ti tcp:8094 >/dev/null 2>&1; then
  echo 'Local smoke ports are occupied; leaving existing servers untouched' >&2
  exit 2
fi
PORT=8794 LB_DEV_SPEECH=fake pnpm -C apps/api exec tsx evals/explore/device-stack.ts > .cache/explore-device/api.log 2>&1 &
EXPO_NO_DOTENV=1 EXPO_PUBLIC_API_URL=http://localhost:8794 EXPO_PUBLIC_SUPABASE_URL=http://localhost:8794 EXPO_PUBLIC_SUPABASE_ANON_KEY=dev-anon-key EXPO_PUBLIC_INTERNAL_BUILD=1 APP_VARIANT=development pnpm -C apps/mobile exec expo start --dev-client --port 8094 --localhost --clear > .cache/explore-device/metro.log 2>&1 &
ready=0
until curl -fsS http://localhost:8094/status >/dev/null && curl -fsS http://localhost:8794/v1/health >/dev/null; do
  ready=$((ready + 1))
  [ "$ready" -lt 60 ] || { echo 'Local stack failed to start' >&2; exit 2; }
  sleep 1
done
[ -z "$(adb -s "$serial" reverse --list)" ] || { echo 'POCO became occupied; stopping local stack' >&2; exit 2; }
adb -s "$serial" install -r "$LB_SMOKE_DEV_APK"
forward_api=0
forward_metro=0
cleanup_device() {
  [ "$forward_api" = 0 ] || adb -s "$serial" reverse --remove tcp:8794 || true
  [ "$forward_metro" = 0 ] || adb -s "$serial" reverse --remove tcp:8094 || true
  lb_test_lock_release
}
trap cleanup_device EXIT
adb -s "$serial" reverse tcp:8794 tcp:8794
forward_api=1
adb -s "$serial" reverse tcp:8094 tcp:8094
forward_metro=1
adb -s "$serial" shell cmd notification post -t 'LearnBuddy smoke reminder' -c activity -n com.learnbuddy.app.dev/.MainActivity lb-explorer-944 'Brueche wiederholen'
maestro --device "$serial" test --format junit --output .cache/explore-device/bootstrap.xml .maestro/explorer/00-bootstrap.yaml
smoke_failed=0
for flow in .maestro/explorer/0[1-7]-*.yaml; do
  name=$(basename "$flow" .yaml)
  maestro --device "$serial" test --format junit --output ".cache/explore-device/$name.xml" "$flow" || smoke_failed=1
done
[ "$smoke_failed" = 0 ] || { echo 'One or more device flows failed; release blocked' >&2; exit 1; }
# A silent FakeSpeech fixture cannot prove pitch, noise, sentence endings or recognition.
: "${LB_SMOKE_AUDIO_EVIDENCE:?Reviewed audio evidence JSON is mandatory for release}"
node scripts/explore-audio-gate.mjs "$LB_SMOKE_AUDIO_EVIDENCE"
