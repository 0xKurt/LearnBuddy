// A talk as a goal with steps, a rehearsal talk and reading aloud (issue #264), on a real Postgres:
//
//   1. **The goal with its steps is created** from her words, every day resolved by the server;
//      a plan that cannot be kept (a step on the day of the talk, out of order) is refused, and
//      undo takes the whole plan back.
//   2. **A rehearsal is measured by code**: duration against the length she was given, words per
//      minute, hesitation sounds counted from the transcript's marks, a part of the talk heard only
//      with a quote that stands in the transcript. The talk's rehearsal step is done by evidence.
//   3. **Reading aloud** names the words of the text she skipped or read as another word.
//   4. **The recording is deleted after the measuring**: it is in no table, nor is the transcript
//      — only the numbers and the words of the given text stay.
//   5. The failure paths: the same recording twice, another learner's card, the model down, a
//      recording without speech, a read-aloud longer than two minutes.
//
// requires live verification in Claude Code session (needs a running Postgres; the model is scripted)

import { randomUUID } from 'node:crypto';

import type {
  ActionSummary,
  BuddyHome,
  RehearseResponse,
  SendMessageResponse,
} from '@learnbuddy/shared-types/contracts';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { LlmError } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const turn = (over: Record<string, unknown>) => ({
  lookups: [],
  concern: false,
  also_asked: false,
  actions: [],
  reply: 'Alles klar.',
  options: null,
  asks_permission: false,
  ...over,
});

const day = (days: number) => ({ kind: 'in_days', days });

const PLAN = {
  tool: 'plan_talk',
  args: {
    title: 'Vulkane',
    format: 'referat',
    subject: 'Erdkunde',
    subject_kind: 'geography',
    day: day(14),
    minutes: 5,
    steps: [
      { stage: 'outline', day: day(3) },
      { stage: 'sources', day: day(6) },
      { stage: 'slides', day: day(10) },
      { stage: 'rehearsal', day: day(12) },
    ],
    quote: 'in zwei Wochen ein Referat über Vulkane',
  },
};

const PASSAGE =
  'Der kleine Fuchs lief am Morgen durch den Wald. Er suchte etwas zu essen für seine Familie.';

/** A recording as the app sends it: what is in it is the scripted model's to say. */
const AUDIO = Buffer.from('a'.repeat(4000)).toString('base64');

describe.skipIf(!dbReady)('talks, rehearsals and reading aloud', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-10-10T08:00:00Z' });
  });
  afterEach(() => env.checkScript({ reset: true }));
  afterAll(async () => {
    await env?.close();
  });

  async function say(l: Learner, text: string): Promise<BuddyHome> {
    const res = await l.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: randomUUID(),
      text,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body.home;
  }

  function card<T extends ActionSummary['tool']>(home: BuddyHome, tool: T) {
    const found = home.thread.flatMap((m) => m.actions).find((a) => a.summary.tool === tool);
    if (!found) throw new Error(`no ${tool} card`);
    return { id: found.id, summary: found.summary as Extract<ActionSummary, { tool: T }> };
  }

  async function offer(l: Learner, args: Record<string, unknown>, text: string) {
    env.llm.script('buddy_turn', {
      json: turn({ actions: [{ tool: 'offer_rehearsal', args }], reply: 'Los geht’s.' }),
    });
    return card(await say(l, text), 'offer_rehearsal');
  }

  async function record(l: Learner, actionId: string, durationMs: number, id = randomUUID()) {
    return l.api.post<RehearseResponse>('/buddy/rehearsals', {
      client_request_id: id,
      action_id: actionId,
      mime: 'audio/mp4',
      audio_base64: AUDIO,
      duration_ms: durationMs,
    });
  }

  it('plans a talk with its steps on days the server resolved, and undo takes it back', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2012-03-01' });
    env.llm.script('buddy_turn', {
      json: turn({ actions: [PLAN], reply: 'Ich habe dir den Plan bis zum Referat gemacht.' }),
    });
    const home = await say(l, 'Ich halte in zwei Wochen ein Referat über Vulkane, 5 Minuten.');
    const plan = card(home, 'plan_talk');
    expect(plan.summary).toMatchObject({
      title: 'Vulkane',
      format: 'referat',
      due_date: '2026-10-24',
      minutes: 5,
      steps: [
        { stage: 'outline', date: '2026-10-13' },
        { stage: 'sources', date: '2026-10-16' },
        { stage: 'slides', date: '2026-10-20' },
        { stage: 'rehearsal', date: '2026-10-22' },
      ],
    });
    const goal = await env.db.one<{ kind: string; talk_minutes: number; due_date: string }>(
      `select kind, talk_minutes, due_date::text from buddy_goals where id = $1`,
      [plan.summary.goal_id],
    );
    expect(goal).toEqual({ kind: 'talk', talk_minutes: 5, due_date: '2026-10-24' });
    const steps = await env.db.query<{ kind: string; title: string; stage: string }>(
      `select kind, title, payload->>'stage' as stage from buddy_steps where goal_id = $1
        order by planned_date`,
      [plan.summary.goal_id],
    );
    expect(steps).toEqual([
      { kind: 'task', title: 'Gliederung schreiben', stage: 'outline' },
      { kind: 'task', title: 'Quellen sammeln', stage: 'sources' },
      { kind: 'task', title: 'Folien oder Karteikarten', stage: 'slides' },
      { kind: 'task', title: 'Probevortrag', stage: 'rehearsal' },
    ]);
    // The talk's day is on her list like a test's, and so are its steps.
    expect(home.next.find((n) => n.id === plan.summary.goal_id)?.kind).toBe('talk');
    expect(home.next.filter((n) => n.kind === 'step')).toHaveLength(4);

    const undo = await l.api.post(`/buddy/actions/${plan.id}/undo`, {});
    expect(undo.status).toBe(200);
    // The plan is dropped and every step of it cancelled.
    const left = await env.db.query<{ status: string }>(
      `select g.status from buddy_goals g where g.id = $1
       union all
       select st.state from buddy_steps st where st.goal_id = $1`,
      [plan.summary.goal_id],
    );
    expect(left.map((r) => r.status)).toEqual([
      'dropped',
      'cancelled',
      'cancelled',
      'cancelled',
      'cancelled',
    ]);
  });

  it('refuses a plan that cannot be kept — the model gets one repair round', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2012-03-01' });
    const late = {
      ...PLAN,
      args: { ...PLAN.args, steps: [{ stage: 'rehearsal', day: day(14) }] },
    };
    const backwards = {
      ...PLAN,
      args: {
        ...PLAN.args,
        steps: [
          { stage: 'slides', day: day(3) },
          { stage: 'outline', day: day(5) },
        ],
      },
    };
    env.llm.script(
      'buddy_turn',
      { json: turn({ actions: [late] }) },
      { json: turn({ actions: [backwards] }) },
    );
    await say(l, 'Ich halte in zwei Wochen ein Referat über Vulkane, 5 Minuten.');
    const goals = await env.db.one<{ n: number }>(
      `select count(*)::int as n from buddy_goals where learner_id = $1`,
      [l.learnerId],
    );
    expect(goals.n).toBe(0);
    const repair = env.llm.callsFor('buddy_turn').at(-1);
    expect(JSON.stringify(repair?.contents)).toMatch(/every step comes before the day of the talk/);
  });

  it('measures a rehearsal by code, marks the step done and keeps neither recording nor transcript', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Ben', birthDate: '2012-03-01' });
    env.llm.script('buddy_turn', { json: turn({ actions: [PLAN] }) });
    const planned = card(
      await say(l, 'Ich halte in zwei Wochen ein Referat über Vulkane, 5 Minuten.'),
      'plan_talk',
    );
    const rehearsal = await offer(
      l,
      { kind: 'talk', goal: 'g1', text: null },
      'Kann ich mein Referat einmal üben?',
    );
    expect(rehearsal.summary).toMatchObject({ kind: 'talk', title: 'Vulkane', minutes: 5 });

    const transcript =
      'Heute {äh} erzähle ich euch etwas über Vulkane. {ähm} Ein Vulkan ist ein Berg aus Lava. Geheimwort Zitronenfalter. Danke fürs Zuhören.';
    env.llm.script('transcribe', {
      json: {
        heard_speech: true,
        transcript,
        parts: [
          { part: 'opening', present: true, quote: 'Heute erzähle ich euch etwas über Vulkane' },
          { part: 'main', present: true, quote: 'Vulkane brechen alle hundert Jahre aus' },
          { part: 'closing', present: true, quote: 'Danke fürs Zuhören' },
        ],
      },
    });
    const res = await record(l, rehearsal.id, 240_000);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.rehearsal).toMatchObject({
      kind: 'talk',
      duration_s: 240,
      target_s: 300,
      words: 19,
      words_per_minute: 5,
      fillers: 2,
      structure: [
        { part: 'opening', status: 'heard' },
        // Its quote is not in the transcript: nothing confirmed, nothing denied.
        { part: 'main', status: 'unknown' },
        { part: 'closing', status: 'heard' },
      ],
      step_done: true,
    });
    // The result is Buddy's message in the thread, its words written by code.
    const message = res.body.home.thread.find((m) => m.rehearsal);
    expect(message?.text).toBe(
      'Dein Probevortrag dauerte 4:00 Minuten – vorgesehen sind 5:00. Du hast 5 Wörter pro Minute gesprochen. Pausenlaute wie „äh“ habe ich 2-mal gehört.',
    );
    expect(message?.rehearsal?.id).toBe(res.body.rehearsal.id);
    const step = await env.db.one<{ state: string; done_source: string; evidence: unknown }>(
      `select state, done_source, evidence from buddy_steps
        where goal_id = $1 and payload->>'stage' = 'rehearsal'`,
      [planned.summary.goal_id],
    );
    expect(step).toMatchObject({
      state: 'done',
      done_source: 'evidence',
      evidence: { duration_s: 240, target_s: 300, words_per_minute: 5, fillers: 2 },
    });

    // Neither the recording nor a word she said is stored anywhere.
    const tables = await env.db.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
        where table_schema = 'public' and data_type in ('text', 'jsonb', 'character varying', 'ARRAY')`,
    );
    for (const { table_name, column_name } of tables) {
      const hit = await env.db.one<{ n: number }>(
        `select count(*)::int as n from ${table_name}
          where ${column_name}::text like '%Zitronenfalter%' or ${column_name}::text like $1`,
        [`%${AUDIO.slice(0, 64)}%`],
      );
      expect(hit.n, `${table_name}.${column_name}`).toBe(0);
    }
  });

  it('names the words of the passage she skipped or read as another word', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Cem', birthDate: '2016-03-01' });
    const reading = await offer(
      l,
      { kind: 'read_aloud', goal: null, text: PASSAGE },
      'Ich möchte vorlesen üben.',
    );
    expect(reading.summary).toMatchObject({ kind: 'read_aloud', text: PASSAGE });
    env.llm.script('transcribe', {
      json: {
        heard_speech: true,
        transcript:
          'Der Fuchs lief am Morgen durch den Feld. Er suchte etwas zu essen für eine Familie.',
        parts: [],
      },
    });
    const res = await record(l, reading.id, 30_000);
    expect(res.status).toBe(200);
    expect(res.body.rehearsal).toMatchObject({
      kind: 'read_aloud',
      words: 14,
      words_per_minute: 28,
      fillers: null,
      skipped: ['kleine'],
      misread: ['Wald', 'seine'],
      structure: null,
      step_done: false,
    });
    expect(res.body.home.thread.find((m) => m.rehearsal)?.text).toBe(
      'Du hast 28 Wörter pro Minute richtig gelesen. Diese Wörter schau dir noch einmal an: kleine, Wald, seine.',
    );
  });

  it('counts the same recording once, keeps other learners out, and stores nothing when it fails', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Dora', birthDate: '2016-03-01' });
    const reading = await offer(
      l,
      { kind: 'read_aloud', goal: null, text: PASSAGE },
      'Ich möchte vorlesen üben.',
    );
    const count = async () =>
      await env.db.one<{ r: number; m: number }>(
        `select (select count(*)::int from rehearsals where learner_id = $1) as r,
                  (select count(*)::int from buddy_messages where learner_id = $1 and rehearsal_id is not null) as m`,
        [l.learnerId],
      );

    // The model is down: nothing is measured, nothing is kept.
    env.llm.script('transcribe', { error: new LlmError('unavailable', 'outage') });
    expect((await record(l, reading.id, 30_000)).status).toBe(503);
    // No speech in it: she is told, nothing is kept.
    env.llm.script('transcribe', { json: { heard_speech: false, transcript: '', parts: [] } });
    const silent = await record(l, reading.id, 30_000);
    expect(silent.status).toBe(422);
    expect(await count()).toEqual({ r: 0, m: 0 });

    // Reading aloud takes two minutes at most.
    expect((await record(l, reading.id, 180_000)).status).toBe(413);

    // Sent twice (the connection dropped on the way back): one rehearsal, one message.
    env.llm.script('transcribe', {
      json: { heard_speech: true, transcript: PASSAGE, parts: [] },
    });
    const id = randomUUID();
    const first = await record(l, reading.id, 30_000, id);
    const again = await record(l, reading.id, 30_000, id);
    expect(again.status).toBe(200);
    expect(again.body.rehearsal.id).toBe(first.body.rehearsal.id);
    expect(await count()).toEqual({ r: 1, m: 1 });

    // Another learner cannot record on her card.
    const other = await onboard(env, { relation: 'child', name: 'Emil', birthDate: '2016-03-01' });
    expect((await record(other, reading.id, 30_000)).status).toBe(404);
  });
});
