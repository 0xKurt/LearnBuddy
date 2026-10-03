// Kopfrechnen-Schnellrunde (issue #243): tasks written by CODE, no model, a digit pad.
//
// Buddy only CHOOSES — one range from a closed list, and for the times tables which rows.
// Everything else is computed on the server (`apps/api/src/modules/practice/drill.ts`): the
// tasks, their keys, the order (weighted by FSRS, so the weak facts come more often), the
// check of her answer and the line at the end. No field here can carry a task text, a key or
// a verdict, so a round can never contain a task whose key disagrees with its own numbers —
// #224 "Regel 0" in its strongest form: there is no second author to check.
//
// What the ranges already make inexpressible, so nothing has to be validated away: a negative
// result, a division with a remainder, a fraction that is not in lowest terms, a percentage
// with a fractional result. Carry is only sayable for the ranges where it means something
// (the refinements below, enforced again by the tool that offers a round).

import { z } from 'zod';

import { Uuid } from './common.js';

/**
 * The closed list Buddy picks from. Each value is a whole family of tasks:
 *  - `plus_10`  — a + b ≤ 10
 *  - `plus_20` / `minus_20`   — within 20, with or without crossing ten (`carry`)
 *  - `plus_100` / `minus_100` — within 100, at least one two-digit number, with or without carry
 *  - `times`    — the small times tables, rows 1–10 (`rows`: which ones; none = all)
 *  - `divide`   — the same tables backwards, always without a remainder
 *  - `fractions` — two fractions of one family (halves/quarters/eighths, thirds/sixths,
 *                  fifths/tenths) added, the sum at most 1 ("½ + ¼")
 *  - `percent`  — 10, 20, 25, 50 or 75 % of a multiple of 20 up to 200, a whole result
 */
export const DRILL_RANGES = [
  'plus_10',
  'plus_20',
  'minus_20',
  'plus_100',
  'minus_100',
  'times',
  'divide',
  'fractions',
  'percent',
] as const;
export const DrillRange = z.enum(DRILL_RANGES);
export type DrillRange = z.infer<typeof DrillRange>;

/** The ranges where crossing the ten ("mit Übergang") is a property of a task. */
export const CARRY_RANGES: readonly DrillRange[] = ['plus_20', 'minus_20', 'plus_100', 'minus_100'];
/** The ranges that are built from times-table rows. */
export const ROW_RANGES: readonly DrillRange[] = ['times', 'divide'];

/** with: every task crosses the ten · without: none does · null: both, mixed. */
export const DrillCarry = z.enum(['with', 'without']);
export type DrillCarry = z.infer<typeof DrillCarry>;

/** A times-table row: 1–10 (das kleine Einmaleins). */
export const DrillRow = z.number().int().min(1).max(10);

/**
 * What a round is about — and all that Buddy may say about it. `rows` only for `times` and
 * `divide` (null = every row), `carry` only for the four plus/minus ranges above ten.
 */
export const DrillSpec = z
  .object({
    range: DrillRange,
    rows: z.array(DrillRow).min(1).max(10).nullable().default(null),
    carry: DrillCarry.nullable().default(null),
  })
  .refine((s) => s.rows === null || ROW_RANGES.includes(s.range), {
    message: 'rows only for times or divide',
    path: ['rows'],
  })
  .refine((s) => s.carry === null || CARRY_RANGES.includes(s.range), {
    message: 'carry only for plus/minus within 20 or 100',
    path: ['carry'],
  })
  .refine((s) => s.rows === null || new Set(s.rows).size === s.rows.length, {
    message: 'each row once',
    path: ['rows'],
  });
export type DrillSpec = z.infer<typeof DrillSpec>;

/** How many tasks one round has, at most (fewer only when the range holds fewer facts). */
export const DRILL_ROUND = 20;

/**
 * What the line at the end of a round is about. A times or division row is named by its
 * number ("die 7er"); every other range by the round's own title, which the server wrote.
 */
export const DrillGroup = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('times'), n: DrillRow }),
  z.object({ kind: z.literal('divide'), n: DrillRow }),
  z.object({ kind: z.literal('range') }),
]);
export type DrillGroup = z.infer<typeof DrillGroup>;

/**
 * The one line at the end — never a count of wrong answers (CLAUDE.md rule 6), and never a
 * claim nobody measured (rule 5):
 *  - `better` — tasks of this group she had missed before are right now (the review's own
 *    `state_before` says so; nothing is guessed),
 *  - `solid`  — every task of this group in this round was right,
 *  - `again`  — this group is the one to come back to; said as a plan, not as a verdict.
 */
export const DrillLine = z.object({
  line: z.enum(['better', 'solid', 'again']),
  group: DrillGroup,
});
export type DrillLine = z.infer<typeof DrillLine>;

/** The task she just answered, as the card shows it under the next one. */
export const DrillLast = z.object({
  item_id: Uuid,
  /** The task and its key, in the same notation as `ItemView.prompt` (math between `$`). */
  prompt: z.string(),
  answer: z.string(),
  /** What she typed. */
  given: z.string(),
  correct: z.boolean(),
});
export type DrillLast = z.infer<typeof DrillLast>;

/**
 * `SessionView.drill`: set for a quick round, null for every other session. The tasks
 * themselves are the session's ordinary `items` (the open ones without their key); this is
 * what only a round has.
 */
export const DrillView = z.object({
  spec: DrillSpec,
  /** `fraction` puts a "/" on the pad; every other range is answered with whole numbers. */
  input: z.enum(['whole', 'fraction']),
  last: DrillLast.nullable(),
  /** Once the round is finished; null while it runs. */
  summary: DrillLine.nullable(),
});
export type DrillView = z.infer<typeof DrillView>;

/** POST /practice/drills — start a round. Idempotent per `client_request_id`. */
export const StartDrillRequest = z.object({
  client_request_id: Uuid,
  spec: DrillSpec,
});
export type StartDrillRequest = z.infer<typeof StartDrillRequest>;

/**
 * POST /practice/sessions/:id/drill — one answer of a round, checked by code at once. One try
 * per task: right or not, the task closes and the next one is there. Idempotent per
 * `client_turn_id`.
 */
export const DrillAnswerRequest = z.object({
  client_turn_id: Uuid,
  item_id: Uuid,
  /** Digits, and for a fraction one "/": what the pad can type. */
  text: z
    .string()
    .trim()
    .min(1)
    .max(12)
    .regex(/^[0-9]+(?:[/,.][0-9]+)?$/),
});
export type DrillAnswerRequest = z.infer<typeof DrillAnswerRequest>;
