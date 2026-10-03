// Structured items: questions whose answer is a SHAPE, not a sentence (issues #228–#230).
// docs/architecture.md §Practice ("Structured items").
//
// Three kinds share one foundation:
//   order       — put 3–8 elements into the right order (#228)
//   match       — pair or group elements (#229)
//   table_fill  — fill the gaps of a table (#230)
// The next one (#232, a text with several gaps) is a fourth member of every union below; the
// database already allows its kind (migration 0079), so it needs no constraint migration.
//
// Three shapes per kind, and the difference between them is the whole design:
//
//   * `StructuredTask`     — the stored definition INCLUDING the key (`items.task`, migration
//                            0079). It never leaves the server.
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
export const STRUCTURED_KINDS = ['order', 'match', 'table_fill'] as const;
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

// ─────────────── table_fill (#230) ───────────────

/** As big as a shown table (`TableFigure`): six columns fit a 360-pt phone, ten rows a card. */
export const TABLE_COLS_MAX = 6;
export const TABLE_ROWS_MAX = 10;
/** One cell is a number, a word form or a short term — never a sentence. */
export const TABLE_CELL_MAX = 40;
/** Other spellings a teacher accepts for one gap. */
export const TABLE_ALSO_MAX = 4;
/** What she may type into one gap: more than a key, less than a paragraph. */
export const TABLE_ANSWER_MAX = 60;
/** A number wall (Zahlenmauer): three to six rows of bricks, the widest at the bottom. */
export const WALL_ROWS_MIN = 3;
export const WALL_ROWS_MAX = 6;

/**
 * How a gap is typed in: `math` (a number or a term — the math keys come up) or `text` (a
 * word — the keyboard). Set by code from the key, never by the model.
 */
export const TableInput = z.enum(['math', 'text']);
export type TableInput = z.infer<typeof TableInput>;

/**
 * What code recomputes before a table is stored (#230, Regel 0). Declared by the model, so a
 * table it calls a value table IS checked as one; null means only the structure is checked.
 *   values — every value is the function `fn` at its x (`x_in` says where the x stand);
 *   wall   — a number wall: every brick is the sum of the two under it;
 *   totals — the last column and the last row are the sums of their row and column.
 */
export const TableFamily = z.enum(['values', 'wall', 'totals']);
export type TableFamily = z.infer<typeof TableFamily>;

/** Where a value table's x stand: in the header (one row of values) or in the first column. */
export const TableXIn = z.enum(['header', 'first_column']);
export type TableXIn = z.infer<typeof TableXIn>;

/** A cell she reads. May be empty (the corner of a two-way table). */
export const TableShownCell = z.object({ text: z.string().trim().max(TABLE_CELL_MAX) });
export type TableShownCell = z.infer<typeof TableShownCell>;

/** A gap: its server-given id, its key and the other accepted spellings. Server only. */
export const TableGapCell = z.object({
  id: PartId,
  key: z.string().trim().min(1).max(TABLE_CELL_MAX),
  also: z.array(z.string().trim().min(1).max(TABLE_CELL_MAX)).max(TABLE_ALSO_MAX),
  input: TableInput,
});
export type TableGapCell = z.infer<typeof TableGapCell>;

/** The gap first: a shown cell never has an id, so the union tells them apart. */
export const TableTaskCell = z.union([TableGapCell, TableShownCell]);
export type TableTaskCell = z.infer<typeof TableTaskCell>;

export const TableFillTask = z.object({
  type: z.literal('table_fill'),
  /** Column headings; null only for a number wall, whose bricks have none. */
  header: z.array(z.string().trim().max(TABLE_CELL_MAX)).min(1).max(TABLE_COLS_MAX).nullable(),
  /** Top to bottom. A grid row has one cell per heading; a wall's row r has r + 1 bricks. */
  rows: z.array(z.array(TableTaskCell).min(1).max(TABLE_COLS_MAX)).min(1).max(TABLE_ROWS_MAX),
  family: TableFamily.nullable(),
  /** The function of a value table, plain (2x+1, x^2-3); null for every other table. */
  fn: z.string().trim().min(1).max(120).nullable(),
  x_in: TableXIn.nullable(),
});
export type TableFillTask = z.infer<typeof TableFillTask>;

/** A gap as the app shows it: where it is and how it is typed in — never its key. */
export const TableViewGap = z.object({
  id: PartId,
  input: TableInput,
  /**
   * Every form of the gap's key is a whole number (code decides it from the key and its other
   * spellings; one fact about the key and no more — not its size, not its sign). The phone's
   * digits then write it, and the app shows no math keys over the table (#286 finding 5, #239).
   */
  whole: z.boolean().default(false),
});
export type TableViewGap = z.infer<typeof TableViewGap>;

export const TableViewCell = z.union([TableViewGap, TableShownCell]);
export type TableViewCell = z.infer<typeof TableViewCell>;

export const TableFillTaskView = z.object({
  type: z.literal('table_fill'),
  header: z.array(z.string().max(TABLE_CELL_MAX)).min(1).max(TABLE_COLS_MAX).nullable(),
  rows: z.array(z.array(TableViewCell).min(1).max(TABLE_COLS_MAX)).min(1).max(TABLE_ROWS_MAX),
  /** `wall`: the rows stand centred, brick on brick; `grid`: an ordinary table. */
  layout: z.enum(['grid', 'wall']),
});
export type TableFillTaskView = z.infer<typeof TableFillTaskView>;

export const TableFillAnswer = z.object({
  type: z.literal('table_fill'),
  /** Every gap once, with what she typed into it. */
  cells: z
    .array(z.object({ id: PartId, text: z.string().max(TABLE_ANSWER_MAX) }))
    .min(1)
    .max(TABLE_COLS_MAX * TABLE_ROWS_MAX),
});
export type TableFillAnswer = z.infer<typeof TableFillAnswer>;

// ─────────────── match (#229) ───────────────
//
// Two forms, one shape: she takes an element on the LEFT and puts it to one on the RIGHT.
//   pairs  — left 3–MATCH_PAIRS_MAX, right as many: every left has exactly one right, every
//            right one left.
//   groups — left MATCH_GROUPED_MIN–MATCH_GROUPED_MAX elements, right 2–MATCH_GROUPS_MAX groups:
//            every element belongs to exactly one group, every group gets at least one element.
//
// The maxima are not a guess at what a task needs but what a 360×740 phone holds without the
// parts scrolling (CLAUDE.md rule 16) — measured in the walkthrough with every text at its cap
// (tests/web/modes.spec.ts, "zuordnen at its largest"): the largest grouping before she has
// sorted anything, and the largest pairing after a check, with Buddy's reply above it. A task
// over them is rejected when it is written, never shrunk (`matchDraftProblem`).

export const MATCH_PAIRS_MIN = 3;
export const MATCH_PAIRS_MAX = 4;
export const MATCH_GROUPS_MIN = 2;
export const MATCH_GROUPS_MAX = 3;
export const MATCH_GROUPED_MIN = 4;
export const MATCH_GROUPED_MAX = 8;
/** A pair's side: a word or a short line (it wraps in its column, at word boundaries). */
export const MATCH_ELEMENT_MAX = 32;
/** A thing to sort or a group's name: two of them must share a row of a 360-pt phone. */
export const MATCH_GROUP_TEXT_MAX = 16;
/** The longest single word anywhere in a match: a word cannot wrap, so it must fit a column. */
export const MATCH_WORD_MAX = 16;
/** The instruction of a match: the question card above the parts may take at most two lines. */
export const MATCH_PROMPT_MAX = 44;

export const MatchForm = z.enum(['pairs', 'groups']);
export type MatchForm = z.infer<typeof MatchForm>;

export const MatchElement = z.object({
  id: PartId,
  /** Plain text, math between dollar signs like everywhere else. */
  text: z.string().trim().min(1).max(MATCH_ELEMENT_MAX),
});
export type MatchElement = z.infer<typeof MatchElement>;

/** One link: a left element and the right one (pair partner or group) it belongs to. */
export const MatchLink = z.object({ left: PartId, right: PartId });
export type MatchLink = z.infer<typeof MatchLink>;

export const MatchTask = z.object({
  type: z.literal('match'),
  form: MatchForm,
  /** What she takes first, in the order she sees it (shuffled once by the server). */
  left: z.array(MatchElement).min(MATCH_PAIRS_MIN).max(MATCH_GROUPED_MAX),
  /** Where it goes: the pair partners (shuffled) or the groups (in the model's order). */
  right: z.array(MatchElement).min(MATCH_GROUPS_MIN).max(MATCH_PAIRS_MAX),
  /** One link per left element. */
  key: z.array(MatchLink).min(MATCH_PAIRS_MIN).max(MATCH_GROUPED_MAX),
});
export type MatchTask = z.infer<typeof MatchTask>;

export const MatchTaskView = z.object({
  type: z.literal('match'),
  form: MatchForm,
  left: z.array(MatchElement).min(MATCH_PAIRS_MIN).max(MATCH_GROUPED_MAX),
  right: z.array(MatchElement).min(MATCH_GROUPS_MIN).max(MATCH_PAIRS_MAX),
});
export type MatchTaskView = z.infer<typeof MatchTaskView>;

export const MatchAnswer = z.object({
  type: z.literal('match'),
  /** Every left element once, each with the right one she put it to. */
  links: z.array(MatchLink).min(MATCH_PAIRS_MIN).max(MATCH_GROUPED_MAX),
});
export type MatchAnswer = z.infer<typeof MatchAnswer>;

// ─────────────── the unions (one member per kind that exists) ───────────────

/** The stored definition including the key (`items.task`). Server only. */
export const StructuredTask = z.discriminatedUnion('type', [OrderTask, TableFillTask, MatchTask]);
export type StructuredTask = z.infer<typeof StructuredTask>;

/** What the app shows (`ItemView.task_view`): the task without its key. */
export const StructuredTaskView = z.discriminatedUnion('type', [
  OrderTaskView,
  TableFillTaskView,
  MatchTaskView,
]);
export type StructuredTaskView = z.infer<typeof StructuredTaskView>;

/** What she sends (`AnswerRequest.parts`). */
export const StructuredAnswer = z.discriminatedUnion('type', [
  OrderAnswer,
  TableFillAnswer,
  MatchAnswer,
]);
export type StructuredAnswer = z.infer<typeof StructuredAnswer>;
