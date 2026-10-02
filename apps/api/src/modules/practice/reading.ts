// Leseverständnis (issue #233): one text, several questions about it, the text visible while
// she answers. docs/architecture.md §Practice ("Reading texts").
//
// The model writes the text line by line (from the photo, or its own) and the questions; code
// decides what may be asked, before anything is stored (#224 "Regel 0"):
//
//   · A line a question names ("Z. 12", "lines 3–5") must exist in the text. The reference is
//     read by its FORMAT (an abbreviation and a number), not by understanding the sentence.
//   · Every short answer, option and true/false statement comes with its EVIDENCE: the words of
//     the text it stands in. The evidence must stand in the text word for word (line breaks and
//     a hyphen at a line's end set aside), and a short answer's key words must occur in it —
//     otherwise it is no reading question and none is created. Code also knows from it WHICH
//     lines hold the answer, and that becomes the question's one hint ("Lies nochmal Z. 5–7")
//     and, once it is closed, the place she is shown.
//   · A true/false statement may not repeat the text word for word: copying a line is not
//     understanding it.
//   · A marking (#234) in a reading group marks a sentence OF the text: its words must stand in
//     it. An order (#228) is checked like every order.
//   · Fewer than two questions left is no reading group: nothing is stored.
//
// Language is not marked in a reading task (#197, `docs/lehrplan-und-uebungsformen.md` §7.3):
// `evaluate.ts` judges the content only, as for a listening task.
//
// The model never writes a line number into a stored field, an id or an alias (CLAUDE.md
// rule 2): lines are counted by code, the group's alias is given by the view.

import {
  PASSAGE_CHARS_MAX,
  PASSAGE_CHARS_MIN,
  PASSAGE_LINE_MAX,
  PASSAGE_LINES_MAX,
  READING_QUESTIONS_MAX,
  READING_QUESTIONS_MIN,
  ReadPassage,
  type PassageLines,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

import { t } from '../../i18n/index.js';
import { ItemDraft, itemsOneByOne, MAX_ACCEPTED, usableItems, type StoredItem } from './items.js';
import { MarkDraftBase, markPlainText } from './mark.js';
import { structuredItem } from './structured.js';

/** The evidence a question quotes: a sentence or two of the text, never a paragraph. */
const EVIDENCE_MAX = 300;

/**
 * What the generator and the photo reading are told about a reading text. Principles and bans,
 * never an example sentence (models copy examples — standing owner rule).
 */
export const READING_RULES = `READING TEXTS ("reading"): a text the learner READS, with questions about it; the app shows the text with its line numbers above each question. lines: the text line by line — from a photo exactly as printed, every line as it stands on the page (an empty string for an empty line between paragraphs), a hyphen at a line's end kept; your own text in lines of at most 45 characters (a phone line), broken between words. ${PASSAGE_CHARS_MIN}–${PASSAGE_CHARS_MAX} characters, at most ${PASSAGE_LINES_MAX} lines. title: the heading or null. lang: the language the text is written in. Then ${READING_QUESTIONS_MIN}–${READING_QUESTIONS_MAX} questions in the order of the text, each about what the text SAYS: kind "short" (answer short, in the text's words where possible), "multiple_choice" (2–4 options), "true_false" (a statement that is true or false by the text, in your own words — never a sentence copied from it), "order" (3–6 events of the text to put in order) or "mark" (a sentence of the text, copied exactly, in which she marks words or the gaps for commas). short, multiple_choice and true_false give evidence: the words of the text the answer stands in, copied EXACTLY (at most ${EVIDENCE_MAX} characters). A question may name a line ("Z. 12", "line 12") only if that line exists. A question you cannot back with words of the text is left out. Questions in the language the learner is taught the text in (a German or Latin text: German; an English, French or Spanish text: that language).`;

const Evidence = z
  .string()
  .trim()
  .min(1)
  .max(EVIDENCE_MAX)
  .describe('The words of the text the answer stands in, copied exactly');

const Base = {
  difficulty: ItemDraft.shape.difficulty,
};

/** One question about the text, as the model writes it. */
export const ReadingQuestion = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('short'),
    prompt: z.string().trim().min(1).max(300),
    answer: z.string().trim().min(1).max(200),
    accepted_answers: z.array(z.string().trim().min(1).max(200)).max(MAX_ACCEPTED).default([]),
    evidence: Evidence,
    ...Base,
  }),
  z.object({
    kind: z.literal('multiple_choice'),
    prompt: z.string().trim().min(1).max(300),
    choices: z.array(z.string().trim().min(1).max(200)).min(2).max(4),
    correct_choice: z.number().int().min(0).max(3),
    evidence: Evidence,
    ...Base,
  }),
  z.object({
    kind: z.literal('true_false'),
    statement: z.string().trim().min(1).max(300).describe('In your own words, never copied'),
    is_true: z.boolean(),
    evidence: Evidence,
    ...Base,
  }),
  z.object({
    kind: z.literal('order'),
    prompt: z.string().trim().min(1).max(300),
    elements: z
      .array(z.string().trim().min(1).max(120))
      .max(8)
      .describe('Events of the text, written in the CORRECT order'),
    ...Base,
  }),
  MarkDraftBase.omit({ type: true, topic: true, prompt_lang: true, difficulty: true }).extend({
    kind: z.literal('mark'),
    ...Base,
  }),
]);
export type ReadingQuestion = z.infer<typeof ReadingQuestion>;

/** One reading text and its questions, as the model writes them. */
export const ReadingDraft = z.object({
  title: z.string().trim().min(1).max(80).nullable(),
  lines: z
    .array(z.string().max(PASSAGE_LINE_MAX * 2))
    .min(1)
    .max(PASSAGE_LINES_MAX * 2),
  lang: z.string().regex(/^[a-z]{2}$/),
  topic: z.string().trim().min(1).max(60).describe('2–4 words: what the text is about'),
  questions: z.array(ReadingQuestion).max(READING_QUESTIONS_MAX * 2),
});
export type ReadingDraft = z.infer<typeof ReadingDraft>;

/** How a draft is parsed: one question that does not fit costs itself, never the text. */
export const ReadingDraftParse = ReadingDraft.extend({
  questions: itemsOneByOne(ReadingQuestion, READING_QUESTIONS_MAX * 2),
});

// ─────────────── the text, word by word, with its lines ───────────────

/** A word of the text, folded for comparison, and the line (1-based) it starts on. */
type LineWord = { w: string; line: number };

function fold(text: string): string {
  return text.normalize('NFC').toLocaleLowerCase();
}

function wordsOf(text: string): string[] {
  return fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * The text's words with their lines. A word split at a line's end ("Ge-" / "schichte") is one
 * word, on the line it starts on — it is one word in print, and a quote of it is one word too.
 */
export function lineWords(lines: readonly string[]): LineWord[] {
  const out: LineWord[] = [];
  let carry: LineWord | null = null;
  lines.forEach((raw, i) => {
    const line = i + 1;
    const words = wordsOf(raw);
    if (carry && words.length > 0) {
      out.push({ w: carry.w + words.shift()!, line: carry.line });
      carry = null;
    } else if (carry) {
      out.push(carry);
      carry = null;
    }
    // A word that ends the line with a hyphen continues on the next one.
    const hyphenated = /\p{L}-\s*$/u.test(raw) && words.length > 0;
    const last = hyphenated ? words.pop()! : null;
    for (const w of words) out.push({ w, line });
    if (last !== null) carry = { w: last, line };
  });
  if (carry) out.push(carry);
  return out;
}

/** Where the words of `quote` stand in the text, as lines — or null when they do not. */
export function linesOf(lines: readonly string[], quote: string): PassageLines | null {
  const text = lineWords(lines);
  const want = wordsOf(quote);
  if (want.length === 0) return null;
  for (let i = 0; i + want.length <= text.length; i++) {
    if (want.every((w, k) => text[i + k]!.w === w)) {
      return { from: text[i]!.line, to: text[i + want.length - 1]!.line };
    }
  }
  return null;
}

/** Does `quote` stand in the text, word for word? */
export function standsInText(lines: readonly string[], quote: string): boolean {
  return linesOf(lines, quote) !== null;
}

/**
 * The line numbers a question names, read by their format: an abbreviation for "line" or
 * "verse" in the languages a text is taught in, and a number or a range. Not language
 * understanding (CLAUDE.md rule 3) — the same kind of reading as a date format.
 */
const LINE_REF =
  /(?<![\p{L}])(?:Z\.|Zeilen?|V\.|Verse?|vv?\.|lines?|ll?\.|lignes?|l[ií]neas?|riga|righe|r\.)\s*(\d{1,3})(?:\s*(?:[-–—]|bis|to|à|a|al)\s*(\d{1,3}))?/giu;

export function lineRefs(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(LINE_REF)) {
    out.push(Number(m[1]));
    if (m[2] !== undefined) out.push(Number(m[2]));
  }
  return out;
}

/** Every line a question names exists in the text. */
export function refsExist(text: string, lineCount: number): boolean {
  return lineRefs(text).every((n) => n >= 1 && n <= lineCount);
}

/**
 * The key words of a short answer are in the evidence (issue #233): at least one word of four
 * letters or more, or a number, and at least half of them stand there. "Stand there" allows a
 * different ending (the text says "Hundes", the answer "Hund"): two words agree when they share
 * all but their last two letters, at least four. Not language understanding — a string
 * comparison with a tolerance for inflection.
 */
export function keyWordsIn(answer: string, evidence: string): boolean {
  const keys = wordsOf(answer).filter((w) => w.length >= 4 || /^\p{N}+$/u.test(w));
  if (keys.length === 0) return false;
  const there = wordsOf(evidence);
  const agrees = (a: string, b: string) => {
    if (a === b) return true;
    if (/^\p{N}+$/u.test(a) || /^\p{N}+$/u.test(b)) return false;
    const n = Math.max(4, Math.min(a.length, b.length) - 2);
    return a.length >= 4 && b.length >= 4 && a.slice(0, n) === b.slice(0, n);
  };
  const found = keys.filter((k) => there.some((w) => agrees(k, w))).length;
  return found * 2 >= keys.length;
}

/** The statement is a copy of the text: all its words stand there in a row. */
export function copiesText(lines: readonly string[], statement: string): boolean {
  return standsInText(lines, statement);
}

/** The passage as stored, or null when it is no reading text (sizes, empty). */
export function passageFrom(
  draft: Pick<ReadingDraft, 'title' | 'lines' | 'lang'>,
): ReadPassage | null {
  const lines = draft.lines.map((l) => l.replace(/\s+$/u, '').replace(/\t/g, ' '));
  // Empty lines at either end are no part of the text.
  while (lines.length > 0 && lines[0]!.trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') lines.pop();
  if (lines.length === 0 || lines.length > PASSAGE_LINES_MAX) return null;
  if (lines.some((l) => l.length > PASSAGE_LINE_MAX)) return null;
  const chars = lines.join('\n').length;
  if (chars < PASSAGE_CHARS_MIN || chars > PASSAGE_CHARS_MAX) return null;
  const parsed = ReadPassage.safeParse({ title: draft.title, lines, lang: draft.lang });
  return parsed.success ? parsed.data : null;
}

/** The passage a stored row carries, or null (an unreadable column is no text). */
export function passageOf(stored: unknown): ReadPassage | null {
  if (stored === null || stored === undefined) return null;
  const parsed = ReadPassage.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

/** The lines a closed question's answer stands in, from its stored evidence. */
export function evidenceOf(
  passage: ReadPassage | null,
  excerpt: string | null,
): PassageLines | null {
  if (!passage || !excerpt) return null;
  return linesOf(passage.lines, excerpt);
}

/**
 * The alias of each question's text in one view ('t1', 't2' …), by the order the questions
 * stand in: questions about the same text share it (like `listenRefs`, issue #210).
 */
export function passageRefs(
  rows: ReadonlyArray<{ id: string; read_passage: unknown }>,
): Map<string, string> {
  const refs = new Map<string, string>();
  const byText = new Map<string, string>();
  for (const row of rows) {
    const p = passageOf(row.read_passage);
    if (!p) continue;
    const key = `${p.lang}\u0000${p.title ?? ''}\u0000${p.lines.join('\n')}`;
    const ref = byText.get(key) ?? `t${byText.size + 1}`;
    byText.set(key, ref);
    refs.set(row.id, ref);
  }
  return refs;
}

/** A question of a reading group, as stored: an ordinary item plus its text. */
export type ReadingItem = StoredItem & { read_passage: ReadPassage };

/** The one hint a reading question gets: where in the text to look again. */
function lookHint(locale: string, at: PassageLines): string {
  return at.from === at.to
    ? t(locale, 'practice.reading.look_line', { from: at.from })
    : t(locale, 'practice.reading.look', { from: at.from, to: at.to });
}

/**
 * The questions of one reading text, as items — or none.
 *
 * Every question is checked on its own and dropped on its own; a group with fewer than
 * READING_QUESTIONS_MIN questions left is no group, and nothing of it is stored. `locale` is the
 * learner's app language: the hint is in it, and true/false options are written in the text's
 * language where the server has words for it, else in hers.
 */
export function readingItems(draft: ReadingDraft | null, locale: string): ReadingItem[] {
  if (!draft) return [];
  const passage = passageFrom(draft);
  if (!passage) return [];
  const lines = passage.lines;
  const n = lines.length;
  const topic = draft.topic;
  const optionsLocale = ['de', 'en', 'fr', 'es', 'it'].includes(passage.lang)
    ? passage.lang
    : locale;
  const out: ReadingItem[] = [];
  for (const q of draft.questions.slice(0, READING_QUESTIONS_MAX)) {
    const item = readingItem(q);
    if (item) out.push({ ...item, read_passage: passage });
  }
  return out.length >= READING_QUESTIONS_MIN ? out : [];

  function plain(
    kind: 'short' | 'multiple_choice',
    fields: Pick<
      ItemDraft,
      'prompt' | 'answer' | 'accepted_answers' | 'choices' | 'correct_choice'
    >,
    evidence: string,
    difficulty: number,
  ): StoredItem | null {
    const at = linesOf(lines, evidence);
    if (!at) return null;
    const [usable] = usableItems([
      {
        kind,
        ...fields,
        unit: null,
        topic,
        difficulty,
        prompt_lang: passage!.lang,
        lang: null,
        figure: null,
        tolerance: null,
        // Never 'strict': what she wrote is judged on what she understood (issue #197).
        spelling: kind === 'short' ? 'gentle' : null,
        source_excerpt: evidence,
        curriculum_point: null,
        hints: [lookHint(locale, at)],
        worked_solution: null,
        rubric: null,
      },
    ]);
    return usable ?? null;
  }

  function readingItem(q: ReadingQuestion): StoredItem | null {
    const prompt = q.kind === 'true_false' ? q.statement : q.prompt;
    if (!refsExist(prompt, n)) return null;
    switch (q.kind) {
      case 'short':
        if (!keyWordsIn(q.answer, q.evidence)) return null;
        return plain(
          'short',
          {
            prompt: q.prompt,
            answer: q.answer,
            accepted_answers: q.accepted_answers,
            choices: null,
            correct_choice: null,
          },
          q.evidence,
          q.difficulty,
        );
      case 'multiple_choice': {
        const chosen = q.choices[q.correct_choice];
        if (chosen === undefined) return null;
        return plain(
          'multiple_choice',
          {
            prompt: q.prompt,
            answer: chosen,
            accepted_answers: [],
            choices: q.choices,
            correct_choice: q.correct_choice,
          },
          q.evidence,
          q.difficulty,
        );
      }
      case 'true_false': {
        if (copiesText(lines, q.statement)) return null;
        const choices = [
          t(optionsLocale, 'practice.reading.true'),
          t(optionsLocale, 'practice.reading.false'),
        ];
        const correct = q.is_true ? 0 : 1;
        return plain(
          'multiple_choice',
          {
            prompt: q.statement,
            answer: choices[correct]!,
            accepted_answers: [],
            choices,
            correct_choice: correct,
          },
          q.evidence,
          q.difficulty,
        );
      }
      case 'order':
        return structuredItem({
          type: 'order',
          prompt: q.prompt,
          elements: q.elements,
          numeric: null,
          topic,
          difficulty: q.difficulty,
          prompt_lang: passage!.lang,
        });
      case 'mark': {
        // Syllables are a word exercise, not a reading one; in a text she marks words or commas.
        if (q.mode === 'syllables') return null;
        const item = structuredItem({
          type: 'mark',
          prompt: q.prompt,
          mode: q.mode,
          text: q.text,
          targets: q.targets,
          categories: q.categories,
          corrected: q.corrected,
          topic,
          difficulty: q.difficulty,
          prompt_lang: passage!.lang,
        });
        if (!item || item.task.type !== 'mark') return null;
        // The sentence she marks is a sentence OF the text (a "Belegstelle", #234 with #233).
        // Compared by its words: the commas she has to set are not shown, so they cannot count.
        return standsInText(lines, markPlainText(item.task)) ? item : null;
      }
    }
  }
}
