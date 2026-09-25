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
