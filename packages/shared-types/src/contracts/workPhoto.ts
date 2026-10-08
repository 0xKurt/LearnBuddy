// Her own working, photographed (issue #444, step 3 of #221).
//
// She works in her exercise book and photographs the way instead of typing it. The model only
// COPIES IT DOWN; the copy goes into her answer field, she sees it and puts it right, and only her
// "Prüfen" sends it — through the ordinary answer path, where code checks the way step by step
// (`apps/api/src/modules/practice/steps.ts`, `checkPath`). Read is not written: a check on a copy
// she never saw would judge something she may never have written (CLAUDE.md rule 5).
//
// What this contract fixes for both sides:
//   · A line that could not be read with certainty comes as `null` — the server never sends a
//     guessed text for it, even when the model wrote one. The app names the line to her.
//   · The photo is held in memory for this one call and never stored, and neither is the copy:
//     what is stored is what she sends as her answer herself.
//   · A path is possible only where the server checks one (`PATH_KINDS`) — one list for both.

import { z } from 'zod';

import { Uuid } from './common.js';
import type { ItemKind } from './learning.js';

/**
 * The kinds whose answer may carry a worked path: exactly where `evaluate.ts` calls `checkPath`
 * (issue #209). In a vocabulary answer or a multiple choice a line break means nothing, and a
 * photo of a path would be an answer the check cannot read.
 */
const PATH_KINDS: readonly ItemKind[] = ['numeric', 'formula', 'short'];

/** Whether a worked path is checked for this kind — typed line by line, or photographed. */
export function pathPossible(kind: string): boolean {
  return (PATH_KINDS as readonly string[]).includes(kind);
}

/**
 * The most lines one reading hands back, and the longest line. Together they fit one answer
 * (`ANSWER_TEXT_MAX`, 2000): 16 × 120 characters and 15 line breaks. A photo with more is said to
 * be too much (`too_long`) — never cut down to what fits, which would check a path she never
 * wrote to its end.
 */
export const WORK_LINES_MAX = 16;
export const WORK_LINE_MAX = 120;

/**
 * The photo as the app prepares every photo (`apps/mobile/lib/capture/upload.ts` `preparePhoto`:
 * JPEG, longest side 1600 px) — about 1.5 MB at the most. The bound is transport, like a
 * recording's (`SpeakRequest`).
 */
export const WORK_PHOTO_BASE64_MAX = 2_000_000;

/** POST /practice/sessions/:id/work-photo — read her working for one open question. */
export const ReadWorkRequest = z.object({
  item_id: Uuid,
  photo_base64: z.string().min(100).max(WORK_PHOTO_BASE64_MAX),
});
export type ReadWorkRequest = z.infer<typeof ReadWorkRequest>;

/**
 * What was read off the photo. Nothing here is a verdict — the verdict comes from her answer.
 *
 *   · read        — her lines, top to bottom; `null` for a line that could not be read with
 *                   certainty (named to her, never guessed). At least one line was read.
 *   · unreadable  — nothing on the photo could be read with certainty.
 *   · no_working  — the photo shows no working of hers for this question.
 *   · too_long    — more than one answer holds (`WORK_LINES_MAX`, `WORK_LINE_MAX`).
 *
 * Only `read` carries lines.
 */
export const WorkReadingStatus = z.enum(['read', 'unreadable', 'no_working', 'too_long']);
export type WorkReadingStatus = z.infer<typeof WorkReadingStatus>;

export const WorkReading = z.object({
  status: WorkReadingStatus,
  lines: z.array(z.string().min(1).max(WORK_LINE_MAX).nullable()).max(WORK_LINES_MAX),
});
export type WorkReading = z.infer<typeof WorkReading>;
