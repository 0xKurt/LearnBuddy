// Structured items: questions whose answer is a SHAPE — an order, pairs, table cells, gaps
// (issues #228–#232). docs/architecture.md §Practice ("Structured items").
//
// Both directions of #224's "Regel 0" live here, and both are code:
//
//   1. What the MODEL wrote is checked before it is stored. A task that fails a check gives
//      no question at all — nothing is repaired (as in `keyCheck.ts` and #162). For `order`:
//      3–8 elements, no two the same after normalising, a key that is a permutation of the
//      elements, and a numeric sequence whose key really is sorted the way it says.
//   2. What SHE answers is compared with the key exactly. The verdict is never a model's,
//      and the reply names the place: "Bis Schritt 3 stimmt's".
//
// The model writes the elements (in the right order); code names them (ids), shuffles them
// for display and records the key as a sequence of ids (CLAUDE.md rule 2). The stored task
// (`items.task`) carries the key; the view (`ItemView.task_view`) never does.
//
// Adding a kind (#229 match, #230 table_fill, #232 cloze): its draft schema, a builder from
// draft to task, a `problem` check, a view, a checker and a reply — each one more `case` in
// the switches below. The answer flow in `service.ts` only ever calls the exported functions.

import {
  OrderNumeric,
  ORDER_ELEMENT_MAX,
  ORDER_MAX,
  ORDER_MIN,
  StructuredTask,
  type OrderAnswer,
  type OrderTask,
  type PartId,
  type StructuredAnswer,
  type StructuredKind,
  type StructuredTaskView,
} from '@learnbuddy/shared-types/contracts';
import { parseNumericInput, plainMath } from '@learnbuddy/shared-math';
import { z } from 'zod';

import { t } from '../../i18n/index.js';
import { dollarMathRuns } from './dollarMath.js';
import { ItemDraft } from './items.js';
import {
  checkTable,
  tableAnswerText,
  TableDraftBase,
  tableKeys,
  tableProblem,
  tableReply,
  tableShownText,
  tableSolution,
  tableTaskFrom,
  tableView,
  type CellContext,
  type TableCheck,
  type TableProblem,
} from './table.js';
import { mentionsSolution } from './tutor.js';

/** At most this many structured questions in one prepared set (a set is not a puzzle book). */
export const MAX_STRUCTURED_ITEMS = 4;

/** How the elements of an order stand next to each other when they are read as one text. */
export const ORDER_JOIN = ' → ';

// ─────────────── what the model may write ───────────────

/**
 * What the generator and the photo reading are told about order items. Exact and minimal,
 * and deliberately without an example sentence: models copy examples (repo convention).
 */
export const ORDER_RULES = `Order tasks ("structured", type "order"): only when the learner has to put given elements into one correct order — steps of a process, events in time, numbers by size. ${ORDER_MIN}–${ORDER_MAX} elements, each a short line, no two alike; write them in the CORRECT order, the app shuffles them. prompt: the instruction, saying by what to order; it never lists the elements. numeric: when every element is a number, "ascending" or "descending" (the direction of your order); null otherwise. Only an order with exactly one right answer; if two orders could be right, write no order task.`;

/** The model's order task: the elements in the right order, nothing else about the key. */
const OrderDraftBase = z.object({
  type: z.literal('order'),
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(600)
    .describe('The instruction: what to put in order and by what; never the elements themselves'),
  elements: z
    .array(z.string().trim().min(1).max(ORDER_ELEMENT_MAX))
    .max(ORDER_MAX * 2)
    .describe(`${ORDER_MIN}–${ORDER_MAX} elements, written in the CORRECT order`),
  numeric: OrderNumeric.nullable()
    .default(null)
    .describe('Only when every element is a number: the direction of the correct order; else null'),
  topic: ItemDraft.shape.topic,
  difficulty: ItemDraft.shape.difficulty,
  prompt_lang: ItemDraft.shape.prompt_lang,
});

const OrderDraftWithHelp = OrderDraftBase.extend({
  hints: ItemDraft.shape.hints,
  worked_solution: ItemDraft.shape.worked_solution,
});

/** A structured task as the model writes it, with prepared help (photo reading). */
export const StructuredDraft = z.discriminatedUnion('type', [
  OrderDraftWithHelp,
  TableDraftBase.extend({
    hints: ItemDraft.shape.hints,
    worked_solution: ItemDraft.shape.worked_solution,
  }),
]);
export type StructuredDraft = z.infer<typeof StructuredDraft>;

/** Homework: hints, but no worked solution (she never sees one there; fewer tokens). */
export const StructuredDraftHomework = z.discriminatedUnion('type', [
  OrderDraftBase.extend({ hints: ItemDraft.shape.hints }),
  TableDraftBase.extend({ hints: ItemDraft.shape.hints }),
]);
export type StructuredDraftHomework = z.infer<typeof StructuredDraftHomework>;

/** The same without hints and worked solution (a topic: help is written in the background). */
export const StructuredDraftNoHelp = z.discriminatedUnion('type', [OrderDraftBase, TableDraftBase]);
export type StructuredDraftNoHelp = z.infer<typeof StructuredDraftNoHelp>;

/**
 * A question whose answer key is `task`: every other field is either the model's wording
 * (prompt, topic, hints) or computed from the task (answer). `insertItems` stores both.
 */
export type StructuredItem = Omit<ItemDraft, 'kind'> & {
  kind: StructuredKind;
  task: StructuredTask;
};

// ─────────────── Regel 0: what the model wrote, checked ───────────────

/** Why a task is not stored. Each one is a test (`__tests__/structured.test.ts`). */
export type TaskProblem =
  /** Fewer than ORDER_MIN or more than ORDER_MAX elements. */
  | 'count'
  /** Two elements that read the same once case, spacing and math markup are set aside. */
  | 'duplicate'
  /** The key names an element twice, misses one, or names one that is not there. */
  | 'not_permutation'
  /** `numeric` is stated, but an element is no number (or the units differ). */
  | 'not_numbers'
  /** Every element is a number, but no direction was stated: the order is a guess. */
  | 'numbers_without_direction'
  /** A numeric sequence whose key is not sorted the way `numeric` says. */
  | 'numeric_unsorted'
  /** table_fill (#230): see `table.ts`. */
  | TableProblem;

/** An element as it is compared for sameness: markup, case and surrounding marks set aside. */
function sameness(text: string): string {
  return plainMath(text)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:!?"'„“”‚‘’«»]+|[\s.,;:!?"'„“”‚‘’«»]+$/g, '')
    .trim();
}

type Exact = { num: bigint; den: bigint };

/** An element as a number with its unit, or null when it is not one written number. */
function numberOf(text: string): { exact: Exact; unit: string | null } | null {
  const n = parseNumericInput(text);
  if (n.exact === null || n.form === null || n.form === 'expression' || n.has_residue) return null;
  return { exact: n.exact, unit: n.unit };
}

/** a < b, exactly (denominators are positive). */
function less(a: Exact, b: Exact): boolean {
  return a.num * b.den < b.num * a.den;
}

/** What is wrong with an order task, or null when it holds together. */
export function orderProblem(task: OrderTask): TaskProblem | null {
  const n = task.elements.length;
  if (n < ORDER_MIN || n > ORDER_MAX) return 'count';
  const seen = new Set<string>();
  for (const e of task.elements) {
    const s = sameness(e.text);
    if (s === '' || seen.has(s)) return 'duplicate';
    seen.add(s);
  }
  const ids = new Set(task.elements.map((e) => e.id));
  if (ids.size !== n) return 'not_permutation';
  if (task.key.length !== n || new Set(task.key).size !== n) return 'not_permutation';
  if (!task.key.every((id) => ids.has(id))) return 'not_permutation';

  const byId = new Map(task.elements.map((e) => [e.id, e.text]));
  const numbers = task.key.map((id) => numberOf(byId.get(id) ?? ''));
  const allNumbers = numbers.every((x) => x !== null);
  if (task.numeric === null) return allNumbers ? 'numbers_without_direction' : null;
  if (!allNumbers) return 'not_numbers';
  const units = new Set(numbers.map((x) => x?.unit ?? null));
  if (units.size > 1) return 'not_numbers';
  for (let i = 1; i < n; i++) {
    const prev = numbers[i - 1]!.exact;
    const next = numbers[i]!.exact;
    // Strictly: two equal values have no order between them, so the key would be a guess.
    const inOrder = task.numeric === 'ascending' ? less(prev, next) : less(next, prev);
    if (!inOrder) return 'numeric_unsorted';
  }
  return null;
}

/** What is wrong with a stored or built task, or null. One `case` per kind. */
export function taskProblem(task: StructuredTask): TaskProblem | null {
  switch (task.type) {
    case 'order':
      return orderProblem(task);
    case 'table_fill':
      return tableProblem(task);
  }
}

// ─────────────── from the model's draft to a stored task ───────────────

/** A small deterministic generator, so the same elements always shuffle the same way. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Display positions for `n` elements: a shuffle that is neither the right order nor its
 * reverse (both would give the task away). Deterministic per content, so a test, a replay
 * and a second reading of the same sheet see the same card.
 */
function displayOrder(n: number, seedText: string): number[] {
  const base = hash(seedText);
  for (let attempt = 0; attempt < 32; attempt++) {
    const random = seeded(base + attempt);
    const idx = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [idx[i], idx[j]] = [idx[j]!, idx[i]!];
    }
    const identity = idx.every((v, i) => v === i);
    const reversed = idx.every((v, i) => v === n - 1 - i);
    if (!identity && !reversed) return idx;
  }
  // Unreachable for n ≥ 3 (a rotation is neither); kept so the result is always defined.
  return Array.from({ length: n }, (_, i) => (i + 1) % n);
}

/** Ids by display position: a, b, c … — they say where an element STANDS, not where it belongs. */
function idAt(position: number): PartId {
  return String.fromCharCode(97 + position);
}

/**
 * The stored task for elements written in the right order, or null when Regel 0 rejects it.
 * Exported for the tests, which also build tasks by hand to reach every rejection.
 */
export function orderTaskFrom(
  correct: readonly string[],
  numeric: OrderTask['numeric'],
): OrderTask | null {
  const texts = correct.map((e) => dollarMathRuns(e.trim()));
  if (texts.length < ORDER_MIN || texts.length > ORDER_MAX) return null;
  const shown = displayOrder(texts.length, texts.join('\u0000'));
  // shown[p] = the index (in the right order) of the element at display position p.
  const elements = shown.map((ci, p) => ({ id: idAt(p), text: texts[ci]! }));
  const key = texts.map((_, ci) => idAt(shown.indexOf(ci)));
  const task: OrderTask = { type: 'order', elements, key, numeric };
  const parsed = StructuredTask.safeParse(task);
  if (!parsed.success || parsed.data.type !== 'order') return null;
  return taskProblem(parsed.data) === null ? parsed.data : null;
}

/** The solution as she reads it: the elements in the right order. */
export function solutionOf(task: StructuredTask): string {
  switch (task.type) {
    case 'order': {
      const byId = new Map(task.elements.map((e) => [e.id, e.text]));
      return task.key.map((id) => byId.get(id) ?? '').join(ORDER_JOIN);
    }
    case 'table_fill':
      return tableSolution(task);
  }
}

/** A draft from the model as a question, or null when it fails Regel 0. */
export function structuredItem(
  draft: StructuredDraft | StructuredDraftHomework | StructuredDraftNoHelp,
): StructuredItem | null {
  switch (draft.type) {
    case 'order': {
      const task = orderTaskFrom(draft.elements, draft.numeric);
      if (!task) return null;
      const prompt = dollarMathRuns(draft.prompt);
      const answer = solutionOf(task);
      // Help never gives the whole order away (the same check as every prepared hint).
      const hints = ('hints' in draft ? draft.hints : []).filter(
        (h) => !mentionsSolution(h, answer, prompt),
      );
      return {
        kind: 'order',
        task,
        prompt,
        answer,
        accepted_answers: [],
        unit: null,
        choices: null,
        correct_choice: null,
        topic: draft.topic,
        difficulty: draft.difficulty,
        prompt_lang: draft.prompt_lang,
        lang: null,
        figure: null,
        tolerance: null,
        spelling: null,
        source_excerpt: null,
        hints,
        worked_solution: 'worked_solution' in draft ? draft.worked_solution : null,
      };
    }
    case 'table_fill': {
      const task = tableTaskFrom(draft);
      if (!task) return null;
      const prompt = dollarMathRuns(draft.prompt);
      // Help never gives a cell away: no hint may state a key that the table does not show
      // already (the same check as every prepared hint, per cell).
      const visible = `${prompt} ${tableShownText(task)}`;
      const keys = tableKeys(task);
      const hints = ('hints' in draft ? draft.hints : []).filter(
        (h) => !keys.some((k) => mentionsSolution(h, k, visible)),
      );
      return {
        kind: 'table_fill',
        task,
        prompt,
        answer: solutionOf(task),
        accepted_answers: [],
        unit: null,
        choices: null,
        correct_choice: null,
        topic: draft.topic,
        difficulty: draft.difficulty,
        prompt_lang: draft.prompt_lang,
        lang: null,
        figure: null,
        tolerance: null,
        spelling: null,
        source_excerpt: null,
        hints,
        worked_solution: 'worked_solution' in draft ? draft.worked_solution : null,
      };
    }
  }
}

/** The drafts of one model answer as questions; one that fails costs only itself. */
export function structuredItems(
  drafts: ReadonlyArray<StructuredDraft | StructuredDraftHomework | StructuredDraftNoHelp>,
  allowed: ReadonlySet<string>,
  max: number = MAX_STRUCTURED_ITEMS,
): StructuredItem[] {
  return drafts
    .filter((d) => allowed.has(d.type))
    .flatMap((d) => {
      const item = structuredItem(d);
      return item ? [item] : [];
    })
    .slice(0, max);
}

// ─────────────── the stored task, read back ───────────────

/**
 * The task a stored row carries, or null — a column that does not parse, does not match its
 * kind or no longer passes Regel 0 is no task (never trusted as it stands, never guessed at).
 */
export function structuredTaskOf(stored: unknown, kind: string): StructuredTask | null {
  if (stored === null || stored === undefined) return null;
  const parsed = StructuredTask.safeParse(stored);
  if (!parsed.success || parsed.data.type !== kind) return null;
  return taskProblem(parsed.data) === null ? parsed.data : null;
}

/** What the app shows: the task without its key. One `case` per kind. */
export function viewOf(task: StructuredTask): StructuredTaskView {
  switch (task.type) {
    case 'order':
      return { type: 'order', elements: task.elements };
    case 'table_fill':
      return tableView(task);
  }
}

// ─────────────── Regel 0: her answer, checked ───────────────

/** One part of her answer: an element at its place, a pair, a cell, a gap. */
export type PartResult = { id: PartId; ok: boolean };

/**
 * The verdict on a structured answer, with what is right part by part. Kinds add their own
 * detail beside `parts` (order: the first place that is wrong, 1-based).
 */
export type StructuredCheck =
  | {
      type: 'order';
      correct: boolean;
      /** In her order: each element she placed, and whether it is at its right place. */
      parts: PartResult[];
      first_wrong: number | null;
    }
  /** table_fill (#230): every gap, how many are right, and which are not yet. */
  | TableCheck;

function checkOrder(task: OrderTask, answer: OrderAnswer): StructuredCheck | null {
  const ids = new Set(task.elements.map((e) => e.id));
  const given = answer.order;
  // Every element exactly once: anything else is not an answer to this task (400).
  if (given.length !== ids.size || new Set(given).size !== given.length) return null;
  if (!given.every((id) => ids.has(id))) return null;
  const parts = given.map((id, i) => ({ id, ok: task.key[i] === id }));
  const wrong = parts.findIndex((p) => !p.ok);
  return {
    type: 'order',
    correct: wrong === -1,
    parts,
    first_wrong: wrong === -1 ? null : wrong + 1,
  };
}

/**
 * Her answer against the key, or null when the answer does not fit the task at all (another
 * kind, an element missing or twice, an id that is not there) — the caller refuses that as
 * invalid input rather than grading it.
 */
export function checkStructured(
  task: StructuredTask,
  answer: StructuredAnswer,
  /** What the subject says about spelling (decision D-2), for kinds with written parts. */
  ctx: CellContext = { spelling: null, subject_kind: null },
): StructuredCheck | null {
  switch (task.type) {
    case 'order':
      return answer.type === 'order' ? checkOrder(task, answer) : null;
    case 'table_fill':
      return answer.type === 'table_fill' ? checkTable(task, answer, ctx) : null;
  }
}

/** Her answer as it stands in the conversation ("B → A → C"). */
export function answerTextOf(task: StructuredTask, answer: StructuredAnswer): string {
  switch (task.type) {
    case 'order': {
      if (answer.type !== 'order') return '';
      const byId = new Map(task.elements.map((e) => [e.id, e.text]));
      return answer.order.map((id) => byId.get(id) ?? '').join(ORDER_JOIN);
    }
    case 'table_fill':
      return answer.type === 'table_fill' ? tableAnswerText(task, answer) : '';
  }
}

/**
 * The reply to a wrong structured answer: where it stops being right, kindly. The right
 * one is answered like every right answer (`practice.correct`).
 */
export function structuredReply(locale: string, check: StructuredCheck): string {
  switch (check.type) {
    case 'order': {
      const at = check.first_wrong ?? 1;
      return at <= 1
        ? t(locale, 'practice.order.first_wrong')
        : t(locale, 'practice.order.right_until', { right: at - 1, from: at });
    }
    case 'table_fill':
      return tableReply(locale, check);
  }
}
