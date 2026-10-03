// Git merge driver for the Ausnahmelisten (issue #328, docs/engineering-guards.md).
//
// Almost every PR lowers a number on a list (`pnpm guards:shrink`), so two branches touching the
// same list met in a conflict that had no content: two smaller numbers for the same entry. This
// driver resolves it the one safe way: per entry the LARGER of both sides, the union of both
// lists. The result can only be too loose, never too tight — and too loose is what the ratchet in
// guards.test.mjs reports right after the merge ("`pnpm guards:shrink`"), while no-growth.mjs
// still holds every list against main.
//
//   .gitattributes:  tools/guards/baselines/*.json merge=lb-baseline
//   git config merge.lb-baseline.driver "node tools/guards/merge-baseline.mjs %O %A %B"
//   (set by `pnpm install`, package.json "prepare")

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Merges two versions of a list: numbers take the maximum, string lists the sorted union,
 * objects merge key by key; anything else (the `$comment`) keeps our side.
 * @param {unknown} ours
 * @param {unknown} theirs
 * @returns {unknown}
 */
export function mergeBaselines(ours, theirs) {
  if (typeof ours === 'number' && typeof theirs === 'number') return Math.max(ours, theirs);
  if (Array.isArray(ours) && Array.isArray(theirs)) {
    return [...new Set([...ours, ...theirs])].sort();
  }
  if (isObject(ours) && isObject(theirs)) {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const key of [...Object.keys(ours), ...Object.keys(theirs)]) {
      if (key in out) continue;
      out[key] =
        key in ours && key in theirs
          ? mergeBaselines(ours[key], theirs[key])
          : key in ours
            ? ours[key]
            : theirs[key];
    }
    return out;
  }
  return ours ?? theirs;
}

/** @param {unknown} v @returns {v is Record<string, unknown>} */
function isObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // %O (base) is not needed: the larger side of each entry is safe whatever the base was.
  const [, , , oursPath, theirsPath] = process.argv;
  if (!oursPath || !theirsPath) {
    console.error('usage: merge-baseline.mjs <base> <ours> <theirs>');
    process.exit(2);
  }
  try {
    const merged = mergeBaselines(
      JSON.parse(readFileSync(oursPath, 'utf8')),
      JSON.parse(readFileSync(theirsPath, 'utf8')),
    );
    writeFileSync(oursPath, `${JSON.stringify(merged, null, 2)}\n`);
  } catch (err) {
    // Not JSON on one side (a hand-edited conflict): leave it to git as an ordinary conflict.
    console.error(`merge-baseline: ${String(err)}`);
    process.exit(1);
  }
}
