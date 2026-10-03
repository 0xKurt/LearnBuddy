// A pull request stands on a fresh main (issue #328, Engineering-Regel 8 "Kurze Branches").
//
// Long branches were the cause of a day of merge conflicts on 03.10.: five finished features
// waited about 100 commits behind main while main was restructured underneath them. This makes a
// PR red as soon as main holds a commit it does not have that is older than a day — the fix is
// one `git merge origin/main`, done while the conflict is still small.
//
// Only main's own commits count (`--first-parent`): a merged PR brings its commits with the
// times they were written, so a two-day-old commit that landed an hour ago would make every
// other PR look stale. The merge commit carries the time it reached main.
//
//   node tools/guards/fresh-base.mjs <base-ref> [<head>]   e.g. origin/main <PR head sha> (CI)
//
// <head> defaults to HEAD. CI passes the PR's own head: a pull_request job checks out GitHub's
// merge commit, which contains main by construction and would always look fresh.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** How old the oldest commit of main a PR is missing may be. */
export const MAX_AGE_HOURS = 24;

/**
 * Hours since the oldest commit of the base that the branch does not contain, or null when it
 * contains all of them.
 * @param {number[]} missingCommitTimes commit times (unix seconds) of base commits not in HEAD
 * @param {number} nowSeconds
 * @returns {number | null}
 */
export function staleHours(missingCommitTimes, nowSeconds) {
  if (missingCommitTimes.length === 0) return null;
  return (nowSeconds - Math.min(...missingCommitTimes)) / 3600;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const base = process.argv[2];
  const head = process.argv[3] || 'HEAD';
  if (!base) {
    console.error('usage: fresh-base.mjs <base-ref> [<head>]');
    process.exit(2);
  }
  const out = execFileSync('git', ['log', '--first-parent', '--format=%ct', `${head}..${base}`], {
    encoding: 'utf8',
  });
  const times = out.split('\n').filter(Boolean).map(Number);
  const hours = staleHours(times, Math.floor(Date.now() / 1000));
  if (hours !== null && hours > MAX_AGE_HOURS) {
    console.error(
      `✗ Der Branch fehlt ${times.length} Commits von ${base}, der älteste ist ${Math.round(hours)} h alt ` +
        `(Grenze ${MAX_AGE_HOURS} h). \`git merge ${base}\` und neu pushen — kurze Branches, ` +
        'Engineering-Regel 8 (Issue #328).',
    );
    process.exit(1);
  }
  console.log(
    hours === null
      ? `✓ enthält ${base} vollständig`
      : `✓ fehlt ${times.length} Commits von ${base}, der älteste ${Math.round(hours)} h alt`,
  );
}
