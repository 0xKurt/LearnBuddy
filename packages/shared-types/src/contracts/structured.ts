// Structured items: questions whose answer is a SHAPE, not a sentence (issues #228–#232).
// docs/architecture.md §Practice ("Structured items").
//
// Four kinds share one foundation:
//   order       — put 3–8 elements into the right order (#228)
//   match       — pair or group elements (#229)
//   table_fill  — fill the gaps of a table (#230)
//   cloze       — fill several gaps in one text (#232)
//
// Three shapes per kind, and the difference between them is the whole design:
//
//   * `StructuredTask`     — the stored definition INCLUDING the key (`items.task`, migration
//                            0069). It never leaves the server.
//   * `StructuredTaskView` — what the app shows (`ItemView.task_view`): the same task WITHOUT
//                            the key. For `order` that is the elements in a shuffled order
//                            with ids that say nothing about the right one.
//   * `StructuredAnswer`   — what she sends (`AnswerRequest.parts`): the parts she arranged,
//                            by id. Code compares them with the key exactly
//                            (`apps/api/src/modules/practice/structured.ts`) — a verdict here
//                            is never a model's (#224, "Regel 0").
//
// The ids are the server's, never the model's (CLAUDE.md rule 2): the model writes the
// elements, code names them.
//
// Adding a kind: add its task, view and answer object below, append each to the matching
// union, and give it a checker in `practice/structured.ts`. The unions are discriminated by
// `type`, which is always the item's kind.

import { z } from 'zod';

/** The item kinds whose answer is structured. Each has a task, a view and an answer shape. */
export const STRUCTURED_KINDS = ['order', 'match', 'table_fill', 'cloze'] as const;
export const StructuredKind = z.enum(STRUCTURED_KINDS);
export type StructuredKind = z.infer<typeof StructuredKind>;

/** Is this item kind answered with `parts` instead of text? */
export function isStructuredKind(kind: string): kind is StructuredKind {
  return (STRUCTURED_KINDS as readonly string[]).includes(kind);
}

/**
 * A part's id: short, lower-case, given by the server. It names a part of the task (an
 * element, a cell, a gap), never its place in the solution.
 */
export const PartId = z.string().regex(/^[a-z0-9_]{1,12}$/);
export type PartId = z.infer<typeof PartId>;

// ─────────────── order (#228) ───────────────

/** Fewer than three is no order to find; more than eight no longer fits a phone (rule 16). */
export const ORDER_MIN = 3;
export const ORDER_MAX = 8;
/** One element is a step, an event or a number — a line, never a paragraph. */
export const ORDER_ELEMENT_MAX = 120;

export const OrderElement = z.object({
  id: PartId,
  /** Plain text, math between dollar signs ($\frac{1}{2}$) like everywhere else. */
  text: z.string().trim().min(1).max(ORDER_ELEMENT_MAX),
});
export type OrderElement = z.infer<typeof OrderElement>;

/**
 * Which way a sequence of numbers runs. Stated, never guessed: when every element is a
 * number, code checks that the key IS the numerically sorted order (#228, Regel 0).
 */
export const OrderNumeric = z.enum(['ascending', 'descending']);
export type OrderNumeric = z.infer<typeof OrderNumeric>;

export const OrderTask = z.object({
  type: z.literal('order'),
  /** In the order she sees them: shuffled once by the server and stored that way. */
  elements: z.array(OrderElement).min(ORDER_MIN).max(ORDER_MAX),
  /** The element ids in the right order: a permutation of `elements`. */
  key: z.array(PartId).min(ORDER_MIN).max(ORDER_MAX),
  /** Set for a sequence of numbers: the direction the key must be sorted in. */
  numeric: OrderNumeric.nullable(),
});
export type OrderTask = z.infer<typeof OrderTask>;

export const OrderTaskView = z.object({
  type: z.literal('order'),
  /** The elements in the order she first sees them. Never the key, never the direction. */
  elements: z.array(OrderElement).min(ORDER_MIN).max(ORDER_MAX),
});
export type OrderTaskView = z.infer<typeof OrderTaskView>;

export const OrderAnswer = z.object({
  type: z.literal('order'),
  /** Every element id once, in the order she put them. */
  order: z.array(PartId).min(ORDER_MIN).max(ORDER_MAX),
});
export type OrderAnswer = z.infer<typeof OrderAnswer>;

// ─────────────── the unions (one member per kind that exists) ───────────────

/** The stored definition including the key (`items.task`). Server only. */
export const StructuredTask = z.discriminatedUnion('type', [OrderTask]);
export type StructuredTask = z.infer<typeof StructuredTask>;

/** What the app shows (`ItemView.task_view`): the task without its key. */
export const StructuredTaskView = z.discriminatedUnion('type', [OrderTaskView]);
export type StructuredTaskView = z.infer<typeof StructuredTaskView>;

/** What she sends (`AnswerRequest.parts`). */
export const StructuredAnswer = z.discriminatedUnion('type', [OrderAnswer]);
export type StructuredAnswer = z.infer<typeof StructuredAnswer>;
