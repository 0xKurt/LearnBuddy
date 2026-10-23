// Buddy prepares what he offers while she reads his reply (issue #48): tapping the offer
// opens the session without a second model call, and a preparation that fails stays silent
// until she asks for it.
// requires live verification in Claude Code session (needs a running Postgres)

import type { SendMessageResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { exportAccount } from '../modules/identity/privacy.js';
import { tickWork } from '../modules/scheduler/registry.js';
import { applyDecision, type ApplyInput } from '../modules/buddy/apply.js';
import { noAliases } from '../modules/buddy/context.js';
import { turnActionSchema } from '../modules/buddy/registry.js';
import { loadSettings } from '../modules/buddy/state.js';
import { ToolRejection } from '../modules/buddy/toolKit.js';
import { LlmError } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const offer = (text: string, kind: 'practice' | 'test' = 'practice') => ({
  json: {
    lookups: [],
    concern: false,
    actions: [
      {
        tool: 'offer_learning',
        args: {
          kind,
          text,
          goal: null,
          asked: kind === 'test' ? 'Ich möchte einen Probetest' : null,
        },
      },
    ],
    reply: 'Ich bereite dir eine Übung vor.',
    options: null,
    asks_permission: false,
  },
});

const generated = (title: string) => ({
  json: {
    usable: true,
    title,
    subject: { name: 'Mathe', kind: 'math' },
    items: [
      {
        kind: 'short',
        prompt: 'Was ist 3/4 von 20?',
        answer: '15',
        accepted_answers: [],
        unit: null,
        choices: null,
        correct_choice: null,
        topic: 'Brüche',
        difficulty: 2,
        prompt_lang: null,
        lang: null,
        figure: null,
        source_excerpt: null,
      },
    ],
  },
});

describe.skipIf(!dbReady)('an offer is prepared in the background', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterEach(async () => {
    await env?.closeChecked();
  });

  it('has questions ready when she taps, without generating them again', async () => {
    env.llm.script('buddy_turn', offer('Brüche üben'));
    env.llm.script('explain', generated('Brüche'));
    const sent = await l.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: randomUUID(),
      text: 'Ich will Brüche üben',
    });
    expect(sent.status).toBe(200);
    // Offers live on Buddy's message, not in `done` (home.ts keeps them out of there).
    const action = sent.body.home.thread
      .flatMap((m) => m.actions)
      .find((a) => a.summary.tool === 'offer_learning');
    expect(action).toBeDefined();
    // The preparation runs in the background the route started.
    await env.flushBackground();
    expect(env.llm.callsFor('explain')).toHaveLength(1);
    expect(env.llm.callsFor('hints')).toHaveLength(0);

    // Her tap sends the offer's action id as the request id: the session is already there.
    const tapped = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: action!.id,
      kind: 'practice',
      text: 'Brüche üben',
    });
    expect(tapped.status === 200 || tapped.status === 201).toBe(true);
    expect(tapped.body.items).toHaveLength(1);
    expect(env.llm.callsFor('explain')).toHaveLength(1); // still one: nothing was asked twice
  });

  it('stays silent when the preparation fails — her tap prepares it as before', async () => {
    env.llm.script('buddy_turn', offer('Dreisatz üben'));
    env.llm.script('explain', { error: new LlmError('unavailable', 'model down') });
    const sent = await l.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: randomUUID(),
      text: 'Und Dreisatz?',
    });
    const action = sent.body.home.thread
      .flatMap((m) => m.actions)
      .find((a) => a.summary.tool === 'offer_learning' && a.summary.text === 'Dreisatz üben');
    expect(action).toBeDefined();
    await env.flushBackground();
    expect(sent.body.status).toBe('done');
    const sessions = await env.db.query(
      `select 1 from practice_sessions where learner_id = $1 and client_request_id = $2`,
      [l.learnerId, action!.id],
    );
    expect(sessions).toHaveLength(0);
    expect(await counts()).toEqual([{ kind: 'practice', offered: 1, opened: 0 }]);

    env.llm.script('explain', generated('Dreisatz'));
    const tapped = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: action!.id,
      kind: 'practice',
      text: 'Dreisatz üben',
    });
    expect(tapped.status === 200 || tapped.status === 201).toBe(true);
    expect(tapped.body.items).toHaveLength(1);
    expect(await counts()).toEqual([{ kind: 'practice', offered: 1, opened: 1 }]);
  });

  async function publish(kind: 'practice' | 'test', text: string) {
    env.llm.script('buddy_turn', offer(text, kind));
    env.llm.script('explain', generated(text));
    const request = {
      client_message_id: randomUUID(),
      text: kind === 'test' ? `Ich möchte einen Probetest zu ${text}` : text,
    };
    const sent = await l.api.post<SendMessageResponse>('/buddy/messages', request);
    expect(sent.status).toBe(200);
    await env.flushBackground();
    const action = sent.body.home.thread
      .flatMap((m) => m.actions)
      .find((a) => a.summary.tool === 'offer_learning' && a.summary.text === text)!;
    expect(action).toBeDefined();
    return { action, request, input: { client_request_id: action.id, kind, text } };
  }

  async function counts() {
    return env.db.query(
      `select kind, sum(offered)::int as offered, sum(opened)::int as opened
         from offer_counters where learner_id = $1 group by kind order by kind`,
      [l.learnerId],
    );
  }

  async function decision(): Promise<ApplyInput> {
    const settings = await loadSettings(env.db, l.learnerId);
    return {
      learnerId: l.learnerId,
      locale: 'de',
      contextVersion: settings.context_version,
      aliases: noAliases(),
      now: env.clock.now(),
      reference: env.clock.now(),
      learnerWords: ['Brüche'],
      triggerMessageId: null,
      messageClaim: null,
      actions: [turnActionSchema().parse(offer('Brüche').json.actions[0])],
      reply: { text: 'Hier ist deine Übung.', options: null },
      outreach: null,
      meta: {
        mode: 'turn',
        attempt: 1,
        model: null,
        promptVersion: 'test',
        output: {},
        triggers: [],
        reason: null,
        topicKey: null,
      },
    };
  }

  it('rejects an unknown offer kind in code before SQL can abort the decision', async () => {
    const input = await decision();
    // Exercise the write boundary even if an internal caller bypasses input parsing.
    Object.assign(input.actions[0]!.args, { kind: 'future_offer_kind' });
    await expect(applyDecision(env.db, input)).resolves.toMatchObject({
      status: 'rejected',
      errors: [expect.stringContaining('kind')],
    });
    expect(await counts()).toEqual([]);
    expect((await loadSettings(env.db, l.learnerId)).context_version).toBe(input.contextVersion);
  });

  it('keeps SQL open to future contract kinds while requiring a non-null kind', async () => {
    const { action } = await publish('practice', 'Brüche');
    await env.db.query('update offer_counters set kind = $1 where action_id = $2', [
      'future_offer_kind',
      action.id,
    ]);
    expect(await counts()).toEqual([{ kind: 'future_offer_kind', offered: 1, opened: 0 }]);
    await expect(
      env.db.query('update offer_counters set kind = null where action_id = $1', [action.id]),
    ).rejects.toMatchObject({ code: '23502' });
  });

  it('rolls back the counter with its action and reply if publication is rejected', async () => {
    const input = await decision();
    input.scene = {
      apply: async () => {},
      close: async (tx) => {
        expect(
          await tx.query('select 1 from offer_counters where learner_id = $1', [l.learnerId]),
        ).toHaveLength(1);
        throw new ToolRejection('publication rejected');
      },
    };
    expect(await applyDecision(env.db, input)).toEqual({
      status: 'rejected',
      errors: ['publication rejected'],
    });
    expect(await counts()).toEqual([]);
    for (const table of ['buddy_actions', 'buddy_messages']) {
      expect(
        await env.db.query(`select 1 from ${table} where learner_id = $1`, [l.learnerId]),
      ).toEqual([]);
    }
    expect(
      await env.db.query('select disposition from buddy_decisions where learner_id = $1', [
        l.learnerId,
      ]),
    ).toEqual([{ disposition: 'rejected' }]);
    expect((await loadSettings(env.db, l.learnerId)).context_version).toBe(input.contextVersion);
  });

  it('counts offered vs opened per kind once, including message retries and concurrent opens', async () => {
    const practice = await publish('practice', 'Brüche');
    const test = await publish('test', 'Dreisatz');
    // A lost chat response does not publish (or count) its offer a second time.
    expect((await l.api.post('/buddy/messages', practice.request)).status).toBe(200);
    expect(await counts()).toEqual([
      { kind: 'practice', offered: 1, opened: 0 },
      { kind: 'test', offered: 1, opened: 0 },
    ]);
    const opened = await Promise.all([
      l.api.post<SessionView>('/practice/topic', practice.input),
      l.api.post<SessionView>('/practice/topic', practice.input),
    ]);
    expect(opened.every((r) => r.status === 201)).toBe(true);
    await l.api.get(`/practice/sessions/${opened[0]!.body.id}`);
    await env.flushBackground();
    expect(await counts()).toEqual([
      { kind: 'practice', offered: 1, opened: 1 },
      { kind: 'test', offered: 1, opened: 0 },
    ]);
    // A prepared run can also be opened directly from its resume link.
    const run = await env.db.one<{ id: string }>(
      'select id from practice_sessions where learner_id = $1 and client_request_id = $2',
      [l.learnerId, test.action.id],
    );
    const other = await onboard(env);
    expect((await other.api.get(`/practice/sessions/${run.id}`)).status).toBe(404);
    expect((await l.api.get(`/practice/sessions/${run.id}`)).status).toBe(200);
    expect(await counts()).toEqual([
      { kind: 'practice', offered: 1, opened: 1 },
      { kind: 'test', offered: 1, opened: 0 },
    ]);
    expect((await l.api.post(`/practice/sessions/${run.id}/open`)).status).toBe(204);
    expect(await counts()).toEqual([
      { kind: 'practice', offered: 1, opened: 1 },
      { kind: 'test', offered: 1, opened: 1 },
    ]);
  });

  it('exports only counter metadata, erases it with the learner, and retains it for 180 days', async () => {
    const { action, input } = await publish('practice', 'Brüche');
    const out = await exportAccount(env.db, l.accountId);
    expect(out.offer_counters).toEqual([
      {
        action_id: action.id,
        learner_id: l.learnerId,
        kind: 'practice',
        offered: 1,
        opened: 0,
        created_at: env.clock.now(),
      },
    ]);
    const other = await onboard(env);
    const theirs = await other.api.get<{ offer_counters: unknown[] }>('/account/export');
    expect(theirs.body.offer_counters).toEqual([]);
    const rls = await env.db.one<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where oid = 'offer_counters'::regclass",
    );
    expect(rls.relrowsecurity).toBe(true);
    env.clock.advance(180 * 86_400_000);
    const sweep = tickWork().find((w) => w.sweep?.key === 'offer_counters')!.sweep!;
    expect(await sweep.run(env.deps)).toBe(0);
    expect(await counts()).toHaveLength(1); // boundary retained, like llm_calls
    env.clock.advance(1);
    expect(await sweep.run(env.deps)).toBe(1);
    expect(await counts()).toEqual([]);
    // Opening an old offer never recreates bookkeeping beyond its retention window.
    expect((await l.api.post('/practice/topic', input)).status).toBe(201);
    await env.flushBackground();
    expect(await counts()).toEqual([]);
    await publish('test', 'Dreisatz');
    await env.db.query('delete from learners where id = $1', [l.learnerId]);
    expect(await counts()).toEqual([]);
  });
});
