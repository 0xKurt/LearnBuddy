// A task in parts, as in a class test from grade 8 on (issue #297): one material — a short text
// with the situation, and the drawing the question already has — and subtasks a), b), c) on it.
// A later part may build on an earlier part's RESULT ("b) Berechne damit …"), and then a mistake in
// a) is not marked again in b): b) is recomputed with HER result from a) (Folgefehler, as German
// schools mark it).
//
// Three decisions, and why:
//
//   1. Every part is an ordinary question with its own answer form and its own check — nothing
//      is checked twice or in a second way (#296). What is new is only the material above it, its
//      letter, and the formula that ties it to an earlier part.
//   2. The material is stored on EVERY part (`items.task_part`, migration 0100), for the reason a
//      reading text is (#233): spaced repetition may bring one part back alone in three weeks,
//      and then it brings its situation along. A part that comes back alone is checked against
//      its key only — there is no earlier answer of hers to follow.
//   3. The model never writes an id (CLAUDE.md rule 2): parts are lettered by code in the order
//      they come, an earlier part is named by its letter in a formula ("a * 0,15 + 12"), the group
//      is an id code makes, and the app gets an alias for it (`TaskPartView.ref`: 'p1', 'p2' …).

import { z } from 'zod';

/** The letters of a task's parts, in order; a class test task rarely has more than four. */
export const TASK_PART_LETTERS = ['a', 'b', 'c', 'd'] as const;
export const TaskPartLetter = z.enum(TASK_PART_LETTERS);
export type TaskPartLetter = z.infer<typeof TaskPartLetter>;

/** One subtask is a question; a task in parts has at least two. */
export const TASK_PARTS_MIN = 2;
export const TASK_PARTS_MAX = TASK_PART_LETTERS.length;
/** The situation in a few sentences: what a printed task states before a). */
export const TASK_STEM_MIN = 20;
export const TASK_STEM_MAX = 300;
/** A formula over earlier parts: one line of arithmetic. */
export const TASK_FORMULA_MAX = 120;

/** A part of a task, as stored on each of its questions (`items.task_part`). */
export const TaskPart = z.object({
  /** The task this part belongs to: an id code made when it stored the task. */
  group: z.string().uuid(),
  part: TaskPartLetter,
  /** How many parts the task has (its letters are the first `of` of TASK_PART_LETTERS). */
  of: z.number().int().min(TASK_PARTS_MIN).max(TASK_PARTS_MAX),
  /** The situation, shown above every part. */
  stem: z.string().trim().min(TASK_STEM_MIN).max(TASK_STEM_MAX),
  /**
   * How this part's result follows from earlier parts' results, in their letters ("a * 0,15 +
   * 12"), checked against the keys before it was stored; null for a part that stands on its own.
   */
  from: z.string().trim().min(1).max(TASK_FORMULA_MAX).nullable(),
});
export type TaskPart = z.infer<typeof TaskPart>;

/** A part as the app shows it: the situation, which part this is of which, and nothing of a key. */
export const TaskPartView = z.object({
  /** The same for every part of one task in this run ('p1', 'p2' …), never the stored id. */
  ref: z.string().regex(/^p\d+$/),
  part: TaskPartLetter,
  letters: z.array(TaskPartLetter).min(TASK_PARTS_MIN).max(TASK_PARTS_MAX),
  stem: z.string(),
});
export type TaskPartView = z.infer<typeof TaskPartView>;
