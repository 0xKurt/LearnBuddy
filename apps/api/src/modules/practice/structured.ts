// Structured items: questions whose answer is a SHAPE — an order, pairs, table cells, gaps
// (issues #228–#230). docs/architecture.md §Practice ("Structured items").
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
  MATCH_ELEMENT_MAX,
  MATCH_GROUP_TEXT_MAX,
  MATCH_GROUPED_MAX,
  MATCH_GROUPED_MIN,
  MATCH_GROUPS_MAX,
  MATCH_GROUPS_MIN,
  MATCH_PAIRS_MAX,
  MATCH_PAIRS_MIN,
  MATCH_PROMPT_MAX,
  MATCH_WORD_MAX,
  type MatchAnswer,
  type MatchElement,
  type MatchForm,
  type MatchLink,
  type MatchTask,
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
import {
  checkMark,
  markAnswerText,
  MarkDraftBase,
  markProblem,
  markReply,
  markSolution,
  markTaskFrom,
  markView,
  type MarkCheck,
  type MarkProblem,
} from './mark.js';
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

// ─── match (#229): the model's draft ───

/**
 * What the generator and the photo reading are told about match items — exact, minimal and
 * without an example sentence, like ORDER_RULES.
 */
export const MATCH_RULES = `Match tasks ("structured", type "match"): only when the learner has to link given things — each thing to its one partner (pairs) or each thing to its one category (groups). Fill exactly one of pairs and groups, the other null. pairs: ${MATCH_PAIRS_MIN}–${MATCH_PAIRS_MAX} correct pairs {left, right}; every left has exactly one right and every right exactly one left. groups: ${MATCH_GROUPS_MIN}–${MATCH_GROUPS_MAX} groups {name, elements}, ${MATCH_GROUPED_MIN}–${MATCH_GROUPED_MAX} elements in all, every element in exactly one group, no group empty. A pair's side has at most ${MATCH_ELEMENT_MAX} characters, a thing to sort and a group's name at most ${MATCH_GROUP_TEXT_MAX}, and no single word more than ${MATCH_WORD_MAX}; no two of them are alike. The prompt has at most ${MATCH_PROMPT_MAX} characters. Write only the correct links; the app shuffles them. prompt: the instruction, saying what goes with what; it never lists the elements. If anything could belong to two places, write no match task.`;

/**
 * Parsed generously on purpose: a text over the caps is not a broken draft but one that does not
 * fit the phone, and `matchDraftProblem` says so by name (`too_long`) instead of the parse
 * silently dropping it.
 */
const MatchText = z.string().trim().min(1).max(80);

/** The model's match task: the correct links, nothing else — code builds key and display. */
const MatchDraftBase = z.object({
  type: z.literal('match'),
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(600)
    .describe('The instruction: what to link with what; never the elements themselves'),
  pairs: z
    .array(z.object({ left: MatchText, right: MatchText }))
    .max(MATCH_PAIRS_MAX * 2)
    .nullable()
    .default(null)
    .describe(
      `${MATCH_PAIRS_MIN}–${MATCH_PAIRS_MAX} correct pairs; null when the task sorts into groups`,
    ),
  groups: z
    .array(
      z.object({
        name: MatchText,
        elements: z.array(MatchText).max(MATCH_GROUPED_MAX * 2),
      }),
    )
    .max(MATCH_GROUPS_MAX * 2)
    .nullable()
    .default(null)
    .describe(
      `${MATCH_GROUPS_MIN}–${MATCH_GROUPS_MAX} groups with their elements (${MATCH_GROUPED_MIN}–${MATCH_GROUPED_MAX} in all); null when the task pairs`,
    ),
  topic: ItemDraft.shape.topic,
  difficulty: ItemDraft.shape.difficulty,
  prompt_lang: ItemDraft.shape.prompt_lang,
});
export type MatchDraft = Pick<z.infer<typeof MatchDraftBase>, 'pairs' | 'groups'> & {
  /** Checked when given: the instruction that stands above the parts. */
  prompt?: string;
};

const MatchDraftWithHelp = MatchDraftBase.extend({
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
  MatchDraftWithHelp,
  MarkDraftBase.extend({
    hints: ItemDraft.shape.hints,
    worked_solution: ItemDraft.shape.worked_solution,
  }),
]);
export type StructuredDraft = z.infer<typeof StructuredDraft>;

/** Homework: hints, but no worked solution (she never sees one there; fewer tokens). */
export const StructuredDraftHomework = z.discriminatedUnion('type', [
  OrderDraftBase.extend({ hints: ItemDraft.shape.hints }),
  TableDraftBase.extend({ hints: ItemDraft.shape.hints }),
  MatchDraftBase.extend({ hints: ItemDraft.shape.hints }),
  MarkDraftBase.extend({ hints: ItemDraft.shape.hints }),
]);
export type StructuredDraftHomework = z.infer<typeof StructuredDraftHomework>;

/** The same without hints and worked solution (a topic: help is written in the background). */
export const StructuredDraftNoHelp = z.discriminatedUnion('type', [
  OrderDraftBase,
  TableDraftBase,
  MatchDraftBase,
  MarkDraftBase,
]);
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
  | TableProblem
  // match (#229):
  /** Neither pairs nor groups, or both: which task is meant is a guess. */
  | 'form'
  /** One element linked to two places (a left with two rights, a thing in two groups). */
  | 'ambiguous'
  /** A group nothing belongs to. */
  | 'empty_group'
  /** The key misses a left element, names one twice or names an id that is not there. */
  | 'not_mapping'
  /**
   * A text, a word or the prompt over its cap (MATCH_ELEMENT_MAX, MATCH_GROUP_TEXT_MAX,
   * MATCH_WORD_MAX, MATCH_PROMPT_MAX): it would not fit a 360×740 phone without scrolling.
   */
  | 'too_long'
  /** mark (#234): see `mark.ts`. */
  | MarkProblem;

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
    case 'match':
      return matchProblem(task);
    case 'mark':
      return markProblem(task);
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
    case 'match':
      return matchText(task, task.key);
    case 'mark':
      return markSolution(task);
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
        // No curriculum place (#214) and no rubric (#211): both belong to single answers.
        curriculum_point: null,
        rubric: null,
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
        // No curriculum place (#214) and no rubric (#211): both belong to single answers.
        curriculum_point: null,
        rubric: null,
        hints,
        worked_solution: 'worked_solution' in draft ? draft.worked_solution : null,
      };
    }
    case 'match': {
      const task = matchTaskFrom(draft);
      if (!task) return null;
      const prompt = dollarMathRuns(draft.prompt);
      const answer = solutionOf(task);
      // Help never gives a whole link away, nor the whole solution.
      const hints = ('hints' in draft ? draft.hints : []).filter(
        (h) => !mentionsSolution(h, answer, prompt) && !namesALink(h, task),
      );
      return {
        kind: 'match',
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
        // No curriculum place (#214) and no rubric (#211): both belong to single answers.
        curriculum_point: null,
        rubric: null,
        hints,
        worked_solution: 'worked_solution' in draft ? draft.worked_solution : null,
      };
    }
    case 'mark': {
      const task = markTaskFrom(draft);
      if (!task) return null;
      const prompt = dollarMathRuns(draft.prompt);
      const answer = solutionOf(task);
      // Help never gives the whole set of marks away.
      const hints = ('hints' in draft ? draft.hints : []).filter(
        (h) => !mentionsSolution(h, answer, prompt),
      );
      return {
        kind: 'mark',
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
        // Marking a comma or an error IS the spelling exercise; the marks are compared exactly.
        spelling: null,
        source_excerpt: null,
        curriculum_point: null,
        rubric: null,
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

// ─────────────── match (#229): Regel 0 and the stored task ───────────────

/** How a pair reads as text ("Hund – dog"), and how links and groups stand in a row. */
export const MATCH_PAIR_JOIN = ' – ';
export const MATCH_LIST_JOIN = '; ';

/** What is wrong with a match task (stored or built), or null when it holds together. */
export function matchProblem(task: MatchTask): TaskProblem | null {
  const { left, right, key } = task;
  if (task.form === 'pairs') {
    if (left.length < MATCH_PAIRS_MIN || left.length > MATCH_PAIRS_MAX) return 'count';
    if (right.length !== left.length) return 'count';
  } else {
    if (right.length < MATCH_GROUPS_MIN || right.length > MATCH_GROUPS_MAX) return 'count';
    if (left.length < MATCH_GROUPED_MIN || left.length > MATCH_GROUPED_MAX) return 'count';
  }
  const textMax = task.form === 'pairs' ? MATCH_ELEMENT_MAX : MATCH_GROUP_TEXT_MAX;
  if ([...left, ...right].some((e) => !fitsText(e.text, textMax))) return 'too_long';
  // Every text once — across both sides: a thing named like its group or its partner is
  // no task to solve.
  const seen = new Set<string>();
  for (const e of [...left, ...right]) {
    const s = sameness(e.text);
    if (s === '' || seen.has(s)) return 'duplicate';
    seen.add(s);
  }
  const leftIds = new Set(left.map((e) => e.id));
  const rightIds = new Set(right.map((e) => e.id));
  if (leftIds.size !== left.length || rightIds.size !== right.length) return 'not_mapping';
  if ([...leftIds].some((id) => rightIds.has(id))) return 'not_mapping';
  if (key.length !== left.length || new Set(key.map((k) => k.left)).size !== key.length) {
    return 'not_mapping';
  }
  if (!key.every((k) => leftIds.has(k.left) && rightIds.has(k.right))) return 'not_mapping';
  const used = new Map<string, number>();
  for (const k of key) used.set(k.right, (used.get(k.right) ?? 0) + 1);
  if (task.form === 'pairs') {
    // One partner each way: a right with two lefts leaves another right without one.
    if (right.some((r) => used.get(r.id) !== 1)) return 'ambiguous';
  } else if (right.some((g) => !used.has(g.id))) {
    return 'empty_group';
  }
  return null;
}

/**
 * What is wrong with the model's draft before anything is built, or null. The draft is
 * where an ambiguity can still be SEEN (the same thing written to two places); once ids are
 * given it would read as a mere duplicate.
 */
/** Whether a text fits its cap, and no word in it is longer than a column holds. */
function fitsText(text: string, max: number): boolean {
  const plain = plainMath(text).trim();
  return plain.length <= max && plain.split(/\s+/).every((w) => w.length <= MATCH_WORD_MAX);
}

export function matchDraftProblem(draft: MatchDraft): TaskProblem | null {
  const { pairs, groups } = draft;
  if ((pairs === null) === (groups === null)) return 'form';
  if (draft.prompt !== undefined && draft.prompt.trim().length > MATCH_PROMPT_MAX) {
    return 'too_long';
  }
  if (
    pairs !== null &&
    pairs.some((p) => !fitsText(p.left, MATCH_ELEMENT_MAX) || !fitsText(p.right, MATCH_ELEMENT_MAX))
  ) {
    return 'too_long';
  }
  if (
    groups !== null &&
    groups.some(
      (g) =>
        !fitsText(g.name, MATCH_GROUP_TEXT_MAX) ||
        g.elements.some((e) => !fitsText(e, MATCH_GROUP_TEXT_MAX)),
    )
  ) {
    return 'too_long';
  }
  if (pairs !== null) {
    if (pairs.length < MATCH_PAIRS_MIN || pairs.length > MATCH_PAIRS_MAX) return 'count';
    const partnerOf = new Map<string, string>();
    const partnerOfRight = new Map<string, string>();
    for (const p of pairs) {
      const l = sameness(p.left);
      const r = sameness(p.right);
      const lr = partnerOf.get(l);
      const rl = partnerOfRight.get(r);
      if ((lr !== undefined && lr !== r) || (rl !== undefined && rl !== l)) return 'ambiguous';
      if (lr !== undefined) return 'duplicate';
      partnerOf.set(l, r);
      partnerOfRight.set(r, l);
    }
    return null;
  }
  const gs = groups ?? [];
  if (gs.length < MATCH_GROUPS_MIN || gs.length > MATCH_GROUPS_MAX) return 'count';
  if (gs.some((g) => g.elements.length === 0)) return 'empty_group';
  const total = gs.reduce((n, g) => n + g.elements.length, 0);
  if (total < MATCH_GROUPED_MIN || total > MATCH_GROUPED_MAX) return 'count';
  const groupOf = new Map<string, number>();
  for (const [gi, g] of gs.entries()) {
    for (const e of g.elements) {
      const s = sameness(e);
      const before = groupOf.get(s);
      if (before !== undefined) return before === gi ? 'duplicate' : 'ambiguous';
      groupOf.set(s, gi);
    }
  }
  return null;
}

/**
 * A deterministic shuffle of `n` positions (per content, like an order's), the first that
 * `fits` — or null when none of the tries does.
 */
function shuffleWhere(
  n: number,
  seedText: string,
  fits: (idx: readonly number[]) => boolean,
): number[] | null {
  const base = hash(seedText);
  for (let attempt = 0; attempt < 64; attempt++) {
    const random = seeded(base + attempt);
    const idx = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [idx[i], idx[j]] = [idx[j]!, idx[i]!];
    }
    if (fits(idx)) return idx;
  }
  return null;
}

/** Ids of the right side by position: r1, r2 … (the left side is a, b, c … like an order). */
function rightIdAt(position: number): PartId {
  return `r${position + 1}`;
}

/**
 * The stored task for the model's correct links, or null when Regel 0 rejects it. The
 * display is never already solved: pairs never line up in more than a few rows, and the
 * elements of a grouping never stand sorted by their groups.
 */
export function matchTaskFrom(draft: MatchDraft): MatchTask | null {
  if (matchDraftProblem(draft) !== null) return null;
  const clean = (x: string) => dollarMathRuns(x.trim());
  let form: MatchForm;
  /** In the model's order: each left text and the index of its right. */
  let links: Array<{ text: string; to: number }>;
  let rights: string[];
  if (draft.pairs !== null) {
    form = 'pairs';
    links = draft.pairs.map((p, i) => ({ text: clean(p.left), to: i }));
    rights = draft.pairs.map((p) => clean(p.right));
  } else {
    form = 'groups';
    const groups = draft.groups ?? [];
    rights = groups.map((g) => clean(g.name));
    links = groups.flatMap((g, gi) => g.elements.map((e) => ({ text: clean(e), to: gi })));
  }
  const n = links.length;
  const seed = [form, ...links.map((l) => `${l.text}\u0001${rights[l.to]}`)].join('\u0000');
  // shownLeft[p] = the index (in `links`) of the left element at display position p.
  const shownLeft =
    form === 'pairs'
      ? shuffleWhere(n, seed, () => true)
      : shuffleWhere(n, seed, (idx) => {
          // Sorted by group (every group's elements together, in the groups' order) would be
          // the solution laid out — never that.
          const groupsInRow = idx.map((i) => links[i]!.to);
          return groupsInRow.some((g, i) => i > 0 && g < groupsInRow[i - 1]!);
        });
  if (!shownLeft) return null;
  // Pairs: the right column shuffled too, so that fewer than half of the rows line up.
  const shownRight =
    form === 'pairs'
      ? shuffleWhere(n, `${seed}\u0002`, (idx) => {
          const aligned = shownLeft.filter((li, p) => idx[p] === links[li]!.to).length;
          return aligned * 2 < n;
        })
      : rights.map((_, i) => i);
  if (!shownRight) return null;
  const left: MatchElement[] = shownLeft.map((li, p) => ({ id: idAt(p), text: links[li]!.text }));
  const right: MatchElement[] = shownRight.map((ri, p) => ({
    id: rightIdAt(p),
    text: rights[ri]!,
  }));
  const key: MatchLink[] = shownLeft.map((li, p) => ({
    left: idAt(p),
    right: rightIdAt(shownRight.indexOf(links[li]!.to)),
  }));
  const task: MatchTask = { type: 'match', form, left, right, key };
  const parsed = StructuredTask.safeParse(task);
  if (!parsed.success || parsed.data.type !== 'match') return null;
  return matchProblem(parsed.data) === null ? parsed.data : null;
}

/** The solution in words: "a – 1; b – 2" for pairs, "Nomen: Haus, Baum; Verben: …" for groups. */
function matchText(task: MatchTask, links: readonly MatchLink[]): string {
  const leftText = new Map(task.left.map((e) => [e.id, e.text]));
  const rightText = new Map(task.right.map((e) => [e.id, e.text]));
  // In the order she sees the left side, whatever order the links came in.
  const at = new Map(task.left.map((e, i) => [e.id, i]));
  const sorted = [...links].sort((a, b) => (at.get(a.left) ?? 0) - (at.get(b.left) ?? 0));
  if (task.form === 'pairs') {
    return sorted
      .map((k) => `${leftText.get(k.left) ?? ''}${MATCH_PAIR_JOIN}${rightText.get(k.right) ?? ''}`)
      .join(MATCH_LIST_JOIN);
  }
  return task.right
    .map((g) => {
      const members = sorted.filter((k) => k.right === g.id).map((k) => leftText.get(k.left));
      return members.length === 0 ? null : `${g.text}: ${members.join(', ')}`;
    })
    .filter((x): x is string => x !== null)
    .join(MATCH_LIST_JOIN);
}

/** A hint that states a whole correct link (both of its sides) gives that link away. */
function namesALink(hint: string, task: MatchTask): boolean {
  // Whole words only: "ich" is not named by "sich".
  const words = (x: string) =>
    ` ${sameness(x)
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()} `;
  const h = words(hint);
  const textOf = new Map([...task.left, ...task.right].map((e) => [e.id, words(e.text)]));
  return task.key.some((k) => {
    const l = textOf.get(k.left);
    const r = textOf.get(k.right);
    return l !== undefined && r !== undefined && h.includes(l) && h.includes(r);
  });
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
    case 'match':
      return { type: 'match', form: task.form, left: task.left, right: task.right };
    case 'mark':
      return markView(task);
  }
}

// ─────────────── Regel 0: her answer, checked ───────────────

/** One part of her answer: an element at its place, a pair, a cell, a gap. */
export type PartResult = { id: PartId; ok: boolean };

/**
 * The verdict on a structured answer, with what is right part by part. Kinds add their own
 * detail beside `parts` (order: the first place that is wrong, 1-based).
 */
export type StructuredCheck = OrderCheck | TableCheck | MatchCheck | MarkCheck;

export type OrderCheck = {
  type: 'order';
  correct: boolean;
  /** In her order: each element she placed, and whether it is at its right place. */
  parts: PartResult[];
  first_wrong: number | null;
};

/** match (#229): how many links are right, and the first wrong one in her reading order. */
export type MatchCheck = {
  type: 'match';
  form: MatchForm;
  correct: boolean;
  /** Per left element, in the order she sees them: is it linked to its right place? */
  parts: PartResult[];
  right: number;
  total: number;
  /** The first left element (as shown) that is linked wrongly, or null. */
  first_wrong_text: string | null;
};

function checkMatch(task: MatchTask, answer: MatchAnswer): MatchCheck | null {
  const leftIds = new Set(task.left.map((e) => e.id));
  const rightIds = new Set(task.right.map((e) => e.id));
  const given = new Map<string, string>();
  for (const k of answer.links) {
    // Every left element exactly once, to a right one that is there (else: 400, not graded).
    if (!leftIds.has(k.left) || !rightIds.has(k.right) || given.has(k.left)) return null;
    given.set(k.left, k.right);
  }
  if (given.size !== leftIds.size) return null;
  // Pairs are pairs: one right element cannot be the partner of two.
  if (task.form === 'pairs' && new Set(given.values()).size !== given.size) return null;
  const want = new Map(task.key.map((k) => [k.left, k.right]));
  const parts = task.left.map((e) => ({ id: e.id, ok: want.get(e.id) === given.get(e.id) }));
  const right = parts.filter((p) => p.ok).length;
  const wrong = parts.find((p) => !p.ok);
  return {
    type: 'match',
    form: task.form,
    correct: right === parts.length,
    parts,
    right,
    total: parts.length,
    first_wrong_text: wrong ? (task.left.find((e) => e.id === wrong.id)?.text ?? null) : null,
  };
}

function checkOrder(task: OrderTask, answer: OrderAnswer): OrderCheck | null {
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
    case 'match':
      return answer.type === 'match' ? checkMatch(task, answer) : null;
    case 'mark':
      return answer.type === 'mark' ? checkMark(task, answer) : null;
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
    case 'match':
      return answer.type === 'match' ? matchText(task, answer.links) : '';
    case 'mark':
      return answer.type === 'mark' ? markAnswerText(task, answer) : '';
  }
}

/**
 * The reply to a wrong structured answer: where it stops being right, kindly. The right
 * one is answered like every right answer (`practice.correct`).
 */
export function structuredReply(
  locale: string,
  check: StructuredCheck,
  /** Her wrong tries on this question before this one (`session_items.attempts`). */
  priorMisses: number = 0,
): string {
  switch (check.type) {
    case 'order': {
      const at = check.first_wrong ?? 1;
      return at <= 1
        ? t(locale, 'practice.order.first_wrong')
        : t(locale, 'practice.order.right_until', { right: at - 1, from: at });
    }
    case 'table_fill':
      return tableReply(locale, check);
    case 'match': {
      // First the count ("4 von 5 Paaren stimmen"); WHICH one is wrong only on the second
      // miss — the next rung of the hint ladder, so it counts as help (`structuredNamesPart`).
      const pairs = check.form === 'pairs';
      const base =
        check.right === 0
          ? t(locale, pairs ? 'practice.match.pairs_none' : 'practice.match.groups_none')
          : t(locale, pairs ? 'practice.match.pairs_some' : 'practice.match.groups_some', {
              count: check.right,
              total: check.total,
            });
      return structuredNamesPart(check, priorMisses) && check.first_wrong_text !== null
        ? `${base} ${t(locale, 'practice.match.look_at', { text: check.first_wrong_text })}`
        : base;
    }
    case 'mark':
      return markReply(locale, check);
  }
}

/**
 * Does the reply to this wrong answer point at the part that is wrong? Then it is help given
 * (a hint), like a spelled-out typo (#207). An order always names its place (#228) and that
 * is its feedback, not a hint; a table names its cells on every try (#230), the same;
 * a match names its wrong link from the second miss on (#229).
 */
export function structuredNamesPart(check: StructuredCheck, priorMisses: number): boolean {
  switch (check.type) {
    // A marking reply counts and never names a place (#234).
    case 'order':
    case 'table_fill':
    case 'mark':
      return false;
    case 'match':
      return !check.correct && priorMisses >= 1;
  }
}
