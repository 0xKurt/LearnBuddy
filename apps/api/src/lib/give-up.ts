// Deterministic "the student did not actually answer" detector.
//
// The tutor model self-reports its verdict; trusting it blindly let a learner
// who typed "Weiss nicht" three times get graded "Genau!" (correct). This is
// the server-side safety net: a give-up / help-request / empty / punctuation
// message can NEVER be recorded as correct or partially_correct — it's a
// `skipped`. Asymmetric on purpose: a false "skipped" only reschedules an
// item for more practice; a false "correct" tells a child they've mastered
// something they don't know. The first is cheap, the second is the bug.

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
  'dunno',
  // Short give-ups that would be ambiguous as substrings
  'weiss nicht',
  'weiss es nicht',
  // French / Spanish / Italian short forms safe as whole messages
  'no se',
  'ni idea',
  'boh',
  'jsp',
]);

// Phrases checked as whole-word consecutive sequences anywhere in the message.
// Only include phrases where there is NO plausible real-answer sentence that
// contains the same consecutive tokens.  "weiss nicht" is intentionally
// excluded here and handled as a prefix-only or exact match above, because
// "Es ist weiß, nicht rot" → normalized "es ist weiss nicht rot" would
// otherwise be a false positive.
const GIVE_UP_PHRASES: string[][] = [
  ['ich', 'weiss', 'nicht'],
  ['ich', 'weiss', 'es', 'nicht'],
  ['du', 'weisst', 'nicht'],
  ['keine', 'ahnung'],
  ['keinen', 'plan'],
  ['keine', 'idee'],
  ['no', 'idea'],
  ['not', 'sure'],
  ['dont', 'know'],
  ['do', 'not', 'know'],
  ['ni', 'puta', 'idea'],
  ['no', 'tengo', 'ni', 'idea'],
  ['je', 'ne', 'sais', 'pas'],
  ['aucune', 'idee'],
  ['non', 'lo', 'so'],
  ['non', 'saprei'],
  ['hilf', 'mir'],
  ['help', 'me'],
];

// Phrases that fire ONLY when they LEAD the message (token 0 onward). This
// catches "weiss nicht aber...", "weiss nicht so genau", "weiss nicht ehrlich"
// without misfiring on "Es ist weiss, nicht rot" — the descriptive sentence
// never starts with "weiss nicht" but a real give-up almost always does.
const GIVE_UP_LEADING: string[][] = [
  ['weiss', 'nicht'],
  ['weiss', 'es', 'nicht'],
];

function startsWith(tokens: string[], phrase: string[]): boolean {
  if (tokens.length < phrase.length) return false;
  return phrase.every((w, i) => tokens[i] === w);
}

// U+0300–U+036F = combining diacritical marks. Built from escapes (not a
// literal char class) so "é"→"e", "ñ"→"n", "ä"→"a" reliably.
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

function normalize(text: string): string {
  return text
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/['''`´]/g, '') // join contractions: "don't" → "dont"
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // other punctuation → space
    .replace(/\s+/g, ' ')
    .trim();
}

function hasConsecutivePhrase(tokens: string[], phrase: string[]): boolean {
  if (phrase.length === 0) return false;
  const first = phrase[0]!;
  for (let i = 0; i <= tokens.length - phrase.length; i++) {
    if (tokens[i] === first && phrase.every((w, j) => tokens[i + j] === w)) {
      return true;
    }
  }
  return false;
}

/** True when the message isn't a genuine attempt at the answer. */
export function isNonAnswer(raw: string): boolean {
  const norm = normalize(raw);
  if (norm.length === 0) return true; // empty or pure punctuation ("?", "...")
  if (GIVE_UP_EXACT.has(norm)) return true;
  const tokens = norm.split(' ');
  if (GIVE_UP_LEADING.some((phrase) => startsWith(tokens, phrase))) return true;
  return GIVE_UP_PHRASES.some((phrase) => hasConsecutivePhrase(tokens, phrase));
}
