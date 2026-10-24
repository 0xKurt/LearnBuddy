// Topic requests and edited memories must be checked before generation or storage (#918).
// requires live verification in Claude Code session (real Postgres, scripted model)
import { randomUUID } from 'node:crypto';

import {
  StartTopicRequest,
  type ApiErrorEnvelope,
  type SessionView,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DAILY_LIMITS } from '../config.js';
import { safeguardingText } from '../i18n/safeguarding.js';
import { LlmError } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();
const DISCLOSURE = 'In der Schule werde ich jeden Tag gehauen';
const TASK = 'Was ist 3 mal 4?';
const ORIGINAL = 'Möchte kurze Übungen';

describe.skipIf(!dbReady)('safeguarding before generating a topic or editing a memory', () => {
  let env: TestEnv;
  let learner: Learner;
  beforeEach(async () => {
    env = await createTestEnv();
    learner = await onboard(env, { relation: 'child' });
  });
  afterEach(() => env.closeChecked());

  async function memory() {
    return env.db.one<{ id: string }>(
      `insert into buddy_memories (learner_id, kind, statement, source, created_at)
       values ($1, 'preference', $2, 'learner_edited', $3) returning id`,
      [learner.learnerId, ORIGINAL, env.clock.now()],
    );
  }

  for (const target of ['topic', 'memory'] as const) {
    for (const scenario of [
      'child',
      'adult',
      'blocked',
      'timeout',
      'unavailable',
      'invalid',
      'limit',
    ] as const) {
      it(`${target}: ${scenario} returns fixed help and changes nothing`, async () => {
        const minor = scenario !== 'adult';
        if (!minor) learner = await onboard(env, { locale: 'en' });
        const row = target === 'memory' ? await memory() : null;
        const before = await env.db.query('select * from buddy_memories where learner_id = $1', [
          learner.learnerId,
        ]);
        const context = await env.db.one(
          'select context_version from buddy_settings where learner_id = $1',
          [learner.learnerId],
        );
        const kind =
          scenario === 'blocked'
            ? 'blocked'
            : ['timeout', 'unavailable', 'invalid', 'limit'].includes(scenario)
              ? 'unchecked'
              : 'concern';
        if (scenario === 'limit') {
          await env.db.query(
            `insert into usage_daily (learner_id, day, kind, calls)
             values ($1, '2026-09-28', 'safeguard', $2)`,
            [learner.learnerId, DAILY_LIMITS.safeguard],
          );
        } else {
          env.llm.script(
            'safeguard',
            scenario === 'blocked' || scenario === 'timeout' || scenario === 'unavailable'
              ? { error: new LlmError(scenario, 'check unavailable') }
              : { json: scenario === 'invalid' ? {} : { concern: true, reply: 'Never show this' } },
          );
        }
        // An unsafe regression may call the generator; keep its answer valid so the failure
        // proves the missing gate rather than a missing script.
        env.llm.byDefault('explain', { json: generated(DISCLOSURE) });
        const res = row
          ? await learner.api.patch<ApiErrorEnvelope>(`/buddy/memory/${row.id}`, {
              statement: DISCLOSURE,
              version: 1,
            })
          : await learner.api.post<ApiErrorEnvelope>('/practice/topic', {
              client_request_id: randomUUID(),
              kind: 'help',
              text: DISCLOSURE,
            });
        expect(res.status).toBe(kind === 'unchecked' ? 503 : 422);
        expect(res.body.error.details).toEqual({
          reason: 'safeguarding',
          reply: safeguardingText(minor ? 'de' : 'en', minor, kind),
        });
        expect(env.llm.callsFor('explain')).toHaveLength(0);
        expect(env.llm.choices).toHaveLength(0);
        expect(
          await env.db.query('select * from items where learner_id = $1', [learner.learnerId]),
        ).toEqual([]);
        expect(
          await env.db.query('select * from practice_sessions where learner_id = $1', [
            learner.learnerId,
          ]),
        ).toEqual([]);
        expect(
          await env.db.query('select * from buddy_memories where learner_id = $1', [
            learner.learnerId,
          ]),
        ).toEqual(before);
        expect(
          await env.db.one('select context_version from buddy_settings where learner_id = $1', [
            learner.learnerId,
          ]),
        ).toEqual(context);
        if (scenario !== 'limit') {
          expect(env.llm.callsFor('safeguard')).toHaveLength(1);
          expect(ScriptedGateway.textOf(env.llm.callsFor('safeguard')[0]!)).toContain(DISCLOSURE);
        }
      });
    }
  }

  it.each(StartTopicRequest.shape.kind.options)(
    'checks free text for topic kind %s',
    async (kind) => {
      env.llm.script('safeguard', { json: { concern: true } });
      const res = await learner.api.post<ApiErrorEnvelope>('/practice/topic', {
        client_request_id: randomUUID(),
        kind,
        text: DISCLOSURE,
      });
      expect(res.status).toBe(422);
      expect(res.body.error.details?.reply).toBe(safeguardingText('de', true, 'concern'));
      expect(env.llm.calls.map((call) => call.purpose)).toEqual(['safeguard']);
    },
  );

  it('keeps harmless homework unchanged and replays its session without generating twice', async () => {
    env.llm.script('explain', { json: generated(TASK) });
    const body = { client_request_id: randomUUID(), kind: 'help', text: TASK };
    const res = await learner.api.post<SessionView>('/practice/topic', body);
    expect(res.status).toBe(201);
    expect(res.body.items[0]!.item.prompt).toBe(TASK);
    expect((await learner.api.post<SessionView>('/practice/topic', body)).body.id).toBe(
      res.body.id,
    );
    expect(env.llm.callsFor('explain')).toHaveLength(1);
    expect(env.llm.callsFor('safeguard')).toHaveLength(1);
  });

  it('keeps harmless edits unchanged; retract and undo need no text check', async () => {
    const row = await memory();
    const statement = 'Möchte kurze Übungen mit Pausen';
    expect(
      (await learner.api.patch(`/buddy/memory/${row.id}`, { statement, version: 1 })).status,
    ).toBe(200);
    const saved = await env.db.one<{ id: string; statement: string; source: string }>(
      `select id, statement, source from buddy_memories where supersedes_id = $1`,
      [row.id],
    );
    expect(saved).toMatchObject({ statement, source: 'learner_edited' });
    expect(
      (await learner.api.patch(`/buddy/memory/${saved.id}`, { retract: true, version: 1 })).status,
    ).toBe(200);
    expect(
      (await learner.api.patch(`/buddy/memory/${saved.id}`, { unretract: true, version: 2 }))
        .status,
    ).toBe(200);
    expect(env.llm.callsFor('safeguard')).toHaveLength(1);
  });

  it('rejects another learner’s memory before checking text', async () => {
    const row = await memory();
    const other = await onboard(env);
    expect(
      (await other.api.patch(`/buddy/memory/${row.id}`, { statement: TASK, version: 1 })).status,
    ).toBe(404);
    expect(env.llm.callsFor('safeguard')).toHaveLength(0);
  });

  it('rejects an obsolete memory version before checking text', async () => {
    const row = await memory();
    expect(
      (await learner.api.patch(`/buddy/memory/${row.id}`, { statement: TASK, version: 0 })).status,
    ).toBe(409);
    expect(env.llm.callsFor('safeguard')).toHaveLength(0);
  });

  it('rechecks the memory version after a slow check', async () => {
    const row = await memory();
    env.llm.script('safeguard', async () => {
      expect(
        (await learner.api.patch(`/buddy/memory/${row.id}`, { retract: true, version: 1 })).status,
      ).toBe(200);
      expect(
        (await learner.api.patch(`/buddy/memory/${row.id}`, { unretract: true, version: 2 }))
          .status,
      ).toBe(200);
      return { concern: false };
    });
    const res = await learner.api.patch(`/buddy/memory/${row.id}`, { statement: TASK, version: 1 });
    expect(res.status).toBe(409);
    expect(
      await env.db.query('select id from buddy_memories where supersedes_id = $1', [row.id]),
    ).toEqual([]);
  });
});

function generated(prompt: string) {
  return {
    usable: true,
    title: 'Einmaleins',
    subject: { name: 'Mathe', kind: 'math' },
    items: [
      {
        kind: 'short',
        prompt,
        answer: '12',
        accepted_answers: [],
        unit: null,
        choices: null,
        correct_choice: null,
        topic: 'Einmaleins',
        difficulty: 1,
        prompt_lang: null,
        lang: null,
        figure: null,
        source_excerpt: null,
      },
    ],
  };
}
