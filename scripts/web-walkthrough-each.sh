#!/usr/bin/env sh
# Runs every walkthrough test ALONE, each on a fresh dev stack (issue #350, Engineering-Regel 7):
# a test that only passes after another one took or left something behind fails here. Local
# only — one stack start per test makes it far too slow and costly for CI; the cheap guard in
# CI is apps/api/src/testing/__tests__/walkthrough.test.ts (no queued model answers).
#
#   sh scripts/web-walkthrough-each.sh                       # every test of tests/web
#   sh scripts/web-walkthrough-each.sh modes.spec.ts tour    # only these files (playwright filters)
#
# The ports and database are those of scripts/web-walkthrough.sh (LB_API_PORT, LB_WEB_PORT,
# LB_TEST_DATABASE_URL); the web export is built once and reused by every run.
set -u
cd "$(dirname "$0")/.."
# One location per test (file:line); tests generated in a loop share theirs and run together.
LOCATIONS=$(npx playwright test --list "$@" | sed -n 's/^  \([^ ]*\.spec\.ts:[0-9]*\):[0-9]* › .*/\1/p' | uniq)
if [ -z "$LOCATIONS" ]; then
  echo "web-walkthrough-each: no tests found" >&2
  exit 1
fi
failed=""
for location in $LOCATIONS; do
  echo "web-walkthrough-each: $location alone"
  if sh scripts/web-walkthrough.sh "tests/web/$location"; then
    echo "web-walkthrough-each: ✓ $location"
  else
    echo "web-walkthrough-each: ✗ $location"
    failed="$failed $location"
  fi
done
if [ -n "$failed" ]; then
  echo "web-walkthrough-each: failed alone:$failed" >&2
  exit 1
fi
echo "web-walkthrough-each: every test passes alone"
