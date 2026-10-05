// What Buddy reads aloud (Vorlesen, Gespräch) and how a transcript lands in a field. Pure
// logic (no React Native), unit-tested: the words for math come from the
// locale (useSpokenWords), **bold** markers are never read, and a question
// with choices is read as "…? A: …, B: …".

import { markdownPlain } from '../buddy/markdown.js';
import { speakMathText, type SpokenWords } from '../math/speak.js';
import { baseLanguage } from './voice.js';

/**
 * A model-written text as it is read aloud: no Markdown (bold, italic, list markers), math
 * in words; each line of a list is its own sentence (the voice pauses between them).
 */
export function spokenText(text: string, words: SpokenWords): string {
  return speakMathText(markdownPlain(text, { spoken: true }), words)
    .replace(/\s+/g, ' ')
    .trim();
}

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
  // A fill-in gap outside math ("Ich helfe ___ Mutter.") is read as the gap word, as the
  // screen reader says it, never as underscores (p2-voice-reads-blank-as-underscores).
  const question = endSentence(spokenText(withSpokenBlanks(prompt, words), words));
  const options = (choices ?? [])
    .map((c, i) => ({ letter: choiceLetter(i), text: spokenText(c, words) }))
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
  const said = spokenText(reply, words);
  const word = verdictWord?.trim() ?? '';
  if (!word) return said;
  if (said.toLocaleLowerCase().startsWith(word.toLocaleLowerCase())) return said;
  return said ? `${endSentence(word)} ${said}` : endSentence(word);
}

/** TranscribeRequest.lang: a two-letter language ("fr-FR" → "fr"), otherwise null (= app language). */
export function transcriptLang(lang: string | null | undefined): string | null {
  const base = baseLanguage(lang);
  return base !== null && /^[a-z]{2}$/.test(base) ? base : null;
}

/**
 * Puts a transcript into a field: 'replace' for a short answer, 'append' for
 * a message or a long answer that she may dictate in parts, 'line' for the next
 * line of a written calculation path (issue #221) — what she already wrote stays.
 */
export function mergeTranscript(
  current: string,
  spoken: string,
  mode: 'append' | 'replace' | 'line',
  maxLength: number,
): string {
  const said = spoken.trim();
  if (!said) return current;
  const before = current.trimEnd();
  const glue = mode === 'line' ? '\n' : ' ';
  const next = mode === 'replace' || before.length === 0 ? said : `${before}${glue}${said}`;
  return next.slice(0, maxLength);
}

type ThreadMessage = {
  role: 'learner' | 'buddy';
  status: 'processing' | 'done' | 'failed';
  text: string;
  client_message_id: string | null;
};

/**
 * Buddy's latest finished reply after the learner's message with this
 * client id (thread oldest first); null while there is none yet.
 */
export function replyAfter<M extends ThreadMessage>(
  thread: readonly M[],
  clientMessageId: string,
): M | null {
  const sent = thread.findIndex(
    (m) => m.role === 'learner' && m.client_message_id === clientMessageId,
  );
  if (sent < 0) return null;
  for (let i = thread.length - 1; i > sent; i--) {
    const m = thread[i];
    if (m && m.role === 'buddy' && m.status === 'done' && m.text.trim().length > 0) return m;
  }
  return null;
}

/** TranscribeRequest.context allows at most 600 characters. */
export const MAX_TRANSCRIBE_CONTEXT = 600;

/** The question being answered, as TranscribeRequest.context (trimmed to the limit); null when empty. */
export function transcriptContext(prompt: string | null | undefined): string | null {
  const t = (prompt ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length <= MAX_TRANSCRIBE_CONTEXT ? t : `${t.slice(0, MAX_TRANSCRIBE_CONTEXT - 1)}…`;
}
