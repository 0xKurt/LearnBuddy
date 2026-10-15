#!/usr/bin/env sh
# Source this (". scripts/test-lock.sh") before any test run: hooks, walkthrough, evals.
# One test suite at a time per machine, and never more than a few workers (issue "Test runs
# must not overload the machine": load 252, swap full, 7 parallel vitest runs, 18 orphaned
# workers; docs/engineering-guards.md §Machine resources).
#
#   - takes the machine-wide lock $LB_TEST_LOCK (default ~/.local/share/learnbuddy-agents/test.lock,
#     a directory made with mkdir, which is atomic) and waits for it in a loop, saying so;
#   - a lock whose recorded process is gone is stale and is taken over;
#   - releases it, and kills every process the caller started, on EXIT, INT and TERM;
#   - outside CI (CI unset) caps vitest at LB_TEST_MAX_WORKERS=2 (tools/vitest-workers.mjs);
#     in CI nothing changes and no lock is taken.
# Already holding it (LB_TEST_LOCK_HELD=1: a hook called from a held run, or a coordinator that
# took the lock by hand and exported this) makes it a no-op, so a nested call never waits on
# its parent. It is not an executable: it sets a trap in the shell that sources it.

if [ -z "${CI:-}" ]; then
  LB_TEST_MAX_WORKERS="${LB_TEST_MAX_WORKERS:-2}"
  VITEST_MAX_WORKERS="$LB_TEST_MAX_WORKERS"
  export LB_TEST_MAX_WORKERS VITEST_MAX_WORKERS
fi

# Every descendant of the given pid, deepest first: a hook's pnpm -> vitest -> workers all die.
lb_descendants() {
  for child in $(pgrep -P "$1" 2>/dev/null); do
    lb_descendants "$child"
    echo "$child"
  done
}

lb_test_lock_release() {
  trap '' INT TERM
  for pid in $(lb_descendants $$); do kill "$pid" 2>/dev/null || true; done
  pkill -P $$ 2>/dev/null || true
  if [ "${LB_TEST_LOCK_MINE:-}" = "$$" ]; then
    rm -rf "$LB_TEST_LOCK_DIR"
    LB_TEST_LOCK_MINE=''
  fi
}

lb_test_lock_acquire() {
  [ "${LB_TEST_LOCK_HELD:-}" = "1" ] && return 0
  [ -n "${CI:-}" ] && [ -z "${LB_TEST_LOCK:-}" ] && return 0
  LB_TEST_LOCK_DIR="${LB_TEST_LOCK:-$HOME/.local/share/learnbuddy-agents/test.lock}"
  mkdir -p "$(dirname "$LB_TEST_LOCK_DIR")"
  me="${LB_AGENT_NAME:-$(basename "$PWD")}"
  waited=0
  until mkdir "$LB_TEST_LOCK_DIR" 2>/dev/null; do
    holder="$(cat "$LB_TEST_LOCK_DIR/owner" 2>/dev/null || true)"
    holder_pid="$(cat "$LB_TEST_LOCK_DIR/pid" 2>/dev/null || true)"
    if [ -n "$holder_pid" ] && ! kill -0 "$holder_pid" 2>/dev/null; then
      echo "test-lock: the lock of '$holder' (pid $holder_pid) is stale, taking it over" >&2
      rm -rf "$LB_TEST_LOCK_DIR"
      continue
    fi
    if [ $((waited % 60)) -eq 0 ]; then
      echo "test-lock: waiting for the machine-wide test lock, held by '${holder:-unknown}' ($LB_TEST_LOCK_DIR) …" >&2
    fi
    sleep 5
    waited=$((waited + 5))
  done
  echo "$me" > "$LB_TEST_LOCK_DIR/owner"
  echo "$$" > "$LB_TEST_LOCK_DIR/pid"
  LB_TEST_LOCK_MINE="$$"
  LB_TEST_LOCK_HELD=1
  export LB_TEST_LOCK_HELD
  trap lb_test_lock_release EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  echo "test-lock: acquired (workers capped at ${LB_TEST_MAX_WORKERS:-unlimited})" >&2
}

lb_test_lock_acquire
