// SQL for the Informatik questions (issue #262, docs/architecture.md §Informatik): SQLite's own
// WebAssembly build (@sqlite.org/sqlite-wasm, Apache-2.0), one in-memory database per run.
//
// SQLite in WebAssembly reaches no file and no network — its only world is the memory of its
// WebAssembly instance — and every query runs under the defences SQLite documents for SQL it does
// not trust (https://sqlite.org/security.html):
//   · an authorizer that allows reading and nothing else: no INSERT, UPDATE, DELETE, no CREATE,
//     DROP, ATTACH, PRAGMA — refused at compile time;
//   · a progress handler that interrupts the query past its deadline (a recursive CTE that never
//     ends is a limit, not a hang);
//   · length limits on strings, blobs, the statement and its nesting, and a hard heap limit;
//   · no extension loading (the build has none).
// The table is created and filled by THIS code from the checked task, before the authorizer is
// set; the learner's text only ever runs as one read-only statement against it.

import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

/** A cell as the task stores it and the result reports it. */
export type SqlCell = string | number | null;

type SqlType = 'INTEGER' | 'REAL' | 'TEXT';

export type SqlTable = {
  name: string;
  columns: ReadonlyArray<{ name: string; type: SqlType }>;
  rows: ReadonlyArray<ReadonlyArray<SqlCell>>;
};

export type SqlRun =
  | { kind: 'rows'; columns: string[]; rows: SqlCell[][] }
  /** SQLite refused or failed the statement; `message` is SQLite's own text. */
  | { kind: 'error'; message: string }
  /** It writes, or is more than one statement, or returns no rows at all (not a query). */
  | { kind: 'not_a_query' }
  | { kind: 'limit'; limit: 'time' | 'size' };

/** How long one query may run; a school query over ten rows takes well under a millisecond. */
const SQL_DEADLINE_MS = 500;
/** More result rows than any question shows: past it the query is a limit, not an answer. */
const SQL_ROWS_MAX = 200;
const HEAP_BYTES = 32 * 1024 * 1024;

type Sqlite = Awaited<ReturnType<typeof sqlite3InitModule>>;
let engine: Promise<Sqlite> | null = null;

async function start(): Promise<Sqlite> {
  const sqlite3 = await sqlite3InitModule();
  // Its warnings would print SQLite's error text (and so her statement) into the server log.
  sqlite3.config.warn = () => undefined;
  sqlite3.config.error = () => undefined;
  // Process-wide: no query of any learner can make SQLite hold more than this.
  const db = new sqlite3.oo1.DB(':memory:', 'c');
  try {
    db.exec(`pragma hard_heap_limit = ${HEAP_BYTES}`);
  } finally {
    db.close();
  }
  return sqlite3;
}

function sqlite(): Promise<Sqlite> {
  engine ??= start();
  return engine;
}

const quoted = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** A value as it leaves SQLite: numbers stay numbers, text stays text, a blob is never one. */
function cellOf(value: unknown): SqlCell {
  if (value === null || typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'bigint') {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }
  return '';
}

/** Runs one read-only statement against a fresh database holding `table`. */
export async function runQuery(table: SqlTable, query: string): Promise<SqlRun> {
  const sqlite3 = await sqlite();
  const { capi } = sqlite3;
  const db = new sqlite3.oo1.DB(':memory:', 'c');
  try {
    // ── the table, by this code ──
    const columns = table.columns.map((c) => `${quoted(c.name)} ${c.type}`).join(', ');
    db.exec(`create table ${quoted(table.name)} (${columns})`);
    const marks = table.columns.map(() => '?').join(', ');
    const insert = db.prepare(`insert into ${quoted(table.name)} values (${marks})`);
    try {
      for (const row of table.rows) {
        insert.bind([...row]).stepReset();
      }
    } finally {
      insert.finalize();
    }

    // ── from here on, her statement: read only, limited ──
    // Short on purpose (PR #536 review): one function call is ONE step for the progress handler,
    // and `instr` over two 100 000-character strings took a second — per row. At 2 000 characters
    // (a school table's cells hold 30) a call takes well under a millisecond. A LIKE/GLOB pattern
    // recurses per wildcard: thousands of them overflowed the HOST stack inside the WebAssembly.
    capi.sqlite3_limit(db, capi.SQLITE_LIMIT_LENGTH, 2_000);
    capi.sqlite3_limit(db, capi.SQLITE_LIMIT_LIKE_PATTERN_LENGTH, 100);
    capi.sqlite3_limit(db, capi.SQLITE_LIMIT_SQL_LENGTH, 4_000);
    capi.sqlite3_limit(db, capi.SQLITE_LIMIT_EXPR_DEPTH, 100);
    capi.sqlite3_limit(db, capi.SQLITE_LIMIT_COMPOUND_SELECT, 20);
    capi.sqlite3_limit(db, capi.SQLITE_LIMIT_ATTACHED, 0);
    capi.sqlite3_limit(db, capi.SQLITE_LIMIT_VARIABLE_NUMBER, 0);
    const allowed: number[] = [
      capi.SQLITE_SELECT,
      capi.SQLITE_READ,
      capi.SQLITE_FUNCTION,
      capi.SQLITE_RECURSIVE,
    ];
    capi.sqlite3_set_authorizer(
      db,
      (_arg, action) => (allowed.includes(action) ? capi.SQLITE_OK : capi.SQLITE_DENY),
      0,
    );
    const deadline = Date.now() + SQL_DEADLINE_MS;
    capi.sqlite3_progress_handler(db, 100, () => (Date.now() > deadline ? 1 : 0), 0);

    const statements: string[] = [];
    const names: string[] = [];
    const rows: SqlCell[][] = [];
    let tooMany = false;
    try {
      db.exec({
        sql: query,
        saveSql: statements,
        columnNames: names,
        rowMode: 'array',
        callback: (row: unknown[]) => {
          if (rows.length >= SQL_ROWS_MAX) {
            tooMany = true;
            return false;
          }
          rows.push(row.map(cellOf));
          return undefined;
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/SQLITE_INTERRUPT/.test(message)) return { kind: 'limit', limit: 'time' };
      if (/SQLITE_(TOOBIG|NOMEM)/.test(message)) return { kind: 'limit', limit: 'size' };
      if (/SQLITE_AUTH/.test(message)) return { kind: 'not_a_query' };
      return {
        kind: 'error',
        message: message.replace(/^SQLITE_\w+: sqlite3 result code \d+: /, ''),
      };
    }
    if (tooMany) return { kind: 'limit', limit: 'size' };
    if (statements.length !== 1 || names.length === 0) return { kind: 'not_a_query' };
    return { kind: 'rows', columns: names, rows };
  } finally {
    db.close();
  }
}
