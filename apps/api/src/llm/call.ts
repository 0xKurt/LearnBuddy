// Budgeted model call: reserve → call → record. docs/architecture.md §Model calls.
//
// No model call happens without an atomic reservation against the learner's
// daily limit (safe under concurrent requests), and every call is recorded
// with tokens, cost, latency and outcome — never with prompt or answer text.

import { DAILY_LIMITS } from '../config.js';
import type { Db } from '../lib/db.js';
import { AppError } from '../lib/errors.js';
import { LlmError, type LlmGateway, type LlmRequest, type LlmResult } from './gateway.js';

export type ModelDeps = { db: Db; llm: LlmGateway };

export async function reserveModelCall(
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
  db: Db,
  learnerId: string,
  req: LlmRequest,
  outcome: 'ok' | 'invalid_output' | 'error' | 'timeout',
  usage: LlmResult['usage'] | null,
  errorCode: string | null,
): Promise<void> {
  await db.query(
    `insert into llm_calls (learner_id, purpose, model, prompt_version, input_tokens, output_tokens,
                            thought_tokens, cost_micros, latency_ms, outcome, error_code)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      learnerId,
      req.purpose,
      usage?.model ?? 'unknown',
      req.promptVersion,
      usage?.inputTokens ?? 0,
      usage?.outputTokens ?? 0,
      usage?.thoughtTokens ?? 0,
      usage?.costMicros ?? 0,
      usage?.latencyMs ?? 0,
      outcome,
      errorCode,
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
    await record(deps.db, learnerId, req, 'ok', result.usage, null);
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
      await record(deps.db, learnerId, req, outcome, err.usage, err.kind);
      if (err.kind === 'unavailable' || err.kind === 'rate_limited') {
        await releaseReservation(deps.db, learnerId, localDay, kind);
      }
    }
    throw err;
  }
}
