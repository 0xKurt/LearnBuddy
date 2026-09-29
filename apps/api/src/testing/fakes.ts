// In-memory stand-ins for the outside world in tests: the model, push,
// auth, photo storage and text to speech. The database is never faked (testing/database.ts).
// requires live verification in Claude Code session (paired with a real Postgres)

import type { VoiceName } from '@learnbuddy/shared-types/contracts';

import type { AuthUser, AuthVerifier } from '../auth/verifier.js';
import type { Db } from '../lib/db.js';
import { AppError } from '../lib/errors.js';
import {
  LlmError,
  type LlmGateway,
  type LlmPurpose,
  type LlmRequest,
  type LlmResult,
} from '../llm/gateway.js';
import type { PushMessage, PushReceipt, PushTicket, PushTransport } from '../push/transport.js';
import type { SpeechAudio, SpeechError, SpeechGateway, SpeechInput } from '../speech/gateway.js';
import {
  STORAGE_REMOVE_LIMIT,
  StorageError,
  type StorageGateway,
  type UploadTarget,
} from '../storage/gateway.js';

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
  /** Answers for purposes a test does not care about (scripted answers still come first). */
  private readonly defaults = new Map<LlmPurpose, ScriptedAnswer>();

  /** Answer every unscripted call of this purpose with the same answer. */
  byDefault(purpose: LlmPurpose, answer: ScriptedAnswer): this {
    this.defaults.set(purpose, answer);
    return this;
  }

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
    const answer = this.queues.get(req.purpose)?.shift() ?? this.defaults.get(req.purpose);
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
    // Streaming: the answer as the model would write it, in a few pieces.
    if (req.onPartial) {
      const text = JSON.stringify(json);
      for (const n of [Math.floor(text.length / 3), Math.floor((2 * text.length) / 3), text.length])
        req.onPartial(text.slice(0, n));
    }
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

/** What the real verifier throws when Supabase Auth cannot answer (auth/verifier.ts). */
export const authOutage = (): AppError =>
  new AppError('unavailable', 'The sign-in service cannot be reached');

export type FakeAuthOp = 'verify' | 'deleteUser';

/**
 * Supabase Auth in tests. Like the real one it can fail: `failNext` makes the
 * next call(s) of an operation throw, `outage` makes every call throw until
 * it is switched off (audit S-2, H-27).
 */
export class FakeAuth implements AuthVerifier {
  private readonly tokens = new Map<string, AuthUser>();
  readonly deleted: string[] = [];
  /** Passwords set through the API (user id → password). */
  readonly passwords = new Map<string, string>();
  private seq = 0;
  private readonly failures: { op: FakeAuthOp; error: Error }[] = [];
  /** While true every operation throws like an unreachable Supabase Auth. */
  outage = false;

  /** The next call of `op` throws `error` (default: the verifier's outage error). */
  failNext(op: FakeAuthOp, error: Error = authOutage()): this {
    this.failures.push({ op, error });
    return this;
  }

  private maybeFail(op: FakeAuthOp): void {
    if (this.outage) throw authOutage();
    const i = this.failures.findIndex((f) => f.op === op);
    if (i >= 0) throw this.failures.splice(i, 1)[0]!.error;
  }

  /** The next `times` deleteUser calls fail like an Auth outage. */
  failNextDelete(times = 1): this {
    for (let i = 0; i < times; i++)
      this.failNext('deleteUser', new Error('could not delete auth user'));
    return this;
  }

  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * A signed-up Supabase user (row in auth.users) and a bearer token for it. Its e-mail counts
   * as confirmed, as on the hosted project: confirmations are on there, so there is no session
   * before the link in the mail was clicked. `emailConfirmed: false` is the account that never
   * clicked — it could not sign in on the hosted project, and here it shows that nothing is
   * recorded as confirmed consent without the click (issue #30).
   */
  async createUser(
    email?: string,
    opts: { emailConfirmed?: boolean } = {},
  ): Promise<{ userId: string; token: string }> {
    const row = await this.db.one<{ id: string }>(
      `insert into auth.users (email) values ($1) returning id`,
      [email ?? `user${++this.seq}@example.test`],
    );
    const token = `test-token-${row.id}`;
    this.tokens.set(token, {
      userId: row.id,
      email: email ?? null,
      authenticatedAt: null,
      emailConfirmedAt: opts.emailConfirmed === false ? null : this.now(),
    });
    return { userId: row.id, token };
  }

  /** Simulates a fresh sign-in (PIN reset window). */
  signedInAt(token: string, epochSeconds: number): void {
    const u = this.tokens.get(token);
    if (u) this.tokens.set(token, { ...u, authenticatedAt: epochSeconds });
  }

  /** The click on the confirmation link, as Supabase records it (email_confirmed_at). */
  confirmedEmailAt(token: string, at: Date | null): void {
    const u = this.tokens.get(token);
    if (u) this.tokens.set(token, { ...u, emailConfirmedAt: at });
  }

  revoke(token: string): void {
    this.tokens.delete(token);
  }

  async verify(token: string): Promise<AuthUser | null> {
    this.maybeFail('verify');
    return this.tokens.get(token) ?? null;
  }

  async deleteUser(userId: string): Promise<void> {
    this.maybeFail('deleteUser');
    this.deleted.push(userId);
    await this.db.query(`delete from auth.users where id = $1`, [userId]);
    for (const [token, u] of this.tokens) if (u.userId === userId) this.tokens.delete(token);
  }

  async updatePassword(userId: string, password: string): Promise<void> {
    this.passwords.set(userId, password);
  }
}

export type StorageOp = 'sign' | 'list' | 'download' | 'remove';

/**
 * Photo storage stand-in with the provider's limits (at most 1000 paths per delete) and
 * scripted outages (`failNext`), so failure paths are tested, not only the happy path.
 */
export class MemoryStorage implements StorageGateway {
  readonly objects = new Map<string, Uint8Array>();
  /** Every remove request, as sent (to prove chunking). */
  readonly removeCalls: string[][] = [];
  private readonly failures = new Map<StorageOp, number>();

  /** The next `times` calls of `op` fail like a provider outage (StorageError). */
  failNext(op: StorageOp, times = 1): this {
    this.failures.set(op, (this.failures.get(op) ?? 0) + times);
    return this;
  }

  private maybeFail(op: StorageOp): void {
    const n = this.failures.get(op) ?? 0;
    if (n > 0) {
      this.failures.set(op, n - 1);
      throw new StorageError(op, 'transient');
    }
  }

  async createUploadTarget(path: string): Promise<UploadTarget> {
    this.maybeFail('sign');
    return { path, url: `memory://${path}`, token: 'memory' };
  }
  /** What the app's direct upload would do. */
  put(path: string, bytes: Uint8Array = new Uint8Array([0xff, 0xd8, 0xff])): void {
    this.objects.set(path, bytes);
  }
  async existing(paths: string[]): Promise<Set<string>> {
    this.maybeFail('list');
    return new Set(paths.filter((p) => this.objects.has(p)));
  }
  async download(path: string): Promise<Uint8Array | null> {
    this.maybeFail('download');
    return this.objects.get(path) ?? null;
  }
  async remove(paths: string[]): Promise<void> {
    this.removeCalls.push([...paths]);
    // The hosted API rejects the whole request above its object limit.
    if (paths.length > STORAGE_REMOVE_LIMIT) throw new StorageError('remove', 'refused');
    this.maybeFail('remove');
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

/**
 * Text to speech in tests and the dev stack: a WAV of silence as long as the text would take
 * to say (so playback, progress and read-along can be exercised without Google). Records every
 * call; `failNext` makes the provider fail the way the real one can.
 */
export class FakeSpeech implements SpeechGateway {
  readonly available = true;
  readonly calls: SpeechInput[] = [];
  private failures: SpeechError[] = [];

  voiceId(voice: VoiceName, locale: string): string {
    return `fake-${locale}-${voice}`;
  }

  localeFor(locale: string): string | null {
    return /^(de|en|fr|es|it)-[A-Z]{2}$/.test(locale) ? locale : null;
  }

  failNext(...errors: SpeechError[]): this {
    this.failures.push(...errors);
    return this;
  }

  async synthesize(input: SpeechInput): Promise<SpeechAudio> {
    this.calls.push(input);
    const failure = this.failures.shift();
    if (failure) throw failure;
    const ms = Math.min(8000, Math.max(300, (input.text.length * 60) / input.rate));
    return { mime: 'audio/wav', audio: silentWav(ms) };
  }
}

/** 8 kHz, 8-bit mono PCM silence. */
export function silentWav(ms: number): Buffer {
  const rate = 8000;
  const samples = Math.round((rate * ms) / 1000);
  const b = Buffer.alloc(44 + samples, 0x80);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(36 + samples, 4);
  b.write('WAVE', 8, 'ascii');
  b.write('fmt ', 12, 'ascii');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate, 28); // byte rate
  b.writeUInt16LE(1, 32); // block align
  b.writeUInt16LE(8, 34); // bits per sample
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(samples, 40);
  return b;
}
