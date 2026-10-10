// Where the notation a domain draws stands in a text (issue #107): the learning domain's $…$
// math. Markdown keeps such a piece whole — its line breaks and its stars and underscores are
// the formula's, not Markdown's (lib/buddy/markdown.ts). Without a domain there is none, and
// every character is plain text. Pure logic (unit tests).

import { slot } from '../registry.js';

/** One piece of notation: from `start` up to (not including) `end`. */
export type NotationSpan = { start: number; end: number };

/** Finds the pieces of notation in a text (lib/learning/register.tsx fills it). */
export const notation = slot<(text: string) => readonly NotationSpan[]>('Notation im Text');

const NONE: readonly NotationSpan[] = [];

/** The pieces of notation in this text, in order; none without a domain. */
export function notationSpans(text: string): readonly NotationSpan[] {
  return notation.get()?.(text) ?? NONE;
}
