// requires live verification in Claude Code session (scripted model, real Postgres)
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { SendMessageResponse } from '@learnbuddy/shared-types/contracts';
import { createTestEnv, onboard, type TestEnv } from '../testing/harness.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';

const answer = (reply: string, actions: unknown[] = []) => ({ reply, actions, options: null });
const skeleton = {
  tool: 'show_figure',
  args: { drawing: 'skeleton', n: ['skull', 'spine'], parts: null, filled: null },
};

describe.skipIf(!(await testDatabaseAvailable()))('chat pictures and format repair', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await createTestEnv();
  });
  afterAll(async () => {
    await env?.close();
  });
  afterEach(() => env.checkScript({ reset: true }));

  it.each([
    '```text\n O\n/|\\\n```',
    '┌───┐\n│   │\n└───┘',
    ' O\n/|\\\n |\n/ \\',
    ' O\n/|\\',
    ' O <- Kopf\n/|\\ <- Arme\n | <- Rumpf\n/ \\ <- Beine',
  ])('repairs unsupported text drawings before storing: %s', async (bad) => {
    const l = await onboard(env);
    env.llm.script('buddy_turn', { json: answer(bad) }, (req) => {
      expect(ScriptedGateway.textOf(req)).toContain('reply');
      return answer('Hier siehst du das Skelett.', [skeleton]);
    });
    const res = await l.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: crypto.randomUUID(),
      text: 'Mit Bild bitte',
    });
    expect(res.body.status).toBe('done');
    expect(
      env.llm
        .callsFor('buddy_turn')
        .filter((c) => ScriptedGateway.textOf(c).includes('Your previous answer was rejected'))
        .length,
    ).toBeGreaterThan(0);
    const messages = await env.db.query<{ text: string }>(
      "select text from buddy_messages where learner_id = $1 and role = 'buddy'",
      [l.learnerId],
    );
    expect(messages).toEqual([{ text: 'Hier siehst du das Skelett.' }]);
    const actions = await env.db.query<{ result: unknown }>(
      'select result from buddy_actions where learner_id = $1',
      [l.learnerId],
    );
    expect(actions).toHaveLength(1);
    expect(actions[0]?.result).toMatchObject({
      tool: 'show_figure',
      figure: { type: 'schematic', d: 'skeleton' },
      labels: ['1. Schädel', '2. Wirbelsäule'],
    });
  });
  it('reads the real library before choosing labelled parts', async () => {
    const l = await onboard(env);
    env.llm.script(
      'buddy_turn',
      { json: { ...answer(''), lookups: [{ tool: 'schematic_parts', drawing: 'skeleton' }] } },
      (req) => {
        expect(ScriptedGateway.textOf(req)).toContain('humerus');
        expect(ScriptedGateway.textOf(req)).toContain('Oberarmknochen');
        return answer('Hier siehst du die Teile.', [skeleton]);
      },
    );
    const res = await l.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: crypto.randomUUID(),
      text: 'Skelett mit Bild',
    });
    expect(res.body.status).toBe('done');
    expect(env.llm.callsFor('buddy_turn')).toHaveLength(2);
  });

  it.each([
    { drawing: 'skeleton', n: ['antenna'], parts: null, filled: null },
    { drawing: 'skeleton', n: [], parts: null, filled: null },
    { drawing: 'fraction_circle', n: [], parts: 2, filled: 3 },
  ])('rejects an invalid picture, then applies only the corrected figure: %j', async (args) => {
    const l = await onboard(env);
    env.llm.script(
      'buddy_turn',
      {
        json: answer('Hier ist es.', [
          {
            tool: 'show_figure',
            args,
          },
        ]),
      },
      { json: answer('Hier ist es.', [skeleton]) },
    );
    const res = await l.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: crypto.randomUUID(),
      text: 'Skelett mit Bild',
    });
    expect(res.body.status).toBe('done');
    expect(env.llm.callsFor('buddy_turn')).toHaveLength(2);
    expect(
      await env.db.query('select 1 from buddy_actions where learner_id = $1', [l.learnerId]),
    ).toHaveLength(1);
  });

  it('fails closed when the repair still contains a code fence', async () => {
    const l = await onboard(env);
    env.llm.script(
      'buddy_turn',
      { json: answer('```text\nO\n```') },
      { json: answer('```text\nO\n```') },
    );
    env.llm.script('safeguard', { json: { concern: false } });
    const res = await l.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: crypto.randomUUID(),
      text: 'Skelett mit Bild',
    });
    expect(res.body.status).toBe('failed');
    expect(
      await env.db.query("select 1 from buddy_messages where learner_id = $1 and role = 'buddy'", [
        l.learnerId,
      ]),
    ).toHaveLength(0);
    expect(
      await env.db.query('select 1 from buddy_actions where learner_id = $1', [l.learnerId]),
    ).toHaveLength(0);
  });
});
