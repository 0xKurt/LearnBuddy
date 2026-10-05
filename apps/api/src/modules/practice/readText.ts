// Lesetexte, die Buddy selbst schreibt (#368, der Rest von #233): ein Text auf ihrer Stufe und die
// Fragen dazu, ohne Foto. docs/architecture.md §Practice ("Lesetexte").
//
// The questions are held to exactly the rules of a photographed text (`readingItems`): every
// answer quotes its evidence, which must stand in the text word for word, a short answer's key
// words must be in it, a true/false statement may not copy it, an order is checked like every
// order, a marking marks a sentence OF the text, a Belegstelle's lines are found by code. What a
// photo proves by itself — that the text is a real one — code proves here instead, before anything
// is stored (#224 "Regel 0", reject — never repair):
//
//   · LENGTH and LEVEL by her grade (`READ_BANDS`): the characters of the text, the average and
//     the longest sentence in words. Sentences are cut at their end marks — a format, like a date's
//     (CLAUDE.md rule 3); an abbreviation counts as an end, which only makes a sentence shorter,
//     so the rule errs towards the easier text. Her wish for easier or harder moves one band.
//   · LANGUAGE: the text is in the language the subject teaches — English in English, Latin in
//     Latin, the app language in every other subject (`textLangFor`) — and every letter of it is
//     a letter of that language's alphabet (`inAlphabet`); the questions likewise, in the language
//     they are asked in. A character set, not a word list: it catches a German text sent as an
//     English one (ä, ß), not every slip. A language without a known alphabet gets no text.
//   · ANSWERABLE from the text: on top of the photo rules, a multiple-choice option that is right
//     must have its key words in its evidence (`keyWordsIn`, as a short answer) — the model wrote
//     the text and the options together, so the option must say what the quoted words say.
//   · LINES are code's: the model writes paragraphs, code sets them into printed lines
//     (`printedLines`), so the model cannot know a line number — a question naming one is dropped.
//
// What code cannot check, and does not pretend to: whether the text is true and good to read.
// That is the model's; code checks that it is a text of her level and language, and that each
// question can be answered from it.

import {
  MARK_LINES_KEY_MAX,
  READING_QUESTIONS_MAX,
  type DifficultyWish,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

import {
  keyWordsIn,
  lineRefs,
  ReadingDraft,
  ReadingDraftParse,
  readingItems,
  type ReadingQuestion,
  sentencesOf,
  type ReadingItem,
} from './reading.js';

/**
 * A printed line of Buddy's text: as long as one line of the text box on a 360-pt phone (about 32
 * characters at the reading size), so a printed line never wraps in the middle and "Z. 12" is one
 * line she sees. 52 and 38 broke lines in two (walkthrough 98-reading-buddy, #368).
 */
export const READ_LINE_CHARS = 32;
/** The fewest questions a text of Buddy's carries: he writes them himself, so a text is worth it. */
const READ_QUESTIONS_MIN = 3;

/**
 * Length and sentence length by stage (#368): grades 1–2, 3–4, 5–6, 7–9, from 10 on (and a
 * university or adult learner). Characters of the text; the average sentence and the longest one
 * in words. Set from the ranges school readers use per stage, not from one book — the model is
 * held to them, never shown a text to copy. The longest text, 1400 characters, sets into about
 * 50 lines of READ_LINE_CHARS — inside PASSAGE_LINES_MAX with its paragraph breaks.
 */
const READ_BANDS: ReadonlyArray<{
  chars: readonly [number, number];
  average: number;
  longest: number;
}> = [
  { chars: [150, 500], average: 9, longest: 14 },
  { chars: [300, 900], average: 11, longest: 18 },
  { chars: [500, 1200], average: 14, longest: 22 },
  { chars: [700, 1300], average: 17, longest: 26 },
  { chars: [900, 1400], average: 20, longest: 32 },
];

/** Her stage (an index into READ_BANDS), one up or down when she asked for harder or easier. */
export function bandOf(level: string, grade: number | null, wish: DifficultyWish | null): number {
  const base =
    level !== 'school'
      ? 4
      : grade === null
        ? 2
        : grade <= 2
          ? 0
          : grade <= 4
            ? 1
            : grade <= 6
              ? 2
              : grade <= 9
                ? 3
                : 4;
  const moved = wish === 'easier' ? base - 1 : wish === 'harder' ? base + 1 : base;
  return Math.min(READ_BANDS.length - 1, Math.max(0, moved));
}

/** Does the text keep to its stage: its length, and how long its sentences are? */
export function levelHolds(paragraphs: readonly string[], band: number): boolean {
  const stage = READ_BANDS[band];
  if (!stage) return false;
  const text = paragraphs.join('\n');
  const chars = [...text].length;
  if (chars < stage.chars[0] || chars > stage.chars[1]) return false;
  const sentences = sentencesOf(text);
  if (sentences.length === 0) return false;
  const words = sentences.map((s) => s.length);
  const average = words.reduce((a, b) => a + b, 0) / words.length;
  return average <= stage.average && Math.max(...words) <= stage.longest;
}

/** The letters of each language a text of Buddy's may be written in (lower case). */
const ALPHABETS: Record<string, RegExp> = {
  de: /^[a-zäöüß]$/u,
  en: /^[a-z]$/u,
  fr: /^[a-zàâæçéèêëîïôœùûüÿ]$/u,
  es: /^[a-záéíñóúü]$/u,
  it: /^[a-zàèéìíîòóù]$/u,
  la: /^[a-z]$/u,
};

/** Is every letter of the text one of this language's alphabet? An unknown language: no. */
export function inAlphabet(text: string, lang: string): boolean {
  const alphabet = ALPHABETS[lang];
  if (!alphabet) return false;
  for (const ch of text.normalize('NFC').toLocaleLowerCase()) {
    if (/\p{L}/u.test(ch) && !alphabet.test(ch)) return false;
  }
  return true;
}

/** The language a subject's reading text is in: the one it teaches, else the app's. */
const TAUGHT: Record<string, string> = {
  german: 'de',
  english: 'en',
  french: 'fr',
  spanish: 'es',
  latin: 'la',
};

export function textLangFor(subjectKind: string | null, locale: string): string | null {
  // A language the app has no alphabet for gets no text it could not check.
  if (subjectKind === 'other_language') return null;
  return (subjectKind ? TAUGHT[subjectKind] : undefined) ?? locale.slice(0, 2);
}

/**
 * The paragraphs as printed lines of at most READ_LINE_CHARS characters, broken between words,
 * with an empty line between paragraphs (it is not counted, as in print).
 */
export function printedLines(paragraphs: readonly string[]): string[] {
  const out: string[] = [];
  paragraphs.forEach((paragraph, i) => {
    if (i > 0) out.push('');
    let line = '';
    for (const word of paragraph.trim().split(/\s+/u)) {
      if (line && [...line].length + 1 + [...word].length > READ_LINE_CHARS) {
        out.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) out.push(line);
  });
  return out;
}

/** What the generator is told for a reading run. Principles and bans, never an example text. */
export const READ_TEXT_RULES = `The learner wants to PRACTISE READING COMPREHENSION on the topic they named. Write "reading": ONE text for them to read — a story, a factual text or a report, as their school reader would print it at their grade — and questions about what it SAYS. paragraphs: the text in 1–8 paragraphs of continuous prose, no headings, no line breaks inside a paragraph, no line numbers, no markup. Its length and sentence length fit their grade: short, simple sentences for young readers, longer ones only for older learners. lang: the language of the text — the language the subject teaches (an English, French, Spanish or Latin class: that language), otherwise the app language (LEARNER); only letters of that language's alphabet. title: a heading. topic: 2–4 words. questions: ${READ_QUESTIONS_MIN + 1}–${READING_QUESTIONS_MAX}, in the order of the text, each of kind "short" (the answer short, in the text's words), "multiple_choice" (2–4 options), "true_false" (a statement true or false by the text, in your own words — never copied from it), "order" (3–6 events of the text, written in the CORRECT order), "mark" (one sentence of the text copied EXACTLY as text, in which she marks words — mode "words" — or sets the commas — mode "gaps"; corrected null) or "evidence" (a statement in your own words whose proof she finds by tapping the lines it stands in; at most ${MARK_LINES_KEY_MAX} lines) — never naming a line (the app sets the lines). Every short, multiple_choice, true_false and evidence question gives evidence copied EXACTLY from the text, and the right answer or option says what those words say. Questions in the language of the text (for a Latin text: the app language). Leave "items" empty.`;

/**
 * One reading text of Buddy's, as the model writes it: a photographed text's draft, with
 * paragraphs instead of printed lines (code sets those) and always a heading.
 */
export const BuddyReadingDraft = ReadingDraft.omit({ lines: true }).extend({
  title: z.string().trim().min(1).max(80),
  paragraphs: z
    .array(z.string().trim().min(1).max(1200))
    .min(1)
    .max(8)
    .describe('The text in paragraphs of continuous prose; no line breaks inside, no line numbers'),
});
export type BuddyReadingDraft = z.infer<typeof BuddyReadingDraft>;

/** How it is parsed: one question that does not fit costs itself, never the text. */
export const BuddyReadingDraftParse = BuddyReadingDraft.extend({
  questions: ReadingDraftParse.shape.questions,
});

/** Every text of a question she reads or chooses from, in the language it is asked in. */
function askedText(q: ReadingQuestion): string {
  switch (q.kind) {
    case 'short':
      return `${q.prompt} ${q.answer}`;
    case 'multiple_choice':
      return `${q.prompt} ${q.choices.join(' ')}`;
    case 'true_false':
    case 'evidence':
      return q.statement;
    case 'order':
      return `${q.prompt} ${q.elements.join(' ')}`;
    case 'mark':
      return q.prompt;
  }
}

/** A question Buddy's own text can carry before the photo rules look at it, or not. */
function asksFairly(q: ReadingQuestion, questionLang: string): boolean {
  // The lines are code's: the model cannot know which one it would name.
  if (lineRefs(askedText(q)).length > 0) return false;
  if (!inAlphabet(askedText(q), questionLang)) return false;
  // The right option says what its evidence says.
  if (q.kind === 'multiple_choice') {
    const right = q.choices[q.correct_choice];
    return right !== undefined && keyWordsIn(right, q.evidence);
  }
  return true;
}

/**
 * The questions of Buddy's reading text, as items — or none, when the text is not one of her
 * level and language. Every question that holds goes through the rules of a photographed text.
 */
export function buddyReadingItems(
  draft: BuddyReadingDraft | null,
  opts: {
    locale: string;
    level: string;
    grade: number | null;
    wish: DifficultyWish | null;
    /** The subject the model filed the run under (`GeneratedSet.subject.kind`). */
    subjectKind: string | null;
  },
): ReadingItem[] {
  if (!draft) return [];
  const lang = textLangFor(opts.subjectKind, opts.locale);
  if (lang === null || draft.lang !== lang) return [];
  if (!inAlphabet(`${draft.title} ${draft.paragraphs.join(' ')}`, lang)) return [];
  if (!levelHolds(draft.paragraphs, bandOf(opts.level, opts.grade, opts.wish))) return [];
  const questionLang = lang === 'la' ? opts.locale.slice(0, 2) : lang;
  const items = readingItems(
    {
      title: draft.title,
      lines: printedLines(draft.paragraphs),
      lang,
      topic: draft.topic,
      questions: draft.questions.filter((q) => asksFairly(q, questionLang)),
    },
    { locale: opts.locale, transcript: null },
  );
  return items.length >= READ_QUESTIONS_MIN ? items : [];
}
