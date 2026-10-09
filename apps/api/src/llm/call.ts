// Budgeted model call: reserve → call → record. docs/architecture.md §Model calls.
//
// No model call happens without an atomic reservation against the learner's
// daily limit (safe under concurrent requests), and every call is recorded
// with tokens, cost, latency and outcome — never with prompt or answer text.

import { DAILY_LIMITS } from '../config.js';
import type { Db } from '../lib/db.js';
import { AppError } from '../lib/errors.js';
import type { EmbeddingGateway, EmbedRequest, EmbedResult } from './embeddings.js';
import { LlmError, type LlmGateway, type LlmRequest, type LlmResult } from './gateway.js';

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

async function record(
  deps: ModelDeps,
  learnerId: string,
  req: LlmRequest,
  outcome: 'ok' | 'invalid_output' | 'error' | 'timeout',
  usage: LlmResult['usage'] | null,
  errorCode: string | null,
): Promise<void> {
  // `error_code` is what makes one failure distinguishable from another after the fact: a
  // throttle lands here as 'rate_limited' (vertex.ts classify, HTTP 429), which is what the
  // alarm counts (modules/scheduler/throttle.ts, issue #206).
  await deps.db.query(
    `insert into llm_calls (learner_id, purpose, model, prompt_version, input_tokens, output_tokens,
                            thought_tokens, cached_tokens, cost_micros, latency_ms, outcome, error_code,
                            created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
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
    ],
  );
}

/**
 * Call the model on behalf of a learner. Throws AppError('budget_exhausted')
 * when today's limit is used up, LlmError on provider/output problems.
 */
export async function callModel(
  deps: ModelDeps,
  learnerId: string,
  localDay: string,
  req: LlmRequest,
): Promise<LlmResult> {
  if (!deps.llm.available) throw new LlmError('unavailable', 'no model configured');
  const kind = req.purpose;
  if (!(await reserveModelCall(deps.db, learnerId, localDay, kind))) {
    throw new AppError('budget_exhausted', 'Daily limit for this kind of help is reached');
  }
  try {
    const result = await deps.llm.generate(req);
    await record(deps, learnerId, req, 'ok', result.usage, null);
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
    const result = await deps.embeddings.embed(req);
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
