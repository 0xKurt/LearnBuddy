// `pnpm guards` (issue #313, docs/engineering-guards.md): the guards that look at the whole
// repository rather than one file — copies (jscpd), dead code (knip) and the module boundaries
// (dependency-cruiser, #107), each against what main has (base.mjs, issue #452), unused texts (i18n-keys.mjs, #322), the guards' own tests, and the
// tests of the pre-push stamp (#455).
// The per-file guards (file size, tokens only, no raw Pressable) are ESLint rules and run with
// `eslint`.
//
// All of them run in parallel; each prints its own result. Part of `pnpm lint` (CI) and of the
// pre-commit hook.

import { spawn } from 'node:child_process';
import { join } from 'node:path';

import { REPO_ROOT } from './measure.mjs';

const GUARDS = [
  ['Wächter-Tests', ['--test', '--test-reporter=dot', join('tools', 'guards', 'guards.test.mjs')]],
  [
    'Pre-Push-Stempel (#455)',
    ['--test', '--test-reporter=dot', join('tools', 'guards', 'green-tree.test.mjs')],
  ],
  ['Kopien (jscpd)', [join('tools', 'guards', 'clones.mjs')]],
  ['Toter Code (knip)', [join('tools', 'guards', 'knip.mjs')]],
  ['Grenzen generisch → Domain (#107)', [join('tools', 'guards', 'boundaries.mjs')]],
  ['Ungenutzte Texte (#322)', [join('tools', 'guards', 'i18n-keys.mjs')]],
  ['Lizenzen (ausgeliefert, #493)', [join('tools', 'guards', 'licences.mjs')]],
];

const started = Date.now();
const results = await Promise.all(
  GUARDS.map(
    ([label, args]) =>
      new Promise((resolve) => {
        const t0 = Date.now();
        const child = spawn(process.execPath, /** @type {string[]} */ (args), { cwd: REPO_ROOT });
        let out = '';
        child.stdout.on('data', (d) => (out += d));
        child.stderr.on('data', (d) => (out += d));
        child.on('close', (code) => resolve({ label, code, out: out.trim(), ms: Date.now() - t0 }));
      }),
  ),
);

let failed = false;
for (const {
  label,
  code,
  out,
  ms,
} of /** @type {{ label: string, code: number, out: string, ms: number }[]} */ (results)) {
  const seconds = (ms / 1000).toFixed(1);
  if (code === 0) {
    const line = out
      .split('\n')
      .filter((l) => l.startsWith('✓'))
      .pop();
    console.log(line !== undefined ? `${line} (${seconds} s)` : `✓ ${label} (${seconds} s)`);
  } else {
    failed = true;
    console.error(`✗ ${label} (${seconds} s)\n${out}\n`);
  }
}
console.log(`guards: ${((Date.now() - started) / 1000).toFixed(1)} s`);
if (failed) {
  console.error('\nRegeln und Ausnahmelisten: docs/engineering-guards.md');
  process.exit(1);
}
