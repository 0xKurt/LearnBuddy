// Web bundle budget (issue #313, docs/engineering-guards.md). Runs after `expo export` —
// scripts/web-walkthrough.sh calls it right after its export, so CI's walkthrough job checks
// the bundle it is about to test, with no second build.
//
// It measures the JavaScript that index.html loads (the main bundle) raw and gzipped and
// compares it with baselines/bundle-budget.json. More than TOLERANCE over the budget is red:
// a new library or a big component has to be a decision, written into the budget in the same
// PR (with the reason), not an accident. When the bundle got clearly smaller, it says so: the
// budget comes down with it.
//
//   node tools/guards/bundle-budget.mjs [dist-dir]          check (default apps/mobile/dist-web)
//   node tools/guards/bundle-budget.mjs [dist-dir] --shrink  lower the budget to today's size

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { REPO_ROOT } from './measure.mjs';

const BUDGET = join(REPO_ROOT, 'tools', 'guards', 'baselines', 'bundle-budget.json');

/** @param {string} dist */
function measureBundle(dist) {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script[^>]+src="\/?([^"]+\.js)"/g)].map((m) => m[1] ?? '');
  if (scripts.length === 0) throw new Error(`no <script src> in ${join(dist, 'index.html')}`);
  let bytes = 0;
  let gzip = 0;
  for (const src of scripts) {
    const body = readFileSync(join(dist, src));
    bytes += body.length;
    gzip += gzipSync(body, { level: 9 }).length;
  }
  return { scripts, bytes, gzip };
}

/** @param {number} n */
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

function main() {
  const args = process.argv.slice(2);
  const shrink = args.includes('--shrink');
  const dist = args.find((a) => !a.startsWith('--')) ?? join(REPO_ROOT, 'apps/mobile/dist-web');
  const budget = JSON.parse(readFileSync(BUDGET, 'utf8'));
  const now = measureBundle(dist);
  const tolerance = Number(budget.tolerancePercent) / 100;
  const line = `Web-Bundle: ${kb(now.bytes)} roh, ${kb(now.gzip)} gzip — Budget ${kb(budget.bytes)} / ${kb(budget.gzip)} (+${budget.tolerancePercent} %)`;

  if (shrink) {
    if (now.bytes > budget.bytes || now.gzip > budget.gzip) {
      console.error(
        `${line}\n✗ --shrink senkt nur. Ein größeres Budget ist eine Entscheidung im PR.`,
      );
      process.exit(1);
    }
    writeFileSync(
      BUDGET,
      JSON.stringify({ ...budget, bytes: now.bytes, gzip: now.gzip }, null, 2) + '\n',
    );
    console.log(`${line}\n✓ Budget auf heute gesenkt.`);
    return;
  }

  const over = [];
  if (now.bytes > budget.bytes * (1 + tolerance))
    over.push(`roh ${kb(now.bytes)} > ${kb(budget.bytes * (1 + tolerance))}`);
  if (now.gzip > budget.gzip * (1 + tolerance))
    over.push(`gzip ${kb(now.gzip)} > ${kb(budget.gzip * (1 + tolerance))}`);
  if (over.length > 0) {
    console.error(`${line}\n✗ Bundle-Budget überschritten: ${over.join(', ')}.`);
    console.error(
      '  Was ist neu im Bundle? Eine Bibliothek braucht den Bibliotheks-Check (CLAUDE.md, Engineering-Regel 1);\n' +
        '  ist der Zuwachs gewollt, steht das neue Budget mit Begründung in tools/guards/baselines/bundle-budget.json.',
    );
    process.exit(1);
  }
  console.log(`${line}\n✓ im Budget`);
  if (now.bytes < budget.bytes * (1 - tolerance)) {
    console.log(
      '  Das Bundle ist deutlich kleiner als das Budget — `node tools/guards/bundle-budget.mjs --shrink` senkt es.',
    );
  }
}

main();
