// Module boundaries (issue #107, owner 10.10.): generic Buddy code never imports the learning
// domain. What is which: boundaries.config.mjs. dependency-cruiser (MIT) draws the import graph.
//
// What may stay is what main has, measured on main's tree (base.mjs, issue #452): every import
// from generic into domain code is one entry `from -> to`. A new one is red; one that a cut
// removed is gone on main once merged — the list only shrinks, there is no file to edit.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { treeAllowance } from './base.mjs';
import { ROOTS } from './boundaries.config.mjs';
import { REPO_ROOT } from './measure.mjs';

const CONFIG = join(REPO_ROOT, 'tools', 'guards', 'boundaries.config.mjs');

/**
 * Every import from generic into domain code as `from -> to`, sorted.
 * @param {string} [root] the tree to look at (base.mjs passes main's) @returns {string[]}
 */
export function findBoundaryEdges(root = REPO_ROOT) {
  const roots = ROOTS.filter((r) => existsSync(join(root, r)));
  if (roots.length === 0) return [];
  const run = spawnSync(
    join(REPO_ROOT, 'node_modules', '.bin', 'depcruise'),
    [...roots, '--config', CONFIG, '--output-type', 'json', '--no-progress'],
    { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  // Exit code = number of violations; only an unreadable answer is a failure of the tool.
  /** @type {{ summary: { violations: Array<{ from: string, to: string, rule: { name: string } }> } }} */
  let report;
  try {
    report = JSON.parse(run.stdout);
  } catch {
    throw new Error(`dependency-cruiser failed (${run.status}):\n${run.stderr}`);
  }
  const edges = report.summary.violations
    .filter((v) => v.rule.name === 'generic-to-domain')
    .map((v) => `${v.from} -> ${v.to}`);
  return [...new Set(edges)].sort();
}

/**
 * The guard: returns the problems, empty when green.
 * @param {string[]} allowed the edges main has (base.mjs)
 */
export function checkBoundaries(allowed) {
  const now = findBoundaryEdges();
  const onMain = new Set(allowed);
  const problems = now
    .filter((e) => !onMain.has(e))
    .map(
      (e) =>
        `NEU generisch → Domain: ${e}\n  Die Domain meldet sich im Kern an (Registry), der Kern nennt sie nie (boundaries.config.mjs).`,
    );
  const files = new Set(now.map((e) => e.slice(0, e.indexOf(' -> ')))).size;
  return { problems, summary: `${now.length} Importe in ${files} Dateien` };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { problems, summary } = checkBoundaries(treeAllowance('boundaries', findBoundaryEdges));
  if (problems.length > 0) {
    console.error(`✗ Grenzen generisch → Domain: ${summary}\n\n${problems.join('\n\n')}`);
    process.exit(1);
  }
  console.log(`✓ Grenzen generisch → Domain: ${summary} — nicht mehr als auf main`);
}
