#!/usr/bin/env sh
# Source this (". scripts/test-lock.sh") before any test run: hooks, walkthrough, evals.
# One test suite at a time per machine, and never more than a few workers (issue "Test runs
# must not overload the machine": load 252, swap full, 7 parallel vitest runs, 18 orphaned
# workers; docs/engineering-guards.md §Machine resources).
#
#   - takes the machine-wide lock $LB_TEST_LOCK (default ~/.local/share/learnbuddy-agents/test.lock,
#     a directory made with mkdir, which is atomic) and waits for it in a loop, saying so;
#   - a lock whose recorded process is gone is stale, and so is one without a `pid` file (a run
#     killed between mkdir and writing it) once it is older than LB_TEST_LOCK_STALE_MINUTES
#     (default 90: a lock taken by hand without a pid is not taken from under a long run);
#     the takeover itself is atomic: one waiter at a time, and only of the lock it saw stale
#     (issue #791);
#   - releases it, and kills every process the caller started, on EXIT, INT and TERM;
#   - outside CI (CI unset) caps vitest at LB_TEST_MAX_WORKERS=2 (tools/vitest-workers.mjs);
#     in CI nothing changes and no lock is taken.
# Already holding it (LB_TEST_LOCK_HELD=1: a hook called from a held run, or a coordinator that
# took the lock by hand and exported this) makes it a no-op, so a nested call never waits on
# its parent. It is not an executable: it sets a trap in the shell that sources it.

# The machine's own settings for agents whose shell cannot set variables in front of a command
# (docs/engineering-guards.md §Maschinenlast): KEY=VALUE lines in $LB_AGENT_ENV (default
# ~/.local/share/learnbuddy-agents/env), read outside CI. Only two keys count, every other line is
# ignored, and a value is taken as written, never run:
#   - LB_TEST_DATABASE_URL: the shared test Postgres, only when the variable is unset;
#   - PATH_PREFIX: a directory put first on PATH (Node 22), unless it already stands first.
lb_agent_env() {
  lb_env_file="${LB_AGENT_ENV:-$HOME/.local/share/learnbuddy-agents/env}"
  [ -f "$lb_env_file" ] || return 0
  while IFS= read -r lb_env_line || [ -n "$lb_env_line" ]; do
    lb_env_key="${lb_env_line%%=*}"
    [ "$lb_env_key" = "$lb_env_line" ] && continue
    lb_env_value="${lb_env_line#*=}"
    case "$lb_env_key" in
      LB_TEST_DATABASE_URL)
        if [ -z "${LB_TEST_DATABASE_URL:-}" ] && [ -n "$lb_env_value" ]; then
          LB_TEST_DATABASE_URL="$lb_env_value"
          export LB_TEST_DATABASE_URL
        fi
        ;;
      PATH_PREFIX)
        case "$PATH" in
          "$lb_env_value" | "$lb_env_value":*) ;;
          *)
            if [ -d "$lb_env_value" ]; then
              PATH="$lb_env_value:$PATH"
              export PATH
            fi
            ;;
        esac
        ;;
    esac
  done < "$lb_env_file"
}

if [ -z "${CI:-}" ]; then
  lb_agent_env
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

# Whether the lock dir $1, whose recorded pid is $2 ('' when it has none), is stale.
lb_test_lock_is_stale() {
  if [ -n "$2" ]; then
    ! kill -0 "$2" 2>/dev/null
    return
  fi
  [ -d "$1" ] && [ -n "$(find "$1" -maxdepth 0 -mmin +"${LB_TEST_LOCK_STALE_MINUTES:-90}" 2>/dev/null)" ]
}

# Takes over the lock dir $1 that the caller saw stale with pid $2: under a guard dir of its own
# (mkdir is atomic), and only when the lock still holds that pid and is still stale — a waiter
# that saw a dead holder never removes the lock another waiter took in the meantime (#791).
# 0 when it removed the stale lock, 1 when it did not.
lb_test_lock_take_stale() {
  guard="$1.takeover"
  if ! mkdir "$guard" 2>/dev/null; then
    # A takeover killed midway leaves its guard behind: after a minute it is gone.
    [ -n "$(find "$guard" -maxdepth 0 -mmin +1 2>/dev/null)" ] && rm -rf "$guard"
    return 1
  fi
  taken=1
  now_pid="$(cat "$1/pid" 2>/dev/null || true)"
  if [ "$now_pid" = "$2" ] && lb_test_lock_is_stale "$1" "$now_pid"; then
    rm -rf "$1"
    taken=0
  fi
  rmdir "$guard" 2>/dev/null || true
  return $taken
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
    if lb_test_lock_is_stale "$LB_TEST_LOCK_DIR" "$holder_pid"; then
      if lb_test_lock_take_stale "$LB_TEST_LOCK_DIR" "$holder_pid"; then
        echo "test-lock: the lock of '${holder:-unknown}' (pid ${holder_pid:-none}) is stale, taking it over" >&2
      else
        # Another waiter is taking it over: try again in a moment, not in a busy loop.
        sleep 1
      fi
      continue
    fi
    if [ $((waited % 60)) -eq 0 ]; then
      echo "test-lock: waiting for the machine-wide test lock, held by '${holder:-unknown}' ($LB_TEST_LOCK_DIR) …" >&2
    fi
    sleep "${LB_TEST_LOCK_POLL:-5}"
    waited=$((waited + ${LB_TEST_LOCK_POLL:-5}))
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
