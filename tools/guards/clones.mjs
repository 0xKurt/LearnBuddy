// Rule 3 "Keine Kopien" (issue #313, docs/engineering-guards.md): copy-paste detection with jscpd.
//
// A clone is a run of at least 50 equal tokens over at least 5 lines (jscpd's defaults, comments
// and blank lines ignored) between two places in the shipped source: apps/mobile (app,
// components, lib), apps/api/src and packages/*/src. Tests and the test harness are left out —
// a test may spell its cases out.
//
// The Ausnahmeliste (baselines/clones.json) holds today's clones per file pair with their
// duplicated lines. Keying by the pair, not by line numbers, keeps it stable when code above a
// clone moves. A new pair, or more duplicated lines in a known pair, is red. A pair that got
// smaller or disappeared must leave the list too (`pnpm guards:shrink`): it only shrinks.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPO_ROOT, readBaseline } from './measure.mjs';

export const CLONE_ROOTS = [
  'apps/mobile/app',
  'apps/mobile/components',
  'apps/mobile/lib',
  'apps/api/src',
  'packages/buddy-kit/src',
  'packages/shared-math/src',
  'packages/shared-types/src',
];

const ARGS = [
  ...CLONE_ROOTS,
  '--pattern',
  '**/*.{ts,tsx}',
  '--min-tokens',
  '50',
  '--min-lines',
  '5',
  // jscpd skips files over 1000 lines / 100 kB by default — exactly the big ones we must see.
  '--max-lines',
  '100000',
  '--max-size',
  '2mb',
  '--mode',
  'weak',
  '--ignore',
  '**/__tests__/**,**/*.test.ts,**/*.test.tsx,**/node_modules/**,**/src/testing/**',
  '--reporters',
  'json',
  '--silent',
];

/**
 * @typedef {{ name: string, start: number, end: number }} CloneSide
 * @typedef {{ firstFile: CloneSide, secondFile: CloneSide, lines: number, fragment: string }} Clone
 */

/** @returns {Clone[]} */
export function findClones() {
  const out = mkdtempSync(join(tmpdir(), 'lb-clones-'));
  try {
    const run = spawnSync(
      join(REPO_ROOT, 'node_modules', '.bin', 'jscpd'),
      [...ARGS, '--output', out],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      },
    );
    if (run.status !== 0) {
      throw new Error(`jscpd failed (${run.status}):\n${run.stderr}${run.stdout}`);
    }
    return JSON.parse(readFileSync(join(out, 'jscpd-report.json'), 'utf8')).duplicates;
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

/** @param {Clone} c */
export function pairOf(c) {
  const [a, b] = [c.firstFile.name, c.secondFile.name].sort();
  return a === b ? `${a} (in sich)` : `${a} <-> ${b}`;
}

/** Duplicated lines per file pair. @param {Clone[]} clones @returns {Record<string, number>} */
export function byPair(clones) {
  /** @type {Record<string, number>} */
  const pairs = {};
  for (const c of clones) pairs[pairOf(c)] = (pairs[pairOf(c)] ?? 0) + c.lines;
  return Object.fromEntries(Object.entries(pairs).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** @returns {Record<string, number>} */
export function clonesBaseline() {
  return /** @type {Record<string, number>} */ (readBaseline('clones.json').pairs);
}

/** The guard: returns the problems, empty when green. */
export function checkClones() {
  const clones = findClones();
  const now = byPair(clones);
  const allowed = clonesBaseline();
  /** @type {string[]} */
  const problems = [];
  for (const [pair, lines] of Object.entries(now)) {
    const was = allowed[pair];
    if (was !== undefined && lines <= was) continue;
    const where = clones
      .filter((c) => pairOf(c) === pair)
      .map(
        (c) =>
          `    ${c.firstFile.name}:${c.firstFile.start}-${c.firstFile.end}  =  ${c.secondFile.name}:${c.secondFile.start}-${c.secondFile.end} (${c.lines} Zeilen)`,
      )
      .join('\n');
    problems.push(
      was === undefined
        ? `NEUE Kopie: ${pair} (${lines} Zeilen)\n${where}`
        : `Kopie WÄCHST: ${pair} — ${lines} statt ${was} Zeilen\n${where}`,
    );
  }
  for (const [pair, was] of Object.entries(allowed)) {
    const lines = now[pair] ?? 0;
    if (lines < was) {
      problems.push(
        `Ausnahmeliste veraltet: ${pair} hat jetzt ${lines} statt ${was} Zeilen — \`pnpm guards:shrink\``,
      );
    }
  }
  const total = Object.values(now).reduce((a, b) => a + b, 0);
  return {
    problems,
    summary: `${clones.length} Klone, ${total} doppelte Zeilen in ${Object.keys(now).length} Dateipaaren`,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { problems, summary } = checkClones();
  if (problems.length > 0) {
    console.error(`✗ Kopien (jscpd): ${summary}\n\n${problems.join('\n\n')}`);
    process.exit(1);
  }
  console.log(`✓ Kopien (jscpd): ${summary} — alle auf der Ausnahmeliste`);
}
