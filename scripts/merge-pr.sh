#!/usr/bin/env bash
# Merge exactly the reviewed commit after CI and production migration evidence (#915).
# No branch updates: a changed candidate needs review and fresh checks.
set -euo pipefail
pr=${1:?usage: scripts/merge-pr.sh <pr-number> <full-reviewed-head-sha>}
head=${2:?full reviewed head SHA required}
[[ "$pr" =~ ^[0-9]+$ && "$head" =~ ^[0-9a-f]{40}$ ]] || exit 2
cd "$(git rev-parse --show-toplevel)"

check_candidate() {
  local current
  current=$(gh pr view "$pr" --repo 0xKurt/LearnBuddy --json state,baseRefName,headRefOid --jq '[.state,.baseRefName,.headRefOid] | join(" ")')
  [[ "$current" == "OPEN main $head" ]] || { echo 'PR state/base/head changed; review again.' >&2; exit 1; }
}
check_candidate
git fetch origin main
git fetch origin "refs/pull/$pr/head"
[[ "$(git rev-parse FETCH_HEAD)" == "$head" ]] || { echo 'Fetched PR head changed.' >&2; exit 1; }
base=$(git rev-parse origin/main)
git merge-base --is-ancestor "$base" "$head" || { echo 'Rebase on main and review again.' >&2; exit 1; }
gh pr checks "$pr" --repo 0xKurt/LearnBuddy --watch
node tools/guards/migration-applied.mjs "$base" "$head"
check_candidate
# A moving main requires a fresh diff/CI decision, not an automatic branch update.
git fetch origin main
[[ "$(git rev-parse origin/main)" == "$base" ]] || { echo 'Main changed; rerun after review.' >&2; exit 1; }
gh pr merge "$pr" --repo 0xKurt/LearnBuddy --squash --match-head-commit "$head"
