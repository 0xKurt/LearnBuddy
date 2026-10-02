// A talk as a goal with steps, a rehearsal talk and reading aloud (issue #264):
//   · plan_talk makes a goal with its steps on days the server resolves — and refuses a plan
//     that cannot be kept (a step after the talk, out of order);
//   · offer_rehearsal is a button; the recording it opens is measured by code, and only the
//     numbers are kept — never the recording, never the transcript;
//   · the rehearsal step of the talk is done with the rehearsal as its evidence.
// docs/architecture.md §Talks and reading aloud, docs/dpia.md.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  RehearsalBrief,
  RehearsalView,
  SendMessageResponse,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LlmError } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const turn = (over: Record<string, unknown>) => ({
  json: {
    lookups: [],
    concern: false,
    also_asked: false,
    actions: [],
    reply: 'Alles klar.',
    options: null,
    asks_permission: false,
    ...over,
  },
});

const date = (d: string) => ({ kind: 'date', date: d });
const SAID = 'ich muss am freitag nächste woche ein referat über vulkane halten, 5 minuten';
const PLAN = {
  tool: 'plan_talk',
  args: {
    title: 'Vulkane',
    format: 'referat',
    subject: 'Erdkunde',
    subject_kind: 'geography',
    day: date('2026-10-09'),
    minutes: 5,
    steps: [
      { stage: 'outline', day: date('2026-10-03') },
      { stage: 'sources', day: date('2026-10-05') },
      { stage: 'slides', day: date('2026-10-07') },
      { stage: 'rehearsal', day: date('2026-10-08') },
    ],
    quote: 'ein referat über vulkane halten',
  },
};

const TRANSCRIPT =
  'Heute {äh} erzähle ich euch etwas über Vulkane. Ein Vulkan ist ein Berg mit {ähm} Lava. Danke fürs Zuhören.';
const AUDIO = 'U'.repeat(400);
const PASSAGE =
  'Der kleine Fuchs lief am Morgen durch den Wald. Er suchte etwas zu essen für seine Familie.';

async function say(l: Learner, text: string): Promise<SendMessageResponse> {
  const res = await l.api.post<SendMessageResponse>('/buddy/messages', {
    client_message_id: randomUUID(),
    text,
  });
  expect(res.status).toBe(200);
  return res.body;
}

/** The id of the newest action of this tool in the thread. */
function actionOf(sent: SendMessageResponse, tool: string): string {
  const a = sent.home.thread.flatMap((m) => m.actions).find((x) => x.summary.tool === tool);
  expect(a).toBeDefined();
  return a!.id;
}

describe.skipIf(!dbReady)('a talk, its rehearsal and reading aloud (issue #264)', () => {
  let env: TestEnv;
  let lena: Learner;
  beforeEach(async () => {
    // Thursday 1 October, afternoon in Berlin.
    env = await createTestEnv({ start: '2026-10-01T14:00:00Z' });
    lena = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2012-02-10' });
  });
  afterEach(async () => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      unexpected: env.llm.unexpected.map((u) => u.purpose),
      pending: env.llm.pending(),
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: [], pending: 0 });
  });

  it('plans the talk as a goal with its steps, titled by the app, on the days resolved in her zone', async () => {
    env.llm.script(
      'buddy_turn',
      turn({ actions: [PLAN], reply: 'Ich hab dir einen Plan gemacht.' }),
    );
    const sent = await say(lena, SAID);
    expect(sent.status).toBe('done');
    const card = sent.home.thread
      .flatMap((m) => m.actions)
      .find((a) => a.summary.tool === 'plan_talk');
    expect(card?.summary).toMatchObject({
      tool: 'plan_talk',
      title: 'Vulkane',
      format: 'referat',
      due_date: '2026-10-09',
      minutes: 5,
    });
    expect(card?.undoable).toBe(true);

    const goal = await env.db.one<{
      id: string;
      kind: string;
      due_date: string;
      talk_minutes: number;
    }>(`select id, kind, due_date::text, talk_minutes from buddy_goals where learner_id = $1`, [
      lena.learnerId,
    ]);
    expect(goal).toMatchObject({ kind: 'talk', due_date: '2026-10-09', talk_minutes: 5 });
    const steps = await env.db.query<{
      kind: string;
      title: string;
      planned_date: string;
      stage: string;
    }>(
      `select kind, title, planned_date::text, payload->>'stage' as stage from buddy_steps
        where goal_id = $1 order by planned_date`,
      [goal.id],
    );
    expect(steps).toEqual([
      { kind: 'task', title: 'Gliederung', planned_date: '2026-10-03', stage: 'outline' },
      { kind: 'task', title: 'Quellen sammeln', planned_date: '2026-10-05', stage: 'sources' },
      {
        kind: 'task',
        title: 'Folien oder Karteikarten',
        planned_date: '2026-10-07',
        stage: 'slides',
      },
      { kind: 'task', title: 'Probevortrag', planned_date: '2026-10-08', stage: 'rehearsal' },
    ]);

    // Buddy sees it as a talk she gives herself, with its length and its steps.
    env.llm.script('buddy_turn', turn({ reply: 'Gern.' }));
    await say(lena, 'was steht an');
    const state = ScriptedGateway.textOf(env.llm.callsFor('buddy_turn').at(-1)!);
    expect(state).toContain('talk "Vulkane"');
    expect(state).toContain('5 min long');
    expect(state).toContain('never write it');
    expect(state).toContain('task "Probevortrag"');
  });

  it('refuses a plan that cannot be kept, and the repair answers without it', async () => {
    let repair = '';
    env.llm.script(
      'buddy_turn',
      turn({
        actions: [
          {
            ...PLAN,
            args: {
              ...PLAN.args,
              // The rehearsal after the talk, and sources before the outline.
              steps: [
                { stage: 'sources', day: date('2026-10-05') },
                { stage: 'outline', day: date('2026-10-06') },
              ],
            },
          },
        ],
      }),
      (req) => {
        repair = ScriptedGateway.textOf(req);
        return turn({ reply: 'Wann genau ist das Referat?' }).json;
      },
    );
    await say(lena, SAID);
    expect(repair).toContain('steps must be in the order');
    expect(
      await env.db.query(`select 1 from buddy_goals where learner_id = $1`, [lena.learnerId]),
    ).toHaveLength(0);

    let second = '';
    env.llm.script(
      'buddy_turn',
      turn({
        actions: [
          {
            ...PLAN,
            args: { ...PLAN.args, steps: [{ stage: 'rehearsal', day: date('2026-10-09') }] },
          },
        ],
      }),
      (req) => {
        second = ScriptedGateway.textOf(req);
        return turn({ reply: 'Okay.' }).json;
      },
    );
    await say(lena, SAID);
    expect(second).toContain('every step comes before the day of the talk');
  });

  it('measures a rehearsal by code, keeps only the numbers, and marks the rehearsal step done', async () => {
    env.llm.script('buddy_turn', turn({ actions: [PLAN] }));
    await say(lena, SAID);
    env.llm.script(
      'buddy_turn',
      turn({
        actions: [{ tool: 'offer_rehearsal', args: { kind: 'talk', goal: 'g1', text: null } }],
      }),
    );
    const sent = await say(lena, 'ich will mal probe halten');
    const action = actionOf(sent, 'offer_rehearsal');

    const brief = await lena.api.get<RehearsalBrief>(`/voice/rehearse/${action}`);
    expect(brief.body).toEqual({
      action_id: action,
      kind: 'talk',
      title: 'Vulkane',
      text: null,
      minutes: 5,
      max_s: 600,
    });

    env.llm.script('transcribe', {
      json: {
        heard_speech: true,
        transcript: TRANSCRIPT,
        parts: [
          { part: 'opening', present: true, quote: 'Heute erzähle ich euch etwas über Vulkane' },
          { part: 'main', present: true, quote: 'Ein Vulkan ist ein Berg mit Lava' },
          { part: 'closing', present: true, quote: 'Ich fasse zusammen was ich gesagt habe' },
        ],
      },
    });
    const body = {
      client_request_id: randomUUID(),
      action_id: action,
      mime: 'audio/webm',
      audio_base64: AUDIO,
      duration_ms: 90_000,
    };
    const res = await lena.api.post<RehearsalView>('/voice/rehearse', body);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      kind: 'talk',
      duration_s: 90,
      target_s: 300,
      words: 17,
      // 17 words in 1.5 minutes.
      words_per_minute: 11,
      fillers: 2,
      skipped: [],
      misread: [],
      structure: [
        { part: 'opening', status: 'heard' },
        { part: 'main', status: 'heard' },
        // A quote that is not in what she said confirms nothing.
        { part: 'closing', status: 'unknown' },
      ],
      step_done: true,
    });
    // The recording went to the model once, and the transcriber never saw a text to "hear".
    expect(env.llm.callsFor('transcribe')).toHaveLength(1);

    // Sent again (the answer got lost): the same rehearsal, no second model call.
    const again = await lena.api.post<RehearsalView>('/voice/rehearse', body);
    expect(again.body.id).toBe(res.body.id);
    expect(env.llm.callsFor('transcribe')).toHaveLength(1);

    // Nothing of what she said is kept: no audio, no transcript — only the numbers.
    const dump = await env.db.one<{ dump: string }>(
      `select string_agg(row_to_json(r)::text, ' ') as dump from rehearsals r where learner_id = $1`,
      [lena.learnerId],
    );
    expect(dump.dump).not.toContain('Vulkan');
    expect(dump.dump).not.toContain(AUDIO.slice(0, 50));
    const step = await env.db.one<{
      state: string;
      done_source: string;
      evidence: { duration_s: number };
    }>(
      `select state, done_source, evidence from buddy_steps
        where learner_id = $1 and payload->>'stage' = 'rehearsal'`,
      [lena.learnerId],
    );
    expect(step).toMatchObject({ state: 'done', done_source: 'evidence' });
    expect(step.evidence.duration_s).toBe(90);

    // Buddy reads what was measured.
    env.llm.script('buddy_turn', turn({ reply: 'Super.' }));
    await say(lena, 'und wie war ich');
    const state = ScriptedGateway.textOf(env.llm.callsFor('buddy_turn').at(-1)!);
    expect(state).toContain('rehearsed: 1:30 of 5:00, 11 words/min, 2 filler sounds');

    // Another learner cannot open her offer or record against it.
    const tom = await onboard(env, { relation: 'child', name: 'Tom', birthDate: '2013-05-01' });
    expect((await tom.api.get(`/voice/rehearse/${action}`)).status).toBe(404);
    expect(
      (await tom.api.post('/voice/rehearse', { ...body, client_request_id: randomUUID() })).status,
    ).toBe(404);
  });

  it('reading aloud: words of the text skipped or misread, and correct words per minute', async () => {
    env.llm.script(
      'buddy_turn',
      turn({
        actions: [
          { tool: 'offer_rehearsal', args: { kind: 'read_aloud', goal: null, text: PASSAGE } },
        ],
      }),
    );
    const action = actionOf(await say(lena, 'ich will vorlesen üben'), 'offer_rehearsal');
    const brief = await lena.api.get<RehearsalBrief>(`/voice/rehearse/${action}`);
    expect(brief.body).toMatchObject({ kind: 'read_aloud', text: PASSAGE, max_s: 120 });

    env.llm.script('transcribe', {
      json: {
        heard_speech: true,
        transcript:
          'Der Fuchs lief am Morgen durch den Feld. Er suchte etwas zu essen für eine Familie.',
        parts: [],
      },
    });
    const res = await lena.api.post<RehearsalView>('/voice/rehearse', {
      client_request_id: randomUUID(),
      action_id: action,
      mime: 'audio/webm',
      audio_base64: AUDIO,
      duration_ms: 30_000,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      kind: 'read_aloud',
      words: 14,
      words_per_minute: 28,
      fillers: null,
      structure: null,
      skipped: ['kleine'],
      misread: ['Wald', 'seine'],
      step_done: false,
    });
    // The passage is never given to the transcriber: it would hear the text instead of her.
    const call = env.llm.callsFor('transcribe')[0]!;
    expect(ScriptedGateway.textOf(call)).not.toContain('Fuchs');
    expect(call.system).not.toContain('Fuchs');

    // Longer than reading aloud takes: refused before anything is sent to the model.
    const tooLong = await lena.api.post('/voice/rehearse', {
      client_request_id: randomUUID(),
      action_id: action,
      mime: 'audio/webm',
      audio_base64: AUDIO,
      duration_ms: 150_000,
    });
    expect(tooLong.status).toBe(413);
    expect(env.llm.callsFor('transcribe')).toHaveLength(1);
  });

  it('a text too short to read aloud is refused as an offer', async () => {
    let repair = '';
    env.llm.script(
      'buddy_turn',
      turn({
        actions: [
          { tool: 'offer_rehearsal', args: { kind: 'read_aloud', goal: null, text: 'Der Fuchs' } },
        ],
      }),
      (req) => {
        repair = ScriptedGateway.textOf(req);
        return turn({ reply: 'Welchen Text willst du lesen?' }).json;
      },
    );
    await say(lena, 'ich will vorlesen üben');
    expect(repair).toContain('this one has 2');
  });

  it('keeps nothing when no speech was heard, and nothing when the model is down', async () => {
    env.llm.script(
      'buddy_turn',
      turn({
        actions: [{ tool: 'offer_rehearsal', args: { kind: 'talk', goal: null, text: null } }],
      }),
    );
    const action = actionOf(await say(lena, 'ich will mal probe halten'), 'offer_rehearsal');
    const send = () =>
      lena.api.post<{ error: { code: string; details?: { reason?: string } } }>('/voice/rehearse', {
        client_request_id: randomUUID(),
        action_id: action,
        mime: 'audio/webm',
        audio_base64: AUDIO,
        duration_ms: 20_000,
      });

    env.llm.script('transcribe', { json: { heard_speech: false, transcript: '', parts: [] } });
    const silent = await send();
    expect(silent.status).toBe(422);
    expect(silent.body.error.details?.reason).toBe('no_speech');

    env.llm.script('transcribe', { error: new LlmError('unavailable', 'down') });
    expect((await send()).status).toBe(503);

    expect(
      await env.db.query(`select 1 from rehearsals where learner_id = $1`, [lena.learnerId]),
    ).toHaveLength(0);
  });
});
