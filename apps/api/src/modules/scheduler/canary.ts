// Does the model still serve what this build sends? docs/architecture.md §Model calls (issue #650,
// audit F2-b).
//
// For eleven days (03.–14.10.2026, #627) Vertex refused every practice run, test, help and sheet
// reading with a bare 400, because their schemas had grown past what it serves. The learner read
// "Buddy konnte gerade nicht antworten"; the operator read nothing. Two checks close that, both on
// every scheduler run and both into the run's errors, which `/health` answers with a 503 and the
// health workflow (`.github/workflows/health.yml`, every 30 minutes) turns into a failed run —
// the way this project already reaches its owner (the throttle alarm, issue #206):
//
//   1. Every schema the running build sends (`buddy/schemas.ts`) is held against the bound Vertex
//      was measured to serve (`llm/schemaBudget.ts`). No model call, no cost, so on every run: a
//      deploy that ships a schema past the bound is red on its first tick, not at a child's tap.
//   2. Once an hour, one tiny real call: a two-line prompt and a one-field schema on the model
//      the children use. It proves what no static check can — credentials, the model's existence,
//      the region, a provider that answers at all. Measured on eu/gemini-3.6-flash on 14.10.2026:
//      59 input, 5 output and 0 thinking tokens, 2.2 s, 70 micro-USD (pricing.ts) — at 24 calls a
//      day ≈ 0.17 US cents a day, ≈ 5 cents a month.
//
// What it does not prove: that Vertex still serves a schema AT the bound — the canary's own schema
// is tiny on purpose, since sending the largest one every hour would cost the input tokens of the
// whole schema each time. A bound Vertex lowers shows up as refused calls of real traffic, which
// the per-purpose alarm counts (`throttle.ts` modelFailures).

import { z } from 'zod';

import type { Deps } from '../../deps.js';
import { callCanary } from '../../llm/call.js';
import { LlmError, type JsonSchema, type LlmRequest } from '../../llm/gateway.js';
import { MAX_SCHEMA_PROPERTIES, schemaProperties } from '../../llm/schemaBudget.js';
import { sentSchemas, type SentSchema } from '../buddy/schemas.js';

/** How often the real call runs. The health workflow looks every 30 minutes. */
export const CANARY_INTERVAL_MINUTES = 60;

/** The real call's whole budget; the tick starts it only with this much time left. */
export const CANARY_TIMEOUT_MS = 20_000;

const CANARY_SCHEMA: JsonSchema = {
  type: 'object',
  properties: { ok: { type: 'boolean' } },
  required: ['ok'],
};
const CanaryAnswer = z.object({ ok: z.literal(true) });

const CANARY_REQUEST: Omit<LlmRequest, 'timeoutMs'> = {
  purpose: 'canary',
  tier: 'smart',
  promptVersion: 'canary.v1',
  system: 'You are a health check. Set ok to true.',
  contents: [{ role: 'user', parts: [{ text: 'Health check.' }] }],
  schema: CANARY_SCHEMA,
  maxOutputTokens: 64,
  temperature: 0,
  thinkingLevel: 'minimal',
};

export type OverBudget = { purpose: string; profile: string; properties: number };

/** Every sent schema past the bound, with its count. */
export function schemasOverBudget(schemas: SentSchema[] = sentSchemas()): OverBudget[] {
  return schemas
    .map((s) => ({
      purpose: s.purpose,
      profile: s.profile,
      properties: schemaProperties(s.schema),
    }))
    .filter((s) => s.properties > MAX_SCHEMA_PROPERTIES);
}

export function overBudgetAlarm(over: OverBudget[]): string {
  const list = over.map((o) => `${o.purpose} (${o.profile}): ${o.properties}`).join('; ');
  return (
    `schema past the budget: ${list} properties, Vertex serves at most ` +
    `${MAX_SCHEMA_PROPERTIES} — these calls are refused with a 400 (#627)`
  );
}

export type CanaryRun = {
  /** When the real call last ran (the app clock), null before the first. */
  last_run_at: string | null;
  /** Its result: ok, or the error kind it failed with. Null before the first. */
  outcome: string | null;
  latency_ms: number | null;
  cost_micros: number | null;
  /** The line the failure travels as, null while the last call passed. */
  last_error: string | null;
};

type Heartbeat = {
  last_started_at: Date | null;
  last_error: string | null;
  stats: { outcome?: string; latency_ms?: number; cost_micros?: number } | null;
};

/** The canary's last real call, as `/health` reports it. */
export async function lastCanary(deps: Pick<Deps, 'db'>): Promise<CanaryRun> {
  const hb = await deps.db.maybeOne<Heartbeat>(
    `select last_started_at, last_error, stats from system_heartbeats where name = 'model_canary'`,
  );
  return {
    last_run_at: hb?.last_started_at ? hb.last_started_at.toISOString() : null,
    outcome: hb?.stats?.outcome ?? null,
    latency_ms: hb?.stats?.latency_ms ?? null,
    cost_micros: hb?.stats?.cost_micros ?? null,
    last_error: hb?.last_error ?? null,
  };
}

/**
 * Runs the real call when it is due and this run claims it, and returns the canary's state. Two
 * ticks at once claim it once: the claim is one conditional upsert on the heartbeat's start.
 */
export async function runCanary(deps: Deps): Promise<CanaryRun> {
  if (!deps.llm.available) return lastCanary(deps);
  const now = deps.now();
  const claimed = await deps.db.maybeOne(
    `insert into system_heartbeats (name, last_started_at) values ('model_canary', $1)
     on conflict (name) do update set last_started_at = $1
       where system_heartbeats.last_started_at is null
          or system_heartbeats.last_started_at <= $2
     returning name`,
    [now, new Date(now.getTime() - CANARY_INTERVAL_MINUTES * 60_000)],
  );
  if (!claimed) return lastCanary(deps);
  let outcome = 'ok';
  let error: string | null = null;
  let latency: number | null = null;
  let cost: number | null = null;
  try {
    const res = await callCanary(deps, { ...CANARY_REQUEST, timeoutMs: CANARY_TIMEOUT_MS });
    latency = res.usage.latencyMs;
    cost = res.usage.costMicros;
    if (!CanaryAnswer.safeParse(res.json).success) {
      outcome = 'invalid_output';
      error = 'model canary: the model answered, but not with the one field it was asked for';
    }
  } catch (err) {
    outcome = err instanceof LlmError ? err.kind : 'error';
    if (err instanceof LlmError && err.usage) {
      latency = err.usage.latencyMs;
      cost = err.usage.costMicros;
    }
    // The provider's own words go to the function log only: `/health` is public, and a refusal
    // can name the project or the service account.
    console.warn('[canary] model call failed', {
      outcome,
      message: err instanceof Error ? err.message.slice(0, 500) : String(err),
    });
    error = `model canary failed (${outcome}): the hourly test call on the learners' model got no usable answer; the provider's reason is in the function log`;
  }
  await deps.db.query(
    `update system_heartbeats set last_finished_at = $1, last_error = $2, stats = $3
      where name = 'model_canary'`,
    [deps.now(), error, JSON.stringify({ outcome, latency_ms: latency, cost_micros: cost })],
  );
  return lastCanary(deps);
}
