// Postgres access. docs/architecture.md §Data access.
//
// The API talks to Postgres directly (Supabase pooler URL in production) so
// that multi-row changes — a Buddy decision with its reply, memory and plan
// updates, a job claim with its lease — commit atomically or not at all.
// Every query is parameterised; there is no string-built SQL with user data.

import pg from 'pg';

// Keep calendar dates and wall times as strings ("2026-10-02", "17:30");
// JS Date would silently shift them into the server's zone.
pg.types.setTypeParser(1082, (v: string) => v); // date
pg.types.setTypeParser(1083, (v: string) => v.slice(0, 5)); // time → HH:MM
pg.types.setTypeParser(20, (v: string) => Number(v)); // int8 (counters, versions)
pg.types.setTypeParser(1700, (v: string) => Number(v)); // numeric (relevance)

export type Row = Record<string, unknown>;

export interface Db {
  /** All rows. */
  query<R extends Row = Row>(text: string, params?: readonly unknown[]): Promise<R[]>;
  /** Exactly one row, else throws. */
  one<R extends Row = Row>(text: string, params?: readonly unknown[]): Promise<R>;
  /** Zero or one row. */
  maybeOne<R extends Row = Row>(text: string, params?: readonly unknown[]): Promise<R | null>;
  /** Run `fn` in one transaction. Nested calls reuse the outer transaction. */
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

type Queryable = { query: (text: string, params?: unknown[]) => Promise<pg.QueryResult> };

class QueryDb implements Db {
  constructor(
    private readonly runner: Queryable,
    private readonly inTx: boolean,
    private readonly txPool: pg.Pool | null,
  ) {}

  async query<R extends Row = Row>(text: string, params: readonly unknown[] = []): Promise<R[]> {
    const res = await this.runner.query(text, [...params]);
    return res.rows as R[];
  }

  async one<R extends Row = Row>(text: string, params: readonly unknown[] = []): Promise<R> {
    const rows = await this.query<R>(text, params);
    if (rows.length !== 1) throw new Error(`expected exactly one row, got ${rows.length}`);
    return rows[0]!;
  }

  async maybeOne<R extends Row = Row>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<R | null> {
    const rows = await this.query<R>(text, params);
    if (rows.length > 1) throw new Error(`expected at most one row, got ${rows.length}`);
    return rows[0] ?? null;
  }

  async tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    if (this.inTx || !this.txPool) return fn(this);
    const client = await this.txPool.connect();
    try {
      await client.query('begin');
      const result = await fn(new QueryDb(client, true, null));
      await client.query('commit');
      return result;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}

export type PgDb = Db & { close(): Promise<void>; pool: pg.Pool };

export function createDb(connectionString: string, opts: { max?: number } = {}): PgDb {
  const pool = new pg.Pool({
    connectionString,
    max: opts.max ?? 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  // An idle client error (e.g. the pooler closed the connection) must not
  // crash the process; the next query gets a fresh client.
  pool.on('error', () => undefined);
  const db = new QueryDb(pool, false, pool);
  return {
    query: <R extends Row = Row>(text: string, params?: readonly unknown[]) =>
      db.query<R>(text, params),
    one: <R extends Row = Row>(text: string, params?: readonly unknown[]) =>
      db.one<R>(text, params),
    maybeOne: <R extends Row = Row>(text: string, params?: readonly unknown[]) =>
      db.maybeOne<R>(text, params),
    tx: <T>(fn: (inner: Db) => Promise<T>) => db.tx(fn),
    pool,
    close: () => pool.end(),
  };
}

/** Postgres unique_violation. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = err as { code?: string; constraint?: string } | null;
  return !!e && e.code === '23505' && (!constraint || e.constraint === constraint);
}
