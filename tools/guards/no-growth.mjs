// The Ausnahmelisten only shrink (issue #313, docs/engineering-guards.md). Every guard compares
// the code with its list — this compares the LISTS with the base branch, so a list cannot be
// made to grow quietly to let new debt in.
//
//   node tools/guards/no-growth.mjs <base-ref>      e.g. origin/main (CI, pull requests)
//
// Growth is red unless a commit in <base-ref>..HEAD says why, with a line
//
//   Ausnahmeliste-Zuwachs: #<issue> <reason>
//
// (issue #313 step 3: PRs that were finished before the guards may still land, with their
// entries on the list — visibly, never silently).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPO_ROOT } from './measure.mjs';

/**
 * A list as `entry → size`: a larger size or a new entry is growth.
 * @type {Record<string, (json: Record<string, unknown>) => Record<string, number>>}
 */
export const LISTS = {
  'tools/guards/baselines/style-numbers.json': (j) =>
    /** @type {Record<string, number>} */ (j.files),
  'tools/guards/baselines/max-lines.json': (j) => /** @type {Record<string, number>} */ (j.files),
  'tools/guards/baselines/clones.json': (j) => /** @type {Record<string, number>} */ (j.pairs),
  'tools/guards/baselines/pressable.json': (j) =>
    Object.fromEntries(/** @type {string[]} */ (j.files).map((f) => [f, 1])),
  'tools/guards/baselines/knip.json': (j) =>
    Object.fromEntries(/** @type {string[]} */ (j.findings).map((f) => [f, 1])),
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
  const base = process.argv[2];
  if (base === undefined) {
    console.error('usage: node tools/guards/no-growth.mjs <base-ref>');
    process.exit(2);
  }
  /** @type {string[]} */
  const grown = [];
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
  if (grown.length === 0) {
    console.log(`✓ Ausnahmelisten gegenüber ${base}: nicht gewachsen`);
    return;
  }
  const messages = git(['log', '--format=%B', `${base}..HEAD`]);
  const reason = TRAILER.exec(messages);
  if (reason !== null) {
    console.log(`Ausnahmelisten gewachsen, begründet („${reason[0]}“):\n  ${grown.join('\n  ')}`);
    return;
  }
  console.error(`✗ Ausnahmelisten gegenüber ${base} gewachsen:\n  ${grown.join('\n  ')}`);
  console.error(
    '  Die Listen dürfen nur schrumpfen (Issue #313). Neue Schuld beheben statt eintragen —\n' +
      '  oder, wenn der Owner es so entschieden hat, im Commit begründen:\n' +
      '  Ausnahmeliste-Zuwachs: #<issue> <Grund>',
  );
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
