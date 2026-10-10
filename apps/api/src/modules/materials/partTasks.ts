// Tasks in parts on a photographed sheet (issue #297, step 3): one material — a situation, a short
// text, values written out — and its subtasks a), b), c) on it, kept as ONE task instead of falling
// apart into separate questions. docs/architecture.md §Practice ("Aufgaben mit Teilaufgaben").
//
// The reading reports the structure: which subtasks share one material, the letter each carries on
// the sheet, its form, and for a computed one how it follows from earlier results. Code decides
// (CLAUDE.md rules 1 and 3): the printed letters must be exactly a), b), c) … in order — a subtask
// left out (a drawing, an unsettled spot) leaves a gap, and a gap is no task —, and the task then
// goes through the very checks a generated task does (`partTaskItems`): every part held like any
// question, every formula recomputed from the keys, every open part's key points held to their
// rules. The letters it reports are only compared, never stored (rule 2): code letters the parts.
//
// Whatever does not hold falls back to what the sheet gave before: its subtasks as separate
// questions, each with the material in front of it and each checked on its own (`usableItems`).
// A subtask is never lost because the task around it did not hold — which is why everything here
// is read generously (a fifth part, an unknown form, a long material) and judged by code after.

import {
  TASK_PART_LETTERS,
  TASK_STEM_MAX,
  TASK_STEM_MIN,
  type ItemKind,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

import {
  ItemDraft,
  itemsOneByOne,
  samePrompt,
  usableItems,
  type StoredItem,
} from '../practice/items.js';
import {
  OPEN_PART_RULE,
  PART_FROM_RULE,
  PartDraft,
  partQuestion,
  PartTaskDraft,
  partTaskItems,
} from '../practice/taskParts.js';

/** The most tasks in parts one reading may return; like `items`, the rest is read on the next pass. */
export const PART_TASKS_PER_READING = 6;

/** The most subtasks read for one task: more than the app letters, so a longer one falls back whole. */
const PARTS_READ_MAX = 8;

/** The longest prompt a question is stored with (`items.prompt`, the baseline's check). */
const STORED_PROMPT_MAX = 1000;

/** A material read generously: one too long for a task in parts still carries its subtasks. */
const MATERIAL_READ_MAX = 4000;

/** What the photo reading is told. Principles and bans, never an example task (owner rule). */
export const SHEET_PART_RULES = `Tasks in parts ("part_tasks"): a task on the sheet that gives ONE material — a situation, a short text, values written out — and then lettered subtasks on it (a), b), c), at most d)) becomes one entry in "part_tasks", never separate questions in items. stem: the material exactly as printed before a), every number and fact the subtasks need, without the task's number and without the subtasks (${TASK_STEM_MIN}–${TASK_STEM_MAX} characters: a situation, a source or a text keeps its line breaks; a table of values is written out row by row; a drawing or chart beside it is named with its title and every value the subtasks need — the app shows the photo of it above every part; a longer material: its subtasks go into items as usual, each with the material it needs). parts: every subtask in the order printed — letter: its letter as printed, without the bracket, also when one before it got no question (named in not_practicable or unclear); prompt: its question as printed, WITHOUT its letter; kind numeric, short, multiple_choice or long, with its own key; hints as for any question. ${PART_FROM_RULE} — the app recomputes it from the keys; null for a subtask that stands on its own. ${OPEN_PART_RULE}`;

/**
 * One subtask as the reading writes it: a part of a task, its printed letter and its help. No
 * reading off a drawn chart: the sheet's picture is its real crop (`images.ts`), never a redraw.
 */
const SheetPart = PartDraft.omit({ read: true }).extend({
  letter: z
    .string()
    .trim()
    .min(1)
    .max(4)
    .describe('Its letter as printed, without the bracket: a, b, c or d'),
  hints: ItemDraft.shape.hints,
  worked_solution: ItemDraft.shape.worked_solution,
});

/**
 * A task in parts as the reading writes it, the material in place of a written situation. Its
 * drawing is the crop of the page (`images.ts`), never data the reading writes.
 */
function sheetTask<P extends z.ZodTypeAny>(part: P) {
  return PartTaskDraft.omit({ figure: true }).extend({
    stem: z
      .string()
      .trim()
      .min(1)
      .max(MATERIAL_READ_MAX)
      .describe(
        'The material exactly as printed before a): every number and fact the subtasks need',
      ),
    parts: part,
  });
}

/** What a study reading is shown. */
export const SheetPartTask = sheetTask(z.array(SheetPart).max(PARTS_READ_MAX));
/** What a homework reading is shown: no worked solution, as for every homework task. */
export const SheetPartTaskHomework = sheetTask(
  z.array(SheetPart.omit({ worked_solution: true })).max(PARTS_READ_MAX),
);
/**
 * How every reading is parsed: a subtask one by one and of any form a question may have, so one
 * that does not fit costs only itself — and leaves the gap that makes the rest separate questions.
 */
export const SheetPartTaskParse = sheetTask(
  itemsOneByOne(SheetPart.extend({ kind: ItemDraft.shape.kind }), PARTS_READ_MAX),
);
export type SheetPartTask = z.infer<typeof SheetPartTaskParse>;

/**
 * Only whole tasks: a part whose task lost another part on the way (a reading of the same sheet
 * again, where the sheet already asks that one) goes too — its letters would name a part that is
 * not there. Questions of no task pass as they are.
 */
export function wholeTasks(items: readonly StoredItem[]): StoredItem[] {
  const count = new Map<string, number>();
  for (const { task_part: p } of items) if (p) count.set(p.group, (count.get(p.group) ?? 0) + 1);
  return items.filter(({ task_part: p }) => !p || count.get(p.group) === p.of);
}

/** The prompts of every subtask read, so a continued reading repeats none of them (#150). */
export function partPrompts(tasks: readonly SheetPartTask[]): string[] {
  return tasks.flatMap((t) => t.parts.map((p) => p.prompt));
}

/** The tasks of a continued reading none of whose parts is among the prompts `known` (#150). */
export function unseenTasks(
  tasks: readonly SheetPartTask[],
  known: ReadonlySet<string>,
): SheetPartTask[] {
  return tasks.filter((t) => t.parts.every((p) => !known.has(samePrompt(p.prompt))));
}

/**
 * The task as a generated one is written, or null when it is none: its letters are not a), b), c)
 * … in order, or it does not fit what a task in parts is (2–4 parts of the part forms, a material
 * of a few sentences — `PartTaskDraft`).
 */
function asTask(read: SheetPartTask): PartTaskDraft | null {
  const lettered = read.parts.every(
    (p, i) => p.letter.toLowerCase().replace(/[^\p{L}]/gu, '') === TASK_PART_LETTERS[i],
  );
  if (!lettered) return null;
  const parsed = PartTaskDraft.safeParse(read);
  return parsed.success ? parsed.data : null;
}

/**
 * The questions one task in parts on the sheet gives: the task, lettered and whole — or, when it
 * does not hold, its subtasks as questions of their own. `off` is this environment's switched-off
 * forms (#296): a task with a part of such a form would keep a gap, so it is none either.
 */
export function sheetPartTaskItems(
  read: SheetPartTask,
  opts: { locale: string; off: ReadonlySet<ItemKind> },
): StoredItem[] {
  const task = asTask(read);
  const whole = task ? partTaskItems(task, { locale: opts.locale, help: read.parts }) : [];
  if (whole.length > 0 && !whole.some((it) => opts.off.has(it.kind))) return whole;
  return usableItems(
    read.parts.map((p) => {
      // Each one answerable on its own: the material before its question, where it fits.
      const withMaterial = `${read.stem}\n\n${p.prompt}`;
      const prompt = withMaterial.length <= STORED_PROMPT_MAX ? withMaterial : p.prompt;
      return partQuestion(read, { ...p, prompt });
    }),
    { locale: opts.locale },
  );
}
