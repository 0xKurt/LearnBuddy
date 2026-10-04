// Leseverständnis: several questions about ONE text she reads (issue #233).
//
// The text is the stimulus, not the answer, so unlike a listening text (#210) it is shown while
// the questions are open — above the question, with line numbers, foldable, and the one part of
// the question card that may scroll in itself (CLAUDE.md rule 16, `scroll-text` in
// tests/web/fit.ts: "nur ein Text scrollt"). The answer forms are the ones that exist: multiple
// choice (true/false is one, with two options code writes), a short answer and an order (#228).
//
// Three decisions, and why:
//
//   1. The text is stored on EVERY question of its group (`items.read_passage`, migration 0086),
//      for the reason `items.listen_task` is: spaced repetition may bring one question back alone
//      in three weeks, and a question whose text lives elsewhere is then unanswerable. The group
//      is the set of questions carrying the same text.
//   2. The text is stored LINE BY LINE, as printed on the sheet. A question that says "Z. 12"
//      means line 12 of the sheet, and the app numbers exactly these lines — numbering whatever a
//      wrapped paragraph happens to fit on a phone would make "Z. 12" point nowhere. Code checks
//      that every line a question names exists (`apps/api/src/modules/practice/reading.ts`).
//   3. Questions about one text share an alias (`PassageView.ref`: 't1', 't2' …) issued by the
//      server from the position in the view (CLAUDE.md rule 2), so the app keeps the text as she
//      left it — folded or open, scrolled where she was — from one question of the group to the
//      next.

import { z } from 'zod';

/** A reading text of a class test or a textbook page: one page, not a book (issue #233). */
export const PASSAGE_CHARS_MAX = 2500;
/** Under this there is nothing to understand that a single question could not quote. */
export const PASSAGE_CHARS_MIN = 120;
/** Lines as printed; a page of a reader has 30–45. */
export const PASSAGE_LINES_MAX = 60;
/** One printed line (a wide textbook line is about 75 characters). */
export const PASSAGE_LINE_MAX = 100;
/** The most questions one text carries: a class test asks four to six. */
export const READING_QUESTIONS_MAX = 6;
/** One question about a text is a question with a quote; a group needs at least two. */
export const READING_QUESTIONS_MIN = 2;

/** The text of a reading group, as stored on each of its questions (`items.read_passage`). */
export const ReadPassage = z.object({
  /** The heading as printed; null when there is none. */
  title: z.string().trim().min(1).max(80).nullable(),
  /**
   * The lines, in order, as printed. An empty line (a paragraph break) is kept for the layout but
   * not counted: "Z. 12" is the twelfth line of TEXT, as print numbers them.
   */
  lines: z.array(z.string().max(PASSAGE_LINE_MAX)).min(1).max(PASSAGE_LINES_MAX),
  /** The language the text is written in (ISO 639-1). */
  lang: z.string().regex(/^[a-z]{2}$/),
});
export type ReadPassage = z.infer<typeof ReadPassage>;

/**
 * The number each line carries, as print counts them: a line with text counts, an empty line
 * between paragraphs does not (it carries null). "Z. 12" on a sheet is the twelfth line OF TEXT.
 * One count for both sides: the server checks a question's lines against it, the app numbers
 * the text with it.
 */
export function lineNumbers(lines: readonly string[]): Array<number | null> {
  let n = 0;
  return lines.map((l) => (l.trim() === '' ? null : ++n));
}

/** Lines of the text (1-based, inclusive; numbered as `lineNumbers` counts them). */
export const PassageLines = z.object({
  from: z.number().int().min(1).max(PASSAGE_LINES_MAX),
  to: z.number().int().min(1).max(PASSAGE_LINES_MAX),
});
export type PassageLines = z.infer<typeof PassageLines>;

/**
 * What the app shows above a reading question (`ItemView.passage`): the whole text, because it
 * is what she answers FROM, never the answer itself.
 */
export const PassageView = z.object({
  /** The same for every question about this text in one view ('t1', 't2' …). */
  ref: z.string().regex(/^t[1-9][0-9]*$/),
  title: z.string().nullable(),
  lines: z.array(z.string()).min(1).max(PASSAGE_LINES_MAX),
  lang: z.string(),
  /**
   * Where this question's answer stands in the text — sent only once the question is closed,
   * under exactly the condition its solution is sent under: while it is open the place would
   * be half the answer. Null for an order, which is about the whole text.
   */
  evidence: PassageLines.nullable().default(null),
  /**
   * The lines the question itself names ("Z. 17–19"), read by code from its text: the text opens
   * there and numbers them, so she does not count. Never more than the question already says.
   */
  named: PassageLines.nullable().default(null),
});
export type PassageView = z.infer<typeof PassageView>;
