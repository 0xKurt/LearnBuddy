// The production must never break silently again (issue #650, audit F2-b): refused and unusable
// model calls alarm per purpose, a schema past what Vertex serves turns `/health` red on the next
// scheduler run, and an hourly real call proves the model answers at all.
// docs/architecture.md §Model calls.
//
// requires live verification in Claude Code session (needs a running Postgres; the provider is
// scripted — a real 400 for an oversized schema was measured in #627, a real canary call is
// recorded in the PR of #650.)

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { JsonSchema } from '../llm/gateway.js';
import { LlmError } from '../llm/gateway.js';
import { MAX_SCHEMA_PROPERTIES } from '../llm/schemaBudget.js';
import { registerSentSchemas, type SentSchema } from '../modules/buddy/schemas.js';
import { CANARY_INTERVAL_MINUTES } from '../modules/scheduler/canary.js';
import { runTick } from '../modules/scheduler/tick.js';
import {
  FAILURE_ALARM_PERCENT,
  FAILURE_MIN_FAILED,
  THROTTLE_WINDOW_MINUTES,
} from '../modules/scheduler/throttle.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

type Health = {
  ok: boolean;
  scheduler: {
    state: string;
    last_error: string | null;
    model_failures?: { purpose: string; refused: number; invalid_output: number }[];
    model_canary?: { last_run_at: string | null; outcome: string | null };
  };
};

async function health(env: TestEnv): Promise<{ status: number; body: Health }> {
  const res = await env.app.request('/v1/health');
  return { status: res.status, body: (await res.json()) as Health };
}

/** Call-log rows of one purpose, a minute old by the app clock. */
async function logCalls(
  env: TestEnv,
  learnerId: string,
  purpose: string,
  spec: { ok?: number; refused?: number; invalid?: number; minutesAgo?: number },
) {
  const at = new Date(env.clock.now().getTime() - (spec.minutesAgo ?? 1) * 60_000);
  const rows: [string, string | null][] = [
    ...Array.from({ length: spec.ok ?? 0 }, (): [string, string | null] => ['ok', null]),
    ...Array.from({ length: spec.refused ?? 0 }, (): [string, string | null] => [
      'error',
      'refused',
    ]),
    ...Array.from({ length: spec.invalid ?? 0 }, (): [string, string | null] => [
      'invalid_output',
      'invalid_output:MAX_TOKENS',
    ]),
  ];
  for (const [outcome, code] of rows)
    await env.db.query(
      `insert into llm_calls (learner_id, purpose, model, prompt_version, outcome, error_code, created_at)
       values ($1, $2, 'scripted', 'v1', $3, $4, $5)`,
      [learnerId, purpose, outcome, code, at],
    );
}

/** One flat object with `n` properties: the shape the bound was measured on (#627). */
function flat(n: number): JsonSchema {
  const properties: JsonSchema = {};
  for (let i = 0; i < n; i++) properties[`p${i}`] = { type: 'string' };
  return { type: 'object', properties, required: Object.keys(properties) };
}

// A build that ships a schema one property past the bound, switched on per test: registered the
// way a domain registers its schemas, so the tick reads it from the same list as every other.
let shipOversized = false;
const OVERSIZED: SentSchema = {
  purpose: 'explain',
  profile: 'grown by one field',
  tier: 'smart',
  promptVersion: 'test.v1',
  system: 'test',
  schema: flat(MAX_SCHEMA_PROPERTIES + 1),
  where: 'model-canary.int.test.ts',
};
registerSentSchemas(() => (shipOversized ? [OVERSIZED] : []));

describe.skipIf(!dbReady)('the model alarms (#650)', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-10-14T08:00:00Z' });
  });
  afterEach(async () => {
    shipOversized = false;
    try {
      await env.checkScript({ reset: true });
    } finally {
      await env.db.query(`delete from llm_calls`);
      await env.db.query(`delete from system_heartbeats where name = 'model_canary'`);
      // Every test starts a day later, so no window reaches back into another test's rows.
      env.clock.hours(24);
    }
  });
  afterAll(async () => {
    await env?.close();
  });

  it('a purpose whose calls are refused turns /health red, though every other call works', async () => {
    const l = await onboard(env);
    // The shape of #627: the chat answers all afternoon, every practice run is refused. As a
    // share of all calls that is 4 %, far below anything a global rate would notice.
    await logCalls(env, l.learnerId, 'buddy_turn', { ok: 48 });
    await logCalls(env, l.learnerId, 'explain', { refused: 2 });

    const stats = await runTick(env.deps);
    expect(stats.errors).toHaveLength(1);
    expect(stats.errors[0]).toContain('explain');
    expect(stats.errors[0]).toContain('2 refused');
    expect(stats.errors[0]).toContain(`${THROTTLE_WINDOW_MINUTES} min`);

    const red = await health(env);
    expect(red.status).toBe(503);
    expect(red.body.ok).toBe(false);
    expect(red.body.scheduler.state).toBe('failing');
    expect(red.body.scheduler.last_error).toBe(stats.errors[0]);
    expect(red.body.scheduler.model_failures?.[0]).toMatchObject({
      purpose: 'explain',
      refused: 2,
      invalid_output: 0,
    });
  });

  it('counts unusable answers with refusals, and stays quiet on one odd call or a low share', async () => {
    const l = await onboard(env);
    // One refusal alone: one odd request, not yet "the same thing again".
    await logCalls(env, l.learnerId, 'extraction', { refused: FAILURE_MIN_FAILED - 1 });
    expect((await runTick(env.deps)).errors).toEqual([]);

    // A cut-off answer next to it makes two failures of four calls: 50 %, an alarm.
    await logCalls(env, l.learnerId, 'extraction', { ok: 2, invalid: 1 });
    const alarmed = await runTick(env.deps);
    expect(alarmed.errors).toHaveLength(1);
    expect(alarmed.errors[0]).toContain('extraction — 1 refused and 1 unusable of 4 calls');

    // The same two failures among many good calls stay under the share.
    await logCalls(env, l.learnerId, 'extraction', { ok: 10 });
    const quiet = await runTick(env.deps);
    expect(quiet.failures?.[0]?.percent).toBeLessThan(FAILURE_ALARM_PERCENT);
    expect(quiet.errors).toEqual([]);

    // And rows older than the window, measured by the app clock, are not counted (rule 7).
    await env.db.query(`delete from llm_calls`);
    await logCalls(env, l.learnerId, 'extraction', {
      refused: 5,
      minutesAgo: THROTTLE_WINDOW_MINUTES + 1,
    });
    expect((await runTick(env.deps)).errors).toEqual([]);
  });

  it('a schema past the budget turns /health red on the next run, without a model call', async () => {
    const green = await runTick(env.deps);
    expect(green.errors).toEqual([]);
    expect(green.overBudget).toEqual([]);
    expect((await health(env)).status).toBe(200);

    // A deploy grows one schema by one field. The canary's hourly call ran a minute ago and is
    // not due for 59 minutes: the size check does not wait for it, nor for a learner's tap.
    shipOversized = true;
    env.clock.minutes(1);
    const canariesBefore = env.llm.canaries.length;
    const red = await runTick(env.deps);
    expect(env.llm.canaries.length).toBe(canariesBefore);
    expect(env.llm.calls).toEqual([]);
    expect(red.overBudget).toEqual([
      { purpose: 'explain', profile: 'grown by one field', properties: MAX_SCHEMA_PROPERTIES + 1 },
    ]);
    expect(red.errors).toHaveLength(1);
    expect(red.errors[0]).toContain(`${MAX_SCHEMA_PROPERTIES + 1} properties`);
    expect(red.errors[0]).toContain(`at most ${MAX_SCHEMA_PROPERTIES}`);
    const alarmed = await health(env);
    expect(alarmed.status).toBe(503);
    expect(alarmed.body.scheduler.state).toBe('failing');

    // The fix ships: the next run is green again.
    shipOversized = false;
    env.clock.minutes(1);
    expect((await runTick(env.deps)).errors).toEqual([]);
    expect((await health(env)).status).toBe(200);
  });

  it('calls the model once an hour, recorded without a learner, and not on every run', async () => {
    const first = await runTick(env.deps);
    expect(first.canary).toMatchObject({ outcome: 'ok', last_error: null });
    expect(env.llm.canaries).toHaveLength(1);
    const req = env.llm.canaries[0]!;
    // Tiny on purpose: one field, a two-line prompt, no thinking to pay for.
    expect(req).toMatchObject({ purpose: 'canary', tier: 'smart', thinking: 'minimal' });
    expect(Object.keys((req.schema as { properties: object }).properties)).toEqual(['ok']);

    const rows = await env.db.query<{ learner_id: string | null; outcome: string }>(
      `select learner_id, outcome from llm_calls where purpose = 'canary'`,
    );
    expect(rows).toEqual([{ learner_id: null, outcome: 'ok' }]);

    for (const minutes of [1, 30, CANARY_INTERVAL_MINUTES - 32]) {
      env.clock.minutes(minutes);
      await runTick(env.deps);
    }
    expect(env.llm.canaries).toHaveLength(1);
    env.clock.minutes(1); // an hour after the first
    await runTick(env.deps);
    expect(env.llm.canaries).toHaveLength(2);
  });

  it('two runs at once send one canary call', async () => {
    await Promise.all([runTick(env.deps), runTick(env.deps), runTick(env.deps)]);
    expect(env.llm.canaries).toHaveLength(1);
  });

  it('a failed canary keeps /health red on every run until the next call passes', async () => {
    env.llm.script('canary', {
      error: new LlmError('refused', 'provider rejected the request (403): permission denied'),
    });
    const failed = await runTick(env.deps);
    expect(failed.canary).toMatchObject({ outcome: 'refused' });
    expect(failed.errors).toHaveLength(1);
    expect(failed.errors[0]).toContain('model canary failed (refused)');
    // The provider's own words stay in the function log: /health is public.
    expect(failed.errors[0]).not.toContain('permission denied');
    const red = await health(env);
    expect(red.status).toBe(503);
    expect(red.body.scheduler.model_canary).toMatchObject({ outcome: 'refused' });

    // Half an hour later no call is due, and the alarm is still there.
    env.clock.minutes(30);
    const between = await runTick(env.deps);
    expect(env.llm.canaries).toHaveLength(1);
    expect(between.errors[0]).toContain('model canary failed');
    expect((await health(env)).status).toBe(503);

    // The next hourly call passes and clears it.
    env.clock.minutes(CANARY_INTERVAL_MINUTES - 30);
    const passed = await runTick(env.deps);
    expect(env.llm.canaries).toHaveLength(2);
    expect(passed.errors).toEqual([]);
    expect((await health(env)).status).toBe(200);
  });

  it('a model that answers, but not with the one field, is no healthy model', async () => {
    env.llm.script('canary', { json: { ok: false } });
    const stats = await runTick(env.deps);
    expect(stats.canary).toMatchObject({ outcome: 'invalid_output' });
    expect(stats.errors).toHaveLength(1);
    expect((await health(env)).status).toBe(503);
  });

  it('a tick without time for the whole call leaves it for the next', async () => {
    const stats = await runTick(env.deps, { budgetMs: 1_000 });
    expect(env.llm.canaries).toHaveLength(0);
    expect(stats.canary).toMatchObject({ last_run_at: null, outcome: null });
    expect(stats.errors).toEqual([]);
  });
});
