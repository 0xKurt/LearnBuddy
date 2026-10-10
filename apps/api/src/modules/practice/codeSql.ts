// Informatik, databases: one small table and an SQL query (issue #262, docs/architecture.md
// §Informatik). The model writes the table, the task and its own query; code builds the table in
// SQLite (`src/sandbox/sql.ts`), runs the query and takes its rows as the key. The rows the model
// claimed are a probe — when they differ, no question. Her query runs on the same table and its
// rows are compared with the key's: the same rows, in any order — in the key's order only where
// the key itself sorts (an ORDER BY of the whole query).

import type { CodeTask, Figure } from '@learnbuddy/shared-types/contracts';

import { runQuery, type SqlCell, type SqlRun, type SqlTable } from '../../sandbox/sql.js';
import { CODE_COMMON, codeText, type Built } from './codeParts.js';

type SqlTask = Extract<CodeTask, { task: 'sql_query' }>;

/** The most rows a key may have: what a phone shows of a result without scrolling. */
const RESULT_ROWS_MAX = 8;
const NUMBER = /^-?\d+(?:\.\d+)?$/;

/** A cell as the model wrote it, in its column's type; "" is NULL. Null when it does not fit. */
function cellOf(text: string, type: SqlTable['columns'][number]['type']): SqlCell | undefined {
  const raw = text.trim();
  if (raw === '') return null;
  if (type === 'TEXT') return raw;
  if (type === 'INTEGER') return /^-?\d{1,9}$/.test(raw) ? Number(raw) : undefined;
  return NUMBER.test(raw) ? Number(raw) : undefined;
}

/** The table the task describes, or null when a row or a cell does not fit its columns. */
function sqlTableOf(task: SqlTask): SqlTable | null {
  const names = task.columns.map((c) => c.name);
  if (new Set(names).size !== names.length || names.includes(task.table)) return null;
  const rows: SqlCell[][] = [];
  for (const row of task.rows) {
    if (row.length !== task.columns.length) return null;
    const cells = row.map((cell, i) => cellOf(cell, task.columns[i]!.type));
    if (cells.some((c) => c === undefined) || row.some((c) => c.includes('$'))) return null;
    rows.push(cells as SqlCell[]);
  }
  return { name: task.table, columns: task.columns, rows };
}

/** A cell as it is shown: NULL in words, numbers as SQLite gives them. */
function shownCell(cell: SqlCell): string {
  return cell === null ? 'NULL' : String(cell);
}

/** A cell of the key as `code_task.result` stores it: the model's own convention, "" for NULL. */
const storedCell = (cell: SqlCell): string => (cell === null ? '' : String(cell));

/** The table as the question shows it. */
function tableFigure(table: SqlTable): Extract<Figure, { type: 'table' }> {
  return {
    type: 'table',
    header: table.columns.map((c) => c.name),
    rows: table.rows.map((row) => row.map(shownCell)),
  };
}

/**
 * Does the query sort its whole result — an ORDER BY outside every bracket and string? Then the
 * order of its rows is part of the answer; otherwise SQL promises none, and only the rows count.
 */
export function sortsResult(query: string): boolean {
  let flat = query
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""');
  // Brackets from the inside out: a sub-query's ORDER BY says nothing about the result.
  let before = '';
  while (before !== flat) {
    before = flat;
    flat = flat.replace(/\([^()]*\)/g, ' ');
  }
  return /\border\s+by\b/i.test(flat);
}

/**
 * One cell in a form two results can be compared by: numbers by value, text as written, and NULL
 * the same as "" — the way the model writes NULL, and the way the key's rows are stored.
 */
function cellKey(cell: SqlCell | string): string {
  const text = cell === null ? '' : String(cell).trim();
  if (text === '') return 'null';
  if (typeof cell === 'number' || NUMBER.test(text)) {
    const n = Number(text);
    return Number.isFinite(n) ? `n:${Number(n.toPrecision(12))}` : `s:${text}`;
  }
  return `s:${text}`;
}

const rowKey = (row: ReadonlyArray<SqlCell | string>) => row.map(cellKey).join('\u0001');

/** How two results compare: the same, the same rows in another order, or what differs first. */
export type RowsCompared =
  | { same: true }
  | { same: false; at: 'columns' | 'count' | 'order' | 'values'; got: number; want: number };

export function compareRows(
  want: ReadonlyArray<ReadonlyArray<SqlCell | string>>,
  got: ReadonlyArray<ReadonlyArray<SqlCell | string>>,
  ordered: boolean,
): RowsCompared {
  const width = (rows: typeof want) => rows[0]?.length ?? 0;
  if (want.length > 0 && got.length > 0 && width(want) !== width(got)) {
    return { same: false, at: 'columns', got: width(got), want: width(want) };
  }
  if (want.length !== got.length) {
    return { same: false, at: 'count', got: got.length, want: want.length };
  }
  const a = want.map(rowKey);
  const b = got.map(rowKey);
  if (a.every((key, i) => key === b[i])) return { same: true };
  const sameSet = [...a].sort().join('\n') === [...b].sort().join('\n');
  if (sameSet && !ordered) return { same: true };
  return { same: false, at: sameSet ? 'order' : 'values', got: got.length, want: want.length };
}

/** The question an SQL task becomes — or why none. */
export async function sqlItem(task: SqlTask, locale: string): Promise<Built> {
  const table = sqlTableOf(task);
  if (table === null) return { reject: 'bad_table' };
  if (task.statement.includes('$') || task.query.includes('$')) return { reject: 'display' };
  const run = await runQuery(table, task.query);
  if (run.kind !== 'rows') return { reject: 'not_a_query' };
  const width = run.columns.length;
  if (run.rows.length === 0 || run.rows.length > RESULT_ROWS_MAX || width > 5) {
    return { reject: 'result_unusable' };
  }
  if (run.rows.some((row) => row.some((c) => typeof c === 'string' && c.includes('$')))) {
    return { reject: 'result_unusable' };
  }
  // The probe: are the rows the model claimed the rows its query returns?
  if (!compareRows(run.rows, task.result, sortsResult(task.query)).same) {
    return { reject: 'result_disagrees' };
  }
  const query = task.query.trim();
  return {
    item: {
      ...CODE_COMMON,
      code_task: { ...task, query, result: run.rows.map((row) => row.map(storedCell)) },
      kind: 'long',
      prompt: codeText(locale, 'sql_prompt', { table: task.table, statement: task.statement }),
      answer: query,
      topic: codeText(locale, 'topic_sql'),
      difficulty: /\b(group\s+by|join|having)\b/i.test(query) ? 4 : 3,
      figure: tableFigure(table),
      hints: [
        codeText(locale, 'hint_sql_parts'),
        codeText(locale, 'hint_sql_rows', { count: run.rows.length }),
      ],
      worked_solution: codeText(locale, 'worked_sql'),
    },
  };
}

// ─────────────── her query ───────────────

export type SqlCheck =
  | { verdict: 'correct' }
  | {
      verdict: 'partly' | 'wrong';
      fault:
        | { at: 'error'; message: string }
        | { at: 'not_a_query' }
        | { at: 'limit' }
        | { at: 'columns' | 'count' | 'order' | 'values'; got: number; want: number };
    };

/** Her query on the same table, against the key's rows. */
export async function checkSql(task: SqlTask, answer: string): Promise<SqlCheck> {
  const table = sqlTableOf(task);
  // The question was only written for a table that held; a stored one that no longer does is
  // answered like a query that does not run, never judged against nothing.
  if (table === null) return { verdict: 'wrong', fault: { at: 'not_a_query' } };
  const mine: SqlRun = await runQuery(table, answer);
  if (mine.kind === 'error')
    return { verdict: 'wrong', fault: { at: 'error', message: mine.message } };
  if (mine.kind === 'not_a_query') return { verdict: 'wrong', fault: { at: 'not_a_query' } };
  if (mine.kind === 'limit') return { verdict: 'wrong', fault: { at: 'limit' } };
  const compared = compareRows(task.result, mine.rows, sortsResult(task.query));
  if (compared.same) return { verdict: 'correct' };
  return {
    verdict: compared.at === 'order' ? 'partly' : 'wrong',
    fault: { at: compared.at, got: compared.got, want: compared.want },
  };
}

/** The reply to a query that is not right yet, from what really ran. */
export function sqlReply(locale: string, check: SqlCheck): string {
  if (check.verdict === 'correct') return codeText(locale, 'sql_right');
  const f = check.fault;
  switch (f.at) {
    case 'error':
      return codeText(locale, 'sql_error', { message: f.message.slice(0, 160) });
    case 'not_a_query':
      return codeText(locale, 'sql_not_query');
    case 'limit':
      return codeText(locale, 'sql_limit');
    case 'columns':
      return codeText(locale, 'sql_columns', { got: f.got, want: f.want });
    case 'count':
      return codeText(locale, 'sql_count', { got: f.got, want: f.want });
    case 'order':
      return codeText(locale, 'sql_order');
    case 'values':
      return codeText(locale, 'sql_values');
  }
}
