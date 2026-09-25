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

/** True when `quote` occurs verbatim (after normalisation) in `source`. */
export function quoteOccursIn(quote: string, source: string): boolean {
  const q = normalizeForMatch(quote).replace(/^["'.,!?;:\s]+|["'.,!?;:\s]+$/g, '');
  if (q.length < 2) return false;
  return normalizeForMatch(source).includes(q);
}
