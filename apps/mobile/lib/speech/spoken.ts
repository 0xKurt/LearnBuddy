// What Buddy reads aloud (Vorlesen, Gespräch) and how a transcript lands in a field. Pure
// logic (no React Native), unit-tested: **bold** markers are never read, and the notation a
// domain writes (math) is said in words (`say`, lib/speech/say.ts). A question with its choices
// and the verdict after an answer are the learning domain's (lib/practice/readText.ts).

import { markdownPlain } from '../buddy/markdown.js';
import type { Say } from './say.js';
import { baseLanguage } from './voice.js';

/**
 * A model-written text as it is read aloud: no Markdown (bold, italic, list markers), notation
 * in words; each line of a list is its own sentence (the voice pauses between them).
 */
export function spokenText(text: string, say: Say): string {
  return say(markdownPlain(text, { spoken: true }))
    .replace(/\s+/g, ' ')
    .trim();
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
