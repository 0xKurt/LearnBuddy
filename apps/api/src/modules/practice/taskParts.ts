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
// An OPEN part („Begründe …", „Deute …", step 2 of #297) is a free text with key points, written,
// checked and stored exactly as an explanation question is („Erklär mal", `teachBack.ts`): the same
// rules for its points (against everything she reads — the situation and its question), the same
// rubric, the same follow-ups as its hints. Answering it is the one key-point path of
// `answer.ts` (#236, the quote check of #258): no second check, no grade. Its points may not hang
// on an earlier part's result: she may go on with her own (`openPartProblem`).
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
  TASK_OPEN_POINTS_MAX,
  TASK_OPEN_POINTS_MIN,
  TASK_PART_LETTERS,
  TASK_PARTS_MAX,
  TASK_PARTS_MIN,
  TASK_STEM_MAX,
  TASK_STEM_MIN,
  BarChartFigure,
  ClimateChartFigure,
  FunctionPlotFigure,
  LineChartFigure,
  PieChartFigure,
  ScatterPlotFigure,
  TableFigure,
  TaskPart,
  type TaskPartLetter,
  type TaskPartView,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

import type { Db } from '../../lib/db.js';
import { valuesIn } from './evaluate.js';
import { ItemDraft, usableItems, type StoredItem } from './items.js';
import { close, lastValue } from './steps.js';
import { KeyPointDraft, keyPointFields, keyPointsProblem } from './teachBack.js';

/** The most tasks in parts one run carries: each is three or four questions already. */
export const MAX_PART_TASKS = 2;

/**
 * The answer forms a part may have: a number, a short answer, a choice — and an open answer
 * (`long`), checked against its key points. A run offers only those its profile allows
 * (`setProfiles.ts`): a test has no long answer, so no open part.
 */
export const PART_KINDS = ['numeric', 'short', 'multiple_choice', 'long'] as const;

export const PartDraft = ItemDraft.pick({
  prompt: true,
  answer: true,
  accepted_answers: true,
  unit: true,
  choices: true,
  correct_choice: true,
  tolerance: true,
  // A number read off the material's chart says what it reads, as for any question about a chart:
  // code computes the key from the chart's data (`chartRead.ts`).
  read: true,
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
  points: z
    .array(KeyPointDraft)
    .max(TASK_OPEN_POINTS_MAX)
    .default([])
    .describe(
      `long only: the ${TASK_OPEN_POINTS_MIN}–${TASK_OPEN_POINTS_MAX} key points a complete answer to this open part makes, in the order a teacher expects them; empty for every other part`,
    ),
});

/**
 * The drawings a task's material may be (#297, Schnitt 4): the data a class test prints beside its
 * situation — a table of values, a chart, a function graph. Not every figure: the whole union a
 * second time would grow the explain schema by a third (22 kB, measured 10.10.); these seven are
 * 3.2 kB. Each is checked and drawn by the same code as any question's figure (`usableItems`).
 */
const MaterialFigure = z.discriminatedUnion('type', [
  TableFigure,
  FunctionPlotFigure,
  BarChartFigure,
  LineChartFigure,
  ClimateChartFigure,
  PieChartFigure,
  ScatterPlotFigure,
]);

/**
 * A task in parts as the model writes it: the situation, the drawing it shows if any, and the
 * parts. A drawing that does not parse costs the task (no `.catch`): a situation that names its
 * table is no task without it (Regel 0, reject, never repair).
 */
export const PartTaskDraft = z.object({
  stem: z
    .string()
    .trim()
    .min(TASK_STEM_MIN)
    .max(TASK_STEM_MAX)
    .describe('The material, stated once before a): every number and fact the parts need'),
  figure: MaterialFigure.nullable()
    .default(null)
    .describe(
      'The table, chart or function graph the material shows, as data (see Figures) — the app draws it above every part; null for a material in words',
    ),
  topic: ItemDraft.shape.topic,
  difficulty: ItemDraft.shape.difficulty,
  prompt_lang: ItemDraft.shape.prompt_lang,
  parts: z.array(PartDraft).min(TASK_PARTS_MIN).max(TASK_PARTS_MAX),
});
export type PartTaskDraft = z.infer<typeof PartTaskDraft>;

/**
 * How a computed part says it goes on from earlier ones: the same syntax for a task the generator
 * writes and one read from a photo (`materials/partTasks.ts`). A syntax, not a task.
 */
export const PART_FROM_RULE = `A numeric part that goes on with the result of earlier parts says how in "from": arithmetic over their letters only (a, b, c; numbers, + - * / ^, sqrt, parentheses) that gives exactly its own key from theirs`;

/** What an open part holds, wherever it is written (the generator, a photo reading). */
export const OPEN_PART_RULE = `An open part (kind long: begründe, erkläre, beschreibe, deute, beurteile) asks for her reasoning about the situation; its answer is its points in a few words, and "points" holds the ${TASK_OPEN_POINTS_MIN}–${TASK_OPEN_POINTS_MAX} key points a complete answer makes. None of them states what the situation or the question already says, and none hangs on an earlier part's result (no number she computed there): she may go on with her own.`;

/**
 * What the generator is told about tasks in parts. Principles, never an example task (models copy
 * examples — standing owner rule); the formula's form is a syntax, not a task.
 */
export const PART_TASK_RULES = `Tasks in parts ("part_tasks", grade 7 and up, any subject where one material carries several steps — a situation in maths or science, a reaction in chemistry, a source or a short text in history, German or English): one material (stem: every number and fact the parts need — a situation in a few sentences, or the text to work on, written for her level; never a quote invented for a real person; figure: the table of values, chart or function graph it shows, as data, else null; with a chart, every numeric part is a value read off it and says what it reads in "read", as a question about a chart does) and ${TASK_PARTS_MIN}–${TASK_PARTS_MAX} parts in the order a class test asks them, from finding a value to using it and judging it. Each part is a question of kind numeric, short, multiple_choice or — where the schema offers it — long, with its own key, written WITHOUT its letter (the app letters them a), b), c)). ${PART_FROM_RULE} — the app recomputes it, and a task whose formula does not give the key is dropped whole. ${OPEN_PART_RULE} Never a part that only repeats another, never more parts than the situation carries.`;

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
 * Why part `index` cannot stand as it is for its key points, or null when it can (Regel 0: the
 * whole task goes, never a repaired one). Exported for the unit test.
 *
 *   · an open part has `TASK_OPEN_POINTS_MIN`–`TASK_OPEN_POINTS_MAX` key points, held to the
 *     rules of every key point (`keyPointsProblem`) against everything she reads while she answers
 *     it: the situation and its question;
 *   · any other part has none — a point there would be checked by nothing;
 *   · no point of an open part hangs on an earlier part's RESULT: a computed part's value in its
 *     statement or an exact term, unless the situation or the question states that number too.
 *     Her wrong a) carried on consistently would otherwise make the point "missing" — the
 *     Folgefehler marked a second time.
 */
export function openPartProblem(draft: PartTaskDraft, index: number): string | null {
  const part = draft.parts[index];
  if (!part) return 'no part';
  if (part.kind !== 'long') return part.points.length > 0 ? 'key points on a closed part' : null;
  if (part.points.length < TASK_OPEN_POINTS_MIN) return 'too few key points';
  const shown = `${draft.stem}\n${part.prompt}`;
  const problem = keyPointsProblem(part.points, shown, null);
  if (problem !== null) return problem;
  const stated = valuesIn(shown);
  const results = draft.parts
    .slice(0, index)
    .flatMap((p) => (p.kind === 'numeric' ? [keyValue(p.answer)] : []))
    .filter((v): v is number => v !== null && !stated.some((s) => close(s, v)));
  const hangs = part.points.some((p) =>
    [p.point, ...p.exact].some((t) => valuesIn(t).some((v) => results.some((r) => close(r, v)))),
  );
  return hangs ? 'point hangs on an earlier result' : null;
}

/**
 * The help a photo reading writes beside each part, as it does beside every question it reads
 * (`materials/partTasks.ts`). A generated task has none here: its help comes in its own call
 * (`hints.ts`). An open part's help is always its follow-ups, whatever is given.
 */
export type PartHelp = Pick<ItemDraft, 'hints' | 'worked_solution'>;

/** The material a part carries besides its words: the drawing beside it, or none. */
type PartMaterial = Pick<PartTaskDraft, 'topic' | 'difficulty' | 'prompt_lang'> & {
  figure?: PartTaskDraft['figure'];
};

/** What one part says of itself: its form, its question, its key and its help. */
type PartFields = PartHelp &
  Pick<
    ItemDraft,
    | 'kind'
    | 'prompt'
    | 'answer'
    | 'accepted_answers'
    | 'unit'
    | 'choices'
    | 'correct_choice'
    | 'tolerance'
  > & { read?: ItemDraft['read'] };

/**
 * A part as an ordinary question: the task's topic, difficulty and language, the material's
 * drawing (Schnitt 4) and nothing else the model wrote beside it. The one shape both a part of a
 * task and a part read back as a question of its own take (`materials/partTasks.ts`).
 */
export function partQuestion(task: PartMaterial, part: PartFields): ItemDraft {
  return {
    kind: part.kind,
    prompt: part.prompt,
    answer: part.answer,
    accepted_answers: part.accepted_answers,
    unit: part.unit,
    choices: part.choices,
    correct_choice: part.correct_choice,
    tolerance: part.tolerance,
    topic: task.topic,
    difficulty: task.difficulty,
    prompt_lang: task.prompt_lang,
    lang: null,
    figure: task.figure ?? null,
    choice_figures: null,
    read: part.read ?? null,
    computes: null,
    spelling: null,
    source_excerpt: null,
    curriculum_point: null,
    hints: part.hints,
    worked_solution: part.worked_solution,
    rubric: null,
  };
}

/**
 * The questions of one task in parts, lettered, each carrying the task — or none.
 *
 * Every part goes through `usableItems` like any question; one that does not hold, a formula that
 * does not, or an open part whose key points do not, costs the whole task (a task is its parts in
 * order). An open part is then stored as an explanation question is (`keyPointFields`).
 */
export function partTaskItems(
  draft: PartTaskDraft,
  opts: { locale?: string; help?: readonly PartHelp[] } = {},
): StoredItem[] {
  const n = draft.parts.length;
  if (draft.parts.some((_, i) => openPartProblem(draft, i) !== null)) return [];
  const open = draft.parts.map((p) => (p.kind === 'long' ? keyPointFields(p.points) : null));
  const drafts = draft.parts.map((p, i) => {
    const o = open[i];
    return partQuestion(draft, {
      ...p,
      // An open part's key is its points, whatever the model wrote beside them.
      ...(o ? { answer: o.answer, accepted_answers: o.accepted_answers, unit: o.unit } : {}),
      hints: opts.help?.[i]?.hints ?? [],
      worked_solution: opts.help?.[i]?.worked_solution ?? null,
    });
  });
  const usable = usableItems(drafts, { locale: opts.locale });
  if (usable.length !== n) return [];
  // The material's drawing stands above every part, or the task is none: a part that lost it would
  // ask about a table she cannot see.
  if (draft.figure !== null && usable.some((it) => it.figure === null)) return [];
  for (let i = 0; i < n; i++) {
    const from = draft.parts[i]?.from ?? null;
    if (from === null) continue;
    if (usable[i]?.kind !== 'numeric' || !formulaHolds(from, i, usable)) return [];
  }
  const group = randomUUID();
  const letters = lettersOf(n);
  return usable.map((it, i) => ({
    ...it,
    // An open part is judged against its key points, on the path every key point takes (#236).
    ...(open[i] ?? { rubric: null }),
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
 *
 * Its letters are the parts of the task that are in THIS run, in letter order — never a letter of
 * a part that does not come: a Probearbeit leaves an open c) out (no long answer in a test), and a
 * review brings one part back alone. The bar says where she is in what she will see (rule 5).
 */
export function taskPartViews<R extends { id: string; task_part?: unknown }>(
  rows: readonly R[],
): Map<string, TaskPartView> {
  const parts = rows.flatMap((row) => {
    const p = taskPartOf(row.task_part);
    return p ? [{ id: row.id, ...p }] : [];
  });
  const inRun = new Map<string, Set<TaskPartLetter>>();
  for (const p of parts) inRun.set(p.group, (inRun.get(p.group) ?? new Set()).add(p.part));
  const views = new Map<string, TaskPartView>();
  const refs = new Map<string, string>();
  for (const p of parts) {
    const ref = refs.get(p.group) ?? `p${refs.size + 1}`;
    refs.set(p.group, ref);
    const letters = lettersOf(p.of).filter((l) => inRun.get(p.group)?.has(l));
    views.set(p.id, { ref, part: p.part, letters, stem: p.stem });
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
