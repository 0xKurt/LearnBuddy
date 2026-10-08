// What one reading of a sheet becomes as questions, before anything is stored: every form held to
// its own rules by code (Regel 0, #224) — in one place for the first reading of a sheet and for a
// reading the learner settled a spot for (#164). docs/architecture.md §Material.

import type { ItemKind } from '@learnbuddy/shared-types/contracts';
import type { z } from 'zod';

import { formsOn, samePrompt, usableItems, type StoredItem } from '../practice/items.js';
import { readingItems } from '../practice/reading.js';
import { SHEET_STRUCTURED, structuredItems } from '../practice/structured.js';
import type { ExtractionParse } from './extract.js';
import { sheetPartTaskItems, wholeTasks } from './partTasks.js';

type Read = z.infer<typeof ExtractionParse>;
type Forms = { locale: string; off: ReadonlySet<ItemKind> };

/**
 * The questions of a reading, in order. The ordinary ones, and after them the structured ones
 * that pass Regel 0 (#228–#230): an order, a table or links to make. Then each reading text's
 * group (#233), checked against the text and the transcription of the sheet — not in homework,
 * which is helped task by task as printed (its schema has no reading). Then each task in parts
 * (#297): whole, or as its separate questions.
 */
export function sheetQuestions(
  x: Pick<Read, 'items' | 'structured' | 'reading' | 'part_tasks' | 'extracted_text'>,
  opts: Forms & { homework: boolean },
): StoredItem[] {
  return [
    ...usableItems(x.items),
    ...structuredItems(x.structured, SHEET_STRUCTURED, x.structured.length),
    ...(opts.homework ? [] : x.reading).flatMap((r) =>
      readingItems(r, { locale: opts.locale, transcript: x.extracted_text }),
    ),
    ...x.part_tasks.flatMap((t) => sheetPartTaskItems(t, opts)),
  ];
}

/**
 * What a reading of the settled task adds to a sheet that already asks `known` (#164): its
 * questions of forms that are on (#296), none the sheet asks already — and a task in parts only
 * whole, never with the gap of a part the sheet already has (#297).
 */
export function addedQuestions(
  x: Pick<Read, 'items' | 'part_tasks'>,
  known: ReadonlySet<string>,
  opts: Forms,
): StoredItem[] {
  const read = [
    ...usableItems(x.items),
    ...x.part_tasks.flatMap((t) => sheetPartTaskItems(t, opts)),
  ];
  return wholeTasks(formsOn(read, opts.off).filter((it) => !known.has(samePrompt(it.prompt))));
}
