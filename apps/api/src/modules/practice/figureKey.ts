// The two forms a number key read off a figure takes (docs/architecture.md §Practice): a count
// ("Wie viele Kanten?", "Wie viele Lampen leuchten?") and a measure with a unit ("Volumen in cm³",
// "Stromstärke in A"). One copy for every figure whose key code computes — solids (#255) and
// circuits (#261) — so a key is held to the same rule wherever it is read off.

import { canonicalizeUnit, parseCanonicalKey, unitFactor } from '@learnbuddy/shared-math';

import { numberKeyTolerance } from './chartRead.js';
import type { ItemDraft } from './items.js';

/** A whole-number key without a unit that is exactly `n`. */
export function exactCount<T extends ItemDraft>(it: T, n: number): T | null {
  if (it.kind !== 'numeric' || it.unit !== null) return null;
  const key = parseCanonicalKey(it.answer);
  return key.value === n && !key.unit ? { ...it, tolerance: null } : null;
}

/**
 * A number key that agrees with `value`, given in `from` (null: no unit at all) — in the key's
 * own unit or the item's, converted exactly, and written exactly or rounded at the precision it
 * is written in (`numberKeyTolerance`, the chart rule).
 */
export function measured<T extends ItemDraft>(it: T, value: number, from: string | null): T | null {
  if (it.kind !== 'numeric') return null;
  const key = parseCanonicalKey(it.answer);
  const to = canonicalizeUnit(it.unit) ?? key.unit ?? null;
  let inUnit = value;
  if (from === null) {
    if (to !== null) return null;
  } else {
    const factor = to === null ? null : unitFactor(from, to);
    if (factor === null) return null;
    inUnit = (value * Number(factor.num)) / Number(factor.den);
  }
  const tolerance = numberKeyTolerance(it.answer, inUnit, 0);
  return tolerance === undefined ? null : { ...it, tolerance };
}
