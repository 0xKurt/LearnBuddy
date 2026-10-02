// Leseverständnis: several questions about ONE text she reads (issue #233).
//
// The text is the stimulus, not the answer, so unlike a listening text (#210) it is shown while
// the questions are open — above the question, with line numbers, collapsible, and the one part
// of the practice screen besides the conversation that may scroll (CLAUDE.md rule 16: "nur ein
// Text scrollt"). The answer forms are the ones that exist: multiple choice (true/false is one,
// with two options code writes), a short answer, an order (#228) and a marking (#234).
//
// Three decisions, and why:
//
//   1. The text is stored on EVERY question of its group (`items.read_passage`, migration 0090),
//      for the reason `items.listen_task` is: spaced repetition may bring one question back alone
//      in three weeks, and a question whose text lives elsewhere is then unanswerable.
//   2. The text is stored LINE BY LINE, as printed on the sheet or as Buddy wrote it. A question
//      that says "Z. 12" means line 12 of the sheet, and the app numbers exactly these lines — a
//      wrapped paragraph would number whatever fits the phone, and "Z. 12" would point nowhere.
//      Code checks every line a question names exists (`apps/api/src/modules/practice/reading.ts`).
//   3. Questions about one text share an alias (`PassageView.ref`, 't1', 't2' …) issued by the
//      server from the position in the view, so the app keeps the text open, scrolled where she
//      left it, from one question of the group to the next.

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

/** The text of a reading group, as stored on each of its questions. */
export const ReadPassage = z.object({
  /** The heading as printed or as Buddy gave it; null when there is none. */
  title: z.string().trim().min(1).max(80).nullable(),
  /** The lines, in order, as printed. Empty lines (a paragraph break) are kept and counted. */
  lines: z.array(z.string().max(PASSAGE_LINE_MAX)).min(1).max(PASSAGE_LINES_MAX),
  /** The language the text is written in (ISO 639-1). */
  lang: z.string().regex(/^[a-z]{2}$/),
});
export type ReadPassage = z.infer<typeof ReadPassage>;

/** What the app shows above a reading question (`ItemView.passage`). */
export const PassageView = z.object({
  /** The same for every question about this text in one view ('t1', 't2' …). */
  ref: z.string().regex(/^t[1-9][0-9]*$/),
  title: z.string().nullable(),
  lines: z.array(z.string()).min(1).max(PASSAGE_LINES_MAX),
  lang: z.string(),
});
export type PassageView = z.infer<typeof PassageView>;

/** Lines of the text a closed question's answer stands in (1-based, inclusive). */
export const PassageLines = z.object({
  from: z.number().int().min(1).max(PASSAGE_LINES_MAX),
  to: z.number().int().min(1).max(PASSAGE_LINES_MAX),
});
export type PassageLines = z.infer<typeof PassageLines>;
