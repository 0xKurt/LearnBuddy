// A task in parts (issue #297): one material, subtasks a), b), c) on it, and Folgefehler.
// docs/architecture.md §Practice ("Aufgaben mit Teilaufgaben"), contracts/taskParts.ts.
//
// Regel 0, in both directions, and nothing checked in a second way (#296):
//
//   · Writing: every part is an ordinary question and goes through `usableItems` like every other
//     — its figure, its key, its options, its hints. A part that does not hold costs the WHOLE
//     task: b) without a) is no task, and its letters would lie. A part that says how its result
//     follows from earlier parts ("a * 0,15 + 12") is recomputed with their keys; a formula that
//     does not come out at its own key, names a part that is not earlier, names a part that is no
//     number or no part at all, or has nothing earlier in it, costs the task too. Reject, never
//     repair.
//   · Answering: a part is first judged against its key like any question (`evaluate.ts`). Only
//     when that says it is not right, and only when an earlier part it builds on was answered
//     WRONG in this run, code recomputes the formula with HER results and compares again. Her b)
//     that follows correctly from her wrong a) is right — a Folgefehler, as German schools mark
//     it — and the reply says so. Her own a) stays wrong; nothing here touches it.
//
// The model never writes an id or a letter into a stored field (CLAUDE.md rule 2): the parts are
// lettered here in the order they come, the group id is made here, the app gets an alias.

import { randomUUID } from 'node:crypto';

import {
  compareNumbers,
  evaluateExpression,
  parseCanonicalKey,
  parseExpression,
  parseNumericInput,
  variablesOf,
} from '@learnbuddy/shared-math';
import {
  TASK_FORMULA_MAX,
  TASK_PART_LETTERS,
  TASK_PARTS_MAX,
  TASK_PARTS_MIN,
  TASK_STEM_MAX,
  TASK_STEM_MIN,
  TaskPart,
  type TaskPartLetter,
  type TaskPartView,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

import type { Db } from '../../lib/db.js';
import { ItemDraft, usableItems, type StoredItem } from './items.js';
import { lastValue } from './steps.js';

/** The most tasks in parts one run carries: each is three or four questions already. */
export const MAX_PART_TASKS = 2;

/** The answer forms a part may have in this first step: a number, a short answer, a choice. */
const PART_KINDS = ['numeric', 'short', 'multiple_choice'] as const;

const PartDraft = ItemDraft.pick({
  prompt: true,
  answer: true,
  accepted_answers: true,
  unit: true,
  choices: true,
  correct_choice: true,
  tolerance: true,
}).extend({
  kind: z.enum(PART_KINDS),
  from: z
    .string()
    .trim()
    .min(1)
    .max(TASK_FORMULA_MAX)
    .nullable()
    .default(null)
    .describe(
      'numeric only, and only when this part goes on with the RESULT of earlier parts: how its answer follows from theirs, as arithmetic in their letters (a, b, c) — "a * 0,15 + 12"; null for a part that stands on its own',
    ),
});

/**
 * A task in parts as the model writes it: the situation and the parts. No drawing yet: a second
 * figure union in the explain schema would grow it by a third (20 kB of 65 kB, measured 05.10.) —
 * the material as a figure comes once the schema budget is measured with Vertex (#281, #297 plan).
 */
export const PartTaskDraft = z.object({
  stem: z
    .string()
    .trim()
    .min(TASK_STEM_MIN)
    .max(TASK_STEM_MAX)
    .describe('The situation, stated once before a): every number the parts need'),
  topic: ItemDraft.shape.topic,
  difficulty: ItemDraft.shape.difficulty,
  prompt_lang: ItemDraft.shape.prompt_lang,
  parts: z.array(PartDraft).min(TASK_PARTS_MIN).max(TASK_PARTS_MAX),
});
export type PartTaskDraft = z.infer<typeof PartTaskDraft>;

/**
 * What the generator is told about tasks in parts. Principles, never an example task (models copy
 * examples — standing owner rule); the formula's form is a syntax, not a task.
 */
export const PART_TASK_RULES = `Tasks in parts ("part_tasks", grade 7 and up, any subject where a situation carries several steps): one situation (stem: a few sentences with every number the parts need — no drawing, chart or table: such a task is not written as one in parts) and ${TASK_PARTS_MIN}–${TASK_PARTS_MAX} parts in the order a class test asks them, from finding a value to using it. Each part is a question of kind numeric, short or multiple_choice with its own key, written WITHOUT its letter (the app letters them a), b), c)). A numeric part that goes on with the result of earlier parts says how in "from": arithmetic over their letters only (a, b, c; numbers, + - * / ^, sqrt, parentheses) that gives exactly its own key from theirs — the app recomputes it, and a task whose formula does not give the key is dropped whole. Never a part that only repeats another, never more parts than the situation carries.`;

/** The letters of a task of `n` parts. */
function lettersOf(n: number): TaskPartLetter[] {
  return TASK_PART_LETTERS.slice(0, n);
}

/** The value of a numeric key, or null when it is no plain number. */
function keyValue(answer: string): number | null {
  const parsed = parseCanonicalKey(answer);
  return parsed.form === 'expression' ? null : parsed.value;
}

/**
 * Does `from` hold for part `index`: it names only earlier numeric parts, at least one of them,
 * and computed from their keys it gives this part's key? Exported for the unit test.
 */
export function formulaHolds(
  from: string,
  index: number,
  parts: ReadonlyArray<{
    kind: string;
    answer: string;
    unit: string | null;
    tolerance: number | null;
  }>,
): boolean {
  const expr = parseExpression(from, 'letters');
  if (!expr) return false;
  const used = variablesOf(expr);
  if (used.length === 0) return false;
  const env: Record<string, number> = {};
  for (const name of used) {
    const at = (TASK_PART_LETTERS as readonly string[]).indexOf(name);
    const earlier = parts[at];
    if (at < 0 || at >= index || !earlier || earlier.kind !== 'numeric') return false;
    const value = keyValue(earlier.answer);
    if (value === null) return false;
    env[name] = value;
  }
  const own = parts[index];
  if (!own) return false;
  return isValue(evaluateExpression(expr, env), own) === true;
}

/**
 * Is `written` — the part's own key unless another number is given — the computed `value`, at the
 * precision the part's key is written in (decision D-1: a decimal key counts to half a unit of its
 * last decimal, else exactly, or within the part's own tolerance)? Null when the key is no plain
 * number or the value is not finite: then nothing is decided here.
 */
function isValue(
  value: number,
  part: { answer: string; unit: string | null; tolerance: number | null },
  written = parseCanonicalKey(part.answer),
): boolean | null {
  const key = parseCanonicalKey(part.answer);
  if (!Number.isFinite(value) || key.value === null || key.form === 'expression') return null;
  // The computed value, written to the key's own precision, then compared as a key would be.
  const computed = parseCanonicalKey(value.toFixed(Math.min(10, key.decimals)));
  const c = compareNumbers(written, computed, { unit: part.unit, tolerance: part.tolerance });
  return c === 'unknown' ? null : c === 'equal';
}

/**
 * The questions of one task in parts, lettered, each carrying the task — or none.
 *
 * Every part goes through `usableItems` like any question; one that does not hold, or a formula
 * that does not, costs the whole task (a task is its parts in order).
 */
export function partTaskItems(draft: PartTaskDraft, opts: { locale?: string } = {}): StoredItem[] {
  const n = draft.parts.length;
  const drafts: ItemDraft[] = draft.parts.map(({ from: _from, ...p }) => ({
    ...p,
    topic: draft.topic,
    difficulty: draft.difficulty,
    prompt_lang: draft.prompt_lang,
    lang: null,
    figure: null,
    choice_figures: null,
    read: null,
    computes: null,
    spelling: null,
    source_excerpt: null,
    curriculum_point: null,
    hints: [],
    worked_solution: null,
    rubric: null,
  }));
  const usable = usableItems(drafts, opts);
  if (usable.length !== n) return [];
  for (let i = 0; i < n; i++) {
    const from = draft.parts[i]?.from ?? null;
    if (from === null) continue;
    if (usable[i]?.kind !== 'numeric' || !formulaHolds(from, i, usable)) return [];
  }
  const group = randomUUID();
  const letters = lettersOf(n);
  return usable.map((it, i) => ({
    ...it,
    rubric: null,
    task_part: TaskPart.parse({
      group,
      part: letters[i],
      of: n,
      stem: draft.stem,
      from: draft.parts[i]?.from ?? null,
    }),
  }));
}

/** A stored part, read forgivingly: anything that does not parse is no part. */
export function taskPartOf(raw: unknown): TaskPart | null {
  const parsed = TaskPart.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Each part as the app gets it (`ItemView.task_part`): the parts of one task share the alias
 * ('p1', 'p2' …, by the order they stand in, like a reading text's 't1').
 */
export function taskPartViews<R extends { id: string; task_part?: unknown }>(
  rows: readonly R[],
): Map<string, TaskPartView> {
  const views = new Map<string, TaskPartView>();
  const refs = new Map<string, string>();
  for (const row of rows) {
    const p = taskPartOf(row.task_part);
    if (!p) continue;
    const ref = refs.get(p.group) ?? `p${refs.size + 1}`;
    refs.set(p.group, ref);
    views.set(row.id, { ref, part: p.part, letters: lettersOf(p.of), stem: p.stem });
  }
  return views;
}

/**
 * The number she wrote: what the last line of a written path states, or what a single line ends
 * in after its last "=" ("9 + 3 = 12"), or the number itself. Null for anything else.
 */
function herNumber(text: string) {
  const line = lastValue(text) ?? text;
  const parsed = parseNumericInput((line.split('=').at(-1) ?? line).trim());
  return parsed.value === null || parsed.form === 'expression' ? null : parsed;
}

type Answered = { part: TaskPartLetter; answer: string; text: string | null };

/**
 * A Folgefehler (issue #297): is her answer to this part right when it is computed from HER
 * results of the earlier parts it builds on, while at least one of those was wrong? Pure; the
 * caller hands over her latest answer to every earlier part of the task in this run.
 * Null when the part builds on nothing, she answered none of its parts wrongly, or a number is
 * not readable — then the key alone decides, as for any question.
 */
export function followsOn(
  part: TaskPart,
  item: { answer: string; unit: string | null; tolerance: number | null },
  text: string,
  earlier: readonly Answered[],
): TaskPartLetter | null {
  if (part.from === null) return null;
  const expr = parseExpression(part.from, 'letters');
  if (!expr) return null;
  const env: Record<string, number> = {};
  let wrongOne: TaskPartLetter | null = null;
  for (const name of variablesOf(expr)) {
    const done = earlier.find((e) => e.part === name);
    const key = done ? keyValue(done.answer) : null;
    const hers = done?.text ? (herNumber(done.text)?.value ?? null) : null;
    if (!done || key === null || hers === null) return null;
    env[name] = hers;
    if (isValue(hers, { answer: done.answer, unit: null, tolerance: null }) === false)
      wrongOne ??= done.part;
  }
  if (wrongOne === null) return null;
  const given = herNumber(text);
  if (given === null) return null;
  // Her number against the formula's value from HER results, to the key's precision.
  return isValue(evaluateExpression(expr, env), item, given) === true ? wrongOne : null;
}

/**
 * Her latest answer in this run to each earlier part of the task `part` belongs to. Only this
 * run: a part that comes back alone in a review has no earlier answer of hers to follow.
 */
export async function earlierAnswers(
  db: Db,
  sessionId: string,
  part: TaskPart,
): Promise<Answered[]> {
  const rows = await db.query<{ task_part: unknown; answer: string; text: string | null }>(
    `select i.task_part, i.answer,
            (select t.text from practice_turns t
              where t.session_id = si.session_id and t.item_id = i.id and t.role = 'learner'
                and t.verdict is not null and t.verdict <> 'not_an_attempt'
              order by t.seq desc limit 1) as text
       from session_items si join items i on i.id = si.item_id
      where si.session_id = $1 and i.task_part->>'group' = $2`,
    [sessionId, part.group],
  );
  const order = TASK_PART_LETTERS.indexOf(part.part);
  return rows.flatMap((r) => {
    const p = taskPartOf(r.task_part);
    return p && TASK_PART_LETTERS.indexOf(p.part) < order
      ? [{ part: p.part, answer: r.answer, text: r.text }]
      : [];
  });
}
