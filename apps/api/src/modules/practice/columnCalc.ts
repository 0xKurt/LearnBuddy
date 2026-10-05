// Schriftlich rechnen (issue #260): addition, subtraction, multiplication and division in
// columns, digit by digit, with the carries. docs/architecture.md §Practice ("Structured items" →
// "Written arithmetic"). A structured kind like table_fill; `structured.ts` dispatches here.
//
// Both directions of #224's "Regel 0", both code, no model call:
//
//   1. The MODEL names only the operation and the numbers. Code computes the procedure itself —
//      column by column with its carries, partial product by partial product, step by step of a
//      division — lays it out on squared paper and keeps every digit as the key. A task whose
//      numbers do not fit the operation (a subtrahend larger than the minuend, a divisor of two
//      digits) or whose grid would not fit a 360×740 phone gives no question; nothing is repaired.
//   2. What SHE writes is compared cell by cell: every digit AND every carry. The reply names the
//      first place that is not right yet, in the order she writes — "bei den Zehnern fehlt noch
//      der Übertrag" — never the digit that belongs there.
//
// The stored task is only what the model named (`ColumnCalcTask`); the grid and its key are
// computed again whenever it is read, so a change here can never leave a stored key behind.
//
// The notation (contracts/structured.ts §column_calc): carries small above the line; partial
// products from the first digit of the second factor on; a division as a staircase. An empty cell
// is right where nothing belongs: no carry, or a leading zero (no one writes 0612).

import {
  ColumnCalcTask,
  columnResultText,
  columnsFit,
  COLUMN_ADDENDS_MAX,
  COLUMN_DIGITS_MAX,
  COLUMN_FACTOR_DIGITS_MAX,
  COLUMN_GAPS_MAX,
  COLUMN_ROWS_MAX,
  ColumnOp,
  type ColumnCalcAnswer,
  type ColumnCalcTaskView,
  type ColumnCell,
  type ColumnPart,
  type ColumnRow,
  type PartId,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

import { t, type MessageKey } from '../../i18n/index.js';
import { ItemDraft } from './items.js';

/** The instruction above the grid: two lines of the question card at most. */
const COLUMN_PROMPT_MAX = 60;

/**
 * What the generator and the photo reading are told about written arithmetic. Exact and minimal,
 * and deliberately without an example: models copy examples (repo convention).
 */
export const COLUMN_RULES = `Written arithmetic tasks ("structured", type "column_calc"): only when the learner is to calculate on paper in columns ("schriftlich rechnen"). op "add": ${2}–${COLUMN_ADDENDS_MAX} numbers; "sub": two numbers, the first the larger; "mul": two numbers, the second of 1–${COLUMN_FACTOR_DIGITS_MAX} digits, none of them 0, and not 1; "div": two numbers, the second a single digit 2–9, the quotient of at most two digits. operands: the numbers as digit strings, whole and positive, at most ${COLUMN_DIGITS_MAX} digits, the longest at least two. Never the result: the app computes every digit and carry itself. prompt: the instruction, at most ${COLUMN_PROMPT_MAX} characters; it never states the result.`;

/** The model's task: the operation and its numbers, nothing else. */
export const ColumnDraftBase = z.object({
  type: z.literal('column_calc'),
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(COLUMN_PROMPT_MAX * 4)
    .describe(`The instruction, at most ${COLUMN_PROMPT_MAX} characters; never the result`),
  op: ColumnOp,
  operands: z
    .array(z.string().trim())
    .max(COLUMN_ADDENDS_MAX * 2)
    .describe('The numbers as digit strings, in the order they are written'),
  topic: ItemDraft.shape.topic,
  difficulty: ItemDraft.shape.difficulty,
  prompt_lang: ItemDraft.shape.prompt_lang,
});

/** Why a written-arithmetic task is not stored. Each one is a test (`column-calc.test.ts`). */
export type ColumnProblem =
  /** The numbers do not fit the operation (count, size, a 0 digit in a two-digit factor …). */
  | 'operands'
  /** The grid would not fit a 360×740 phone: too wide, too many rows or cells. */
  | 'too_long';

// ─────────────── the procedure, laid out ───────────────

/** A cell she fills, with its key. `blank`: an empty cell is right here (no carry, leading 0). */
type KeyCell = {
  part: ColumnPart;
  place: number;
  step: number;
  digit: number;
  blank: boolean;
};

/** The grid as code built it: shown cells and cells with their keys, and the writing order. */
type Grid = {
  rows: Array<{ cells: Array<KeyCell | { text: string }>; rule: boolean }>;
  order: Array<[number, number]>;
};

/** A built grid with the ids the app and her answer use. */
export type ColumnLayout = {
  view: ColumnCalcTaskView;
  keys: ReadonlyMap<PartId, KeyCell>;
  /** The result as a number (the quotient of a division, with its remainder beside it). */
  result: { value: number; remainder: number | null };
};

const MINUS = '−';
const TIMES = '·';

/** The digit of a digit string at a place (0 the ones), or 0 above its first digit. */
function at(s: string, place: number): number {
  const ch = s[s.length - 1 - place];
  return ch === undefined ? 0 : Number(ch);
}

/** A number's digits as cells at places 0…top, a cell above its first digit may stay empty. */
function numberCells(
  value: number,
  top: number,
  part: ColumnPart,
  step: number,
): Map<number, KeyCell> {
  const s = String(value);
  const cells = new Map<number, KeyCell>();
  for (let p = 0; p <= top; p++) {
    cells.set(p, { part, place: p, step, digit: at(s, p), blank: p >= s.length });
  }
  return cells;
}

function grid(cols: number): {
  g: Grid;
  row: (rule: boolean) => Array<KeyCell | { text: string }>;
} {
  const g: Grid = { rows: [], order: [] };
  return {
    g,
    row: (rule) => {
      const cells: Array<KeyCell | { text: string }> = Array.from({ length: cols }, () => ({
        text: '',
      }));
      g.rows.push({ cells, rule });
      return cells;
    },
  };
}

/** The digits of a shown number into a row, its ones in column `ones`. */
function writeNumber(row: Array<KeyCell | { text: string }>, s: string, ones: number) {
  for (let p = 0; p < s.length; p++) row[ones - p] = { text: s[s.length - 1 - p]! };
}

/**
 * Cells into a row, their ones in column `ones`, appended to the writing order right to left (or
 * left to right: the steps of a division are written as numbers are read).
 */
function writeCells(
  g: Grid,
  r: number,
  cells: Map<number, KeyCell>,
  ones: number,
  dir: 'rtl' | 'ltr',
) {
  const places = [...cells.keys()].sort((a, b) => (dir === 'rtl' ? a - b : b - a));
  for (const p of places) {
    g.rows[r]!.cells[ones - p] = cells.get(p)!;
    g.order.push([r, ones - p]);
  }
}

/**
 * Adds the columns of digits (place by place, 0 the ones): the carry into every place and the
 * value. `carries[p]` is the carry into place p.
 */
function added(columns: ReadonlyArray<readonly number[]>): { carries: number[]; value: number } {
  const carries = [0];
  let value = 0;
  columns.forEach((digits, p) => {
    const s = digits.reduce((a, b) => a + b, 0) + carries[p]!;
    value += (s % 10) * 10 ** p;
    carries.push(Math.floor(s / 10));
  });
  return { carries, value };
}

/**
 * A result under the line with its carries in the small row above it, in the order she writes
 * them: per place right to left, the carry into it first, then the digit. A carry is written into
 * every place that has digits above it (`carryTop`), never into the ones — a carry into the place
 * above every number goes straight into the result.
 */
function writeSum(
  g: Grid,
  at: { carryRow: number; resultRow: number; ones: number },
  carries: readonly number[],
  carryTop: number,
  value: number,
  top: number,
) {
  const digits = numberCells(value, top, 'result', 0);
  for (let p = 0; p <= top; p++) {
    if (p >= 1 && p <= carryTop) {
      const carry = carries[p] ?? 0;
      g.rows[at.carryRow]!.cells[at.ones - p] = {
        part: 'carry',
        place: p,
        step: 0,
        digit: carry,
        blank: carry === 0,
      };
      g.order.push([at.carryRow, at.ones - p]);
    }
    g.rows[at.resultRow]!.cells[at.ones - p] = digits.get(p)!;
    g.order.push([at.resultRow, at.ones - p]);
  }
}

function addGrid(ops: readonly string[]): Grid {
  const len = Math.max(...ops.map((o) => o.length));
  // A sign column, then one column per place up to one above the longest number.
  const ones = len + 1;
  const { g, row } = grid(ones + 1);
  ops.forEach((o, i) => {
    const r = row(false);
    if (i === ops.length - 1) r[0] = { text: '+' };
    writeNumber(r, o, ones);
  });
  row(false);
  row(true);
  const { carries, value } = added(
    Array.from({ length: len + 1 }, (_, p) => ops.map((o) => at(o, p))),
  );
  writeSum(
    g,
    { carryRow: ops.length, resultRow: ops.length + 1, ones },
    carries,
    len - 1,
    value,
    len,
  );
  return g;
}

function subGrid(a: string, b: string): Grid {
  const len = a.length;
  const ones = len;
  const { g, row } = grid(ones + 1);
  writeNumber(row(false), a, ones);
  const second = row(false);
  second[0] = { text: MINUS };
  writeNumber(second, b, ones);
  row(false);
  row(true);
  // Ergänzen (and Abziehen mit Erweitern): a carry is written under the next column and added to
  // the subtrahend's digit there.
  const carries = [0];
  let value = 0;
  for (let p = 0; p < len; p++) {
    const d = at(a, p) - at(b, p) - carries[p]!;
    carries.push(d < 0 ? 1 : 0);
    value += (d < 0 ? d + 10 : d) * 10 ** p;
  }
  writeSum(g, { carryRow: 2, resultRow: 3, ones }, carries, len - 1, value, len - 1);
  return g;
}

function mulGrid(a: string, b: string): Grid {
  const n = a.length;
  const ones = n + b.length;
  const { g, row } = grid(ones + 1);
  const first = row(false);
  writeNumber(first, a, n - 1);
  first[n] = { text: TIMES };
  writeNumber(first, b, ones);
  const A = Number(a);
  if (b.length === 1) {
    row(true);
    writeCells(g, 1, numberCells(A * Number(b), n, 'result', 0), ones, 'rtl');
    return g;
  }
  // Two digits: a partial product per digit, each ending under its digit, then their sum.
  const partials = [...b].map((d) => A * Number(d));
  partials.forEach((value, j) => {
    row(j === 0);
    writeCells(g, 1 + j, numberCells(value, n, 'partial', j + 1), n + 1 + j, 'rtl');
  });
  row(false);
  row(true);
  const [p0, p1] = partials.map(String) as [string, string];
  const { carries, value } = added(
    Array.from({ length: n + 2 }, (_, p) => [at(p1, p), p >= 1 ? at(p0, p - 1) : 0]),
  );
  writeSum(g, { carryRow: 3, resultRow: 4, ones }, carries, n + 1, value, n + 1);
  return g;
}

function divGrid(a: string, b: string): { g: Grid; remainder: number } {
  const n = a.length;
  const divisor = Number(b);
  const start = Number(a[0]) >= divisor ? 0 : 1;
  const steps = n - start;
  const { g, row } = grid(n + 3 + steps);
  const first = row(false);
  writeNumber(first, a, n - 1);
  first[n] = { text: ':' };
  first[n + 1] = { text: b };
  first[n + 2] = { text: '=' };
  let value = Number(a.slice(0, start + 1));
  let remainder = 0;
  for (let j = 0; j < steps; j++) {
    const col = start + j;
    if (j > 0) value = remainder * 10 + Number(a[col]);
    const q = Math.floor(value / divisor);
    const product = q * divisor;
    remainder = value - product;
    first[n + 3 + j] = { part: 'quotient', place: steps - 1 - j, step: 0, digit: q, blank: false };
    g.order.push([0, n + 3 + j]);
    const productRow = g.rows.length;
    row(false);
    writeCells(g, productRow, numberCells(product, col >= 1 ? 1 : 0, 'product', j + 1), col, 'ltr');
    const differenceRow = g.rows.length;
    row(true);
    const last = j === steps - 1;
    // The difference, and (but in the last step) the next digit brought down beside it: together
    // the number the next step divides.
    const next = last ? remainder : remainder * 10 + Number(a[col + 1]);
    writeCells(
      g,
      differenceRow,
      numberCells(next, last ? 0 : 1, 'difference', j + 1),
      last ? col : col + 1,
      'ltr',
    );
  }
  return { g, remainder };
}

/** Do the numbers fit the operation? Digits only, no leading zero, the sizes the rules name. */
function operandsFit(op: ColumnOp, ops: readonly string[]): boolean {
  if (!ops.every((o) => /^[1-9][0-9]*$/.test(o) && o.length <= COLUMN_DIGITS_MAX)) return false;
  if (Math.max(...ops.map((o) => o.length)) < 2) return false;
  switch (op) {
    case 'add':
      return ops.length >= 2 && ops.length <= COLUMN_ADDENDS_MAX;
    case 'sub': {
      if (ops.length !== 2) return false;
      const [a, b] = ops as [string, string];
      return a.length > b.length || (a.length === b.length && a > b);
    }
    case 'mul': {
      if (ops.length !== 2) return false;
      const b = ops[1]!;
      return b.length <= COLUMN_FACTOR_DIGITS_MAX && !b.includes('0') && b !== '1';
    }
    case 'div': {
      if (ops.length !== 2) return false;
      const [a, b] = ops as [string, string];
      return b.length === 1 && b !== '1' && Number(a) >= Number(b);
    }
  }
}

/** The grid of a task, its ids and keys — or null when the task fails Regel 0. */
export function columnLayout(task: ColumnCalcTask): ColumnLayout | null {
  const ops = task.operands;
  if (!operandsFit(task.op, ops)) return null;
  let g: Grid;
  let remainder: number | null = null;
  switch (task.op) {
    case 'add':
      g = addGrid(ops);
      break;
    case 'sub':
      g = subGrid(ops[0]!, ops[1]!);
      break;
    case 'mul':
      g = mulGrid(ops[0]!, ops[1]!);
      break;
    case 'div': {
      const built = divGrid(ops[0]!, ops[1]!);
      g = built.g;
      remainder = built.remainder;
      break;
    }
  }
  const keys = new Map<PartId, KeyCell>();
  const rows: ColumnRow[] = g.rows.map((r, ri) => ({
    rule: r.rule,
    cells: r.cells.map((c, ci): ColumnCell => {
      if ('text' in c) return { text: c.text };
      const id = `r${ri}c${ci}`;
      keys.set(id, c);
      return { id, part: c.part, place: c.place, step: c.step };
    }),
  }));
  const order = g.order.map(([r, c]) => `r${r}c${c}`);
  if (rows.length > COLUMN_ROWS_MAX || keys.size > COLUMN_GAPS_MAX || !columnsFit(rows)) {
    return null;
  }
  const [a, b] = ops.map(Number) as [number, number];
  const value =
    task.op === 'add'
      ? ops.reduce((sum, o) => sum + Number(o), 0)
      : task.op === 'sub'
        ? a - b
        : task.op === 'mul'
          ? a * b
          : Math.floor(a / b);
  return {
    view: { type: 'column_calc', op: task.op, rows, order },
    keys,
    result: { value, remainder },
  };
}

/** What is wrong with a written-arithmetic task (stored or built), or null. */
export function columnProblem(task: ColumnCalcTask): ColumnProblem | null {
  if (!operandsFit(task.op, task.operands)) return 'operands';
  return columnLayout(task) === null ? 'too_long' : null;
}

/** The stored task for the model's draft, or null when Regel 0 rejects it. */
export function columnTaskFrom(draft: Pick<z.infer<typeof ColumnDraftBase>, 'op' | 'operands'>) {
  const parsed = ColumnCalcTask.safeParse({
    type: 'column_calc',
    op: draft.op,
    operands: draft.operands,
  });
  if (!parsed.success) return null;
  return columnProblem(parsed.data) === null ? parsed.data : null;
}

const SIGN: Record<ColumnOp, string> = { add: '+', sub: MINUS, mul: TIMES, div: ':' };

/** The calculation and its result as she reads it: "4721 + 1389 = 6110", "673 : 3 = 224 R 1". */
export function columnSolution(task: ColumnCalcTask): string {
  const layout = columnLayout(task);
  const expr = task.operands.join(` ${SIGN[task.op]} `);
  if (!layout) return expr;
  const { value, remainder } = layout.result;
  return `${expr} = ${value}${remainder ? ` R ${remainder}` : ''}`;
}

/** What a hint must not say: the result (and a remainder). */
export function columnSecrets(task: ColumnCalcTask): string[] {
  const layout = columnLayout(task);
  if (!layout) return [];
  const { value, remainder } = layout.result;
  return remainder ? [String(value), String(remainder)] : [String(value)];
}

// ─────────────── her digits, checked ───────────────

/** The first cell that is not right yet, in the order she writes. */
type FirstWrong = { part: ColumnPart; place: number; step: number; missing: boolean };

export type ColumnCheck = {
  type: 'column_calc';
  correct: boolean;
  /** Per cell, in the order she writes them. */
  parts: Array<{ id: PartId; ok: boolean }>;
  first: FirstWrong | null;
  /** Her result in the conversation (`columnResultText`). */
  text: string;
};

/** Her cells against the key; null when a cell is missing, twice, or not one of this grid. */
export function checkColumns(task: ColumnCalcTask, answer: ColumnCalcAnswer): ColumnCheck | null {
  const layout = columnLayout(task);
  if (!layout) return null;
  const given = new Map(answer.cells.map((c) => [c.id, c.digit]));
  if (given.size !== answer.cells.length || given.size !== layout.keys.size) return null;
  if (![...given.keys()].every((id) => layout.keys.has(id))) return null;
  let first: FirstWrong | null = null;
  const parts = layout.view.order.map((id) => {
    const key = layout.keys.get(id)!;
    const digit = given.get(id) ?? '';
    const ok = digit === '' ? key.blank : Number(digit) === key.digit;
    if (!ok && first === null) {
      first = { part: key.part, place: key.place, step: key.step, missing: digit === '' };
    }
    return { id, ok };
  });
  return {
    type: 'column_calc',
    correct: first === null,
    parts,
    first,
    text: columnResultText(layout.view, Object.fromEntries(given)),
  };
}

/** The places as the reply names them ("bei den Zehnern"); a seventh place is the millions. */
const PLACES = [
  'practice.column.place_0',
  'practice.column.place_1',
  'practice.column.place_2',
  'practice.column.place_3',
  'practice.column.place_4',
  'practice.column.place_5',
  'practice.column.place_6',
] as const satisfies readonly MessageKey[];

/** The reply to a grid that is not right yet: the first place, kindly, never its digit. */
export function columnReply(locale: string, check: ColumnCheck): string {
  const first = check.first;
  if (first === null) return t(locale, 'practice.correct');
  const where = t(locale, PLACES[Math.min(first.place, PLACES.length - 1)]!);
  switch (first.part) {
    case 'carry':
      return t(
        locale,
        first.missing ? 'practice.column.carry_missing' : 'practice.column.carry_wrong',
        { at: where },
      );
    case 'result':
      return t(
        locale,
        first.missing ? 'practice.column.digit_missing' : 'practice.column.digit_wrong',
        { at: where },
      );
    case 'partial':
      return t(locale, 'practice.column.partial', { at: where, step: first.step });
    case 'quotient': {
      // Counted from the left, as she reads the quotient: its first digit has the highest place.
      const digits = check.parts.length > 0 ? quotientDigits(check) : 1;
      return t(locale, 'practice.column.quotient', { n: digits - first.place });
    }
    case 'product':
      return t(locale, 'practice.column.product', { step: first.step });
    case 'difference':
      return t(locale, 'practice.column.difference', { step: first.step });
  }
}

/** How many digits the quotient has: one per division step. */
function quotientDigits(check: ColumnCheck): number {
  return check.parts.filter((p) => /^r0c/.test(p.id)).length;
}
