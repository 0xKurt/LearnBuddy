#!/usr/bin/env sh
# Starts every local Postgres 16 cluster that is down (Claude Code session start).
# The cloud container has no init system: after a restart the clusters stay down and the
# pre-push gate fails with "no Postgres". No-op where pg_ctlcluster is not installed.
command -v pg_lsclusters >/dev/null 2>&1 || exit 0
pg_lsclusters --no-header 2>/dev/null | awk '$1 == "16" && $4 == "down" { print $2 }' |
  while read -r cluster; do pg_ctlcluster 16 "$cluster" start >/dev/null 2>&1 || true; done
exit 0
