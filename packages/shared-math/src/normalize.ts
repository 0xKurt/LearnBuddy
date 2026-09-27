// Canonicalization helper for local answer evaluation (short answers).

/**
 * Normalize a short-answer string for token-overlap comparison.
 * NFKC normalize → lowercase → strip punctuation → collapse whitespace → ß↔ss.
 */
export function normalizeShortAnswer(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
