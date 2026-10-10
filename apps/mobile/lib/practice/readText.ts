// What Buddy reads of a practice question and of his reaction to an answer (Vorlesen, Gespräch):
// the question with its choices as "A: …, B: …", a fill-in gap as the gap word, and the verdict
// word before the reply. Math is read in words (lib/math/speak.ts). Pure logic, unit-tested; the
// plain reading of a reply is the core's (lib/speech/spoken.ts spokenText).

import { sayMath, type SpokenWords } from '../math/speak.js';
import { spokenText } from '../speech/spoken.js';

/** Gaps of three or more underscores outside $…$ as the blank word (math reads its own). */
function withSpokenBlanks(text: string, words: SpokenWords): string {
  return text
    .split(/(\$[^$]*\$)/)
    .map((part) => (part.startsWith('$') ? part : part.replace(/_{3,}/g, ` ${words.blank} `)))
    .join('');
}

/** "A", "B", … for the n-th choice (0-based); past Z it counts on ("27"). */
export function choiceLetter(index: number): string {
  return index >= 0 && index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

/** Ends a sentence so the voice pauses before what follows ("Wie viel ist 3 + 4" → "… 4."). */
export function endSentence(text: string): string {
  const t = text.trim();
  if (t.length === 0) return t;
  return /[.?!:;…]$/.test(t) ? t : `${t}.`;
}

/** The question read aloud: the prompt, then each choice as "A: …, B: …". The topic is not read. */
export function questionReadText(
  prompt: string,
  choices: readonly string[] | null,
  words: SpokenWords,
): string {
  const say = sayMath(words);
  // A fill-in gap outside math ("Ich helfe ___ Mutter.") is read as the gap word, as the
  // screen reader says it, never as underscores (p2-voice-reads-blank-as-underscores).
  const question = endSentence(spokenText(withSpokenBlanks(prompt, words), say));
  const options = (choices ?? [])
    .map((c, i) => ({ letter: choiceLetter(i), text: spokenText(c, say) }))
    .filter((c) => c.text.length > 0)
    .map((c) => `${c.letter}: ${c.text}`);
  if (options.length === 0) return question;
  return `${question} ${endSentence(options.join(', '))}`.trim();
}

/**
 * Buddy's reaction after an answer: the verdict word ("Richtig") and the reply.
 * The word is left out when the reply already starts with it.
 */
export function feedbackReadText(
  verdictWord: string | null,
  reply: string,
  words: SpokenWords,
): string {
  const said = spokenText(reply, sayMath(words));
  const word = verdictWord?.trim() ?? '';
  if (!word) return said;
  if (said.toLocaleLowerCase().startsWith(word.toLocaleLowerCase())) return said;
  return said ? `${endSentence(word)} ${said}` : endSentence(word);
}
