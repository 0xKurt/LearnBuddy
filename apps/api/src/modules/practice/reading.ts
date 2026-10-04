// Leseverständnis (issue #233): one text, several questions about it, the text visible while
// she answers. docs/architecture.md §Practice ("Lesetexte").
//
// The photo reading writes the text line by line, as printed, and the questions — the printed
// ones, or its own where the sheet prints none. Code decides what may be asked, before anything
// is stored (#224 "Regel 0", reject — never repair):
//
//   · The text is the photo's: its words stand, in order, in the reading's own transcription of
//     the sheet (`extracted_text`). A text the reading made up next to the sheet is no text of
//     hers, and nothing of it is stored.
//   · A line a question names ("Z. 12", "lines 3–5") must exist in the text, and the words the
//     answer stands in must touch it. The reference is read by its FORMAT (an abbreviation and a
//     number, like a date format), not by understanding the sentence (CLAUDE.md rule 3).
//   · Every short answer, option and true/false statement comes with its EVIDENCE: the words of
//     the text it stands in. The evidence must stand in the text word for word (line breaks and a
//     hyphen at a line's end set aside), and a short answer's key words must occur in it —
//     otherwise it is no reading question and none is created. Code knows from the evidence WHICH
//     lines hold the answer: that becomes the question's one hint ("Lies nochmal Z. 5–7") and,
//     once it is closed, the place she is shown (`PassageView.evidence`).
//   · A true/false statement may not repeat the text word for word: copying a line is not
//     understanding it. Its two options are written HERE, never by the model, so the key cannot
//     point at the wrong one.
//   · An order (#228) in a reading group is checked like every order.
//   · Fewer than two questions left is no reading group: nothing of it is stored.
//
// Language is not marked in a reading task (#197, `docs/lehrplan-und-uebungsformen.md` §7.3):
// `evaluate.ts` judges the content only, from the stored text, as for a listening task.
//
// The model never writes a line number into a stored field, an id or an alias (CLAUDE.md rule
// 2): lines are counted by code, the group's alias is given by the view.

import {
  PASSAGE_CHARS_MAX,
  PASSAGE_CHARS_MIN,
  PASSAGE_LINE_MAX,
  PASSAGE_LINES_MAX,
  READING_QUESTIONS_MAX,
  READING_QUESTIONS_MIN,
  lineNumbers,
  ReadPassage,
  type PassageLines,
  type PassageView,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

import { t } from '../../i18n/index.js';
import { asLocale } from './chartRead.js';
import { ItemDraft, itemsOneByOne, MAX_ACCEPTED, usableItems, type StoredItem } from './items.js';
import { structuredItem } from './structured.js';

/** The evidence a question quotes: a sentence or two of the text, never a paragraph. */
const EVIDENCE_MAX = 300;

/** The most reading texts one reading of a sheet may return: a page holds one, a spread two. */
export const READINGS_PER_READING = 2;

/**
 * What the photo reading is told about a reading text. Principles and bans, never an example
 * sentence (models copy examples — standing owner rule).
 */
export const READING_RULES = `Reading texts ("reading"): a text on the sheet with questions about it (a reading text, a factual text, a source, a story) — the app shows the text with its line numbers above each question. lines: the text line by line EXACTLY as printed, every line as it stands on the page (an empty string for an empty line between paragraphs — it is not counted, as in print —, a hyphen at a line's end kept), without the line numbers printed in the margin; ${PASSAGE_CHARS_MIN}–${PASSAGE_CHARS_MAX} characters, at most ${PASSAGE_LINES_MAX} lines of at most ${PASSAGE_LINE_MAX} characters. title: its heading as printed, or null. lang: the language the text is written in. topic: 2–4 words, what the text is about. questions: the questions printed about it, in their order; when none are printed, ${READING_QUESTIONS_MIN + 2}–${READING_QUESTIONS_MAX} of your own about what the text SAYS, in the order of the text. Each is kind "short" (the answer short, in the text's words where possible), "multiple_choice" (2–4 options), "true_false" (a statement that is true or false by the text, in your own words — never a sentence copied from it) or "order" (3–6 events of the text to put in order, written in the CORRECT order). short, multiple_choice and true_false give evidence: the words of the text the answer stands in, copied EXACTLY (at most ${EVIDENCE_MAX} characters). A question may name a line ("Z. 12") only when that line holds what it asks about; count only the lines with text, as the sheet numbers them. A question you cannot back with words of the text is left out. Questions in the language the text is taught in (a German or Latin text: German; an English, French or Spanish text: that language).`;

const Evidence = z
  .string()
  .trim()
  .min(1)
  .max(EVIDENCE_MAX)
  .describe('The words of the text the answer stands in, copied exactly');

const Prompt = z.string().trim().min(1).max(300);
const Difficulty = ItemDraft.shape.difficulty;

/** One question about the text, as the model writes it. */
export const ReadingQuestion = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('short'),
    prompt: Prompt,
    answer: z.string().trim().min(1).max(200),
    accepted_answers: z.array(z.string().trim().min(1).max(200)).max(MAX_ACCEPTED).default([]),
    evidence: Evidence,
    difficulty: Difficulty,
  }),
  z.object({
    kind: z.literal('multiple_choice'),
    prompt: Prompt,
    choices: z.array(z.string().trim().min(1).max(200)).min(2).max(4),
    correct_choice: z.number().int().min(0).max(3),
    evidence: Evidence,
    difficulty: Difficulty,
  }),
  z.object({
    kind: z.literal('true_false'),
    statement: Prompt.describe('In your own words, never copied from the text'),
    is_true: z.boolean(),
    evidence: Evidence,
    difficulty: Difficulty,
  }),
  z.object({
    kind: z.literal('order'),
    prompt: Prompt,
    elements: z
      .array(z.string().trim().min(1).max(120))
      .max(8)
      .describe('Events of the text, written in the CORRECT order'),
    difficulty: Difficulty,
  }),
]);
export type ReadingQuestion = z.infer<typeof ReadingQuestion>;

/** One reading text and its questions, as the model writes them. */
export const ReadingDraft = z.object({
  title: z.string().trim().min(1).max(80).nullable(),
  // Parsed generously: a line or a text over the caps is not a broken draft but one that does
  // not fit, and `passageFrom` says so by refusing it — the same text read on another day must
  // not be cut into something the sheet does not say.
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

/** How many lines of text there are — the highest line a question may name. */
export function lineCount(lines: readonly string[]): number {
  return lines.filter((l) => l.trim() !== '').length;
}

/** A word of the text, folded for comparison, and the line (its number) it starts on. */
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
function lineWords(lines: readonly string[]): LineWord[] {
  const out: LineWord[] = [];
  const numbers = lineNumbers(lines);
  let carry: LineWord | null = null;
  lines.forEach((raw, i) => {
    const line = numbers[i] ?? 0;
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
  const want = lineWords(quote.split('\n')).map((x) => x.w);
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

/**
 * A line reference stays on one line of the screen: "Z." and its number with a no-break space
 * between them, so a phone never sets "(Z." at the end of one line and "17–19)" on the next.
 * Only the spaces inside the reference change — the words are the model's.
 */
function keepLineRefsTogether(text: string): string {
  return text.replace(LINE_REF, (ref) => ref.replace(/\s+/gu, '\u00A0'));
}

/** The line ranges a question names. */
export function lineRefs(text: string): PassageLines[] {
  const out: PassageLines[] = [];
  for (const m of text.matchAll(LINE_REF)) {
    const from = Number(m[1]);
    const to = m[2] !== undefined ? Number(m[2]) : from;
    out.push({ from: Math.min(from, to), to: Math.max(from, to) });
  }
  return out;
}

/**
 * Every line a question names exists in the text, and — when the answer's place is known — the
 * answer stands on or right next to a named line. A question that sends her to line 12 for an
 * answer that stands in line 30 is a question that counted wrong.
 */
export function refsHold(text: string, lineCount: number, at: PassageLines | null): boolean {
  const refs = lineRefs(text);
  if (refs.some((r) => r.from < 1 || r.to > lineCount)) return false;
  if (refs.length === 0 || at === null) return true;
  return refs.some((r) => at.from <= r.to + 1 && at.to >= r.from - 1);
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

/**
 * The passage is the sheet's: its words stand, in order, in the reading's own transcription of
 * the photos. Compared word by word, so Markdown, line breaks and a hyphen at a line's end
 * (in either of the two) do not count.
 */
export function onTheSheet(lines: readonly string[], transcript: string): boolean {
  const sheet = lineWords(transcript.split('\n')).map((x) => x.w);
  const want = lineWords(lines).map((x) => x.w);
  if (want.length === 0) return false;
  for (let i = 0; i + want.length <= sheet.length; i++) {
    if (want.every((w, k) => sheet[i + k] === w)) return true;
  }
  return false;
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
function passageOf(stored: unknown): ReadPassage | null {
  if (stored === null || stored === undefined) return null;
  const parsed = ReadPassage.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

/**
 * Each reading question's text as the app gets it (`ItemView.passage`), by the order the
 * questions stand in: questions about the same text share the alias ('t1', 't2' …, like
 * `listenRefs`, issue #210). `evidence` — where the answer stands — only where `shown` says the
 * solution may be sent: while the question is open the place would be half the answer. `named` —
 * the lines the question itself names — always: it says nothing the question does not.
 */
export function passageViews<
  R extends { id: string; prompt: string; read_passage?: unknown; source_excerpt?: string | null },
>(rows: readonly R[], shown: (row: R) => boolean): Map<string, PassageView> {
  const views = new Map<string, PassageView>();
  const byText = new Map<string, string>();
  for (const row of rows) {
    const p = passageOf(row.read_passage);
    if (!p) continue;
    const key = `${p.lang}\u0000${p.title ?? ''}\u0000${p.lines.join('\n')}`;
    const ref = byText.get(key) ?? `t${byText.size + 1}`;
    byText.set(key, ref);
    const evidence = shown(row) && row.source_excerpt ? linesOf(p.lines, row.source_excerpt) : null;
    // The first range the question names (it was checked to exist when it was written).
    const named = lineRefs(row.prompt)[0] ?? null;
    views.set(row.id, { ref, ...p, evidence, named });
  }
  return views;
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
 * language where the server has words for it, else in hers. `transcript` is the reading's own
 * transcription of the sheet, which the text has to stand in.
 */
export function readingItems(
  draft: ReadingDraft,
  opts: { locale: string; transcript: string },
): ReadingItem[] {
  const passage = passageFrom(draft);
  if (!passage || !onTheSheet(passage.lines, opts.transcript)) return [];
  const lines = passage.lines;
  const topic = draft.topic;
  const optionsLocale = asLocale(passage.lang) ?? opts.locale;
  const out: ReadingItem[] = [];
  // The first questions that hold, up to the most one text carries: one that fails costs only
  // itself, never a place for one that holds.
  for (const q of draft.questions) {
    if (out.length >= READING_QUESTIONS_MAX) break;
    const item = readingItem(q);
    if (item) out.push({ ...item, read_passage: passage });
  }
  return out.length >= READING_QUESTIONS_MIN ? out : [];

  /** A short or multiple-choice question, held to the rules every such question is held to. */
  function plain(
    fields: Pick<
      ItemDraft,
      'kind' | 'prompt' | 'answer' | 'accepted_answers' | 'choices' | 'correct_choice'
    >,
    evidence: string,
    difficulty: number,
  ): StoredItem | null {
    const at = linesOf(lines, evidence);
    if (!at || !refsHold(fields.prompt, lineCount(lines), at)) return null;
    const [usable] = usableItems(
      [
        {
          ...fields,
          prompt: keepLineRefsTogether(fields.prompt),
          unit: null,
          topic,
          difficulty,
          prompt_lang: passage!.lang,
          lang: null,
          figure: null,
          read: null,
          tolerance: null,
          // Never 'strict': what she wrote is judged on what she understood (issue #197).
          spelling: fields.kind === 'short' ? 'gentle' : null,
          // The words the answer stands in: the place she is shown once it is closed.
          source_excerpt: evidence,
          curriculum_point: null,
          hints: [lookHint(opts.locale, at)],
          worked_solution: null,
          rubric: null,
        },
      ],
      { locale: opts.locale },
    );
    return usable ?? null;
  }

  function readingItem(q: ReadingQuestion): StoredItem | null {
    switch (q.kind) {
      case 'short':
        if (!keyWordsIn(q.answer, q.evidence)) return null;
        return plain(
          {
            kind: 'short',
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
          {
            kind: 'multiple_choice',
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
        if (standsInText(lines, q.statement)) return null;
        const choices = [
          t(optionsLocale, 'practice.reading.true'),
          t(optionsLocale, 'practice.reading.false'),
        ];
        const correct = q.is_true ? 0 : 1;
        return plain(
          {
            kind: 'multiple_choice',
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
      case 'order': {
        if (!refsHold(q.prompt, lineCount(lines), null)) return null;
        return structuredItem({
          type: 'order',
          prompt: keepLineRefsTogether(q.prompt),
          elements: q.elements,
          numeric: null,
          topic,
          difficulty: q.difficulty,
          prompt_lang: passage!.lang,
        });
      }
    }
  }
}
