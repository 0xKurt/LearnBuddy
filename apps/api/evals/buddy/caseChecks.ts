// The checks the live-model cases of Buddy's turns share (evals/buddy/cases.ts): what a case gets
// back, how it states a failure, and the language checks every reply goes through.
// requires live verification in Claude Code session (stand-ins for the outside world; live model)

import type { TestEnv, Learner } from '../../src/testing/harness.js';
import type { Repeat } from './repeat.js';

export type Outcome = {
  status: 'done' | 'processing' | 'failed';
  errorCode: string | null;
  reply: string | null;
  options: string[] | null;
  tools: string[];
  goals: Array<{
    title: string;
    kind: string;
    due_date: string | null;
    status: string;
    outcome: string | null;
    subject_kind: string | null;
  }>;
  memories: Array<{ kind: string; statement: string; valid_until: Date | null }>;
  /** Her sheets by title, and whether each is still there (issue #111). */
  materials: Array<{ title: string | null; archived: boolean }>;
  /**
   * Every turn of the conversation, newest last (issue #127): whether it asked for
   * permission, what it did, and what it said. One answer can be right and a conversation
   * made of them still feel like being interrogated.
   */
  turns: Array<{ asks: boolean; tools: string[]; reply: string }>;
  /**
   * Every button Buddy put in the chat (issue #196): what it offers to start, in his words.
   * `tools` only says that an offer happened — and the bug was in what it carried.
   */
  offers: Array<{
    kind: string;
    text: string;
    /** A test with time (issue #241): its minutes; null — no clock — unless she asked. */
    minutes: number | null;
  }>;
  /** What Buddy PROPOSED to delete and is waiting for her tap on (issue #151). */
  pending: Array<{
    operation: string;
    title: string | null;
    detail: string | null;
    status: string;
  }>;
  steps: Array<{
    kind: string;
    title: string;
    planned_date: string | null;
    planned_time: string | null;
    /** A standing arrangement (issue #112). */
    repeat: string | null;
    agreed: boolean;
    state: string;
  }>;
  settings: { contact_enabled: boolean; paused_until: Date | null };
  level: { level: string; grade: number | null };
  /** Lookup tools Buddy used before answering (ADR 0005). */
  lookups: string[];
};

export type Case = {
  id: string;
  /** Moment the learner writes (UTC). Monday 2026-09-28 10:00 in Berlin unless stated. */
  at?: string;
  learner?: {
    locale?: 'de' | 'en' | 'fr' | 'es' | 'it';
    timezone?: string;
    relation?: 'self' | 'child';
    birthDate?: string;
  };
  setup?: (env: TestEnv, l: Learner) => Promise<void>;
  /** A first message that just runs; the measured turn then answers Buddy's reply to it. */
  before?: string;
  /**
   * More messages before the measured one, each a whole turn (issue #127). `before` is one
   * of these; this is for a conversation that has to be WALKED, because what the owner
   * complained about ("fühlt sich alles schlechter an") is not one answer but the shape of
   * several — how often Buddy asks back instead of doing the thing.
   */
  conversation?: readonly string[];
  message: string;
  /** Returns the violated expectations (empty = pass). */
  check: (o: Outcome) => string[];
  /**
   * Run this case several times on a fresh database each, and fail it when more than
   * `maxFailures` runs fail (issue #225, `repeat.ts`). For a case whose failure is rare but
   * real: one run of a case that falls over one time in five proves nothing.
   */
  repeat?: Repeat;
};

export const must = (cond: boolean, msg: string): string[] => (cond ? [] : [msg]);

/**
 * The day words of each language, for the check that a reply names a day only in the learner's
 * own ones (issue #200). The German list carries "Heute"/"Morgen" as well: German is the
 * direction the leak ran — one static prompt serves all five languages, so a day word shown in
 * it was German for everyone — and those two are unmistakable inside an English, French,
 * Spanish or Italian sentence. No word here occurs inside a word of another language (the
 * accents keep "sabato" apart from "sábado", "lundi" from "lunedì"), so a hit is a day named in
 * the wrong language. Only for the day cases below, whose subject is fractions: a vocabulary
 * test ON weekdays would of course put the other language's words in the reply by right.
 */
export const DAY_WORDS: Record<'de' | 'en' | 'fr' | 'es' | 'it', readonly string[]> = {
  de: [
    'Montag',
    'Dienstag',
    'Mittwoch',
    'Donnerstag',
    'Freitag',
    'Samstag',
    'Sonnabend',
    'Sonntag',
    'Heute',
    'Morgen',
  ],
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  fr: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'],
  es: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'],
  it: ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'],
};

/**
 * A day word from a language that is not hers, as it stands in the reply — '' when there is
 * none. The boundary is a Unicode letter lookaround, not `\b`: `\b` is ASCII, so `\bvenerdì\b`
 * never matches "venerdì " at all and the check would silently pass everything.
 */
export function foreignDayWord(reply: string, locale: keyof typeof DAY_WORDS): string {
  for (const [lang, words] of Object.entries(DAY_WORDS)) {
    if (lang === locale) continue;
    for (const word of words) {
      const hit = new RegExp(`(?<!\\p{L})${word}(?!\\p{L})`, 'iu').exec(reply);
      if (hit) return `${hit[0]} (${lang})`;
    }
  }
  return '';
}

/**
 * German words that cannot stand in an English, French, Spanish or Italian reply (issue #201) —
 * the generalisation of the day-word check above, and the check that would have caught #200
 * whatever German word had leaked. Function words, not content: a leak is a sentence the model
 * carried over from an example, and it brings its small words with it. "du" (French), "die"
 * (English), "am" (English), "in" and "no" are deliberately absent — they are words of the other
 * four languages too, and a check that cries wolf gets switched off.
 *
 * Only used on cases whose subject is not the German language: a learner practising German
 * vocabulary gets German words in her reply by right.
 */
export const GERMAN_WORDS: readonly string[] = [
  'ich',
  'mir',
  'mich',
  'dein',
  'deine',
  'nicht',
  'und',
  'ist',
  'sind',
  'eine',
  'einer',
  'einen',
  'kein',
  'keine',
  'hab',
  'habe',
  'hast',
  'kannst',
  'machen',
  'gleich',
  'schon',
  'noch',
  'auch',
  'aber',
  'oder',
  'wenn',
  'dann',
  'sehr',
  'für',
  'über',
  'Aufgabe',
  'Aufgaben',
  'Arbeitsblatt',
  'Zettel',
  'Klassenarbeit',
  'Probetest',
  'Hilfe',
  'Rückgängig',
  'Übung',
  'Erinnerung',
  'Einstellungen',
  'Stunde',
  'Minuten',
  'Woche',
  'Handballtraining',
];

/**
 * The first German word standing in a reply that is not German — '' when there is none, and ''
 * for a German learner. The German day words count too: they are what leaked in #200.
 */
export function germanLeak(reply: string, locale: keyof typeof DAY_WORDS): string {
  if (locale === 'de') return '';
  for (const word of [...GERMAN_WORDS, ...DAY_WORDS.de]) {
    const hit = new RegExp(`(?<!\\p{L})${word}(?!\\p{L})`, 'iu').exec(reply);
    if (hit) return hit[0];
  }
  return '';
}

export async function exam(
  env: TestEnv,
  l: Learner,
  title: string,
  due: string,
  subjectKind = 'math',
): Promise<void> {
  await env.db.query(
    `with s as (insert into subjects (learner_id, name, kind) values ($1, 'Mathe', $4) returning id)
     insert into buddy_goals (learner_id, kind, title, subject_id, due_date) select $1, 'exam', $2, s.id, $3 from s`,
    [l.learnerId, title, due, subjectKind],
  );
}
