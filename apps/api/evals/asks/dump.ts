// The corpus as one JSON document on stdout (issue #106). Everything that reads the 500
// cases from outside — a browsable page, a spreadsheet, the live sample runner — takes it
// from here instead of parsing five TypeScript files.
//
//   pnpm --filter @learnbuddy/api exec tsx evals/asks/dump.ts > asks.json
//
// Counts go to stderr, so the JSON on stdout stays pipeable.
// requires live verification in Claude Code session

import { BUDDY } from './buddy.js';
import { LEARNING } from './learning.js';
import { LIFE } from './life.js';
import { MATERIAL } from './material.js';
import { TIME } from './time.js';

const all = { learning: LEARNING, time: TIME, material: MATERIAL, buddy: BUDDY, life: LIFE };

const counts = Object.entries(all).map(([domain, list]) => ({
  domain,
  cases: list.length,
  hunches: list.filter((a) => a.hunch).length,
  safeguarding: list.filter((a) => a.expect.kind === 'safeguarding').length,
}));

process.stderr.write(
  `${counts.map((c) => `${c.domain} ${c.cases} (${c.hunches} Verdacht)`).join(' · ')}\n` +
    `gesamt ${counts.reduce((n, c) => n + c.cases, 0)} Fälle, ` +
    `${counts.reduce((n, c) => n + c.hunches, 0)} mit Verdacht, ` +
    `${counts.reduce((n, c) => n + c.safeguarding, 0)} Notlagen\n`,
);
process.stdout.write(JSON.stringify(all));
