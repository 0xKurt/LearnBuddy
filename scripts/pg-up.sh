#!/usr/bin/env sh
# Starts every local Postgres 16 cluster that is down (Claude Code session start).
# The cloud container has no init system: after a restart the clusters stay down and the
# pre-push gate fails with "no Postgres". No-op where pg_ctlcluster is not installed.
# A reachable LB_TEST_DATABASE_URL (the machine's one shared server) is used as given: no
# second server is started next to it (docs/engineering-guards.md §Machine resources).
if [ -n "${LB_TEST_DATABASE_URL:-}" ]; then
  hostport="${LB_TEST_DATABASE_URL#*@}"
  hostport="${hostport%%/*}"
  host="${hostport%%:*}"
  port="${hostport##*:}"
  [ "$port" = "$hostport" ] && port=5432
  if command -v nc >/dev/null 2>&1 && nc -z "$host" "$port" >/dev/null 2>&1; then
    exit 0
  fi
fi
command -v pg_lsclusters >/dev/null 2>&1 || exit 0
pg_lsclusters --no-header 2>/dev/null | awk '$1 == "16" && $4 == "down" { print $2 }' |
  while read -r cluster; do pg_ctlcluster 16 "$cluster" start >/dev/null 2>&1 || true; done
exit 0
