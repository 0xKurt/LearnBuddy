#!/usr/bin/env sh
set -eu
. scripts/test-lock.sh
cd apps/api
case "${1:-}" in
  --owner) shift; pnpm exec tsx evals/explore/owner-run.ts "$@" ;;
  *) pnpm exec tsx evals/explore/run.ts "$@" ;;
esac
