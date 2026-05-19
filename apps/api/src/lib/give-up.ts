// Deterministic "the student did not actually answer" detector.
//
// The tutor model self-reports its verdict; trusting it blindly let a learner
// who typed "Weiss nicht" three times get graded "Genau!" (correct). This is
// the server-side safety net: a give-up / help-request / empty / punctuation
// message can NEVER be recorded as correct or partially_correct — it's a
// `skipped`. Asymmetric on purpose: a false "skipped" only reschedules an
// item for more practice; a false "correct" tells a child they've mastered
// something they don't know. The first is cheap, the second is the bug.

// Strong phrases that, if present anywhere, mean "I'm not answering" — these
// don't occur inside real answers across de/en/fr/es/it.
const GIVE_UP_CONTAINS = [
  'weiss nicht',
  'weiss es nicht',
  'keine ahnung',
  'keinen plan',
  'keine idee',
  'ich weiss nicht',
  'no idea',
  'not sure',
  'dont know',
  'do not know',
  'dunno',
  'no se', // "no sé" after diacritic strip
  'ni idea',
  'ni puta idea',
  'no tengo ni idea',
  'je ne sais pas',
  'aucune idee',
  'non lo so',
  'non saprei',
  'hilf mir',
  'help me',
];

// Whole-message give-ups (the entire normalized text equals one of these).
const GIVE_UP_EXACT = new Set([
  'ka',
  'kp',
  'idk',
  'boh',
  'jsp',
  'pass',
  'skip',
  'weiter',
  'hilfe',
  'help',
  'hint',
  'tipp',
  'na',
  'nichts',
  'nada',
  'rien',
  'niente',
]);

// U+0300–U+036F = combining diacritical marks. Built from escapes (not a
// literal char class) so "é"→"e", "ñ"→"n", "ä"→"a" reliably.
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

function normalize(text: string): string {
  return text
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/['’‘`´]/g, '') // join contractions: "don't" → "dont"
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // other punctuation → space
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when the message isn't a genuine attempt at the answer. */
export function isNonAnswer(raw: string): boolean {
  const norm = normalize(raw);
  if (norm.length === 0) return true; // empty or pure punctuation ("?", "...")
  if (GIVE_UP_EXACT.has(norm)) return true;
  return GIVE_UP_CONTAINS.some((p) => norm.includes(p));
}
