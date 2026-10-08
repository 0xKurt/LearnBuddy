// Dead code (issue #313, docs/engineering-guards.md): knip finds unused files, exports, types
// and dependencies across the workspace (configuration: knip.jsonc).
//
// What may stay is what main has, measured on main's tree (base.mjs, issue #452). A new finding
// is red; a finding that is gone is gone on main once merged — there is no list to edit.

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { treeAllowance } from './base.mjs';
import { REPO_ROOT } from './measure.mjs';

/**
 * Every finding as `kind: file: name`, sorted.
 * @param {string} [root] the tree to look at (base.mjs passes main's) @returns {string[]}
 */
export function findDeadCode(root = REPO_ROOT) {
  const run = spawnSync(
    join(REPO_ROOT, 'node_modules', '.bin', 'knip'),
    ['--reporter', 'json', '--no-progress', '--no-exit-code'],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (run.status !== 0) throw new Error(`knip failed (${run.status}):\n${run.stderr}`);
  // knip prints configuration errors (a plugin that cannot load its config) to stderr and
  // carries on with less knowledge — that would silently change the findings, so it is red.
  if (/ERROR/.test(run.stderr)) throw new Error(`knip reported an error:\n${run.stderr}`);
  /** @type {{ issues: Array<Record<string, unknown> & { file: string }> }} */
  const report = JSON.parse(run.stdout);
  /** @type {string[]} */
  const out = [];
  for (const issue of report.issues) {
    for (const [kind, items] of Object.entries(issue)) {
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        // `duplicates` lists groups of names; every other kind lists { name }.
        const name = Array.isArray(item)
          ? item.map((i) => i.name).join(' = ')
          : /** @type {{ name: string }} */ (item).name;
        out.push(kind === 'files' ? `files: ${issue.file}` : `${kind}: ${issue.file}: ${name}`);
      }
    }
  }
  return out.sort();
}

/**
 * The guard: returns the problems, empty when green.
 * @param {string[]} allowed the findings main has (base.mjs)
 */
export function checkDeadCode(allowed) {
  const now = findDeadCode();
  const onMain = new Set(allowed);
  const problems = now.filter((f) => !onMain.has(f)).map((f) => `NEU ungenutzt: ${f}`);
  /** @type {Record<string, number>} */
  const kinds = {};
  for (const f of now) {
    const kind = f.slice(0, f.indexOf(':'));
    kinds[kind] = (kinds[kind] ?? 0) + 1;
  }
  const parts = Object.entries(kinds).map(([k, n]) => `${n} ${k}`);
  return { problems, summary: `${now.length} Funde (${parts.join(', ')})` };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { problems, summary } = checkDeadCode(treeAllowance('knip', findDeadCode));
  if (problems.length > 0) {
    console.error(`✗ Toter Code (knip): ${summary}\n\n${problems.join('\n\n')}`);
    process.exit(1);
  }
  console.log(`✓ Toter Code (knip): ${summary} — nicht mehr als auf main`);
}
