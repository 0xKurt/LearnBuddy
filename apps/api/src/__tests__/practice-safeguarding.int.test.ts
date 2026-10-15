// Distress typed into a practice answer field gets the app's fixed help answer — the same one
// the chat gives — and never the tutor's own words, a hint, a solution or a counted try
// (issue #389). Before this, the tutor improvised ("steer back kindly") and a provider block
// ended in "kann ich gerade nicht prüfen". Checked against the database, not only the reply.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DAILY_LIMITS } from '../config.js';
import { t } from '../i18n/index.js';
import { LlmError } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const item = (over: Record<string, unknown>) => ({
  kind: 'short',
  prompt: 'Was ist 3 · 4?',
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
  ...over,
});

async function start(
  env: TestEnv,
  l: Learner,
  kind: 'practice' | 'test',
  items = [item({}), item({ prompt: 'Was ist 6 · 7?', answer: '42' })],
) {
  env.llm.script('explain', {
    json: {
      usable: true,
      title: 'Einmaleins',
      subject: { name: 'Mathe', kind: 'math' },
      items,
    },
  });
  const res = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind,
    text: 'Einmaleins',
  });
  expect(res.status).toBe(201);
  await env.flushBackground();
  return (await l.api.get<SessionView>(`/practice/sessions/${res.body.id}`)).body;
}

const answer = (l: Learner, s: SessionView, text: string) =>
  l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
    client_turn_id: randomUUID(),
    item_id: s.items[0]!.item.id,
    text,
  });

const MODEL_WORDS = 'Oh, das klingt schwer. Lass uns weiterrechnen: Was ist 3 · 4?';
const tutorSays = (concern: boolean) => ({
  json: {
    intent: 'off_topic',
    verdict: 'not_an_attempt',
    reply: MODEL_WORDS,
    gave_hint: false,
    revealed_answer: false,
    concern,
  },
});

describe.skipIf(!dbReady)('distress in a practice answer field (issue #389)', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-04T15:00:00Z' });
    l = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2014-02-10',
      pin: '4826',
    });
  });
  afterEach(() => env.closeChecked());

  it('answers with the fixed help text, counts no try and leaves the question open', async () => {
    const s = await start(env, l, 'practice');
    env.llm.script('tutor', tutorSays(true));
    const res = await answer(l, s, 'Ich will nicht mehr nach Hause, mein Onkel tut mir weh.');
    expect(res.status).toBe(200);
    expect(res.body.reply.text).toBe(t('de', 'safeguarding.concern'));
    expect(res.body.reply.text).not.toContain(MODEL_WORDS);
    expect(res.body.verdict).toBe('not_an_attempt');

    const row = await env.db.one<{ attempts: number; hints_used: number; status: string }>(
      `select attempts, hints_used, status from session_items where session_id = $1 and item_id = $2`,
      [s.id, s.items[0]!.item.id],
    );
    expect(row).toEqual({ attempts: 0, hints_used: 0, status: 'open' });
    // The solution is not part of the help answer.
    expect(res.body.reply.text).not.toContain('12');
  });

  it('shows the model its own words when it is ordinary frustration, not a concern', async () => {
    const s = await start(env, l, 'practice');
    env.llm.script('tutor', tutorSays(false));
    const res = await answer(l, s, 'Ich hasse Mathe.');
    expect(res.status).toBe(200);
    expect(res.body.reply.text).toBe(MODEL_WORDS);
  });

  it('gives the help text in a practice test too, not the neutral test line', async () => {
    const s = await start(env, l, 'test');
    env.llm.script('tutor', tutorSays(true));
    const res = await answer(l, s, 'Ich will mir etwas antun.');
    expect(res.status).toBe(200);
    expect(res.body.reply.text).toBe(t('de', 'safeguarding.concern'));
    expect(res.body.reply.text).not.toBe(t('de', 'practice.test_no_hints'));
    const row = await env.db.one<{ attempts: number; status: string }>(
      `select attempts, status from session_items where session_id = $1 and item_id = $2`,
      [s.id, s.items[0]!.item.id],
    );
    // One try per question in a test: a disclosure must not use it up.
    expect(row).toEqual({ attempts: 0, status: 'open' });
  });

  // ── #747: the help answer never depends on the tutor's answer working ──────────────────────

  const itemRow = (s: SessionView) =>
    env.db.one<{ attempts: number; status: string }>(
      `select attempts, status from session_items where session_id = $1 and item_id = $2`,
      [s.id, s.items[0]!.item.id],
    );
  const HIT = 'Mein Vater schlägt mich, wenn ich schlechte Noten habe.';

  it('keeps the concern when the tutor raises it with an empty reply (the live baseline)', async () => {
    // Measured live (15.10.): the tutor said concern true and, told its reply is replaced, wrote
    // "" — the reply's min(1) failed the whole decision and she got "kann ich gerade nicht prüfen".
    const s = await start(env, l, 'practice');
    env.llm.script('tutor', {
      json: { ...tutorSays(true).json, reply: '' },
    });
    const res = await answer(l, s, HIT);
    expect(res.status).toBe(200);
    expect(res.body.reply.text).toBe(t('de', 'safeguarding.concern'));
    expect(res.body.verdict).toBe('not_an_attempt');
    expect(await itemRow(s)).toEqual({ attempts: 0, status: 'open' });
    // The concern bit was enough: no second model read her words.
    expect(env.llm.callsFor('safeguard')).toHaveLength(0);
  });

  it.each([
    ['an outage', { error: new LlmError('unavailable', 'down') }],
    ['a timeout', { error: new LlmError('timeout', 'slow') }],
    ['invalid output', { error: new LlmError('invalid_output', 'cut off') }],
    ['an answer outside the schema', { json: { intent: 'nonsense' } }],
  ] as const)('checks her words on their own when the tutor fails with %s', async (_, failure) => {
    const s = await start(env, l, 'practice');
    env.llm.script('tutor', failure);
    env.llm.script('safeguard', { json: { concern: true } });
    const res = await answer(l, s, HIT);
    expect(res.status).toBe(200);
    expect(res.body.reply.text).toBe(t('de', 'safeguarding.concern'));
    expect(res.body.reply.text).not.toContain(t('de', 'practice.cannot_check'));
    expect(res.body.verdict).toBe('not_an_attempt');
    expect(await itemRow(s)).toEqual({ attempts: 0, status: 'open' });
    // The check read her words, and nothing of the solution.
    const [check] = env.llm.callsFor('safeguard');
    expect(ScriptedGateway.textOf(check!)).toContain(HIT);
  });

  it('checks her words when her day of tutor calls is used up', async () => {
    const s = await start(env, l, 'practice');
    const day = '2026-10-04';
    await env.db.query(
      `insert into usage_daily (learner_id, day, kind, calls) values ($1, $2, 'tutor', $3)
         on conflict (learner_id, day, kind) do update set calls = $3`,
      [l.learnerId, day, DAILY_LIMITS.tutor - 1],
    );
    // One call left: the tutor's would have been it; the check takes it instead (the tutor fails).
    env.llm.script('tutor', { error: new LlmError('unavailable', 'down') });
    env.llm.script('safeguard', { json: { concern: true } });
    const res = await answer(l, s, HIT);
    expect(res.body.reply.text).toBe(t('de', 'safeguarding.concern'));
  });

  it('fails safe when no check can read her words: the fixed help line, never only "cannot check"', async () => {
    const s = await start(env, l, 'practice');
    env.llm.script('tutor', { error: new LlmError('unavailable', 'down') });
    env.llm.script('safeguard', { error: new LlmError('unavailable', 'down') });
    const res = await answer(l, s, HIT);
    expect(res.status).toBe(200);
    expect(res.body.reply.text).toBe(
      `${t('de', 'practice.cannot_check')} ${t('de', 'safeguarding.unchecked')}`,
    );
    expect(res.body.reply.text).toContain('116 111');
    // Nothing was judged, as before: no verdict claimed, no try counted (rule 5).
    expect(res.body.verdict).toBeNull();
  });

  it('fails safe when the day is used up for the check too', async () => {
    const s = await start(env, l, 'practice');
    await env.db.query(
      `insert into usage_daily (learner_id, day, kind, calls) values ($1, '2026-10-04', 'tutor', $2)
         on conflict (learner_id, day, kind) do update set calls = $2`,
      [l.learnerId, DAILY_LIMITS.tutor],
    );
    const res = await answer(l, s, HIT);
    expect(res.status).toBe(200);
    expect(res.body.reply.text).toContain(t('de', 'safeguarding.unchecked'));
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('answers a provider block of the check like a block of the tutor', async () => {
    const s = await start(env, l, 'practice');
    env.llm.script('tutor', { error: new LlmError('timeout', 'slow') });
    env.llm.script('safeguard', { error: new LlmError('blocked', 'finish reason SAFETY') });
    const res = await answer(l, s, HIT);
    expect(res.body.reply.text).toBe(t('de', 'safeguarding.blocked'));
  });

  it('asks no check for a number or for the key itself (no call, no wait)', async () => {
    const s = await start(env, l, 'practice', [
      item({}),
      item({
        kind: 'multiple_choice',
        prompt: 'Was ist die Hauptstadt von Frankreich?',
        answer: 'Paris',
        choices: ['Berlin', 'Paris', 'Rom', 'Madrid'],
        correct_choice: 1,
      }),
    ]);
    // A wrong number, first try: code's own line at once; then the right one.
    const wrong = await answer(l, s, '13');
    expect(wrong.body.reply.text).toBe(t('de', 'practice.try_again'));
    expect((await answer(l, s, '12')).body.verdict).toBe('correct');
    // The choice typed as it stands: her words are the key's.
    const choice = await l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: s.items[1]!.item.id,
      text: 'Paris',
    });
    expect(choice.body.verdict).toBe('correct');
    expect(env.llm.callsFor('safeguard')).toHaveLength(0);
  });

  it('answers a provider block with the fixed text, not "kann ich gerade nicht prüfen"', async () => {
    const s = await start(env, l, 'practice');
    env.llm.script('tutor', { error: new LlmError('blocked', 'finish reason SAFETY') });
    const res = await answer(l, s, 'Etwas, das der Filter zurückhält.');
    expect(res.status).toBe(200);
    expect(res.body.reply.text).toBe(t('de', 'safeguarding.blocked'));
    expect(res.body.reply.text).not.toBe(t('de', 'practice.cannot_check'));
    expect(res.body.verdict).toBe('not_an_attempt');
    const row = await env.db.one<{ attempts: number }>(
      `select attempts from session_items where session_id = $1 and item_id = $2`,
      [s.id, s.items[0]!.item.id],
    );
    expect(row.attempts).toBe(0);
  });
});
