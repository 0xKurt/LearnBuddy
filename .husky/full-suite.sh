# Sourced by .husky/pre-commit and .husky/pre-push (issues #330, #455): the one full test suite
# of both hooks, and the record that keeps pre-push from running it twice on the same tree.
#
# A green full run records the tree it ran on (tools/guards/green-tree.mjs, in the worktree's own
# git directory, never tracked), but only when the files on disk were exactly that tree before
# and after the run. Pre-push skips the suite only when every commit it pushes has such a record
# from the same command, Node, test database and installed packages. Anything else (no record,
# an unreadable one, a related-tests run, a merge or an amend without a full run, a branch from
# before #455 without the helper) runs the suite as before. docs/engineering-guards.md §Pre-Push.

# Integration tests must never skip silently: without a reachable Postgres
# (LB_TEST_DATABASE_URL, default 127.0.0.1:5432) the gate fails instead of
# passing with every database test skipped (audit precommit-green-without-postgres).
export LB_REQUIRE_TEST_DB=1
LB_FULL_SUITE='pnpm -r --parallel test'
LB_GREEN_TREE=tools/guards/green-tree.mjs

tests_failed() {
  echo "✗ tests failed. If the API reports 'LB_REQUIRE_TEST_DB=1 but no Postgres', start a" >&2
  echo "  Postgres 16 (or set LB_TEST_DATABASE_URL) — see README.md §Develop." >&2
  exit 1
}

# The full suite. When it is green, the tree it ran on is recorded.
full_suite() {
  if [ ! -f "$LB_GREEN_TREE" ]; then
    $LB_FULL_SUITE
    return
  fi
  tree=$(node "$LB_GREEN_TREE" snapshot) || tree=''
  $LB_FULL_SUITE || return 1
  node "$LB_GREEN_TREE" record "$LB_FULL_SUITE" "$tree" || true
}

# Succeeds only when the tree of every commit being pushed already passed full_suite here.
# Reads git's pre-push lines on stdin; $1 is the remote's name.
suite_proven_for_push() {
  [ -f "$LB_GREEN_TREE" ] || return 1
  node "$LB_GREEN_TREE" covered "$LB_FULL_SUITE" "$1"
}
