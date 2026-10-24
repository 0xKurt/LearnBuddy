// requires live verification in Claude Code session (real shared Postgres; scripted external model)
import { afterEach, expect, it } from 'vitest';
import { createTestEnv, onboard, type TestEnv } from '../../../src/testing/harness.js';
import { history, say } from '../driver.js';
import { inspect } from '../checks.js';
import { Session } from '../session.js';
import { safeguardingText } from '../../../src/i18n/safeguarding.js';

let env: TestEnv | undefined;
afterEach(async () => {
  await env?.close();
  env = undefined;
});
const reply = (text: string, concern = false) => ({
  json: {
    lookups: [],
    concern,
    also_asked: false,
    actions: [],
    reply: text,
    options: null,
    asks_permission: false,
  },
});
it('reads the real stream and compares restarted API history against persisted rows', async () => {
  env = await createTestEnv();
  const l = await onboard(env, { relation: 'child' });
  env.llm.script('buddy_turn', reply('Der Nenner steht unter dem Bruchstrich.'));
  const turn = await say(env, l, 'Was ist der Nenner?');
  expect(turn.status).toBe('done');
  expect(turn.replies.at(-1)).toBe('Der Nenner steht unter dem Bruchstrich.');
  expect(await history(env, l)).toHaveLength(2);
  expect(await inspect(env, l, [turn])).toEqual([]);
  await env.checkScript();
});
it('double sends use the same request ID and cannot create another learner message', async () => {
  env = await createTestEnv();
  const l = await onboard(env, { relation: 'child', pin: '4826', contact: 'no' });
  env.llm.script('buddy_turn', reply('Der Nenner steht unter dem Bruchstrich.'));
  const session = new Session(env, l, 'de', true);
  const step = await session.act({ type: 'message', text: 'Was ist der Nenner?', double: true });
  expect(step.findings).toEqual([]);
  expect(step.turns).toHaveLength(2);
  expect((await history(env, l)).filter((m) => m.role === 'learner')).toHaveLength(1);
  await env.checkScript();
});
it('checks fixed safeguarding output independently of actor self-report', async () => {
  env = await createTestEnv();
  const l = await onboard(env, { relation: 'child', contact: 'no' });
  env.llm.script(
    'buddy_turn',
    reply('This unsafe model wording must never reach the child.', true),
  );
  const session = new Session(env, l, 'de', true);
  expect(
    (await session.act({ type: 'message', text: 'Ich will mir etwas antun', double: false }))
      .findings,
  ).toEqual([]);
  expect((await history(env, l)).at(-1)?.text).toBe(safeguardingText('de', true, 'concern'));
});

it('roleplay free text keeps the same fixed safeguarding contract', async () => {
  env = await createTestEnv();
  const l = await onboard(env, { relation: 'child' });
  const first = reply('Los geht es!');
  env.llm.script('buddy_turn', {
    json: {
      ...first.json,
      actions: [
        {
          tool: 'start_roleplay',
          args: {
            language: 'en',
            scene: 'Im Café',
            role: 'Kellner',
            points: ['Begrüßen', 'Bestellen', 'Bezahlen'],
            quote: 'lass uns Englisch sprechen',
          },
        },
      ],
    },
  });
  expect((await say(env, l, 'lass uns Englisch sprechen, ich bin im Café')).status).toBe('done');
  env.llm.script('buddy_turn', {
    json: { concern: true, also_asked: false, her_language: 'de', leave: false, reply: '' },
  });
  const session = new Session(env, l, 'de', true);
  expect(
    (await session.act({ type: 'message', text: 'Ich will mir etwas antun', double: false }))
      .findings,
  ).toEqual([]);
  expect((await history(env, l)).at(-1)?.text).toBe(safeguardingText('de', true, 'concern'));
});

it('practice free text checks fixed help against the real answer endpoint', async () => {
  env = await createTestEnv();
  const l = await onboard(env, { relation: 'child' });
  env.llm.script('explain', {
    json: {
      usable: true,
      title: 'Einmaleins',
      subject: { name: 'Mathe', kind: 'math' },
      items: [
        {
          kind: 'short',
          prompt: 'Was ist drei mal vier?',
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
    },
  });
  const started = await l.api.post('/practice/topic', {
    client_request_id: crypto.randomUUID(),
    kind: 'practice',
    text: 'Einmaleins',
  });
  const { SessionView } = await import('@learnbuddy/shared-types/contracts');
  const session = new Session(env, l, 'de', true);
  session.active = SessionView.parse(started.body);
  await env.flushBackground();
  env.llm.script('tutor', {
    json: {
      intent: 'off_topic',
      verdict: 'not_an_attempt',
      reply: 'Unsafe provider words',
      gave_hint: false,
      revealed_answer: false,
      concern: true,
    },
  });
  const step = await session.act({
    type: 'answer',
    text: 'Ich will mir etwas antun',
    double: false,
  });
  expect(step.findings).toEqual([]);
  expect(JSON.stringify(step.response)).toContain(safeguardingText('de', true, 'concern'));
});

it('uses the mobile offer contract: an empty picture wish must be omitted', async () => {
  env = await createTestEnv();
  const l = await onboard(env, { relation: 'child' });
  const { ActionView } = await import('@learnbuddy/shared-types/contracts');
  const { tap } = await import('../driver.js');
  const action = ActionView.parse({
    id: crypto.randomUUID(),
    status: 'applied',
    undoable: false,
    created_at: env.clock.now().toISOString(),
    summary: { tool: 'offer_learning', kind: 'practice', text: 'Einmaleins', figures: [] },
  });
  env.llm.byDefault('explain', {
    json: { usable: false, title: 'Einmaleins', subject: null, items: [] },
  });
  const result = await tap(l, action);
  // A provider refusal is legitimate; a request-shape rejection is an adapter defect.
  expect(result.error).toMatchObject({
    error: { code: 'invalid_input', details: { reason: 'not_usable' } },
  });
});

it('starts an announced prepared worksheet through the real ready-card contract', async () => {
  env = await createTestEnv();
  const l = await onboard(env, { relation: 'child' });
  env.llm.script('extraction', {
    json: {
      is_learning_material: true,
      readable: true,
      title: 'Arbeitsblatt',
      subject: { name: 'Mathe', kind: 'math' },
      extracted_text: 'Drei mal vier ergibt zwölf.',
      items: [
        {
          kind: 'short',
          prompt: 'Was ist drei mal vier?',
          answer: '12',
          topic: 'Einmaleins',
          difficulty: 1,
          choices: null,
          correct_choice: null,
          accepted_answers: [],
          unit: null,
          source_excerpt: null,
        },
      ],
    },
  });
  const created = await l.api.post<{ material: { id: string }; uploads: Array<{ path: string }> }>(
    '/materials',
    {
      client_request_id: crypto.randomUUID(),
      photo_mimes: ['image/jpeg'],
    },
  );
  for (const upload of created.body.uploads) env.storage.put(upload.path);
  expect((await l.api.post(`/materials/${created.body.material.id}/submit`)).status).toBe(202);
  await env.flushBackground();
  const session = new Session(env, l, 'de', true);
  expect((await session.visible()).offers).toHaveLength(1);
  const started = await session.act({ type: 'tap', offer: 0, double: true });
  expect(started.findings).toEqual([]);
  expect(started.taps[0]?.route).toBe('/buddy/steps/:id/start');
  expect(started.taps[0]?.session?.items).toHaveLength(1);
  expect(started.taps[1]?.session?.id).toBe(started.taps[0]?.session?.id);
});
