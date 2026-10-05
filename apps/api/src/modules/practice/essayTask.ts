// Where a long-text task comes from (issue #258, step 2): Buddy offers it (`offer_learning` kind
// `essay`), about a topic she names or the writing task on one of her sheets, and the generator
// writes the ONE task — its wording, its text type and, for an analysis, the text it is about.
// docs/architecture.md §Practice („Lange Texte").
//
// The same seam as „Erklär mal" (#236, `teachBack.ts`): the model fills a list of its own
// (`essay`, only in an essay run), and code decides what is stored. The model picks the text TYPE;
// the key points that type is checked against are code's (`ESSAY_POINTS` in `essay.ts`), never the
// model's. Every check here is mechanical (Regel 0 of #224: reject, never repair):
//
//   · an analysis needs the text it analyses — without one there is nothing to quote with a line;
//   · a text must fit what a reading text may be (`passageFrom`: lines, length);
//   · from her sheet, the text must stand on that sheet word for word (`onTheSheet`, as for #233):
//     a text the model wrote beside her sheet is not the one her teacher set.
//
// Without a sheet an analysis is of a short text Buddy writes himself — like a listening text
// (#210), his own and marked as his ("Frage von Buddy"), never a published text recalled from
// memory.

import {
  EssayType,
  PASSAGE_CHARS_MAX,
  PASSAGE_CHARS_MIN,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

import { essayItem } from './essay.js';
import type { StoredItem } from './items.js';
import { onTheSheet, passageFrom, ReadingDraft } from './reading.js';

/** One essay run is one task: a long text is an afternoon's work, not a set. */
export const MAX_ESSAYS = 1;

export const EssayDraft = z.object({
  prompt: z
    .string()
    .trim()
    .min(10)
    .max(400)
    .describe(
      'The writing task as a teacher sets it, in her language — from SHEET TEXT copied as printed. It names what to write, never what the text has to contain.',
    ),
  type: EssayType.describe(
    'argue_linear: a statement of opinion, a linear discussion or a comment · argue_dialectic: a pro-and-contra discussion, also one based on material · analyse: an analysis or interpretation of a text (story, poem, drama scene, factual text, speech).',
  ),
  topic: z.string().trim().min(1).max(60),
  difficulty: z.number().int().min(1).max(5),
  passage: ReadingDraft.pick({ title: true, lines: true, lang: true })
    .nullable()
    .describe(
      'The text the task is about, line by line as printed, an empty string between paragraphs. Required for analyse; null when the task has no text.',
    ),
});
export type EssayDraft = z.infer<typeof EssayDraft>;

export const ESSAY_RULES = `LONG TEXT ("essay"): the learner wants to practise WRITING a long text — an essay, a discussion (Erörterung), a comment, an analysis or interpretation — and gets feedback on it per key point of its text type. Fill "essay" with exactly ${MAX_ESSAYS} task and nothing else. When SHEET TEXT is given, the task is the writing task printed there, copied as printed; otherwise write one task on the topic she named, the way her teacher would set it at her grade. type: the text type the task asks for. passage: the text the task is about, only when it has one — for analyse always: from SHEET TEXT its lines copied exactly as printed; without a sheet a short text of your own at her level (a scene, a poem, a short factual text; ${PASSAGE_CHARS_MIN}–${PASSAGE_CHARS_MAX} characters), never a published text from memory. No model answer, no list of what she must write, no grade.`;

/**
 * The essay task of a run that may be stored, or none. `sheet` is the text of the sheet the run is
 * about (or null): a text the task is about must stand on it. `locale` names the key points.
 */
export function essayItems(
  drafts: readonly EssayDraft[],
  sheet: string | null,
  locale: string,
): StoredItem[] {
  const out: StoredItem[] = [];
  for (const d of drafts) {
    const passage = d.passage ? passageFrom(d.passage) : null;
    // A text that does not fit is no text — and the task without it would be another task.
    if (d.passage && passage === null) continue;
    if (d.type === 'analyse' && passage === null) continue;
    if (passage && sheet !== null && !onTheSheet(passage.lines, sheet)) continue;
    out.push(essayItem({ ...d, passage }, locale));
    if (out.length >= MAX_ESSAYS) break;
  }
  return out;
}
