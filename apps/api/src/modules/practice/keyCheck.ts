// Does the answer key agree with the question it belongs to (issue #157)?
//
// The item validation checks shape, consistency, language and whether the solution is given
// away in the question — none of which says the generated key is RIGHT. The rule check then
// compares her answer against exactly that key and says "falsch" with full authority. The
// external audit of 30.09. put a key of `8` on `6 + 4` and watched the correct answer `10`
// be rejected: a sure-sounding judgement standing in for an unchecked source, and a child
// left to argue with it.
//
// Where arithmetic makes it decidable, it is decided here — before the question is ever
// asked. That is a small set on purpose: a question whose prompt is nothing but a constant
// expression. Everything else needs subject knowledge, and claiming to check it would be
// the same mistake one level up (CLAUDE.md rule 5). Checked task families with solutions
// computed from parameters are issue #162.

import { compileExpression, parseCanonicalKey, plainMath } from '@learnbuddy/shared-math';

/** Within this of the key, the two agree — floating point, not tolerance for a wrong key. */
const EPSILON = 1e-9;

/**
 * The arithmetic the prompt asks for, when the prompt is nothing else.
 *
 * "6 + 4", "17 · 23 = ?", "$\\frac{1}{2} + \\frac{1}{4}$" qualify. "Wie viel sind 20 % von
 * 80?" does not — it reads as a sentence, and a parser that guessed at it would invent the
 * very certainty this module exists to withhold.
 */
export function askedArithmetic(prompt: string): number | null {
  const bare = plainMath(prompt)
    .replace(/\s+/g, ' ')
    .trim()
    // A trailing "= ?" or "=" is how a worksheet writes the question mark.
    .replace(/=\s*\?*\s*$/, '')
    .trim();
  if (bare.length === 0 || bare.length > 60) return null;
  // Any letter means words, a variable or a unit: not a constant to compute.
  if (/\p{L}/u.test(bare)) return null;
  if (!/[+\-*/·:^]/.test(bare)) return null;
  const fn = compileExpression(bare);
  if (!fn) return null;
  const value = fn(0);
  return Number.isFinite(value) ? value : null;
}

/**
 * False only when the question's own arithmetic contradicts the key. Unknown questions and
 * unparseable keys answer true: this says "no proof against it", never "proven right".
 */
export function keyAgreesWithPrompt(item: {
  kind: string;
  prompt: string;
  answer: string;
  unit: string | null;
}): boolean {
  if (item.kind !== 'numeric' && item.kind !== 'short' && item.kind !== 'formula') return true;
  const asked = askedArithmetic(item.prompt);
  if (asked === null) return true;
  const key = parseCanonicalKey(item.answer);
  if (key.value === null) return true;
  // A unit on either side means the question was about more than the bare arithmetic.
  if (item.unit || key.unit) return true;
  return Math.abs(key.value - asked) <= EPSILON * Math.max(1, Math.abs(asked));
}
