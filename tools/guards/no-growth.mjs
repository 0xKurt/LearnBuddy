// The Ausnahmelisten only shrink (issue #313, docs/engineering-guards.md). The lists the guards
// measure on main (base.mjs, issue #452) cannot grow by themselves — more than main has is red
// in `pnpm lint` — except through a grant in tools/guards/growth/. This makes every grant, and
// every list that is still kept by hand, answer for itself against main, so nothing grows
// quietly.
//
//   node tools/guards/no-growth.mjs <base-branch>      e.g. origin/main (CI, pull requests)
//
// Growth is red unless a commit since the base says why, with a line
//
//   Ausnahmeliste-Zuwachs: #<issue> <reason>
//
// (issue #313 step 3: PRs that were finished before the guards may still land, with their
// debt — visibly, never silently).
//
// Compared: this branch's grants, the lists kept by hand (LISTS below: the bundle budget, the
// drawing registry's `bestand`) and the lists that source tests keep themselves (SOURCE_LISTS,
// issue #296).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { activeGrants, baseSha, GROWTH_DIR } from './base.mjs';
import { REPO_ROOT } from './measure.mjs';
import { fileOf, SOURCE_LISTS } from './source-lists.mjs';

/**
 * A list kept by hand, as `entry → size`: a larger size or a new entry is growth.
 * @type {Record<string, (json: Record<string, unknown>) => Record<string, number>>}
 */
export const LISTS = {
  'tools/guards/baselines/bundle-budget.json': (j) => ({
    bytes: Number(j.bytes),
    gzip: Number(j.gzip),
    tolerancePercent: Number(j.tolerancePercent),
  }),
  'tools/guards/drawing-registry.json': (j) =>
    Object.fromEntries(Object.keys(/** @type {object} */ (j.bestand)).map((f) => [f, 1])),
};

/**
 * @param {Record<string, number>} before
 * @param {Record<string, number>} after
 * @returns {string[]}
 */
export function growth(before, after) {
  /** @type {string[]} */
  const out = [];
  for (const [entry, size] of Object.entries(after)) {
    const was = before[entry];
    if (was === undefined) out.push(`neu: ${entry} (${size})`);
    else if (size > was) out.push(`größer: ${entry} (${was} → ${size})`);
  }
  return out;
}

export const TRAILER = /^Ausnahmeliste-Zuwachs: #\d+ \S.{4,}/m;

/** @param {string[]} args */
function git(args) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function main() {
  const branch = process.argv[2];
  if (branch === undefined) {
    console.error('usage: node tools/guards/no-growth.mjs <base-branch>');
    process.exit(2);
  }
  const base = baseSha(REPO_ROOT, branch);
  /** @type {string[]} */
  const grown = activeGrants(base).map(
    (g) =>
      `${GROWTH_DIR}: ${g.issue} ${g.reason} (${Object.keys(g)
        .filter((k) => k !== 'issue' && k !== 'reason')
        .join(', ')})`,
  );
  for (const [file, entries] of Object.entries(LISTS)) {
    let before = {};
    try {
      before = entries(JSON.parse(git(['show', `${base}:${file}`])));
    } catch {
      // The list does not exist on the base yet (this PR adds it): nothing to grow from.
      continue;
    }
    const after = entries(JSON.parse(readFileSync(join(REPO_ROOT, file), 'utf8')));
    for (const g of growth(before, after)) grown.push(`${file}: ${g}`);
  }
  // The lists a source test keeps (tools/guards/source-lists.mjs): the same comparison.
  for (const [list, entries] of Object.entries(SOURCE_LISTS)) {
    const file = fileOf(list);
    let before = {};
    try {
      before = entries(git(['show', `${base}:${file}`]));
    } catch {
      // Not on the base yet (this PR adds the list): nothing to grow from.
      continue;
    }
    // Outside any try: a list this reader cannot find today (renamed, turned into something
    // else) throws instead of passing as empty — the guard never goes blind quietly.
    const after = entries(readFileSync(join(REPO_ROOT, file), 'utf8'));
    for (const g of growth(before, after)) grown.push(`${list}: ${g}`);
  }
  if (grown.length === 0) {
    console.log(`✓ Ausnahmelisten gegenüber ${branch}: nicht gewachsen`);
    return;
  }
  const messages = git(['log', '--format=%B', `${base}..HEAD`]);
  const reason = TRAILER.exec(messages);
  if (reason !== null) {
    console.log(`Ausnahmelisten gewachsen, begründet („${reason[0]}“):\n  ${grown.join('\n  ')}`);
    return;
  }
  console.error(`✗ Ausnahmelisten gegenüber ${branch} gewachsen:\n  ${grown.join('\n  ')}`);
  console.error(
    '  Die Listen dürfen nur schrumpfen (Issue #313). Neue Schuld beheben statt eintragen —\n' +
      '  oder, wenn der Owner es so entschieden hat, im Commit begründen:\n' +
      '  Ausnahmeliste-Zuwachs: #<issue> <Grund>',
  );
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
