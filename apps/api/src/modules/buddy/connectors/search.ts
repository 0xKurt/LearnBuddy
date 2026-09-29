// Turning a free-text query into a Postgres full-text query without letting
// the model (or a worksheet) inject tsquery syntax: only letters and digits
// survive, every word matches as a prefix ("Röm" finds "Römer", "Römern"),
// and any word may match. ADR 0005 §Connectors.

/** "die Römer & Kaiser!" → "römer:* | kaiser:*"; null when nothing searchable is left. */
export function prefixQuery(text: string, maxWords = 8): string | null {
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3)
    .slice(0, maxWords);
  if (words.length === 0) return null;
  return [...new Set(words)].map((w) => `${w}:*`).join(' | ');
}

/**
 * The words worth a trigram comparison (hybrid search, issue #23): 4+ characters —
 * shorter German words are almost all function words, and three letters share too
 * few trigrams for a meaningful similarity. Plain text, never tsquery syntax.
 */
export function trigramWords(text: string, maxWords = 8): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length >= 4),
    ),
  ].slice(0, maxWords);
}
