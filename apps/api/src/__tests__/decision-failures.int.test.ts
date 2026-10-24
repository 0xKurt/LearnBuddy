// requires live verification in Claude Code session
// Real Postgres; no provider calls. docs/architecture.md §Background work, issue #951.
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../lib/errors.js';
import { recordOfferFailure } from '../modules/practice/offerFailure.js';
import type { PracticeLearner } from '../modules/practice/service.js';
import { schedulerHealth } from '../modules/scheduler/health.js';
import { runTick } from '../modules/scheduler/tick.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();
describe.skipIf(!dbReady)('final decision failures (#951)', () => {
  let env: TestEnv;
  let learner: PracticeLearner;
  const metrics = async () =>
    (await schedulerHealth(env.db, env.clock.now())) as unknown as {
      decision_failures: Record<string, unknown>;
    };
  const message = async (
    code: string | null,
    at = env.clock.now(),
    status = code ? 'failed' : 'done',
    recall: string | null = null,
  ) => {
    const id = randomUUID();
    await env.db.query(
      `insert into buddy_messages
      (id, learner_id, role, text, client_message_id, status, failure_code, recall_block, created_at)
      values ($1,$2,'learner','private child text',$3,$4,$5,$6,$7)`,
      [id, learner.id, randomUUID(), status, code, recall, at],
    );
    return id;
  };
  const decision = async (messageId: string | null, disposition: string) => {
    const row = await env.db.one<{ id: string }>(
      `insert into buddy_decisions
      (learner_id,mode,trigger_message_id,context_version,disposition,created_at)
      values ($1,$2,$3,1,$4,$5) returning id`,
      [learner.id, messageId ? 'turn' : 'check', messageId, disposition, env.clock.now()],
    );
    return row.id;
  };
  const offer = async (at = env.clock.now()) => {
    const row = await env.db.one<{ id: string }>(
      `insert into buddy_actions
      (learner_id,tool,args,result,created_at) values ($1,'offer_learning','{}','{}',$2) returning id`,
      [learner.id, at],
    );
    return row.id;
  };
  beforeAll(async () => {
    env = await createTestEnv();
    const l = await onboard(env);
    learner = await env.db.one<PracticeLearner>('select * from learners where id = $1', [
      l.learnerId,
    ]);
  });
  beforeEach(async () => {
    await env.db.query('delete from buddy_actions');
    await env.db.query('delete from buddy_decisions');
    await env.db.query('delete from buddy_messages');
  });
  afterAll(async () => {
    await env?.close();
  });

  it('counts final messages once despite rejected attempts; separates repairs and background work', async () => {
    const failed = await message('invalid');
    await decision(failed, 'rejected');
    await decision(failed, 'rejected');
    const healed = await message(null);
    await decision(healed, 'rejected');
    await decision(healed, 'applied');
    await decision(null, 'rejected');
    expect((await metrics()).decision_failures).toMatchObject({
      messages: 2,
      failed: 1,
      percent: 50,
      alarming: false,
      rejected_attempts: 3,
      repaired_messages: 1,
      background: { decisions: 1, rejected: 1, failed: 0 },
    });
    // Retrying the same message heals the final outcome without adding a denominator row.
    await env.db.query("update buddy_messages set status='done', failure_code=null where id=$1", [
      failed,
    ]);
    expect((await metrics()).decision_failures).toMatchObject({ messages: 2, failed: 0 });
  });

  it('does not count stopped, blocked, protective decisions or in-progress retries as outages', async () => {
    await message('stopped');
    await message('blocked', env.clock.now(), 'done', 'blocked');
    await message(null, env.clock.now(), 'done', 'concern');
    await message('internal', env.clock.now(), 'processing');
    expect((await metrics()).decision_failures).toMatchObject({
      messages: 4,
      failed: 0,
      stopped: 1,
      blocked: 1,
      protected: 1,
      alarming: false,
    });
  });

  it('uses inclusive app-clock boundaries and returns only the top three fixed codes over 24 hours', async () => {
    const now = env.clock.now().getTime();
    await message('invalid', new Date(now - 60 * 60_000));
    await message('internal');
    await message('budget', new Date(now - 60 * 60_000 - 1));
    await message('invalid', new Date(now - 24 * 60 * 60_000));
    await message('model_unavailable', new Date(now - 24 * 60 * 60_000 - 1));
    await message('model_unavailable', new Date(now + 1));
    expect((await metrics()).decision_failures).toMatchObject({
      messages: 2,
      failed: 2,
      percent: 100,
      alarming: true,
      top_codes_24h: [
        { code: 'invalid', count: 2 },
        { code: 'budget', count: 1 },
        { code: 'internal', count: 1 },
      ],
    });
    expect(JSON.stringify(await metrics())).not.toContain('private child text');
  });

  it('requires both two failures and 25 percent, including zero traffic', async () => {
    expect((await metrics()).decision_failures).toMatchObject({
      messages: 0,
      failed: 0,
      percent: 0,
      alarming: false,
    });
    await message('budget');
    await message('model_unavailable');
    for (let i = 0; i < 7; i++) await message(null);
    expect((await metrics()).decision_failures).toMatchObject({
      messages: 9,
      failed: 2,
      alarming: false,
    });
    await env.db.query(
      'delete from buddy_messages where id in (select id from buddy_messages where failure_code is null limit 1)',
    );
    expect((await metrics()).decision_failures).toMatchObject({
      messages: 8,
      failed: 2,
      percent: 25,
      alarming: true,
    });
  });

  it('persists fixed offer reasons at failure time, including delayed failures and repeated taps', async () => {
    const oldOffer = await offer(new Date(env.clock.now().getTime() - 2 * 60 * 60_000));
    const error = new AppError('invalid_input', 'private provider text', { reason: 'not_usable' });
    await recordOfferFailure(env.deps, learner, oldOffer, error);
    await recordOfferFailure(env.deps, learner, oldOffer, error);
    const speech = await offer();
    await recordOfferFailure(
      env.deps,
      learner,
      speech,
      new AppError('invalid_input', 'private', { reason: 'speech_off' }),
    );
    const transient = await offer();
    await recordOfferFailure(env.deps, learner, transient, new Error('private child text'));
    const row = await env.db.one<{ result: unknown }>(
      'select result from buddy_actions where id=$1',
      [oldOffer],
    );
    expect(row.result).toMatchObject({
      offer_failure: { code: 'not_usable', at: env.clock.now().toISOString() },
    });
    expect((await metrics()).decision_failures).toMatchObject({
      failed: 0,
      offers: { failed: 3, permanent: 2, codes: { not_usable: 1, speech_off: 1, internal: 1 } },
    });
    expect(JSON.stringify(row.result)).not.toContain('private');
  });

  it('alarms on permanent offers independently, including legacy reasons and expiry', async () => {
    const first = await offer();
    const second = await offer();
    await recordOfferFailure(
      env.deps,
      learner,
      first,
      new AppError('invalid_input', 'private', { reason: 'not_usable' }),
    );
    await env.db.query('update buddy_actions set cannot_start_at=$2 where id=$1', [
      second,
      env.clock.now(),
    ]);
    expect((await metrics()).decision_failures).toMatchObject({
      failed: 0,
      offers: { total: 2, permanent: 2, alarming: true, codes: { not_usable: 1, unknown: 1 } },
    });
    const tick = await runTick(env.deps, { budgetMs: 0 });
    expect(tick.errors.some((e) => e.startsWith('offer failures:'))).toBe(true);
    const later = await schedulerHealth(env.db, new Date(env.clock.now().getTime() + 61 * 60_000));
    expect(later).toMatchObject({
      decision_failures: { offers: { failed: 0, permanent: 0, alarming: false } },
    });
  });

  it('the operator CLI returns only approved metadata, redacting arbitrary error text', async () => {
    const id = await decision(await message('invalid'), 'rejected');
    await env.db.query(
      `update buddy_decisions set errors=$2, output=$3, triggers=$3,
      model='scripted', prompt_version='v1' where id=$1`,
      [
        id,
        JSON.stringify(['model_invalid', 'budget_exhausted', 'private child text']),
        JSON.stringify({ secret: 'private child text' }),
      ],
    );
    await env.db.query(
      `insert into llm_calls
      (learner_id,purpose,model,prompt_version,outcome,decision_id,schema_variant,round,attempts,error_code,created_at)
      values ($1,'buddy_turn','scripted','v1','error',$2,'final, all tools',2,3,'refused:private child text',$3)`,
      [learner.id, id, env.clock.now()],
    );
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      ['--import', 'tsx', 'scripts/decision-why.ts', id],
      { env: { ...process.env, DATABASE_URL: env.deps.config.DATABASE_URL } },
    );
    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toEqual({
      disposition: 'rejected',
      errors: ['model_invalid', 'budget_exhausted', 'redacted'],
      model: 'scripted',
      prompt_version: 'v1',
      calls: [
        { schema_variant: 'final, all tools', round: 2, attempts: 3, error_code: 'redacted' },
      ],
    });
    expect(stdout).not.toContain('private');
    expect(stdout).not.toContain('output');
    expect(stdout).not.toContain('triggers');
    expect(
      (
        await env.db.one<{ disposition: string }>(
          'select disposition from buddy_decisions where id=$1',
          [id],
        )
      ).disposition,
    ).toBe('rejected');
  });

  it('keeps one alarm across ticks, exposes 503, and clears after recovery', async () => {
    await message('invalid');
    await message('invalid');
    const first = await runTick(env.deps, { budgetMs: 0 });
    const second = await runTick(env.deps, { budgetMs: 0 });
    expect(first.errors.filter((e) => e.startsWith('decision failures:'))).toHaveLength(1);
    expect(second.errors).toEqual(first.errors);
    expect((await env.app.request('/v1/health')).status).toBe(503);
    await env.db.query('update buddy_messages set created_at=$1', [
      new Date(env.clock.now().getTime() - 61 * 60_000),
    ]);
    const clean = await runTick(env.deps, { budgetMs: 0 });
    expect(clean.errors).toEqual([]);
    expect((await env.app.request('/v1/health')).status).toBe(200);
  });
});
