// Tabelle ausfüllen (issue #230): a table, some of whose cells are gaps she fills in.
// docs/architecture.md §Practice ("Structured items").
//
// Both directions of #224's "Regel 0", in code:
//
//   1. What the MODEL wrote is checked before it is stored. Always the structure — sizes,
//      one heading per column, at least one gap, every gap a key, no word key standing in its
//      own heading or row label. And where code can recompute a table, it does, and a table
//      that does not add up gives no question (nothing is repaired, as in `keyCheck.ts`):
//        values — every value is the declared function at its x (`shared-math` compiles it);
//        wall   — a number wall: every brick is the sum of the two under it;
//        totals — a two-way table (Vierfeldertafel): the last column and the last row are the
//                 sums of their row and column.
//      Truth tables are not recomputed yet: they are stored after the structural checks only,
//      like a conjugation table.
//   2. What SHE typed is checked cell by cell with the rules every other answer goes
//      through (`ruleCheck` in evaluate.ts: numbers, written words with their near misses,
//      terms), and a term that is not the key's text by its value (`checkPath`, steps.ts).
//      A table cell is CLOSED: it holds exactly its key and the spellings listed with it,
//      so a cell no rule calls right or nearly right is not right yet. No cell ever goes to a
//      model — 0 model calls per answer.
//
// The model writes the table with every value in it and marks the gaps; code names the gaps
// (ids by position, CLAUDE.md rule 2), decides how each is typed in (math keys or keyboard)
// and keeps the keys in `items.task`. The view (`ItemView.task_view`) never carries a key.

import {
  StructuredTask,
  TABLE_ALSO_MAX,
  TABLE_CELL_MAX,
  TABLE_COLS_MAX,
  TABLE_ROWS_MAX,
  TableFamily,
  TableXIn,
  WALL_ROWS_MAX,
  WALL_ROWS_MIN,
  type PartId,
  type TableFillAnswer,
  type TableFillTask,
  type TableFillTaskView,
  type TableGapCell,
  type TableInput,
  type TableTaskCell,
} from '@learnbuddy/shared-types/contracts';
import {
  compileExpression,
  isMathText,
  parseCanonicalKey,
  plainMath,
  type Exact,
} from '@learnbuddy/shared-math';
import { z } from 'zod';

import { t } from '../../i18n/index.js';
import { sameness } from './arrange.js';
import { dollarMathRuns } from './dollarMath.js';
import { compareWithKeys, NEAR_MISS, ruleCheck, type ItemForCheck } from './evaluate.js';
import { ItemDraft } from './items.js';
import { checkPath } from './steps.js';

/** How the values of a row stand next to each other when read as one text. */
export const TABLE_JOIN = ' · ';

/** `items.answer` holds at most this much (0001_baseline.sql); a longer solution is no task. */
const ANSWER_MAX = 1000;

// ─────────────── what the model may write ───────────────

/**
 * What the generator and the photo reading are told about tables. Exact and minimal, and
 * deliberately without an example sentence: models copy examples (repo convention).
 */
export const TABLE_RULES = `Table tasks ("structured", type "table_fill"): only when the learner fills in several cells of ONE table — a value table, a number wall, a two-way table with totals, a conjugation or declension table, a comparison table. At most ${TABLE_COLS_MAX} columns and ${TABLE_ROWS_MAX} rows. header: the column headings (null only for a number wall). rows: top to bottom, one cell per heading; a cell is {text, gap, also}: text is what the cell holds — for a gap its one correct answer; gap true for each cell the learner fills in; also: up to ${TABLE_ALSO_MAX} other spellings a teacher accepts for that gap. Every gap has one short answer (a number, a word form, a short term) that is checked by comparison, never a sentence or an opinion; at least one cell stays visible. family: "values" when the values are a function of x — fn is that function in x in plain notation (* for times, ^ for powers) and x_in is "header" (the x values are the headings after the first, one row of values) or "first_column" (two columns: x, then the value); "wall" for a number wall — header null, the first row is the top brick, row k has k bricks, every brick the sum of the two under it; "totals" when the last column and the last row are the sums of their row and column and the first column names the rows; null for every other table. A declared family is recomputed by the app, and a table that does not add up is dropped; the prompt says what to fill in and never lists the answers.`;

const DraftCell = z.object({
  text: z
    .string()
    .trim()
    .max(TABLE_CELL_MAX)
    .describe('What the cell holds; for a gap its one correct answer'),
  gap: z.boolean().default(false).describe('True for a cell the learner fills in'),
  also: z
    .array(z.string().trim().min(1).max(TABLE_CELL_MAX))
    .max(TABLE_ALSO_MAX)
    .default([])
    .describe('Only for a gap: other spellings a teacher accepts'),
});
type DraftCell = z.infer<typeof DraftCell>;

/** The model's table: every value written in, the gaps marked; nothing about ids or input. */
export const TableDraftBase = z.object({
  type: z.literal('table_fill'),
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(600)
    .describe('The instruction: what to fill in; never the answers'),
  header: z
    .array(z.string().trim().max(TABLE_CELL_MAX))
    .max(TABLE_COLS_MAX * 2)
    .nullable()
    .describe('Column headings; null only for a number wall'),
  // Room above the bounds, so a table that is too big parses and is then REJECTED (Regel 0)
  // instead of failing the whole answer.
  rows: z
    .array(z.array(DraftCell).max(TABLE_COLS_MAX * 2))
    .max(TABLE_ROWS_MAX * 2)
    .describe(`At most ${TABLE_ROWS_MAX} rows, top to bottom`),
  family: TableFamily.nullable()
    .default(null)
    .describe('values | wall | totals when the app can recompute the table; else null'),
  fn: z
    .string()
    .trim()
    .max(120)
    .nullable()
    .default(null)
    .describe('Only for family "values": the function in x, plain notation'),
  x_in: TableXIn.nullable()
    .default(null)
    .describe('Only for family "values": where the x values stand'),
  topic: ItemDraft.shape.topic,
  difficulty: ItemDraft.shape.difficulty,
  prompt_lang: ItemDraft.shape.prompt_lang,
});
export type TableDraft = z.infer<typeof TableDraftBase>;

// ─────────────── Regel 0: what the model wrote, checked ───────────────

/** Why a table is not stored. Each one is a test (`__tests__/table.test.ts`). */
export type TableProblem =
  /** Too many rows or columns, a row without one cell per heading, a wall not a triangle. */
  | 'table_shape'
  /** No gap at all: nothing to fill in. */
  | 'no_gaps'
  /** Nothing visible either: a table of gaps only says nothing. */
  | 'all_gaps'
  /** A gap whose key (or an accepted spelling) is empty once markup is set aside. */
  | 'empty_key'
  /** A word gap whose key stands in its own column heading or row label. */
  | 'key_shown'
  /** A declared family the table does not fit: no function, a cell that is no number … */
  | 'family_shape'
  /** A value of a value table that is not the function at its x. */
  | 'values_mismatch'
  /** A brick of a number wall that is not the sum of the two under it. */
  | 'wall_mismatch'
  /** A row or column total that is not the sum of its cells. */
  | 'totals_mismatch'
  /** The solution as she reads it does not fit `items.answer`. */
  | 'too_long';

function isGap(cell: TableTaskCell): cell is TableGapCell {
  return 'id' in cell;
}

/** What a cell holds: the text she reads, or the key of a gap. */
function valueText(cell: TableTaskCell): string {
  return isGap(cell) ? cell.key : cell.text;
}

/** The server's id of the gap in row r, column c (0-based): it says where, never what. */
export function gapId(row: number, col: number): PartId {
  return `r${row}c${col}`;
}

/** The gaps in reading order (row by row, left to right), with where they stand. */
function gapsOf(task: TableFillTask): Array<{ gap: TableGapCell; row: number; col: number }> {
  return task.rows.flatMap((cells, row) =>
    cells.flatMap((cell, col) => (isGap(cell) ? [{ gap: cell, row, col }] : [])),
  );
}

/** One written number, exactly, with its unit — or null when the text is not one. */
function numberIn(
  text: string,
): { exact: Exact; value: number; decimals: number; unit: string | null } | null {
  const n = parseCanonicalKey(text);
  if (n.exact === null || n.value === null || n.form === null || n.form === 'expression')
    return null;
  if (n.has_residue) return null;
  return {
    exact: n.exact,
    value: n.value,
    decimals: n.form === 'decimal' ? n.decimals : 0,
    unit: n.unit,
  };
}

function sum(a: Exact, b: Exact): Exact {
  return { num: a.num * b.den + b.num * a.den, den: a.den * b.den };
}

function equal(a: Exact, b: Exact): boolean {
  return a.num * b.den === b.num * a.den;
}

/** Every cell of these as a number with one shared unit, or null. */
function numbersOf(cells: readonly TableTaskCell[]): Exact[] | null {
  const out: Exact[] = [];
  const units = new Set<string | null>();
  for (const cell of cells) {
    const n = numberIn(valueText(cell));
    if (!n) return null;
    out.push(n.exact);
    units.add(n.unit);
  }
  return units.size > 1 ? null : out;
}

/** Does a written value state f(x)? To the value's own rounding (decision D-1), else exactly. */
function statesValue(written: string, expected: number): boolean {
  const y = numberIn(written);
  if (!y || !Number.isFinite(expected)) return false;
  if (y.decimals > 0) return Math.abs(y.value - expected) < 0.5 * 10 ** -y.decimals + 1e-9;
  return Math.abs(y.value - expected) <= 1e-9 * Math.max(1, Math.abs(expected));
}

function valuesProblem(task: TableFillTask): TableProblem | null {
  const header = task.header;
  const f = task.fn === null ? null : compileExpression(plainMath(task.fn));
  if (!f || header === null || task.x_in === null) return 'family_shape';
  const pairs: Array<{ x: string; y: string }> = [];
  if (task.x_in === 'header') {
    // One row of values under the x in the headings; its first cell names it ("f(x)").
    if (task.rows.length !== 1 || header.length < 3) return 'family_shape';
    const row = task.rows[0]!;
    if (isGap(row[0]!)) return 'family_shape';
    for (let c = 1; c < header.length; c++) pairs.push({ x: header[c]!, y: valueText(row[c]!) });
  } else {
    // Two columns: x, then its value.
    if (header.length !== 2 || task.rows.length < 2) return 'family_shape';
    for (const row of task.rows) pairs.push({ x: valueText(row[0]!), y: valueText(row[1]!) });
  }
  for (const { x, y } of pairs) {
    const at = numberIn(x);
    if (!at || at.unit !== null || numberIn(y) === null) return 'family_shape';
    if (!statesValue(y, f(at.value))) return 'values_mismatch';
  }
  return null;
}

function wallProblem(task: TableFillTask): TableProblem | null {
  const rows = task.rows.map((r) => numbersOf(r));
  if (rows.some((r) => r === null)) return 'family_shape';
  const n = rows as Exact[][];
  for (let r = 0; r + 1 < n.length; r++) {
    for (let c = 0; c < n[r]!.length; c++) {
      if (!equal(n[r]![c]!, sum(n[r + 1]![c]!, n[r + 1]![c + 1]!))) return 'wall_mismatch';
    }
  }
  return null;
}

function totalsProblem(task: TableFillTask): TableProblem | null {
  const header = task.header;
  // At least two rows and two columns of numbers, each with its total, and the row labels.
  if (header === null || header.length < 4 || task.rows.length < 3) return 'family_shape';
  if (task.rows.some((r) => isGap(r[0]!))) return 'family_shape';
  const body = task.rows.map((r) => numbersOf(r.slice(1)));
  if (body.some((r) => r === null)) return 'family_shape';
  const n = body as Exact[][];
  const width = n[0]!.length;
  const zero: Exact = { num: 0n, den: 1n };
  for (const row of n) {
    const parts = row.slice(0, width - 1).reduce(sum, zero);
    if (!equal(parts, row[width - 1]!)) return 'totals_mismatch';
  }
  for (let c = 0; c < width; c++) {
    const parts = n.slice(0, -1).reduce((acc, row) => sum(acc, row[c]!), zero);
    if (!equal(parts, n[n.length - 1]![c]!)) return 'totals_mismatch';
  }
  return null;
}

/** What is wrong with a table task, or null when it holds together. */
export function tableProblem(task: TableFillTask): TableProblem | null {
  const { header, rows } = task;
  if (rows.length < 1 || rows.length > TABLE_ROWS_MAX) return 'table_shape';
  if (task.family === 'wall') {
    if (header !== null || rows.length < WALL_ROWS_MIN || rows.length > WALL_ROWS_MAX) {
      return 'table_shape';
    }
    if (rows.some((r, i) => r.length !== i + 1)) return 'table_shape';
  } else {
    if (header === null || header.length < 1 || header.length > TABLE_COLS_MAX) {
      return 'table_shape';
    }
    if (rows.some((r) => r.length !== header.length)) return 'table_shape';
  }

  const gaps = gapsOf(task);
  if (gaps.length === 0) return 'no_gaps';
  // The ids are positions the server gave; a stored task with any other id is not this task.
  if (gaps.some(({ gap, row, col }) => gap.id !== gapId(row, col))) return 'table_shape';
  const shown = rows.flat().filter((c) => !isGap(c) && sameness(c.text) !== '');
  if (shown.length === 0) return 'all_gaps';
  for (const { gap, row, col } of gaps) {
    if ([gap.key, ...gap.also].some((k) => sameness(k) === '')) return 'empty_key';
    if (gap.input !== inputFor(gap.key)) return 'table_shape';
    // A word answer that already stands in what names its cell gives itself away. Numbers
    // are left alone: in a value table of f(x) = x² the 1 under x = 1 is right, not shown.
    if (gap.input === 'text') {
      const key = sameness(gap.key);
      const label = rows[row]![0]!;
      const names = [header?.[col] ?? '', col > 0 && !isGap(label) ? label.text : ''];
      if (names.some((n) => sameness(n) === key)) return 'key_shown';
    }
  }

  // Only a value table has a function.
  if ((task.family === 'values') !== (task.fn !== null && task.x_in !== null)) {
    return 'family_shape';
  }
  const family =
    task.family === 'values'
      ? valuesProblem(task)
      : task.family === 'wall'
        ? wallProblem(task)
        : task.family === 'totals'
          ? totalsProblem(task)
          : null;
  if (family) return family;
  return tableSolution(task).length > ANSWER_MAX ? 'too_long' : null;
}

// ─────────────── from the model's draft to a stored task ───────────────

/** Is this key a number (the math keys, and the numeric rules)? */
function isNumberKey(key: string): boolean {
  return numberIn(key) !== null;
}

/** How a gap is typed in, from its key alone: math keys for a number or a term. */
export function inputFor(key: string): TableInput {
  return isNumberKey(key) || isMathText(key) ? 'math' : 'text';
}

function cellFrom(cell: DraftCell, row: number, col: number): TableTaskCell {
  const text = dollarMathRuns(cell.text);
  if (!cell.gap) return { text };
  return {
    id: gapId(row, col),
    key: text,
    also: cell.also.map((a) => dollarMathRuns(a)),
    input: inputFor(text),
  };
}

/**
 * The stored task for a table the model wrote, or null when Regel 0 rejects it. Exported for
 * the tests, which also build tasks by hand to reach every rejection.
 */
export function tableTaskFrom(
  draft: Pick<TableDraft, 'header' | 'rows' | 'family' | 'fn' | 'x_in'>,
): TableFillTask | null {
  const values = draft.family === 'values';
  const task = {
    type: 'table_fill' as const,
    // An empty list of headings is no heading (a number wall has none).
    header:
      draft.header === null || draft.header.length === 0
        ? null
        : draft.header.map((h) => dollarMathRuns(h)),
    rows: draft.rows.map((cells, r) => cells.map((cell, c) => cellFrom(cell, r, c))),
    family: draft.family,
    // A function or an x position beside another family says nothing that is checked.
    fn: values ? draft.fn : null,
    x_in: values ? draft.x_in : null,
  };
  const parsed = StructuredTask.safeParse(task);
  if (!parsed.success || parsed.data.type !== 'table_fill') return null;
  return tableProblem(parsed.data) === null ? parsed.data : null;
}

/** What names a row in a sentence: its first cell, when that is a label she can read. */
function rowLabel(task: TableFillTask, row: number, col: number): string | null {
  if (task.family === 'wall' || col === 0) return null;
  const first = task.rows[row]![0]!;
  return isGap(first) || first.text.trim() === '' ? null : first.text;
}

/** The solution as she reads it, row by row: "ich: gehe, ging · du: gehst, gingst". */
export function tableSolution(task: TableFillTask): string {
  return task.rows
    .flatMap((cells, row) => {
      const keys = cells.flatMap((c) => (isGap(c) ? [c.key] : []));
      if (keys.length === 0) return [];
      const label = rowLabel(task, row, 1);
      return [label === null ? keys.join(', ') : `${label}: ${keys.join(', ')}`];
    })
    .join(TABLE_JOIN);
}

/** What a hint must not give away: any one key that is not already visible. */
export function tableKeys(task: TableFillTask): string[] {
  return gapsOf(task).map(({ gap }) => gap.key);
}

/** The visible text of the table, as a hint's "task" (a key that stands there is no secret). */
export function tableShownText(task: TableFillTask): string {
  return [
    ...(task.header ?? []),
    ...task.rows.flat().flatMap((c) => (isGap(c) ? [] : [c.text])),
  ].join(' ');
}

/**
 * Every form of a gap's key is a whole number (#239, #286 finding 5): the phone's digits write
 * it. A fraction, a decimal or a term anywhere among its forms keeps the keys that write those.
 */
function wholeKey(forms: readonly string[]): boolean {
  return forms.every((form) => {
    const k = parseCanonicalKey(plainMath(form));
    return k.exact !== null && k.exact.den === 1n && k.form === 'integer' && k.unit === null;
  });
}

/** What the app shows: the table without its keys. */
export function tableView(task: TableFillTask): TableFillTaskView {
  return {
    type: 'table_fill',
    header: task.header,
    rows: task.rows.map((cells) =>
      cells.map((c) =>
        isGap(c)
          ? { id: c.id, input: c.input, whole: c.input === 'math' && wholeKey([c.key, ...c.also]) }
          : { text: c.text },
      ),
    ),
    layout: task.family === 'wall' ? 'wall' : 'grid',
  };
}

// ─────────────── Regel 0: her answer, checked cell by cell ───────────────

/** What the subject says about spelling (decision D-2), for the word cells. */
export type CellContext = Pick<ItemForCheck, 'spelling' | 'subject_kind'>;

export type CellVerdict = 'right' | 'near' | 'wrong';

/** A gap that is not right yet, and what names it in a sentence. */
export type TableMiss = {
  id: PartId;
  /** 1-based, as she counts. */
  row: number;
  col: number;
  row_label: string | null;
  col_label: string | null;
  near: boolean;
};

export type TableCheck = {
  type: 'table_fill';
  correct: boolean;
  parts: Array<{ id: PartId; ok: boolean }>;
  right: number;
  total: number;
  wall: boolean;
  misses: TableMiss[];
};

/**
 * One cell against its key, with the rules every answer goes through. `amount`: the table is
 * one code recomputed (a value table, a wall, totals), so a cell asks for an amount and any
 * way of writing it is that amount (as for #162's bar tasks); otherwise another form of the
 * right value — or a term that has the key's value everywhere but is written otherwise — is
 * nearly right, not right (decision D-3).
 */
export function cellVerdict(
  gap: TableGapCell,
  typed: string,
  ctx: CellContext,
  amount: boolean,
): CellVerdict {
  const text = typed.trim();
  if (text === '') return 'wrong';
  const numeric = isNumberKey(gap.key);
  const kind: ItemForCheck['kind'] = numeric
    ? 'numeric'
    : isMathText(gap.key)
      ? 'formula'
      : 'short';
  const item: ItemForCheck = {
    kind,
    answer: gap.key,
    accepted_answers: gap.also,
    unit: null,
    choices: null,
    correct_choice: null,
    tolerance: null,
    spelling: ctx.spelling,
    subject_kind: ctx.subject_kind,
    form_free: amount,
  };
  const verdict = ruleCheck(item, { text, choice: null });
  // 'folded' is the same answer up to case, ß or punctuation where spelling is not the
  // point (D-2): the subject says it does not matter, so it is right here.
  if (verdict === 'correct' || verdict === 'folded') return 'right';
  // 'other_form' (#227): the right value, written another way — the column asks for a form,
  // so it is nearly right, never wrong (in a recomputed table `form_free` made it right).
  if (NEAR_MISS.has(verdict) || verdict === 'other_form') return 'near';
  if (verdict !== 'unknown') return 'wrong';
  if (numeric) return compareWithKeys(item, text) === 'equal' ? 'near' : 'wrong';
  if (kind === 'formula') {
    // The key's term and hers as a two-line path: "sound" means the same value at every
    // probe point (steps.ts) — the same term, written another way.
    const same = [gap.key, ...gap.also].some(
      (k) => checkPath(`${plainMath(k)}\n${text}`).kind === 'sound',
    );
    if (same) return amount ? 'right' : 'near';
  }
  return 'wrong';
}

/**
 * Her cells against the keys, or null when the answer does not fit the table (a gap missing,
 * twice or empty, an id that is not there) — refused as invalid input, never graded.
 */
export function checkTable(
  task: TableFillTask,
  answer: TableFillAnswer,
  ctx: CellContext,
): TableCheck | null {
  const gaps = gapsOf(task);
  const typed = new Map<string, string>();
  for (const cell of answer.cells) {
    if (typed.has(cell.id) || cell.text.trim() === '') return null;
    typed.set(cell.id, cell.text);
  }
  if (typed.size !== gaps.length || !gaps.every(({ gap }) => typed.has(gap.id))) return null;
  const amount = task.family !== null;
  const misses: TableMiss[] = [];
  const parts = gaps.map(({ gap, row, col }) => {
    const verdict = cellVerdict(gap, typed.get(gap.id) ?? '', ctx, amount);
    if (verdict !== 'right') {
      misses.push({
        id: gap.id,
        row: row + 1,
        col: col + 1,
        row_label: rowLabel(task, row, col),
        col_label: task.header?.[col]?.trim() || null,
        near: verdict === 'near',
      });
    }
    return { id: gap.id, ok: verdict === 'right' };
  });
  return {
    type: 'table_fill',
    correct: misses.length === 0,
    parts,
    right: parts.length - misses.length,
    total: parts.length,
    wall: task.family === 'wall',
    misses,
  };
}

/** Her answer as it stands in the conversation: her cells in reading order. */
export function tableAnswerText(task: TableFillTask, answer: TableFillAnswer): string {
  const typed = new Map(answer.cells.map((c) => [c.id, c.text.trim()]));
  return gapsOf(task)
    .map(({ gap }) => typed.get(gap.id) ?? '')
    .join(TABLE_JOIN);
}

/** A cell named so she finds it: by its labels where it has them, else by its place. */
function cellName(locale: string, miss: TableMiss, wall: boolean): string {
  if (wall) return t(locale, 'practice.table.brick', { row: miss.row, n: miss.col });
  if (miss.row_label !== null && miss.col_label !== null) {
    return t(locale, 'practice.table.cell', { row: miss.row_label, column: miss.col_label });
  }
  if (miss.col_label !== null) {
    return t(locale, 'practice.table.cell_in_column', { row: miss.row, column: miss.col_label });
  }
  return t(locale, 'practice.table.cell_at', { row: miss.row, column: miss.col });
}

/** "a, b und c" in her language. */
function listed(locale: string, names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} ${t(locale, 'practice.table.and')} ${names.at(-1)}`;
}

/** At most this many cells are named; the rest are counted. */
const NAMED = 3;

/**
 * The reply to a table that is not right yet: how many cells are right, and which to look at
 * again — kindly, and never through a model.
 *
 * Cells that are only NEARLY right (a slip, another form of the right value, a missing accent)
 * are said as what they are: "fehlt nur noch eine Kleinigkeit". A table where nothing is right
 * yet but everything that is off is nearly right never hears "keins der Felder stimmt" — that
 * would be true to the letter and wrong about her work (#224, review of #230).
 */
export function tableReply(locale: string, check: TableCheck): string {
  const names = check.misses.map((m) => cellName(locale, m, check.wall));
  const allNear = check.misses.length > 0 && check.misses.every((m) => m.near);
  if (check.right === 0 && !allNear) {
    return t(locale, 'practice.table.none_right', { cell: names[0] ?? '' });
  }
  const opening =
    check.right === 0
      ? t(locale, 'practice.table.almost')
      : t(locale, 'practice.table.right', { count: check.right, total: check.total });
  if (check.misses.length === 1) {
    const one = check.misses[0]!;
    return `${opening} ${t(locale, one.near ? 'practice.table.near_one' : 'practice.table.look_one', { cell: names[0]! })}`;
  }
  if (names.length <= NAMED) {
    return `${opening} ${t(locale, allNear ? 'practice.table.near_many' : 'practice.table.look_many', { cells: listed(locale, names) })}`;
  }
  return `${opening} ${t(
    locale,
    allNear ? 'practice.table.near_more' : 'practice.table.look_more',
    {
      cells: names.slice(0, NAMED - 1).join(', '),
      more: names.length - (NAMED - 1),
    },
  )}`;
}
