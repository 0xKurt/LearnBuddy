// "Kurz erklärt" means short (live finding 7: ~200 words in 5 paragraphs, "Wem?."):
// a word limit code can count and a clean-up of doubled punctuation. Structure only
// (words, sentence ends, punctuation marks) — no language understanding.

/** The most words of the explanation before questions (explain mode). The prompt asks for 70. */
export const INTRO_MAX_WORDS = 80;
/** The most words of an explanation written again ("Anders erklären"). The prompt asks for 60. */
export const REEXPLAIN_MAX_WORDS = 80;

/** Words as a reader counts them; a math run ($…$) counts as one. */
export function wordCount(text: string): number {
  return (text.replace(/\$[^$]*\$/g, ' x ').match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [])
    .length;
}

/**
 * Doubled punctuation the model sometimes writes: "Wem?." → "Wem?", "„Wem?“." → "„Wem?“",
 * "!." → "!", ".." → "." (an ellipsis "…" or "..." stays), "??" → "?". Spaces are left alone
 * (French puts one before "?").
 */
export function cleanPunctuation(text: string): string {
  return text
    .replace(/([?!])(["“”„»«'’]?)\.(?!\.)/g, '$1$2')
    .replace(/(?<!\.)\.\.(?!\.)/g, '.')
    .replace(/([?!])\1+/g, '$1');
}

/**
 * The text cut after its last whole sentence within `max` words (at least the first sentence);
 * paragraphs are kept. Used only when a repair did not make it short enough.
 */
export function cutToWords(text: string, max: number): string {
  if (wordCount(text) <= max) return text;
  const sentences = text.match(/[^.!?…]+(?:[.!?…]+["“”»«'’)]*|$)\s*/g) ?? [text];
  let out = '';
  for (const s of sentences) {
    if (out && wordCount(out + s) > max) break;
    out += s;
  }
  return out.trim();
}
