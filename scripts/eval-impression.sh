#!/bin/sh
# The overall-impression comparison in one command (issue #127, docs/architecture.md §Testing).
#
#   sh scripts/eval-impression.sh <revision-A> [<revision-B>]
#
#   sh scripts/eval-impression.sh origin/main                 main vs. this working tree
#   sh scripts/eval-impression.sh 1a2b3c4 origin/main         two commits
#
# Each side walks every scenario of apps/api/evals/impression/scenarios.ts IMPRESSION_RUNS
# times (default 3) through the real app with the live model; then a model judges every pair
# blind and in both orders, and the report says what the numbers carry (judge.ts, stats.ts).
#
# A revision other than the working tree is checked out into a temporary git worktree, and
# TODAY's harness (evals/impression/ and evals/eval-env.ts) is copied into it — so an older
# prompt runs through the same scenarios and the same measuring instrument, and only the
# product differs. If the older revision's test harness cannot run them, it fails loudly.
#
# Needs: a local Postgres (LB_TEST_DATABASE_URL), LLM_BACKEND=vertex and the Vertex variables
# in apps/api/.env.local, and EVAL_GOOGLE_CLOUD_PROJECT — evals never share the app's quota by
# accident (issue #206, docs/SETUP-VERTEX.md §Evals). Costs money: the runner prints what each
# conversation cost, the judge what judging cost.
#
# Output: $IMPRESSION_DIR (default .impression/<timestamp>) holds a.json, b.json, report.md
# and report.pairs.json. Exit code 1 when B is measurably worse than A.
set -eu

if [ $# -lt 1 ] || [ $# -gt 2 ]; then
  sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi

ROOT=$(git rev-parse --show-toplevel)
REV_A=$1
REV_B=${2:-}
OUT=${IMPRESSION_DIR:-$ROOT/.impression/$(date -u +%Y%m%dT%H%M%SZ)}
mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)
WORK=$(mktemp -d)
cleanup() {
  for side in a b; do
    if [ -d "$WORK/$side" ]; then git -C "$ROOT" worktree remove --force "$WORK/$side" >/dev/null 2>&1 || true; fi
  done
  rm -rf "$WORK"
}
trap cleanup EXIT INT TERM

# run_side <a|b> <revision or empty for the working tree>
run_side() {
  side=$1
  rev=$2
  if [ -z "$rev" ]; then
    dir=$ROOT
    label="working tree ($(git -C "$ROOT" rev-parse --short HEAD)$(git -C "$ROOT" diff --quiet HEAD -- || echo '+changes'))"
  else
    sha=$(git -C "$ROOT" rev-parse --verify "$rev^{commit}")
    dir=$WORK/$side
    label="$rev ($(git -C "$ROOT" rev-parse --short "$sha"))"
    git -C "$ROOT" worktree add --detach "$dir" "$sha" >/dev/null
    # Today's instrument in yesterday's product.
    rm -rf "$dir/apps/api/evals/impression"
    cp -R "$ROOT/apps/api/evals/impression" "$dir/apps/api/evals/impression"
    cp "$ROOT/apps/api/evals/eval-env.ts" "$dir/apps/api/evals/eval-env.ts"
    if [ -f "$ROOT/apps/api/.env.local" ]; then cp "$ROOT/apps/api/.env.local" "$dir/apps/api/.env.local"; fi
    echo "→ installing $label"
    (cd "$dir" && pnpm install --frozen-lockfile --prefer-offline --ignore-scripts >/dev/null)
  fi
  echo "→ side $(echo "$side" | tr ab AB): $label"
  (cd "$dir/apps/api" &&
    IMPRESSION_OUT="$OUT/$side.json" IMPRESSION_REVISION="$label" \
      npx tsx evals/impression/run.ts)
}

run_side a "$REV_A"
run_side b "$REV_B"

echo "→ judging"
status=0
(cd "$ROOT/apps/api" &&
  IMPRESSION_REPORT="$OUT/report.md" npx tsx evals/impression/judge.ts "$OUT/a.json" "$OUT/b.json") || status=$?
echo "report → $OUT/report.md"
exit $status
