// Budgeted model call: reserve → call → record. docs/architecture.md §Model calls.
//
// No model call happens without an atomic reservation against the learner's
// daily limit (safe under concurrent requests), and every call is recorded
// with tokens, cost, latency and outcome — never with prompt or answer text.

import { DAILY_LIMITS } from '../config.js';
import type { Db } from '../lib/db.js';
import { AppError } from '../lib/errors.js';
import { timedModel } from '../lib/requestCost.js';
import type { EmbeddingGateway, EmbedRequest, EmbedResult } from './embeddings.js';
import { LlmError, type LlmGateway, type LlmRequest, type LlmResult } from './gateway.js';
import { unsupportedMedia } from './profile.js';

export type ModelDeps = {
  db: Db;
  llm: LlmGateway;
  /**
   * The one clock (rule 7). `llm_calls.created_at` decides behaviour — the retention sweep
   * deletes by it and the throttle alarm measures its window by it
   * (`modules/scheduler/throttle.ts`) — so the row carries the app clock's instant, not the
   * database's `now()`.
   */
  now: () => Date;
};

/**
 * The gateway's answer, once its profile accepts the request (#646): a recording sent to a model
 * that cannot hear is refused here, recorded like any refusal, and never sent.
 */
function generate(llm: LlmGateway, req: LlmRequest): Promise<LlmResult> {
  const refused = unsupportedMedia(llm.profile, req);
  if (refused.length > 0)
    return Promise.reject(
      new LlmError('refused', `${llm.profile.name} does not read ${refused.join(', ')}`),
    );
  return llm.generate(req);
}

async function reserveModelCall(
  db: Db,
  learnerId: string,
  day: string,
  kind: keyof typeof DAILY_LIMITS,
): Promise<boolean> {
  const row = await db.maybeOne<{ calls: number }>(
    `insert into usage_daily (learner_id, day, kind, calls) values ($1, $2, $3, 1)
       on conflict (learner_id, day, kind) do update set calls = usage_daily.calls + 1
       where usage_daily.calls < $4
     returning calls`,
    [learnerId, day, kind, DAILY_LIMITS[kind]],
  );
  return row !== null;
}

async function releaseReservation(
  db: Db,
  learnerId: string,
  day: string,
  kind: string,
): Promise<void> {
  await db.query(
    `update usage_daily set calls = greatest(calls - 1, 0)
      where learner_id = $1 and day = $2 and kind = $3`,
    [learnerId, day, kind],
  );
}

/** How the caller waited for one call (#652): measured here, the same for every gateway. */
type CallTiming = {
  streamed: boolean;
  /** From the call to its first streamed text; null when nothing was streamed. */
  firstTokenMs: number | null;
  /** The whole wait, retries and their pauses included (`latency_ms` is the last attempt's). */
  totalMs: number;
  attempts: number;
};

/**
 * The request as it goes to the gateway, and a stopwatch read when the call has ended (#652).
 * `performance.now()`, not the app clock: it measures this call's wait and decides nothing
 * (rule 7).
 */
function stopwatch(req: LlmRequest) {
  const started = performance.now();
  let firstTokenMs: number | null = null;
  const sent: LlmRequest = req.onPartial
    ? {
        ...req,
        onPartial: (raw) => {
          firstTokenMs ??= Math.round(performance.now() - started);
          req.onPartial?.(raw);
        },
      }
    : req;
  const read = (attempts: number): CallTiming => ({
    streamed: req.onPartial !== undefined,
    firstTokenMs,
    totalMs: Math.round(performance.now() - started),
    attempts,
  });
  return { sent, read };
}

async function record(
  deps: ModelDeps,
  /** Null only for the canary, which runs on no learner's behalf. */
  learnerId: string | null,
  req: LlmRequest,
  outcome: 'ok' | 'invalid_output' | 'error' | 'timeout',
  usage: LlmResult['usage'] | null,
  errorCode: string | null,
  timing: CallTiming,
): Promise<void> {
  // `error_code` is what makes one failure distinguishable from another after the fact: a
  // throttle lands here as 'rate_limited' (vertex.ts classify, HTTP 429), which is what the
  // alarm counts (modules/scheduler/throttle.ts, issue #206). The trace columns (#652, migration
  // 0105) say which decision and round a call was, how often it was sent and how long she
  // waited for its first word.
  await deps.db.query(
    `insert into llm_calls (learner_id, purpose, model, prompt_version, input_tokens, output_tokens,
                            thought_tokens, cached_tokens, cost_micros, latency_ms, outcome, error_code,
                            created_at, decision_id, round, schema_variant, streamed, first_token_ms,
                            attempts, total_ms)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
    [
      learnerId,
      req.purpose,
      usage?.model ?? 'unknown',
      req.promptVersion,
      usage?.inputTokens ?? 0,
      usage?.outputTokens ?? 0,
      usage?.thoughtTokens ?? 0,
      // How much of the prompt the provider served from its cache (issue #25): the only
      // place the effect of the prompt layering is visible after the fact.
      usage?.cachedTokens ?? 0,
      usage?.costMicros ?? 0,
      usage?.latencyMs ?? 0,
      outcome,
      errorCode,
      deps.now(),
      req.trace?.decisionId ?? null,
      req.trace?.round ?? null,
      req.trace?.schemaVariant ?? null,
      timing.streamed,
      timing.firstTokenMs,
      timing.attempts,
      timing.totalMs,
    ],
  );
}

/**
 * One of the learner's daily allowance, held before the calls that make up one run or reading
 * (#665): the choosing call and the main call it chooses for. Taken atomically before the first
 * of them, so a day with one run left starts one chain, however many start at once, and no
 * choosing call is paid for a run her limit would refuse. The main call uses it up (`callModel`);
 * whoever took it and did not get that far gives it back (`releaseCall`).
 */
export type Reservation = {
  learnerId: string;
  day: string;
  kind: keyof typeof DAILY_LIMITS;
  /** Still held: no main call has used it yet, and it was not given back. */
  held: boolean;
};

/** Throws AppError('budget_exhausted') when today's limit for `kind` is used up. */
export async function reserveCall(
  deps: ModelDeps,
  learnerId: string,
  day: string,
  kind: keyof typeof DAILY_LIMITS,
): Promise<Reservation> {
  if (!(await reserveModelCall(deps.db, learnerId, day, kind)))
    throw new AppError('budget_exhausted', 'Daily limit for this kind of help is reached');
  return { learnerId, day, kind, held: true };
}

/** Gives back a reservation no main call used; a used or returned one is left alone. */
export async function releaseCall(deps: ModelDeps, r: Reservation | null): Promise<void> {
  if (!r?.held) return;
  r.held = false;
  await releaseReservation(deps.db, r.learnerId, r.day, r.kind);
}

/**
 * A call that is part of a metered one: the forms chosen before an explain or extraction call
 * (#627). It runs on the reservation of the call it belongs to, so the daily limit counts runs
 * and readings, never choices, and it cannot run without that call's room (#665). Its cost is
 * booked to that call's day and kind; it is recorded under its own purpose (`llm_calls`).
 */
export async function callAhead(
  deps: ModelDeps,
  reservation: Reservation,
  req: LlmRequest,
): Promise<LlmResult> {
  if (!deps.llm.available) throw new LlmError('unavailable', 'no model configured');
  if (!reservation.held) throw new Error('a choosing call runs on a held reservation');
  const { learnerId, day, kind } = reservation;
  const book = async (usage: LlmResult['usage'] | null) => {
    if (usage)
      await deps.db.query(
        `update usage_daily set cost_micros = cost_micros + $4
          where learner_id = $1 and day = $2 and kind = $3`,
        [learnerId, day, kind, usage.costMicros],
      );
  };
  const watch = stopwatch(req);
  try {
    const result = await timedModel(() => generate(deps.llm, watch.sent));
    await record(deps, learnerId, req, 'ok', result.usage, null, watch.read(result.attempts ?? 1));
    await book(result.usage);
    return result;
  } catch (err) {
    if (err instanceof LlmError) {
      await record(
        deps,
        learnerId,
        req,
        outcomeOf(err),
        err.usage,
        err.kind,
        watch.read(err.attempts),
      );
      await book(err.usage);
    }
    throw err;
  }
}

/** How a failed call is recorded: timeout, unusable output, or any other error. */
function outcomeOf(err: LlmError): 'invalid_output' | 'error' | 'timeout' {
  return err.kind === 'timeout'
    ? 'timeout'
    : err.kind === 'invalid_output'
      ? 'invalid_output'
      : 'error';
}

/** One call recorded as it ended, without a reservation and without a day to book it to. */
async function recorded(
  deps: ModelDeps,
  learnerId: string | null,
  req: LlmRequest,
): Promise<LlmResult> {
  const watch = stopwatch(req);
  try {
    const result = await timedModel(() => generate(deps.llm, watch.sent));
    await record(deps, learnerId, req, 'ok', result.usage, null, watch.read(result.attempts ?? 1));
    return result;
  } catch (err) {
    if (err instanceof LlmError)
      await record(
        deps,
        learnerId,
        req,
        outcomeOf(err),
        err.usage,
        err.kind,
        watch.read(err.attempts),
      );
    throw err;
  }
}

/**
 * The scheduler's canary (#650, `scheduler/canary.ts`): no learner asked for it, so nothing of
 * hers is reserved. It is recorded like every call — its cost and outcome are in `llm_calls`,
 * without a learner, and a refusal of it counts towards the model alarms like any other.
 */
export async function callCanary(deps: ModelDeps, req: LlmRequest): Promise<LlmResult> {
  if (req.purpose !== 'canary') throw new Error('only the canary runs on no learner’s behalf');
  return recorded(deps, null, req);
}

/**
 * Call the model on behalf of a learner. Throws AppError('budget_exhausted')
 * when today's limit is used up, LlmError on provider/output problems. A `reservation` still held
 * for this learner, day and purpose is used up instead of taking a new one (#665).
 */
export async function callModel(
  deps: ModelDeps,
  learnerId: string,
  localDay: string,
  req: LlmRequest,
  reservation: Reservation | null = null,
): Promise<LlmResult> {
  if (!deps.llm.available) throw new LlmError('unavailable', 'no model configured');
  const kind = req.purpose;
  // A choosing call has no limit of its own: it is metered with its call (`callAhead`).
  if (kind === 'forms') throw new Error('a forms call goes through callAhead');
  if (kind === 'canary') throw new Error('the canary goes through callCanary');
  const own =
    reservation !== null &&
    reservation.held &&
    reservation.learnerId === learnerId &&
    reservation.day === localDay &&
    reservation.kind === kind;
  if (own) reservation.held = false;
  else if (!(await reserveModelCall(deps.db, learnerId, localDay, kind))) {
    throw new AppError('budget_exhausted', 'Daily limit for this kind of help is reached');
  }
  const watch = stopwatch(req);
  try {
    const result = await timedModel(() => generate(deps.llm, watch.sent));
    await record(deps, learnerId, req, 'ok', result.usage, null, watch.read(result.attempts ?? 1));
    await deps.db.query(
      `update usage_daily set cost_micros = cost_micros + $4
        where learner_id = $1 and day = $2 and kind = $3`,
      [learnerId, localDay, kind, result.usage.costMicros],
    );
    return result;
  } catch (err) {
    if (err instanceof LlmError) {
      const outcome =
        err.kind === 'timeout'
          ? 'timeout'
          : err.kind === 'invalid_output'
            ? 'invalid_output'
            : 'error';
      await record(
        deps,
        learnerId,
        req,
        outcome,
        err.usage,
        err.finishReason ? `${err.kind}:${err.finishReason}` : err.kind,
        watch.read(err.attempts),
      );
      // Nothing usable came back: the learner's daily allowance is not used up by a
      // provider outage, a rejected request or a safety block (her words are not "spent").
      if (err.kind !== 'invalid_output' && err.kind !== 'timeout') {
        await releaseReservation(deps.db, learnerId, localDay, kind);
      }
    }
    throw err;
  }
}

/** Recorded as the prompt version of embedding calls (there is no prompt to version). */
const EMBED_VERSION = 'embed.v1';

/**
 * Embed texts on behalf of a learner, under the same reserve → call → record
 * discipline as callModel (purpose 'embedding'). Throws AppError('budget_exhausted')
 * when today's limit is used up, LlmError on provider problems — callers degrade
 * to full text + trigram search, they never fail the feature.
 */
export async function callEmbedding(
  deps: { db: Db; embeddings: EmbeddingGateway },
  learnerId: string,
  localDay: string,
  req: EmbedRequest,
): Promise<EmbedResult> {
  if (!deps.embeddings.available) throw new LlmError('unavailable', 'no embedding model');
  if (!(await reserveModelCall(deps.db, learnerId, localDay, 'embedding'))) {
    throw new AppError('budget_exhausted', 'Daily limit for this kind of help is reached');
  }
  const recordEmbed = (
    outcome: 'ok' | 'invalid_output' | 'error' | 'timeout',
    usage: EmbedResult['usage'] | null,
    errorCode: string | null,
  ) =>
    // No `created_at` from the app clock here, unlike `record()` above: one caller passes
    // only `{ db, embeddings }` (modules/buddy/connectors/material.ts), so this seam has no
    // clock to use yet and the row keeps the database default. The throttle alarm's window
    // boundary always comes from the app clock either way (issue #206).
    deps.db.query(
      `insert into llm_calls (learner_id, purpose, model, prompt_version, input_tokens,
                              cost_micros, latency_ms, outcome, error_code)
       values ($1,'embedding',$2,$3,$4,$5,$6,$7,$8)`,
      [
        learnerId,
        usage?.model ?? 'unknown',
        EMBED_VERSION,
        usage?.inputTokens ?? 0,
        usage?.costMicros ?? 0,
        usage?.latencyMs ?? 0,
        outcome,
        errorCode,
      ],
    );
  try {
    const result = await timedModel(() => deps.embeddings.embed(req));
    await recordEmbed('ok', result.usage, null);
    await deps.db.query(
      `update usage_daily set cost_micros = cost_micros + $4
        where learner_id = $1 and day = $2 and kind = $3`,
      [learnerId, localDay, 'embedding', result.usage.costMicros],
    );
    return result;
  } catch (err) {
    if (err instanceof LlmError) {
      const outcome =
        err.kind === 'timeout'
          ? 'timeout'
          : err.kind === 'invalid_output'
            ? 'invalid_output'
            : 'error';
      await recordEmbed(outcome, null, err.kind);
      // Same rule as callModel: an outage or refusal does not use up her allowance.
      if (err.kind !== 'invalid_output' && err.kind !== 'timeout') {
        await releaseReservation(deps.db, learnerId, localDay, 'embedding');
      }
    }
    throw err;
  }
}
