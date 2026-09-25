// In-memory stand-ins for the outside world in tests: the model, push,
// auth and photo storage. The database is never faked (testing/database.ts).
// requires live verification in Claude Code session (paired with a real Postgres)

import type { AuthUser, AuthVerifier } from '../auth/verifier.js';
import type { Db } from '../lib/db.js';
import {
  LlmError,
  type LlmGateway,
  type LlmPurpose,
  type LlmRequest,
  type LlmResult,
} from '../llm/gateway.js';
import type { PushMessage, PushReceipt, PushTicket, PushTransport } from '../push/transport.js';
import type { StorageGateway, UploadTarget } from '../storage/gateway.js';

/** The only clock in tests; the API never reads Date.now() for decisions. */
export class TestClock {
  private t: number;
  constructor(start: Date | string) {
    this.t = new Date(start).getTime();
  }
  readonly now = (): Date => new Date(this.t);
  advance(ms: number): Date {
    this.t += ms;
    return this.now();
  }
  minutes(n: number): Date {
    return this.advance(n * 60_000);
  }
  hours(n: number): Date {
    return this.advance(n * 3_600_000);
  }
  set(at: Date | string): Date {
    this.t = new Date(at).getTime();
    return this.now();
  }
}

/** One scripted model answer: JSON, an error, or a function of the request (may have side effects). */
export type ScriptedAnswer =
  | { json: unknown }
  | { error: LlmError }
  | ((req: LlmRequest) => unknown | Promise<unknown>);

/**
 * The model in tests. Every call must be scripted: an unscripted call is
 * recorded in `unexpected` and fails like an unavailable model, so tests see
 * both the honest degradation and the unexpected call.
 */
export class ScriptedGateway implements LlmGateway {
  available = true;
  readonly calls: LlmRequest[] = [];
  readonly unexpected: LlmRequest[] = [];
  /** Errors thrown inside scripted functions (e.g. failed expectations about the context). */
  readonly scriptErrors: string[] = [];
  private readonly queues = new Map<LlmPurpose, ScriptedAnswer[]>();

  script(purpose: LlmPurpose, ...answers: ScriptedAnswer[]): this {
    this.queues.set(purpose, [...(this.queues.get(purpose) ?? []), ...answers]);
    return this;
  }

  /** Forget scripted answers, calls and errors (between tests sharing one environment). */
  reset(): void {
    this.queues.clear();
    this.calls.length = 0;
    this.unexpected.length = 0;
    this.scriptErrors.length = 0;
  }

  pending(purpose?: LlmPurpose): number {
    if (purpose) return this.queues.get(purpose)?.length ?? 0;
    return [...this.queues.values()].reduce((n, q) => n + q.length, 0);
  }

  callsFor(purpose: LlmPurpose): LlmRequest[] {
    return this.calls.filter((c) => c.purpose === purpose);
  }

  /** All text the model saw in a request (state block, dialogue, triggers). */
  static textOf(req: LlmRequest): string {
    return req.contents
      .flatMap((m) =>
        m.parts.map((p) => ('text' in p ? `[${m.role}] ${p.text}` : `[${m.role}] <image>`)),
      )
      .join('\n');
  }

  async generate(req: LlmRequest): Promise<LlmResult> {
    this.calls.push(req);
    const answer = this.queues.get(req.purpose)?.shift();
    if (!answer) {
      this.unexpected.push(req);
      throw new LlmError('unavailable', `unscripted model call (${req.purpose})`);
    }
    let json: unknown;
    if (typeof answer === 'function') {
      try {
        json = await answer(req);
      } catch (err) {
        this.scriptErrors.push(err instanceof Error ? err.message : String(err));
        throw err;
      }
    } else if ('error' in answer) throw answer.error;
    else json = answer.json;
    return {
      json,
      usage: {
        model: 'scripted',
        inputTokens: 1000,
        outputTokens: 200,
        thoughtTokens: 0,
        costMicros: 800,
        latencyMs: 1,
      },
    };
  }
}

export class FakeAuth implements AuthVerifier {
  private readonly tokens = new Map<string, AuthUser>();
  readonly deleted: string[] = [];
  private seq = 0;

  constructor(private readonly db: Db) {}

  /** A signed-up Supabase user (row in auth.users) and a bearer token for it. */
  async createUser(email?: string): Promise<{ userId: string; token: string }> {
    const row = await this.db.one<{ id: string }>(
      `insert into auth.users (email) values ($1) returning id`,
      [email ?? `user${++this.seq}@example.test`],
    );
    const token = `test-token-${row.id}`;
    this.tokens.set(token, { userId: row.id, email: email ?? null, authenticatedAt: null });
    return { userId: row.id, token };
  }

  /** Simulates a fresh sign-in (PIN reset window). */
  signedInAt(token: string, epochSeconds: number): void {
    const u = this.tokens.get(token);
    if (u) this.tokens.set(token, { ...u, authenticatedAt: epochSeconds });
  }

  revoke(token: string): void {
    this.tokens.delete(token);
  }

  async verify(token: string): Promise<AuthUser | null> {
    return this.tokens.get(token) ?? null;
  }

  async deleteUser(userId: string): Promise<void> {
    this.deleted.push(userId);
    await this.db.query(`delete from auth.users where id = $1`, [userId]);
    for (const [token, u] of this.tokens) if (u.userId === userId) this.tokens.delete(token);
  }
}

export class MemoryStorage implements StorageGateway {
  readonly objects = new Map<string, Uint8Array>();

  async createUploadTarget(path: string): Promise<UploadTarget> {
    return { path, url: `memory://${path}`, token: 'memory' };
  }
  /** What the app's direct upload would do. */
  put(path: string, bytes: Uint8Array = new Uint8Array([0xff, 0xd8, 0xff])): void {
    this.objects.set(path, bytes);
  }
  async existing(paths: string[]): Promise<Set<string>> {
    return new Set(paths.filter((p) => this.objects.has(p)));
  }
  async download(path: string): Promise<Uint8Array | null> {
    return this.objects.get(path) ?? null;
  }
  async remove(paths: string[]): Promise<void> {
    for (const p of paths) this.objects.delete(p);
  }
}

type SendOutcome = PushTicket | Error;

/** Push provider stand-in with scripted tickets, errors and receipts. */
export class FakePush implements PushTransport {
  enabled = true;
  /** Messages the provider accepted a request for (ok or error ticket). */
  readonly sent: PushMessage[] = [];
  /** Every send attempt, including ones that threw. */
  readonly attempts: PushMessage[] = [];
  private readonly outcomes: SendOutcome[] = [];
  private readonly receiptMap = new Map<string, PushReceipt>();
  private seq = 0;

  /** Outcome of the next send calls, in order; default is an ok ticket. */
  nextSend(...outcomes: SendOutcome[]): this {
    this.outcomes.push(...outcomes);
    return this;
  }

  receipt(ticketId: string, receipt: PushReceipt): this {
    this.receiptMap.set(ticketId, receipt);
    return this;
  }

  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    const tickets: PushTicket[] = [];
    for (const m of messages) {
      this.attempts.push(m);
      const outcome = this.outcomes.shift();
      if (outcome instanceof Error) throw outcome;
      this.sent.push(m);
      tickets.push(outcome ?? { status: 'ok', id: `ticket-${++this.seq}` });
    }
    return tickets;
  }

  async receipts(ticketIds: string[]): Promise<Map<string, PushReceipt>> {
    const out = new Map<string, PushReceipt>();
    for (const id of ticketIds) {
      const r = this.receiptMap.get(id);
      if (r) out.set(id, r);
    }
    return out;
  }
}
