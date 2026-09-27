// Text helpers for provenance checks. These are NOT language understanding:
// they only verify that a quote the model cites really occurs in what the
// learner wrote (normalising case, whitespace, quotes and dashes).

const QUOTES = /[‘’‚‛′`´]/g;
const DQUOTES = /[“”„‟″«»]/g;
const DASHES = /[‐-―−]/g;

export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(QUOTES, "'")
    .replace(DQUOTES, '"')
    .replace(DASHES, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

const EDGE = /^["'.,!?;:\s…-]+|["'.,!?;:\s…-]+$/g;
const WORD_CHAR = /[\p{L}\p{N}]/u;
/** A quote this short is a fragment unless it is everything she wrote in that message. */
const MIN_FRAGMENT = 4;

function trimmed(text: string): string {
  return normalizeForMatch(text).replace(EDGE, '');
}

function atWordBoundaries(haystack: string, needle: string): boolean {
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + 1)) {
    const before = at === 0 ? '' : haystack.charAt(at - 1);
    const after = haystack.charAt(at + needle.length);
    if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) return true;
  }
  return false;
}

/**
 * True when `quote` is the learner's own words: whole words, in order, from one of the
 * messages in `source` (after normalisation). A fragment of a word ("ge" in "geschlagen")
 * never counts, and a very short quote counts only when it is the whole message (a bare
 * "Ja" answering Buddy's question). Structural comparison against her text — not a list
 * of words (CLAUDE.md rule 3).
 */
export function quoteOccursIn(quote: string, source: string | readonly string[]): boolean {
  const q = trimmed(quote);
  if (q.length === 0) return false;
  const messages = (typeof source === 'string' ? [source] : source).map(trimmed);
  const letters = [...q].filter((c) => WORD_CHAR.test(c)).length;
  if (letters < MIN_FRAGMENT) return messages.some((m) => m === q);
  return messages.some((m) => atWordBoundaries(m, q));
}
