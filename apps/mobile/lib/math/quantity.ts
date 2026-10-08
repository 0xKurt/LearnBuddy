// A number and the unit right after it stay on one line (issue #467): "15 km/h" broke at 360 px
// into "15" at a line's end and "km/h" at the next one's start. The space between them becomes a
// narrow no-break space, as DIN 1338 and the Duden set a quantity. What counts as a unit is the
// unit table the grading uses (packages/shared-math/src/units.ts) — a rule in code, not a list
// of words about content: "15 Kinder" stays breakable. Display only: the spoken form is built
// from the text as written (prompt.ts promptForSpeech, lib/speech/spoken.ts).

import { CASE_SENSITIVE_UNITS, UNIT_ALIASES } from '../../../../packages/shared-math/src/units.js';

/** U+202F, the narrow no-break space between a number and its unit. */
export const NO_BREAK = '\u202F';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * A number (any digit, also "½"), the spaces after it on the same line, and a unit from `units`
 * that ends there — no letter or digit right after it, so "2 mindestens" is not "2 min".
 * Longest units first: "km/h" before "km", "°C" before "°".
 */
function quantity(units: string[], flags: string): RegExp {
  const symbols = [...units]
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join('|');
  return new RegExp(
    `(\\p{N})[ \\t\\u00A0\\u202F]+(?=(?:${symbols})(?![\\p{L}\\p{N}]))`,
    `gu${flags}`,
  );
}

/** Symbols and names as the grading reads them, in any case ("km/h", "Stunden", "°C"). */
const BY_NAME = quantity(Object.keys(UNIT_ALIASES), 'i');
/** Capital symbols only as written: "5 N" is newton, "5 n" a variable. */
const BY_SYMBOL = quantity(Object.keys(CASE_SENSITIVE_UNITS), '');

/**
 * The text with every number bound to the unit after it. `afterNumber`: the text continues a
 * number that stands before it ("$15$ km/h", "**15** km/h"), so a unit at its start is bound too.
 */
export function bindUnits(text: string, { afterNumber = false } = {}): string {
  const lead = afterNumber ? '0' : '';
  const bound = (lead + text).replace(BY_NAME, `$1${NO_BREAK}`).replace(BY_SYMBOL, `$1${NO_BREAK}`);
  return bound.slice(lead.length);
}
