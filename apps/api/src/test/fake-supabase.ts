// In-memory Supabase fake for route tests.
//
// Implements only the surface the routes actually call: `auth.signUp`,
// `auth.getUser`, and the chainable `from(table).select/.insert/.update/.eq/.is/.in/.order/.single/.maybeSingle`.
// Add behavior as new routes need it — do not grow this beyond what's used.
//
// Returned errors mirror Supabase shape (`{ message, status?, code? }`) so the
// route layer's branching (e.g. unique-violation `23505`) exercises the same
// branches as it would in production.
//
// Surface extensions (slice B2):
//   - `in(col, vals)` — IN-list filter used by subjects→folders/materials batch lookups.
//   - `order(col, opts)` — no-op chain; handlers that need ordering re-sort in JS.
//   - List-mode await — `await supabase.from('x').select().eq(...)` (no `.single`/`.maybeSingle`)
//     resolves to `{ data: FakeRow[], error: null }`, matching PostgREST's behavior.
//
// Surface extensions (slice C2):
//   - `storage.from(bucket).createSignedUploadUrl(path)` — returns a
//     deterministic fake PUT URL so the upload-url route exercises end-to-end.
//   - The fake's insert path already supports `.select('*').single()` chaining
//     because `.select()` doesn't reset `.op`; we rely on that for materials.

import type { Deps } from '../lib/deps.js';
import type { Env } from '../lib/env.js';
import { FakeLlmGateway } from './fake-llm.js';

export type FakeUser = { id: string; email: string };
export type FakeRow = Record<string, unknown>;
type FakeError = { message: string; status?: number; code?: string };
type Outcome<T> = { data: T; error: null } | { data: null; error: FakeError };

type FilterOp = 'eq' | 'is' | 'in' | 'gte' | 'lte' | 'gt' | 'lt';

export class FakeQuery {
  private filters: Array<[FilterOp, string, unknown]> = [];
  private op: {
    kind: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
    values?: unknown;
    cols?: string;
    onConflict?: string;
  } = { kind: 'select' };
  private limitN: number | null = null;

  constructor(
    private store: FakeSupabase,
    private table: string,
  ) {}

  /** Whether `.select(...)` was called after a mutation. Real PostgREST
   *  returns the affected rows when the `RETURNING` clause is requested via
   *  `.select(...)` after `.insert`/`.update`; the fake mirrors that. */
  private selectAfterMutation = false;

  select(cols = '*'): this {
    this.op.cols = cols;
    if (this.op.kind !== 'select') this.selectAfterMutation = true;
    return this;
  }
  insert(values: unknown): this {
    this.op = { kind: 'insert', values };
    return this;
  }
  update(values: unknown): this {
    this.op = { kind: 'update', values };
    return this;
  }
  upsert(values: unknown, opts?: { onConflict?: string }): this {
    this.op = { kind: 'upsert', values, onConflict: opts?.onConflict };
    return this;
  }
  delete(): this {
    this.op = { kind: 'delete' };
    return this;
  }
  eq(col: string, val: unknown): this {
    this.filters.push(['eq', col, val]);
    return this;
  }
  is(col: string, val: unknown): this {
    this.filters.push(['is', col, val]);
    return this;
  }
  in(col: string, vals: readonly unknown[]): this {
    this.filters.push(['in', col, vals]);
    return this;
  }
  gte(col: string, val: unknown): this {
    this.filters.push(['gte', col, val]);
    return this;
  }
  lte(col: string, val: unknown): this {
    this.filters.push(['lte', col, val]);
    return this;
  }
  gt(col: string, val: unknown): this {
    this.filters.push(['gt', col, val]);
    return this;
  }
  lt(col: string, val: unknown): this {
    this.filters.push(['lt', col, val]);
    return this;
  }
  // PostgREST exposes `.order()` for server-side sorting. The fake doesn't
  // need to actually sort — handlers that depend on order re-sort in JS — so
  // we accept the call and return `this` to keep the chain unbroken.
  order(_col: string, _opts?: { ascending?: boolean }): this {
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  private match(row: FakeRow): boolean {
    return this.filters.every(([op, col, val]) => {
      if (op === 'eq') return row[col] === val;
      // `is(col, null)` in PostgREST means "WHERE col IS NULL", which includes
      // rows where the column was never set. Mirror that with == null.
      if (op === 'is') return val === null ? row[col] == null : row[col] === val;
      if (op === 'in') return (val as readonly unknown[]).includes(row[col]);
      if (op === 'gte') return (row[col] as string | number) >= (val as string | number);
      if (op === 'lte') return (row[col] as string | number) <= (val as string | number);
      if (op === 'gt') return (row[col] as string | number) > (val as string | number);
      if (op === 'lt') return (row[col] as string | number) < (val as string | number);
      return true;
    });
  }

  private async run(mode: 'single' | 'maybeSingle' | 'list' | 'void'): Promise<Outcome<unknown>> {
    const rows = this.store.tables.get(this.table) ?? [];

    if (this.op.kind === 'insert') {
      const valuesList: FakeRow[] = Array.isArray(this.op.values)
        ? (this.op.values as FakeRow[])
        : ([this.op.values] as FakeRow[]);
      const inserted: FakeRow[] = [];
      for (const v of valuesList) {
        // Enforce: one active learner per account.
        if (
          this.table === 'learners' &&
          rows.some(
            (r) => r.account_id === (v as FakeRow).account_id && (r.archived_at as unknown) == null,
          )
        ) {
          return {
            data: null,
            error: { message: 'duplicate key value', code: '23505', status: 409 },
          };
        }
        const row: FakeRow = {
          id: this.store.nextId(),
          ...(v as FakeRow),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        rows.push(row);
        inserted.push(row);
      }
      this.store.tables.set(this.table, rows);
      if (mode === 'single') return { data: inserted[0] ?? null, error: null };
      if (mode === 'maybeSingle') return { data: inserted[0] ?? null, error: null };
      if (mode === 'list') return { data: inserted, error: null };
      return { data: null, error: null };
    }

    if (this.op.kind === 'update') {
      const matches = rows.filter((r) => this.match(r));
      for (const m of matches) {
        Object.assign(m, this.op.values, { updated_at: new Date().toISOString() });
      }
      if (mode === 'single')
        return matches[0]
          ? { data: matches[0], error: null }
          : { data: null, error: { message: 'no rows' } };
      if (mode === 'maybeSingle') return { data: matches[0] ?? null, error: null };
      if (mode === 'list') return { data: matches, error: null };
      return { data: null, error: null };
    }

    if (this.op.kind === 'upsert') {
      const conflictCol = this.op.onConflict ?? 'id';
      const valuesList: FakeRow[] = Array.isArray(this.op.values)
        ? (this.op.values as FakeRow[])
        : ([this.op.values] as FakeRow[]);
      const affected: FakeRow[] = [];
      for (const v of valuesList) {
        const key = (v as FakeRow)[conflictCol];
        const existing = rows.find((r) => r[conflictCol] === key);
        if (existing) {
          Object.assign(existing, v, { updated_at: new Date().toISOString() });
          affected.push(existing);
        } else {
          const row: FakeRow = {
            id: (v as FakeRow).id ?? this.store.nextId(),
            ...(v as FakeRow),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          rows.push(row);
          affected.push(row);
        }
      }
      this.store.tables.set(this.table, rows);
      if (mode === 'single') return { data: affected[0] ?? null, error: null };
      if (mode === 'maybeSingle') return { data: affected[0] ?? null, error: null };
      if (mode === 'list') return { data: affected, error: null };
      return { data: null, error: null };
    }

    // select / delete
    const matchesAll = rows.filter((r) => this.match(r));
    const matches = this.limitN != null ? matchesAll.slice(0, this.limitN) : matchesAll;
    if (this.op.kind === 'delete') {
      this.store.tables.set(
        this.table,
        rows.filter((r) => !this.match(r)),
      );
      if (mode === 'maybeSingle') return { data: matches[0] ?? null, error: null };
      return { data: null, error: null };
    }
    if (mode === 'single')
      return matches[0]
        ? { data: matches[0], error: null }
        : { data: null, error: { message: 'no rows' } };
    if (mode === 'maybeSingle') return { data: matches[0] ?? null, error: null };
    return { data: matches, error: null };
  }

  single() {
    return this.run('single');
  }
  maybeSingle() {
    return this.run('maybeSingle');
  }
  // Awaiting the query without `.single()` / `.maybeSingle()` resolves to an
  // array result for SELECT (matching PostgREST), or `{ data: null, error: null }`
  // for mutations that don't ask to return rows.
  then<TResult1 = unknown, TResult2 = never>(
    onFulfilled?: (value: Outcome<unknown>) => TResult1 | PromiseLike<TResult1>,
    onRejected?: (reason: unknown) => TResult2 | PromiseLike<TResult2>,
  ): Promise<TResult1 | TResult2> {
    const mode = this.op.kind === 'select' || this.selectAfterMutation ? 'list' : 'void';
    return this.run(mode).then(onFulfilled, onRejected);
  }
}

/** Module-scoped id counter — see FakeSupabase.nextId() for why. */
let fakeIdCounter = 0;

export class FakeSupabase {
  tables = new Map<string, FakeRow[]>();
  /** token → user lookup for `auth.getUser` */
  users = new Map<string, FakeUser>();
  /** known signed-up emails for dup-check */
  emails = new Set<string>();
  // Real-UUID-shaped ids. Several route inputs validate id-typed fields with
  // `Uuid = z.string().uuid()` in `@learnbuddy/shared-types`; using literal
  // sentinels like `fake-000007` would 400 at the boundary. The counter is
  // module-scoped (not per-instance) so two FakeSupabase instances created
  // in the same test don't collide — cross-account regression tests need
  // distinct ids across both fakes.
  nextId(): string {
    fakeIdCounter++;
    const hex = fakeIdCounter.toString(16).padStart(12, '0');
    return `00000000-0000-4000-8000-${hex}`;
  }

  from(table: string): FakeQuery {
    return new FakeQuery(this, table);
  }

  storage = {
    from: (bucket: string) => ({
      createSignedUploadUrl: async (path: string) => ({
        data: {
          signedUrl: `https://fake-storage.local/${bucket}/${path}?sig=fake`,
          path,
          token: `fake-token-${this.nextId()}`,
        },
        error: null as null | { message: string },
      }),
      /** Slice D1: vision pipeline needs photo bytes. The fake returns a
       *  1×1 JPEG so the gateway receives well-formed (if uninformative)
       *  data; the FakeLlmGateway ignores it anyway. */
      download: async (_path: string) => ({
        data: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }),
        error: null as null | { message: string },
      }),
      /** Slice D1.5: diagram pipeline uploads PNGs to study-assets. The
       *  FakeLlmGateway returns no diagrams so this path isn't exercised in
       *  the default test setup, but we accept the call so a custom
       *  llm-override test can pass diagrams without crashing. */
      upload: async (
        path: string,
        _body: unknown,
        _opts?: { contentType?: string; upsert?: boolean },
      ) => ({
        data: { path },
        error: null as null | { message: string },
      }),
    }),
  };

  auth = {
    signUp: async ({ email, password }: { email: string; password: string; options?: unknown }) => {
      if (password.length < 8) {
        return {
          data: { user: null, session: null },
          error: { message: 'Password should be at least 8 characters', status: 422 },
        };
      }
      const key = email.toLowerCase();
      if (this.emails.has(key)) {
        return {
          data: { user: null, session: null },
          error: { message: 'User already registered', status: 422 },
        };
      }
      this.emails.add(key);
      const user: FakeUser = { id: this.nextId(), email };
      return { data: { user, session: null }, error: null };
    },
    getUser: async (token: string) => {
      const user = this.users.get(token);
      if (!user) return { data: { user: null }, error: { message: 'Invalid token' } };
      return { data: { user }, error: null };
    },
  };

  /** Test helper — mint a token for an existing user (simulates verified email). */
  authenticate(userId: string, email: string): string {
    const token = `fake-tok-${userId}`;
    this.users.set(token, { id: userId, email });
    return token;
  }
}

/** Build a Deps instance suitable for route tests. */
export function createTestDeps(overrides: Partial<Deps> = {}): Deps {
  const fake = new FakeSupabase();
  const env: Env = {
    SUPABASE_URL: 'http://fake.local',
    SUPABASE_ANON_KEY: 'fake-anon-key-0000000000',
    SUPABASE_SERVICE_ROLE_KEY: 'fake-service-key-0000000000',
    PUBLIC_APP_URL: 'learnbuddy://',
    EMAIL_REDIRECT_URL: 'learnbuddy://verify-email',
    DSGVO_CONSENT_VERSION: '2026-05-01',
    NODE_ENV: 'test',
    GOOGLE_VERTEX_LOCATION: 'europe-west4',
    VERTEX_MODEL_ID: 'gemini-2.5-flash-lite',
  };
  return {
    env,
    // The fake satisfies the shape the routes actually call; the formal
    // SupabaseClient surface is much wider, hence the cast.
    supabase: fake as unknown as Deps['supabase'],
    supabaseAnon: fake as unknown as Deps['supabaseAnon'],
    llm: new FakeLlmGateway(),
    now: () => new Date('2026-05-16T10:00:00Z'),
    uuid: () => `uuid-${Math.random().toString(36).slice(2, 10)}`,
    ...overrides,
  };
}

/** Convenience accessor for tests that need to peek at fake state. */
export function getFake(deps: Deps): FakeSupabase {
  return deps.supabase as unknown as FakeSupabase;
}
