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
// Adding a kind (#229 match, #230 table_fill, #232 cloze, #240 select_all, #234 mark, #260
// find_error and column_calc, #249 grid_draw): its draft schema, a
// builder from draft to task, a `problem` check, a view, a checker and a reply — each one more
// `case` in the switches below. The answer flow in `answer.ts` only ever calls the exported
// functions.

import {
  OrderNumeric,
  ORDER_ELEMENT_MAX,
  ORDER_MAX,
  ORDER_MIN,
  StructuredTask,
  STRUCTURED_KINDS,
  type OrderAnswer,
  type OrderTask,
  type PartId,
  type StructuredAnswer,
  unsupportedMath,
  type StructuredKind,
  type StructuredTaskView,
} from '@learnbuddy/shared-types/contracts';
import { parseNumericInput } from '@learnbuddy/shared-math';
import { z } from 'zod';

import { t } from '../../i18n/index.js';
import {
  checkCloze,
  clozeAnswerText,
  clozeDecidedBy,
  ClozeDraftBase,
  clozeProblem,
  clozeReply,
  clozeSecrets,
  clozeSolution,
  clozeTaskFrom,
  clozeVerdict,
  visibleOf,
  type ClozeCheck,
  type ClozeProblem,
} from './cloze.js';
import { displayOrder, idAt, sameness } from './arrange.js';
import {
  checkColumns,
  ColumnDraftBase,
  columnLayout,
  columnProblem,
  columnReply,
  columnSecrets,
  columnSolution,
  columnTaskFrom,
  type ColumnCheck,
  type ColumnProblem,
} from './columnCalc.js';
import { dollarMathRuns } from './dollarMath.js';
import {
  checkFindError,
  FindErrorDraftBase,
  findErrorAnswerText,
  findErrorProblem,
  findErrorReply,
  findErrorSecrets,
  findErrorSolution,
  findErrorTaskFrom,
  findErrorVerdict,
  findErrorVisible,
  type FindErrorCheck,
  type FindErrorProblem,
} from './findError.js';
import {
  checkGrid,
  gridAnswerText,
  GridDraftBase,
  gridProblem,
  gridReply,
  gridSecrets,
  gridSolution,
  gridTaskFrom,
  gridView,
  type GridCheck,
  type GridProblem,
} from './grid.js';
import { ItemDraft } from './items.js';
import {
  checkMark,
  MarkDraftBase,
  markAnswerText,
  markProblem,
  markReply,
  markSecrets,
  markSolution,
  markTaskFrom,
  markView,
  namesAMark,
  type MarkCheck,
  type MarkProblem,
} from './mark.js';
import {
  checkMatch,
  MatchDraftBase,
  MatchDraftWithHelp,
  matchNamesPart,
  matchProblem,
  matchReply,
  matchTaskFrom,
  matchText,
  namesALink,
  type MatchCheck,
  type MatchProblem,
} from './match.js';
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
  checkSelect,
  namesAnOption,
  SelectDraftBase,
  selectNamesPart,
  selectProblem,
  selectReply,
  selectTaskFrom,
  selectText,
  type SelectCheck,
  type SelectProblem,
} from './selectAll.js';
import { mentionsSolution } from './tutor.js';

/**
 * The structured kinds a photographed sheet may give: an order, a table, links, gaps (#228–#232),
 * options to tick (#240), words to mark (#234), a solution with a mistake to find and a calculation
 * in columns (#260) are all printed on worksheets. Not a drawing on a grid (#249): its paper would
 * have to be read off the photo, and a point read one square off would be a key that disagrees with
 * the sheet — the reason a note line is not read off a photo either (#226). The photo reading is not
 * offered the kind at all (`StructuredDraft` below).
 */
export const SHEET_STRUCTURED: ReadonlySet<string> = new Set(
  STRUCTURED_KINDS.filter((k) => k !== 'grid_draw'),
);

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
  MatchDraftWithHelp,
  ClozeDraftBase.extend({
    hints: ItemDraft.shape.hints,
    worked_solution: ItemDraft.shape.worked_solution,
  }),
  SelectDraftBase.extend({
    hints: ItemDraft.shape.hints,
    worked_solution: ItemDraft.shape.worked_solution,
  }),
  MarkDraftBase.extend({
    hints: ItemDraft.shape.hints,
    worked_solution: ItemDraft.shape.worked_solution,
  }),
  // The solution is code's (#260): a worked solution by the model would explain another one.
  FindErrorDraftBase.extend({ hints: ItemDraft.shape.hints }),
  ColumnDraftBase.extend({ hints: ItemDraft.shape.hints }),
]);
export type StructuredDraft = z.infer<typeof StructuredDraft>;

/** Homework: hints, but no worked solution (she never sees one there; fewer tokens). */
export const StructuredDraftHomework = z.discriminatedUnion('type', [
  OrderDraftBase.extend({ hints: ItemDraft.shape.hints }),
  TableDraftBase.extend({ hints: ItemDraft.shape.hints }),
  MatchDraftBase.extend({ hints: ItemDraft.shape.hints }),
  ClozeDraftBase.extend({ hints: ItemDraft.shape.hints }),
  SelectDraftBase.extend({ hints: ItemDraft.shape.hints }),
  MarkDraftBase.extend({ hints: ItemDraft.shape.hints }),
  FindErrorDraftBase.extend({ hints: ItemDraft.shape.hints }),
  ColumnDraftBase.extend({ hints: ItemDraft.shape.hints }),
]);
export type StructuredDraftHomework = z.infer<typeof StructuredDraftHomework>;

/**
 * The same without hints and worked solution (a topic: help is written in the background). The
 * only union with a drawing on a grid (#249): Buddy prepares one for a topic, a photo never gives
 * one (`SHEET_STRUCTURED`).
 */
export const StructuredDraftNoHelp = z.discriminatedUnion('type', [
  OrderDraftBase,
  TableDraftBase,
  MatchDraftBase,
  ClozeDraftBase,
  SelectDraftBase,
  MarkDraftBase,
  FindErrorDraftBase,
  ColumnDraftBase,
  GridDraftBase,
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
  /** A match task that fails Regel 0 (#229, `match.ts`). */
  | MatchProblem
  /** A cloze text that fails Regel 0 (#232, `cloze.ts`). */
  | ClozeProblem
  /** A select-all task that fails Regel 0 (#240, `selectAll.ts`). */
  | SelectProblem
  /** A marking task that fails Regel 0 (#234, `mark.ts`). */
  | MarkProblem
  /** A find-the-error task that fails Regel 0 (#260, `findError.ts`). */
  | FindErrorProblem
  /** A written-arithmetic task that fails Regel 0 (#260, `columnCalc.ts`). */
  | ColumnProblem
  /** A grid task that fails Regel 0 (#249, `grid.ts`). */
  | GridProblem;

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
    case 'cloze':
      return clozeProblem(task);
    case 'select_all':
      return selectProblem(task);
    case 'mark':
      return markProblem(task);
    case 'find_error':
      return findErrorProblem(task);
    case 'column_calc':
      return columnProblem(task);
    case 'grid_draw':
      return gridProblem(task);
  }
}

// ─────────────── from the model's draft to a stored task ───────────────

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
    case 'cloze':
      return clozeSolution(task);
    case 'select_all':
      return selectText(task, task.key);
    case 'mark':
      return markSolution(task);
    case 'find_error':
      return findErrorSolution(task);
    case 'column_calc':
      return columnSolution(task);
    case 'grid_draw':
      return gridSolution(task);
  }
}

/**
 * The question around a stored task: every field but the task, its wording, its solution and
 * its help is fixed. No chart to read (the task is the board, #245/#246), no curriculum place
 * (#214) and no rubric (#211): both belong to single answers. Spelling stays null except where
 * the parts are checked with the subject's spelling rule (a cloze, #232).
 */
function asItem(
  draft: StructuredDraft | StructuredDraftHomework | StructuredDraftNoHelp,
  own: Pick<StructuredItem, 'kind' | 'task' | 'prompt' | 'answer' | 'hints'> &
    Partial<Pick<StructuredItem, 'spelling' | 'worked_solution'>>,
): StructuredItem {
  return {
    accepted_answers: [],
    unit: null,
    choices: null,
    correct_choice: null,
    topic: draft.topic,
    difficulty: draft.difficulty,
    prompt_lang: draft.prompt_lang,
    lang: null,
    figure: null,
    read: null,
    tolerance: null,
    spelling: null,
    source_excerpt: null,
    curriculum_point: null,
    rubric: null,
    worked_solution: 'worked_solution' in draft ? draft.worked_solution : null,
    ...own,
  };
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
      return asItem(draft, {
        kind: 'order',
        task,
        prompt,
        answer,
        hints,
      });
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
      return asItem(draft, {
        kind: 'table_fill',
        task,
        prompt,
        answer: solutionOf(task),
        hints,
      });
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
      return asItem(draft, {
        kind: 'match',
        task,
        prompt,
        answer,
        hints,
      });
    }
    case 'cloze': {
      const prompt = dollarMathRuns(draft.prompt);
      const built = clozeTaskFrom({ ...draft, prompt });
      if (!('task' in built)) return null;
      const { task } = built;
      // Help never names what belongs in a gap — no key, no accepted form (the same check as
      // every prepared hint, against everything she can read).
      const visible = visibleOf(task, prompt);
      const hints = ('hints' in draft ? draft.hints : []).filter(
        (h) => !clozeSecrets(task).some((s) => mentionsSolution(h, s, visible)),
      );
      return asItem(draft, {
        kind: 'cloze',
        task,
        prompt,
        answer: clozeSolution(task),
        hints,
        // Each gap is checked with the item's spelling rule (strict in language subjects).
        spelling: draft.spelling,
      });
    }
    case 'select_all': {
      const prompt = dollarMathRuns(draft.prompt);
      const task = selectTaskFrom({ options: draft.options, prompt: draft.prompt });
      if (!task) return null;
      // Help never says of an option whether it is right: no hint may name one.
      const hints = ('hints' in draft ? draft.hints : []).filter(
        (h) => !namesAnOption(h, task, prompt),
      );
      return asItem(draft, { kind: 'select_all', task, prompt, answer: solutionOf(task), hints });
    }
    case 'mark': {
      const prompt = dollarMathRuns(draft.prompt);
      const task = markTaskFrom(draft);
      if (!task) return null;
      // Help never names a place to mark: every target stands in the text she reads.
      const hints = ('hints' in draft ? draft.hints : []).filter(
        (h) => !namesAMark(h, task, prompt),
      );
      return asItem(draft, { kind: 'mark', task, prompt, answer: solutionOf(task), hints });
    }
    case 'find_error': {
      const prompt = dollarMathRuns(draft.prompt);
      const task = findErrorTaskFrom(draft);
      if (!task) return null;
      const help = ownHelp('hints' in draft ? draft.hints : [], task, prompt);
      return asItem(draft, { kind: 'find_error', task, prompt, ...help });
    }
    case 'column_calc': {
      const prompt = dollarMathRuns(draft.prompt);
      const task = columnTaskFrom(draft);
      if (!task) return null;
      const help = ownHelp('hints' in draft ? draft.hints : [], task, prompt);
      return asItem(draft, { kind: 'column_calc', task, prompt, ...help });
    }
    case 'grid_draw': {
      // The prompt is the model's instruction with the task's data after it, written by code.
      // Help is written later, in the background, against the solution (`hints.ts`).
      const built = gridTaskFrom(draft);
      if (!built) return null;
      const { task, prompt } = built;
      return asItem(draft, {
        kind: 'grid_draw',
        task,
        prompt,
        answer: solutionOf(task),
        hints: [],
      });
    }
  }
}

/**
 * The solution and help of a kind whose solution code computes (#260): the answer is code's, no
 * worked solution by the model (it would explain another way, or another number), and no hint
 * that says what is secret.
 */
function ownHelp(
  hints: readonly string[],
  task: StructuredTask,
  prompt: string,
): Pick<StructuredItem, 'answer' | 'hints' | 'worked_solution'> {
  const { secrets, visible } = secretsOf(task, prompt);
  return {
    answer: solutionOf(task),
    hints: hints.filter((h) => !secrets.some((s) => mentionsSolution(h, s, visible))),
    worked_solution: null,
  };
}

/** Every string in a value: a structured task is nested data, and each of its texts is shown. */
function textsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(textsIn);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(textsIn);
  return [];
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
      // Notation the app cannot draw (issue #239) costs the question, as in `usableItems`:
      // every text she reads — the prompt, the pieces, the cells — is held to the one list.
      if (item && textsIn(item).some((text) => unsupportedMath(text).length > 0)) return [];
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
    case 'match':
      return { type: 'match', form: task.form, left: task.left, right: task.right };
    case 'cloze':
      return {
        type: 'cloze',
        segments: task.segments,
        gaps: task.gaps.map((g) => g.id),
        bank: task.bank,
      };
    case 'select_all':
      return { type: 'select_all', options: task.options };
    case 'mark':
      return markView(task);
    case 'find_error':
      return { type: 'find_error', lines: task.lines };
    case 'column_calc':
      // A stored task passed Regel 0 when it was read (`structuredTaskOf`), so it has a layout.
      return columnLayout(task)!.view;
    case 'grid_draw':
      return gridView(task);
  }
}

/**
 * What a prepared hint for this task must not say (`hints.ts`), and what she can read of it
 * — a hint may repeat what is visible. For an order or a match the whole solution is the
 * secret; for a table every key of a gap; for a cloze every key and accepted form; for a
 * select-all task every option — naming one, right or wrong, says which it is (#240).
 */
export function secretsOf(
  task: StructuredTask,
  prompt: string,
): { secrets: string[]; visible: string } {
  switch (task.type) {
    case 'order':
    case 'match':
      return { secrets: [solutionOf(task)], visible: prompt };
    case 'table_fill':
      return { secrets: tableKeys(task), visible: `${prompt} ${tableShownText(task)}` };
    case 'cloze':
      return { secrets: clozeSecrets(task), visible: visibleOf(task, prompt) };
    case 'select_all':
      return { secrets: task.options.map((o) => o.text), visible: prompt };
    case 'mark':
      return { secrets: markSecrets(task), visible: prompt };
    case 'find_error':
      return { secrets: findErrorSecrets(task), visible: findErrorVisible(task, prompt) };
    case 'column_calc':
      return { secrets: columnSecrets(task), visible: `${prompt} ${task.operands.join(' ')}` };
    case 'grid_draw':
      return { secrets: gridSecrets(task), visible: prompt };
  }
}

// ─────────────── Regel 0: her answer, checked ───────────────

/** One part of her answer: an element at its place, a pair, a cell, a gap. */
type PartResult = { id: PartId; ok: boolean };

/**
 * The verdict on a structured answer, with what is right part by part. Kinds add their own
 * detail beside `parts` (order: the first place that is wrong, 1-based).
 */
export type StructuredCheck =
  | OrderCheck
  | TableCheck
  | MatchCheck
  | ClozeCheck
  | SelectCheck
  | MarkCheck
  | FindErrorCheck
  | ColumnCheck
  | GridCheck;

type OrderCheck = {
  type: 'order';
  correct: boolean;
  /** In her order: each element she placed, and whether it is at its right place. */
  parts: PartResult[];
  first_wrong: number | null;
};

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
    case 'cloze':
      return answer.type === 'cloze' ? checkCloze(task, answer, ctx) : null;
    case 'select_all':
      return answer.type === 'select_all' ? checkSelect(task, answer) : null;
    case 'mark':
      return answer.type === 'mark' ? checkMark(task, answer) : null;
    case 'find_error':
      return answer.type === 'find_error' ? checkFindError(task, answer) : null;
    case 'column_calc':
      return answer.type === 'column_calc' ? checkColumns(task, answer) : null;
    case 'grid_draw':
      return answer.type === 'grid_draw' ? checkGrid(task, answer) : null;
  }
}

/**
 * The verdict a structured check stands for: right, wrong, a near miss (a cloze whose gaps
 * are only off by spelling), or null while a part nobody could judge is left — then nothing
 * is claimed (CLAUDE.md rule 5).
 */
export function structuredVerdict(
  check: StructuredCheck,
): 'correct' | 'partially_correct' | 'incorrect' | null {
  switch (check.type) {
    case 'order':
    case 'table_fill':
    case 'match':
    case 'select_all':
    case 'mark':
    case 'column_calc':
    case 'grid_draw':
      return check.correct ? 'correct' : 'incorrect';
    case 'cloze':
      return clozeVerdict(check);
    case 'find_error':
      return findErrorVerdict(check);
  }
}

/**
 * How parts are given when the app does not say (issue #163): arranged by tapping — except
 * the cells of a table (#230), every one typed, and a cloze without a word bank, whose gaps
 * can only be typed (#232).
 */
export function partsVia(task: StructuredTask): 'tapped' | 'typed' {
  switch (task.type) {
    case 'order':
    case 'match':
    case 'select_all':
    case 'mark':
      return 'tapped';
    case 'table_fill':
    case 'column_calc':
    case 'find_error': // the line is tapped, but what is judged last is the line she wrote
      return 'typed';
    // A drawing is produced, not recognised (#163): she sets every point herself, as a note line.
    case 'grid_draw':
      return 'typed';
    case 'cloze':
      return task.bank === null ? 'typed' : 'tapped';
  }
}

/** Who decided: code, unless the model judged a part no rule could (a cloze gap). */
export function structuredDecidedBy(check: StructuredCheck): 'rule' | 'model' {
  switch (check.type) {
    case 'order':
    case 'table_fill':
    case 'match':
    case 'select_all':
    case 'mark':
    case 'find_error':
    case 'column_calc':
    case 'grid_draw':
      return 'rule';
    case 'cloze':
      return clozeDecidedBy(check);
  }
}

/** Her answer as it stands in the conversation ("B → A → C"). */
export function answerTextOf(
  task: StructuredTask,
  answer: StructuredAnswer,
  locale: string,
): string {
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
    case 'cloze':
      return answer.type === 'cloze' ? clozeAnswerText(task, answer) : '';
    case 'select_all':
      return answer.type === 'select_all' ? selectText(task, answer.chosen) : '';
    case 'mark':
      return answer.type === 'mark' ? markAnswerText(task, answer, locale) : '';
    case 'find_error':
      return answer.type === 'find_error' ? findErrorAnswerText(task, answer) : '';
    case 'column_calc':
      return answer.type === 'column_calc' ? (checkColumns(task, answer)?.text ?? '') : '';
    case 'grid_draw':
      return answer.type === 'grid_draw' ? gridAnswerText(task, answer) : '';
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
    case 'match':
      return matchReply(locale, check, priorMisses);
    case 'cloze':
      return clozeReply(locale, check);
    case 'select_all':
      return selectReply(locale, check, priorMisses);
    case 'mark':
      return markReply(locale, check);
    case 'find_error':
      return findErrorReply(locale, check);
    case 'column_calc':
      return columnReply(locale, check);
    case 'grid_draw':
      return gridReply(locale, check);
  }
}

/**
 * Does the reply to this wrong answer point at the part that is wrong? Then it is help given
 * (a hint), like a spelled-out typo (#207). An order always names its place (#228) and that
 * is its feedback, not a hint; a table names its cells on every try (#230), the same;
 * a match names its wrong link from the second miss on (#229); a drawing names its wrong point or
 * bar on every try (#249) — the same as an order's place, its feedback and not a hint.
 */
export function structuredNamesPart(check: StructuredCheck, priorMisses: number): boolean {
  switch (check.type) {
    case 'order':
    case 'table_fill':
    case 'cloze':
    case 'mark':
    case 'find_error': // where to look (#260) is its feedback, as an order's place is (#228)
    case 'column_calc':
    case 'grid_draw':
      return false;
    case 'match':
      return matchNamesPart(check, priorMisses);
    case 'select_all':
      return selectNamesPart(check, priorMisses);
  }
}
