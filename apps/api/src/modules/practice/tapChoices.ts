// Words to tap instead of typing, for vocabulary she is RECOGNISING (issue #147).
//
// The owner's daughter practised a French word list on a phone and had to type every
// answer: "ggfs sollten bei vokabeln halt auch lernkarten gemacht werden. mit der
// moeglichkeit das richtige anzutippen oder so" (30.09.). Typing twenty words is a lot of
// work for little repetition, and every slip becomes the subject instead of the word.
//
// Two decisions keep this small:
//
// 1. Tapping is a way IN, not a different question. The chosen word is sent as if she had
//    typed it and is graded by the same rules, so the key stays the key, typing keeps
//    working, and nothing in grading, FSRS or the tutor has to know about this at all.
// 2. Only where it does not defeat the exercise. Reading "le vélo" and picking "das
//    Fahrrad" is recognition, which is what tapping tests. Writing "le vélo" from "das
//    Fahrrad" is production — a class test asks for it, and a list of four words would
//    hand it over. So: tapping only when the answer is in her OWN language.
//
// The distractors are her own words from the same session, never invented: a word she has
// not met is no test of the one she has.

/** The answer of every vocabulary question in the set, in the session's own order. */
export type VocabSibling = { id: string; answer: string; lang: string | null };

/** How many words she sees at once, the right one included. */
export const TAP_CHOICE_COUNT = 4;

/**
 * Stable per question, without a clock or a random source: reloading the screen must not
 * reshuffle the words under her finger, and the walkthrough must see the same set twice.
 */
function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function tapChoicesFor(
  item: { id: string; kind: string; answer: string; lang: string | null },
  siblings: VocabSibling[],
  /** The learner's own language (ISO 639-1). */
  ownLanguage: string,
): string[] | null {
  if (item.kind !== 'vocab') return null;
  // Producing the foreign word is the point of the exercise; four words would give it away.
  if (item.lang === null || item.lang.toLowerCase() !== ownLanguage.toLowerCase()) return null;

  const seen = new Set([item.answer]);
  const pool: string[] = [];
  for (const s of siblings) {
    if (s.id === item.id) continue;
    // Same language, or the words would not even look like possible answers.
    if (s.lang === null || s.lang.toLowerCase() !== item.lang.toLowerCase()) continue;
    if (seen.has(s.answer)) continue;
    seen.add(s.answer);
    pool.push(s.answer);
  }
  // Too few of her own words to choose from: she types, as before. Three wrong ones and
  // the right one; with fewer, the right answer stands out by being the only real option.
  if (pool.length < TAP_CHOICE_COUNT - 1) return null;

  const seed = seedOf(item.id);
  // A different starting point per question, so two questions of one set rarely show the
  // same three words. The pool holds no duplicates, so rotating through it is enough —
  // and it always yields as many as it has, which a stride through it need not.
  const start = seed % pool.length;
  const picked = Array.from(
    { length: TAP_CHOICE_COUNT - 1 },
    (_, i) => pool[(start + i) % pool.length]!,
  );

  const choices = [...picked];
  choices.splice(seed % TAP_CHOICE_COUNT, 0, item.answer);
  return choices;
}
