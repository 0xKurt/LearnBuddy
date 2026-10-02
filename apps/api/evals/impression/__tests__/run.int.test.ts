// The overall-impression runner's measuring instrument, on a real Postgres with a scripted
// model (issue #127). What a live run cannot tell you is whether the runner READ what it
// claims to read: in #127 the buddy eval's `turns[].tools` was declared, documented and always
// empty, so every check of "what did this turn do" passed by accident. This proves, per turn,
// that a stored answer, an applied tool, an ask-back flag, a failure and the token count each
// arrive in the transcript — and that every scenario's own setup runs on today's schema.
//
// requires live verification in Claude Code session (the model is scripted here; the live run
// is scripts/eval-impression.sh)

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LlmError } from '../../../src/llm/gateway.js';
import { testDatabaseAvailable } from '../../../src/testing/database.js';
import { createTestEnv, onboard, type TestEnv } from '../../../src/testing/harness.js';
import { walkConversation } from '../run.js';
import { SCENARIOS } from '../scenarios.js';
import { ImpressionRun } from '../transcript.js';

const dbReady = await testDatabaseAvailable();

const answer = (reply: string, extra: Record<string, unknown> = {}) => ({
  json: {
    reply,
    options: null,
    concern: false,
    also_asked: false,
    asks_permission: false,
    actions: [],
    ...extra,
  },
});

describe.skipIf(!dbReady)('impression runner', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-09-28T14:00:00Z' });
  });
  afterAll(async () => {
    await env?.close();
  });

  it('runs every scenario’s setup on the current schema', async () => {
    for (const s of SCENARIOS) {
      const l = await onboard(env, {
        locale: s.learner.locale,
        timezone: 'Europe/Berlin',
        relation: s.learner.relation,
        ...(s.learner.birthDate ? { birthDate: s.learner.birthDate } : {}),
      });
      await s.setup?.(env, l);
      expect(s.says.length, s.id).toBeGreaterThan(0);
    }
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
    // Enough scenarios that a clear result CAN be significant (stats.ts winsNeeded(6) = 6).
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(8);
  });

  it('writes down per turn what was said, done, asked and spent — and a failure as a failure', async () => {
    const l = await onboard(env, { relation: 'child', birthDate: '2014-02-10' });
    env.llm.script(
      'buddy_turn',
      answer('Hallo! Was steht heute an?'),
      answer('Cool, 7. Klasse — merk ich mir.', {
        actions: [
          {
            tool: 'remember',
            args: {
              kind: 'fact',
              about: 'learning',
              statement: 'Geht in die 7. Klasse',
              quote: 'in der 7. klasse',
              until: { kind: 'unknown' },
            },
          },
        ],
      }),
      answer('Soll ich dich morgen um 16 Uhr erinnern?', {
        asks_permission: true,
        options: ['Ja', 'Nein'],
      }),
      { error: new LlmError('rate_limited', 'provider rate limit') },
    );
    const says = ['hi', 'ich bin in der 7. klasse', 'mathearbeit am donnerstag', 'ja'];
    const turns = await walkConversation(env, l, says);

    expect(turns.map((t) => t.said)).toEqual(says);
    expect(turns[0]).toMatchObject({
      status: 'done',
      reply: 'Hallo! Was steht heute an?',
      asks: false,
      tools: [],
    });
    // The applied tool of THIS turn, not of the whole conversation.
    expect(turns[1]).toMatchObject({ status: 'done', tools: ['remember'], asks: false });
    expect(turns[2]).toMatchObject({ asks: true, options: ['Ja', 'Nein'], tools: [] });
    // The throttled turn is recorded as unanswered with its honest code (issue #206), and is
    // not credited with the previous turn's answer.
    expect(turns[3]).toMatchObject({
      status: 'failed',
      errorCode: 'model_busy',
      reply: null,
      tools: [],
    });
    for (const t of turns) expect(t.latencyMs).toBeGreaterThanOrEqual(0);
    // Each answered turn made exactly its own model call, which the scripted model bills as
    // whatever usage it reports — the counter moves per turn, never cumulatively.
    const calls = await env.db.query<{ input_tokens: number }>(
      `select input_tokens from llm_calls where learner_id = $1 order by created_at`,
      [l.learnerId],
    );
    expect(turns.slice(0, 3).reduce((s, t) => s + t.inputTokens, 0)).toBe(
      calls.slice(0, 3).reduce((s, c) => s + c.input_tokens, 0),
    );

    // What the runner writes is what the judge accepts.
    expect(
      ImpressionRun.safeParse({
        kind: 'impression-run',
        promptVersion: 'test',
        revision: 'working tree',
        ranAt: '2026-09-28T14:00:00Z',
        models: [],
        runsPerScenario: 1,
        conversations: [{ scenario: 'x', run: 0, turns }],
      }).success,
    ).toBe(true);
  });
});
