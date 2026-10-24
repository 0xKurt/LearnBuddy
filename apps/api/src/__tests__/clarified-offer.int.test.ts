// A clarification keeps only its immediately preceding wish quotable (#938).
// requires live verification in Claude Code session (scripted model, real Postgres)
import { randomUUID } from 'node:crypto';
import type { SendMessageResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const wish = 'Kannst du mir einen Test mit 20 Vokabeln zusammenstellen?';
const turn = (reply: string, options: string[] | null = null, actions: unknown[] = []) => ({
  json: { lookups: [], concern: false, actions, reply, options, asks_permission: false },
});
const offer = () =>
  turn('Dein Vokabeltest ist bereit.', null, [
    {
      tool: 'offer_learning',
      args: { kind: 'test', text: '20 Vokabeln Deutsch und Englisch', asked: wish },
    },
  ]);
async function say(l: Learner, text: string) {
  const res = await l.api.post<SendMessageResponse>('/buddy/messages', {
    client_message_id: randomUUID(),
    text,
  });
  expect(res.status).toBe(200);
  return res.body;
}
async function expectRejectedQuotes(env: TestEnv) {
  const rejected = await env.db.query<{ errors: string[] }>(
    "select errors from buddy_decisions where disposition = 'rejected'",
  );
  expect(rejected).toHaveLength(2);
  expect(
    rejected.every((r) => r.errors.join(' ').includes("is not the learner's exact words")),
  ).toBe(true);
}
const dbReady = await testDatabaseAvailable();
describe.skipIf(!dbReady)('a test requested before a clarification', () => {
  let env: TestEnv;
  let learner: Learner;
  beforeEach(async () => {
    env = await createTestEnv();
    learner = await onboard(env);
  });
  afterEach(async () => {
    await env?.closeChecked();
  });

  it('accepts the exact production sequence and opens the offered test', async () => {
    env.llm.script(
      'buddy_turn',
      turn('In welcher Sprache?', ['Deutsch und Englisch', 'Französisch']),
    );
    expect((await say(learner, wish)).status).toBe('done');
    env.llm.script('buddy_turn', offer());
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Vokabeltest',
        subject: { name: 'Englisch', kind: 'english' },
        items: [
          {
            kind: 'short',
            prompt: 'Was heißt Haus auf Englisch?',
            answer: 'house',
            accepted_answers: [],
            topic: 'Vokabeln',
            difficulty: 1,
            unit: null,
            choices: null,
            correct_choice: null,
            prompt_lang: null,
            lang: null,
            figure: null,
            source_excerpt: null,
          },
        ],
      },
    });
    const answer = await say(learner, 'Deutsch und Englisch.');
    expect(answer.status).toBe('done');
    const action = answer.home.thread
      .flatMap((m) => m.actions)
      .find((a) => a.summary.tool === 'offer_learning');
    expect(action?.summary).toMatchObject({ kind: 'test' });
    expect(
      await env.db.one<{ args: { asked: string } }>(
        'select args from buddy_actions where id = $1 and learner_id = $2',
        [action!.id, learner.learnerId],
      ),
    ).toMatchObject({ args: { asked: wish } });
    await env.flushBackground();
    const opened = await learner.api.post<SessionView>('/practice/topic', {
      client_request_id: action!.id,
      kind: 'test',
      text: '20 Vokabeln Deutsch und Englisch',
    });
    expect([200, 201]).toContain(opened.status);
    expect(opened.body.mode).toBe('test');
    expect(opened.body.items).toHaveLength(1);
    expect(
      await env.db.query("select 1 from buddy_decisions where disposition = 'rejected'"),
    ).toHaveLength(0);
  });

  it.each(['older', 'other learner', 'ordinary answer'] as const)(
    'rejects a quote from %s',
    async (source) => {
      const owner = source === 'other learner' ? await onboard(env) : learner;
      env.llm.script('buddy_turn', turn('Alles klar.'));
      await say(owner, wish);
      if (source !== 'ordinary answer') {
        env.llm.script(
          'buddy_turn',
          turn('In welcher Sprache?', ['Deutsch und Englisch', 'Französisch']),
        );
        await say(learner, 'Lass uns etwas lernen.');
      }
      env.llm.script('buddy_turn', offer(), offer());
      const failed = await say(learner, 'Deutsch und Englisch.');
      expect(failed.status).toBe('failed');
      expect(failed.home.thread.some((m) => m.text === 'Deutsch und Englisch.')).toBe(true);
      expect(
        await env.db.query("select 1 from buddy_actions where tool = 'offer_learning'"),
      ).toHaveLength(0);
      await expectRejectedQuotes(env);
    },
  );
  it.each(['remember', 'set_contact'] as const)(
    'keeps %s restricted to the current answer',
    async (tool) => {
      env.llm.script(
        'buddy_turn',
        turn('In welcher Sprache?', ['Deutsch und Englisch', 'Französisch']),
      );
      await say(learner, wish);
      const args =
        tool === 'remember'
          ? {
              about: 'learning',
              kind: 'fact',
              statement: 'Möchte einen Test mit 20 Vokabeln',
              quote: wish,
              until: null,
            }
          : {
              preferred_start: null,
              preferred_end: null,
              quiet_start: '18:00',
              quiet_end: null,
              avoid_weekdays: null,
              pause: null,
              quote: wish,
            };
      const forbidden = turn('Notiert.', null, [{ tool, args }]);
      env.llm.script('buddy_turn', forbidden, forbidden);
      expect((await say(learner, 'Deutsch und Englisch.')).status).toBe('failed');
      expect(
        await env.db.query('select 1 from buddy_actions where tool = $1', [tool]),
      ).toHaveLength(0);
      await expectRejectedQuotes(env);
    },
  );
});
