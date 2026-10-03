// `pnpm guards:shrink` (issue #313, docs/engineering-guards.md): after a refactor, the
// Ausnahmelisten follow the code DOWN. It never adds an entry and never raises a number —
// every value becomes min(list, today). Something new that breaks a rule is not written down
// here; it is fixed, or it stays red.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { byPair, findClones } from './clones.mjs';
import { findDeadCode } from './knip.mjs';
import {
  BASELINES,
  MAX_LINES,
  REPO_ROOT,
  countedLines,
  importsRawPressable,
  styleNumbers,
} from './measure.mjs';

/** @param {string} name */
const path = (name) => join(BASELINES, name);
/** @param {string} name */
const load = (name) => JSON.parse(readFileSync(path(name), 'utf8'));
/** @param {string} name @param {object} json */
const save = (name, json) => writeFileSync(path(name), JSON.stringify(json, null, 2) + '\n');
/** @param {string} file */
const exists = (file) => existsSync(join(REPO_ROOT, file));
/** @param {Record<string, number>} o */
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

/**
 * min(list, today) per entry; entries at or below `floor` leave the list.
 * @param {Record<string, number>} list
 * @param {(key: string) => number} today
 * @param {number} floor
 */
function shrinkCounts(list, today, floor) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const [key, was] of Object.entries(list)) {
    const now = Math.min(was, today(key));
    if (now > floor) out[key] = now;
  }
  return out;
}

/** @param {string} label @param {number} before @param {number} after */
function report(label, before, after) {
  console.log(`${label}: ${before} → ${after}${after < before ? '  (geschrumpft)' : ''}`);
}

const style = load('style-numbers.json');
const styleFiles = shrinkCounts(style.files, (f) => (exists(f) ? styleNumbers(f) : 0), 0);
report('Stilzahlen', style.total, sum(styleFiles));
save('style-numbers.json', { ...style, total: sum(styleFiles), files: styleFiles });

const lines = load('max-lines.json');
const limitOf = (/** @type {string} */ f) =>
  Object.entries(MAX_LINES).find(([dir]) => f.startsWith(`${dir}/`))?.[1] ?? 0;
/** @type {Record<string, number>} */
const lineFiles = {};
for (const [file, was] of Object.entries(/** @type {Record<string, number>} */ (lines.files))) {
  const now = exists(file) ? Math.min(was, countedLines(file)) : 0;
  if (now > limitOf(file)) lineFiles[file] = now;
}
report(
  'Dateien über der Zeilengrenze',
  Object.keys(lines.files).length,
  Object.keys(lineFiles).length,
);
save('max-lines.json', { ...lines, files: lineFiles });

const pressable = load('pressable.json');
const pressableFiles = pressable.files.filter(
  (/** @type {string} */ f) => exists(f) && importsRawPressable(f),
);
report('Dateien mit rohem Pressable', pressable.files.length, pressableFiles.length);
save('pressable.json', { ...pressable, files: pressableFiles });

const clones = load('clones.json');
const clonesNow = findClones();
const pairsNow = byPair(clonesNow);
const pairs = shrinkCounts(clones.pairs, (p) => pairsNow[p] ?? 0, 0);
report('Kopien (doppelte Zeilen)', clones.lines, sum(pairs));
const keptClones = clonesNow.filter((c) => {
  const [a, b] = [c.firstFile.name, c.secondFile.name].sort();
  return (a === b ? `${a} (in sich)` : `${a} <-> ${b}`) in pairs;
}).length;
save('clones.json', {
  ...clones,
  clones: Math.min(clones.clones, keptClones),
  lines: sum(pairs),
  pairs,
});

const knip = load('knip.json');
const deadNow = new Set(findDeadCode());
const findings = knip.findings.filter((/** @type {string} */ f) => deadNow.has(f));
report('Toter Code (knip)', knip.findings.length, findings.length);
save('knip.json', { ...knip, total: findings.length, findings });

const registryPath = join(REPO_ROOT, 'tools', 'guards', 'drawing-registry.json');
const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
const bestand = Object.fromEntries(Object.entries(registry.bestand).filter(([f]) => exists(f)));
report(
  'Zeichenkomponenten ungeprüft',
  Object.keys(registry.bestand).length,
  Object.keys(bestand).length,
);
writeFileSync(registryPath, JSON.stringify({ ...registry, bestand }, null, 2) + '\n');

console.log(
  '\nDas Web-Bundle-Budget senkt `node tools/guards/bundle-budget.mjs --shrink` nach einem `expo export`.',
);
