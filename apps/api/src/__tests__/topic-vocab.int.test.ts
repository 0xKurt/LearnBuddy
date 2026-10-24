// Topic vocabulary and chat lists share validated pairs (#940).
// requires live verification in Claude Code session
import { randomUUID } from 'node:crypto';
import type { SendMessageResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const vocabulary = {
  source: 'topic',
  output: 'practice',
  count: 2,
  prompt_lang: 'en',
  lang: 'de',
  direction: 'both',
};
const pair = (prompt: string, answer: string) => ({
  kind: 'vocab',
  prompt,
  answer,
  accepted_answers: [] as string[],
  reverse_answers: [] as string[],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Wohnung',
  difficulty: 2,
  prompt_lang: 'en',
  lang: 'de',
  figure: null,
  source_excerpt: null,
});
const pairs = [pair('the kitchen', 'die Küche'), pair('the room', 'das Zimmer')];
const generated = (items = pairs) => ({
  json: {
    usable: true,
    title: 'Wohnung',
    subject: { name: 'Englisch', kind: 'english' },
    items,
  },
});
const offered = (output: 'chat' | 'practice', reply = 'Fertig, deine Vokabeln sind bereit.') => ({
  json: {
    lookups: [],
    concern: false,
    actions: [
      {
        tool: 'offer_learning',
        args: {
          kind: 'vocab',
          text: 'Wohnung',
          vocabulary: { ...vocabulary, output },
        },
      },
    ],
    reply,
    options: null,
    asks_permission: false,
  },
});
const dbReady = await testDatabaseAvailable();
describe.skipIf(!dbReady)('topic vocabulary (#940)', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv();
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterEach(() => env.closeChecked());

  async function start(extra = {}, items = pairs) {
    env.llm.script('explain', generated(items));
    return l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'vocab',
      text: 'Basisvokabeln zur Wohnung',
      vocabulary,
      ...extra,
    });
  }

  it('creates topic pairs with Buddy provenance and reuses existing cards', async () => {
    const first = await start();
    expect(first.status).toBe(201);
    expect(first.body.items).toHaveLength(4);
    expect(first.body.items.every((i) => i.item.origin === 'buddy')).toBe(true);
    const second = await start();
    expect(second.status).toBe(201);
    expect(second.body.items.map((i) => i.item.id).sort()).toEqual(
      first.body.items.map((i) => i.item.id).sort(),
    );
    expect(
      await env.db.query('select id from items where learner_id = $1', [l.learnerId]),
    ).toHaveLength(4);
  });

  it('keeps an actual typed list, even when its sides have only whitespace between them', async () => {
    const result = await start({
      text: 'the kitchen die Küche; the room das Zimmer',
      vocabulary: { ...vocabulary, source: 'typed' },
    });
    expect(result.status).toBe(201);
    expect(result.body.items).toHaveLength(4);
    expect(result.body.items.every((i) => i.item.origin === 'typed')).toBe(true);
  });

  it('makes exactly forty cards for twenty distinct pairs', async () => {
    const items = Array.from({ length: 20 }, (_, i) => pair(`word ${i}`, `Wort ${i}`));
    const result = await start({ vocabulary: { ...vocabulary, count: 20 } }, items);
    expect(result.status).toBe(201);
    expect(result.body.items).toHaveLength(40);
  });

  it('refuses an invented pair in a typed list', async () => {
    const result = await start({
      text: 'the kitchen – die Küche',
      vocabulary: { ...vocabulary, source: 'typed' },
    });
    expect(result.status).toBe(422);
    expect(
      await env.db.query('select id from items where learner_id = $1', [l.learnerId]),
    ).toHaveLength(0);
  });

  it('counts distinct valid pairs before promising the requested count', async () => {
    const result = await start({}, [pairs[0]!, pairs[0]!]);
    expect(result.status).toBe(422);
  });

  it('keeps a requested single direction and reverse accepted translations', async () => {
    const items = [{ ...pairs[0]!, reverse_answers: ['kitchen'] }, pairs[1]!];
    const result = await start(
      { vocabulary: { ...vocabulary, prompt_lang: 'de', lang: 'en', direction: 'produce' } },
      items,
    );
    expect(result.status).toBe(201);
    expect(result.body.items).toHaveLength(2);
    expect(result.body.items.map((i) => i.item.prompt)).toEqual(['die Küche', 'das Zimmer']);
    const reverse = await env.db.one<{ accepted_answers: string[] }>(
      "select accepted_answers from items where learner_id = $1 and prompt = 'die Küche'",
      [l.learnerId],
    );
    expect(reverse.accepted_answers).toContain('kitchen');
  });

  it.each([
    { ...vocabulary, count: 26 },
    { ...vocabulary, lang: 'en' },
  ])('refuses an unsupported count or equal languages before generation', async (request) => {
    const result = await l.api.post('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'vocab',
      text: 'Wohnung',
      vocabulary: request,
    });
    expect(result.status).toBe(422);
    expect(env.llm.callsFor('explain')).toHaveLength(0);
  });

  it('does not reuse another learner’s cards', async () => {
    const first = await start();
    const other = await onboard(env);
    env.llm.script('explain', generated());
    const next = await other.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'vocab',
      text: 'Wohnung',
      vocabulary,
    });
    expect(next.status).toBe(201);
    expect(
      next.body.items.every((i) => !first.body.items.some((old) => old.item.id === i.item.id)),
    ).toBe(true);
  });

  it('reuses cards across concurrent requests without duplicate session entries', async () => {
    const [first, second] = await Promise.all([start(), start()]);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(
      await env.db.query('select id from items where learner_id = $1', [l.learnerId]),
    ).toHaveLength(4);
    expect(new Set(second.body.items.map((i) => i.item.id)).size).toBe(4);
  });

  it('repairs a topic request mislabeled as a typed list before offering it', async () => {
    const wish = 'Schick mir 2 englische Vokabeln zur Wohnung im Chat';
    const wrong = offered('practice');
    wrong.json.actions[0]!.args.text = wish;
    wrong.json.actions[0]!.args.vocabulary.source = 'typed';
    env.llm.script('buddy_turn', wrong, offered('chat'));
    env.llm.script('explain', generated());
    const sent = await l.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: randomUUID(),
      text: wish,
    });
    expect(sent.body.status).toBe('done');
    expect(sent.body.home.thread.filter((m) => m.role === 'buddy').at(-1)?.text).toContain(
      'the kitchen – die Küche',
    );
    expect(env.llm.callsFor('explain')).toHaveLength(1);
  });

  it('uses a future confirmation before vocabulary preparation succeeds', async () => {
    env.llm.script('buddy_turn', offered('practice'));
    env.llm.script('explain', generated());
    const sent = await l.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: randomUUID(),
      text: 'Denk dir 2 englische Vokabeln zur Wohnung aus.',
    });
    const message = sent.body.home.thread.filter((m) => m.role === 'buddy').at(-1);
    expect(message?.text).toBe('Ich bereite deine Vokabeln vor.');
  });

  it('delivers the validated list in the chat and opens those same pairs on tap', async () => {
    env.llm.script('buddy_turn', offered('chat'));
    env.llm.script('explain', generated());
    const sent = await l.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: randomUUID(),
      text: 'Schick mir hier 2 englische Vokabeln zur Wohnung mit deutscher Übersetzung.',
    });
    expect(sent.body.status).toBe('done');
    const message = sent.body.home.thread.find(
      (m) => m.role === 'buddy' && m.actions.some((a) => a.summary.tool === 'offer_learning'),
    )!;
    expect(message).toBeDefined();
    expect(message.text).toContain('the kitchen – die Küche');
    expect(message.text).toContain('the room – das Zimmer');
    const action = message.actions.find((a) => a.summary.tool === 'offer_learning')!;
    const tapped = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: action.id,
      kind: 'vocab',
      text: 'Wohnung',
    });
    expect(tapped.body.items).toHaveLength(4);
    expect(env.llm.callsFor('explain')).toHaveLength(1);
  });
});
