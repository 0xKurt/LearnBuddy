// The core loop end to end: get to know the learner → keep context → act on
// its own → show a useful result → understand feedback → adapt.
// docs/architecture.md §Core loop, ADR 0004.
// requires live verification in Claude Code session (needs a running Postgres)
//
// Only the model is scripted (its answers are what a model could say; the
// server enforces everything else). Database, scheduler, contact policy,
// practice checks and delivery are the real code.

import type {
  BuddyHome,
  SendMessageResponse,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import {
  createTestEnv,
  onboard,
  TEST_TICK_SECRET,
  type Learner,
  type TestEnv,
} from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const ids = {
  msg1: '00000000-0000-4000-8000-000000000101',
  msg2: '00000000-0000-4000-8000-000000000102',
  msg3: '00000000-0000-4000-8000-000000000103',
  material: '00000000-0000-4000-8000-000000000201',
  turn1: '00000000-0000-4000-8000-000000000301',
  turn2: '00000000-0000-4000-8000-000000000302',
  turn3: '00000000-0000-4000-8000-000000000303',
  turn4: '00000000-0000-4000-8000-000000000304',
};

const WORKSHEET = {
  is_learning_material: true,
  readable: true,
  title: 'Brüche kürzen und vergleichen',
  subject: { name: 'Mathe', kind: 'math' },
  extracted_text:
    '# Brüche\n1. Kürze 6/8.\n2. Welcher Bruch ist größer: 2/3 oder 3/5?\n3. Zähler und Nenner …',
  items: [
    {
      kind: 'numeric',
      prompt: 'Kürze 6/8 und gib das Ergebnis als Dezimalzahl an.',
      answer: '0.75',
      accepted_answers: [],
      unit: null,
      choices: null,
      correct_choice: null,
      topic: 'Brüche kürzen',
      difficulty: 2,
      source_excerpt: 'Kürze 6/8.',
    },
    {
      kind: 'multiple_choice',
      prompt: 'Welcher Bruch ist größer?',
      answer: '2/3',
      accepted_answers: [],
      unit: null,
      choices: ['2/3', '3/5'],
      correct_choice: 0,
      topic: 'Brüche vergleichen',
      difficulty: 2,
      source_excerpt: null,
    },
    {
      kind: 'short',
      prompt: 'Wie heißt die Zahl unter dem Bruchstrich?',
      answer: 'Nenner',
      accepted_answers: [],
      unit: null,
      choices: null,
      correct_choice: null,
      topic: 'Begriffe',
      difficulty: 1,
      source_excerpt: null,
    },
    {
      kind: 'long',
      prompt: 'Warum multipliziert man beim Erweitern Zähler und Nenner mit derselben Zahl?',
      answer: 'Damit der Wert des Bruchs gleich bleibt.',
      accepted_answers: [],
      unit: null,
      choices: null,
      correct_choice: null,
      topic: 'Brüche erweitern',
      difficulty: 3,
      source_excerpt: null,
    },
  ],
};

async function tick(env: TestEnv): Promise<Record<string, unknown>> {
  const res = await env.app.request('/v1/internal/tick', {
    method: 'POST',
    headers: { 'x-tick-secret': TEST_TICK_SECRET },
  });
  expect(res.status).toBe(200);
  const stats = (await res.json()) as { errors: string[] };
  expect(stats.errors).toEqual([]);
  return stats;
}

describe.skipIf(!dbReady)('Buddy core loop (child learner, Europe/Berlin)', () => {
  let env: TestEnv;
  let lina: Learner;
  let adminToken: string;
  let goalId: string;
  let captureStepId: string;
  let practiceStepId: string;

  beforeAll(async () => {
    // Monday 2026-09-28, 10:00 in Berlin (CEST).
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
    // The adult sets up the profile and the PIN during onboarding.
    lina = await onboard(env, {
      relation: 'child',
      name: 'Lina',
      birthDate: '2014-03-10',
      pin: '1357',
    });
  });
  afterEach(() => {
    // A failed expectation inside a scripted model answer surfaces here.
    expect({
      scriptErrors: env.llm.scriptErrors,
      unexpected: env.llm.unexpected.length,
      pending: env.llm.pending(),
    }).toEqual({
      scriptErrors: [],
      unexpected: 0,
      pending: 0,
    });
  });
  afterAll(async () => {
    await env?.close();
  });

  it('1 · gets to know the learner: level, the test, and what it needs next', async () => {
    env.llm.script('buddy_turn', (req) => {
      const text = ScriptedGateway.textOf(req);
      // The model sees the facts it needs, as data.
      expect(text).toContain('Name: Lina');
      expect(text).toContain('(minor)');
      expect(text).toContain('Language: German');
      expect(text).toContain('Monday 2026-09-28');
      expect(text).toContain('- no active goals');
      return {
        reply:
          'Cool, dann bereiten wir uns bis Freitag zusammen vor! Hast du ein Arbeitsblatt dazu? Ein Foto reicht.',
        options: null,
        actions: [
          { tool: 'set_level', args: { level: 'school', grade: 7, quote: 'in der 7. Klasse' } },
          {
            tool: 'plan_exam',
            args: {
              title: 'Mathearbeit Brüche',
              subject: 'Mathe',
              subject_kind: 'math',
              day: { kind: 'weekday', weekday: 5, weeks_ahead: 0 },
              topics: ['Brüche'],
              quote: 'am Freitag eine Mathearbeit über Brüche',
            },
          },
          { tool: 'request_material', args: { goal: 'new', title: 'Arbeitsblatt Brüche' } },
        ],
      };
    });
    const res = await lina.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: ids.msg1,
      text: 'Hi! Ich bin in der 7. Klasse und schreibe am Freitag eine Mathearbeit über Brüche.',
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    const home = res.body.home;

    // What Buddy did is shown as cards with real data — the server computed the date.
    const tools = home.done.map((a) => a.summary.tool).sort();
    expect(tools).toEqual(['plan_exam', 'request_material', 'set_level']);
    const planned = home.done.find((a) => a.summary.tool === 'plan_exam')!.summary;
    expect(planned).toMatchObject({
      due_date: '2026-10-02',
      title: 'Mathearbeit Brüche',
      subject_name: 'Mathe',
    });
    goalId = (planned as { goal_id: string }).goal_id;

    // The one thing to do now: a photo for exactly this test.
    expect(home.now).toMatchObject({
      type: 'capture_needed',
      title: 'Arbeitsblatt Brüche',
      goal: { id: goalId },
    });
    captureStepId = (home.now as { step_id: string }).step_id;
    // Contact outside the app is off; for a minor only an adult can turn it on.
    expect(home.decision).toEqual({ type: 'contact_opt_in', can_enable_here: false });
    expect(home.next).toEqual([
      expect.objectContaining({ kind: 'exam', id: goalId, date: '2026-10-02' }),
    ]);

    // Thread order: the learner's message, then Buddy's reply with its action cards.
    const last2 = home.thread.slice(-2);
    expect(last2.map((m) => m.role)).toEqual(['learner', 'buddy']);
    expect(last2[1]!.actions).toHaveLength(3);

    // Level stored; wake-ups planned in the learner's zone (Tue + Thu 15:00, Sat 15:00 follow-up).
    const learner = await env.db.one<{ level: string; grade: number }>(
      `select level, grade from learners where id = $1`,
      [lina.learnerId],
    );
    expect(learner).toEqual({ level: 'school', grade: 7 });
    const wakeups = await env.db.query<{ run_at: Date; reason: string }>(
      `select run_at, payload ->> 'reason' as reason from jobs
        where learner_id = $1 and kind = 'buddy_check' and status = 'queued' order by run_at`,
      [lina.learnerId],
    );
    expect(wakeups.map((w) => [w.run_at.toISOString(), w.reason])).toEqual([
      ['2026-09-29T13:00:00.000Z', 'exam_countdown'],
      ['2026-10-01T13:00:00.000Z', 'exam_countdown'],
      ['2026-10-03T13:00:00.000Z', 'exam_followup'],
    ]);
  });

  it('2 · reads the photographed worksheet in the background and completes the capture step', async () => {
    env.clock.minutes(2);
    env.llm.script('extraction', { json: WORKSHEET });
    const created = await lina.api.post<{
      material: { id: string; status: string };
      uploads: Array<{ path: string }>;
    }>('/materials', {
      client_request_id: ids.material,
      photo_mimes: ['image/jpeg'],
      step_id: captureStepId,
    });
    expect(created.status).toBe(201);
    expect(created.body.material.status).toBe('awaiting_upload');
    // Submitting before the upload arrived is refused honestly.
    const early = await lina.api.post(`/materials/${created.body.material.id}/submit`);
    expect(early.status).toBe(422);
    expect(early.body).toMatchObject({ error: { details: { reason: 'photos_missing' } } });

    env.storage.put(created.body.uploads[0]!.path);
    const submitted = await lina.api.post<{ status: string }>(
      `/materials/${created.body.material.id}/submit`,
    );
    expect(submitted.status).toBe(202);
    expect(submitted.body.status).toBe('queued');
    // Reading starts right away, and Buddy acts on the result while Lina waits.
    env.llm.script('buddy_check', async (req) => {
      // While Buddy thinks about it, Lina's screen says so.
      expect((await lina.api.get<BuddyHome>('/buddy')).body.working).toBe('material');
      const text = ScriptedGateway.textOf(req);
      expect(text).toContain('g1 exam "Mathearbeit Brüche" on Friday 2026-10-02 (in 4 days)');
      expect(text).toContain('material: 1 ready (4 questions)');
      expect(text).toContain(
        'new material is ready: "Brüche kürzen und vergleichen" with 4 questions',
      );
      expect(text).toContain('OFF: Buddy may not message the learner outside the app');
      return {
        disposition: 'act',
        reason: 'Material ready, test in 4 days: prepare a first practice.',
        actions: [
          {
            tool: 'prepare_practice',
            args: { goal: 'g1', subject: null, minutes: 10, focus_topics: [] },
          },
        ],
        outreach: {
          kind: 'result',
          topic_key: 'exam:g1:first-practice',
          title: 'Übung ist bereit',
          body: 'Ich habe aus deinem Arbeitsblatt eine Übung gemacht – ca. 5 Minuten.',
          why: 'Das Blatt ist fertig gelesen und die Arbeit ist am Freitag.',
          relevance: 0.8,
          expires_in_hours: 24,
          goal: 'g1',
          step: 'new',
        },
      };
    });
    await env.flushBackground();

    const material = await lina.api.get<{
      status: string;
      item_count: number;
      title: string;
      subject_name: string;
    }>(`/materials/${created.body.material.id}`);
    expect(material.body).toMatchObject({ status: 'ready', item_count: 4, subject_name: 'Mathe' });
    const step = await env.db.one<{
      state: string;
      done_source: string;
      evidence: { questions: number };
    }>(`select state, done_source, evidence from buddy_steps where id = $1`, [captureStepId]);
    expect(step).toMatchObject({
      state: 'done',
      done_source: 'evidence',
      evidence: { questions: 4 },
    });
  });

  it('3 · acts on its own when the material is ready: prepares practice, respects that contact is off', async () => {
    // (Buddy's check ran right after the reading in step 2, while Lina was waiting in the app.)

    const outreach = await env.db.one<{ status: string; status_reason: string; topic_key: string }>(
      `select status, status_reason, topic_key from buddy_outreach where learner_id = $1`,
      [lina.learnerId],
    );
    // Proposed, but not sent: the adult has not enabled contact. Stored with the real goal id.
    expect(outreach).toEqual({
      status: 'suppressed',
      status_reason: 'contact_disabled',
      topic_key: `exam:${goalId}:first-practice`,
    });

    const home = (await lina.api.get<BuddyHome>('/buddy')).body;
    expect(home.working).toBeNull();
    expect(home.now).toMatchObject({
      type: 'practice_ready',
      question_count: 4,
      goal: { id: goalId, days_left: 4 },
    });
    practiceStepId = (home.now as { step_id: string }).step_id;
    expect(home.done[0]!.summary).toMatchObject({ tool: 'prepare_practice', question_count: 4 });
  });

  it('4 · an adult enables contact with the PIN; the learner cannot loosen it alone', async () => {
    const settings = await lina.api.get<{ version: number; can_loosen: boolean }>(
      '/buddy/settings',
    );
    expect(settings.body.can_loosen).toBe(false);
    const alone = await lina.api.patch('/buddy/settings', {
      contact_enabled: true,
      version: settings.body.version,
    });
    expect(alone.status).toBe(403);
    expect(alone.body).toMatchObject({ error: { code: 'admin_required' } });

    const session = await lina.api.post<{ admin_token: string }>('/account/admin-session', {
      pin: '1357',
    });
    adminToken = session.body.admin_token;
    const parent = lina.api.with({ 'x-admin-token': adminToken });
    const enabled = await parent.patch<{ contact_enabled: boolean; can_loosen: boolean }>(
      '/buddy/settings',
      {
        contact_enabled: true,
        version: settings.body.version,
      },
    );
    expect(enabled.status).toBe(200);
    expect(enabled.body).toMatchObject({ contact_enabled: true, can_loosen: true });
    const who = await env.db.one<{ contact_changed_by: string }>(
      `select contact_changed_by from buddy_settings where learner_id = $1`,
      [lina.learnerId],
    );
    expect(who.contact_changed_by).toBe('account_holder');

    const token = await lina.api.post('/buddy/push-tokens', {
      token: 'ExponentPushToken[lina-phone-01]',
      platform: 'ios',
    });
    expect(token.status).toBe(200);
  });

  it('5 · shows a useful result: practice with rule checks, a model-judged answer, evidence on the step', async () => {
    env.clock.hours(5); // Monday 15:02 local
    const started = await lina.api.post<{ session_id: string }>(
      `/buddy/steps/${practiceStepId}/start`,
    );
    expect(started.status).toBe(200);
    // Starting twice resumes the same session.
    const again = await lina.api.post<{ session_id: string }>(
      `/buddy/steps/${practiceStepId}/start`,
    );
    expect(again.body.session_id).toBe(started.body.session_id);
    const sessionId = started.body.session_id;

    let view = (await lina.api.get<SessionView>(`/practice/sessions/${sessionId}`)).body;
    expect(view.items).toHaveLength(4);
    // Open questions never carry their solution to the client.
    expect(view.items.every((i) => i.answer === null)).toBe(true);
    const byTopic = (topic: string) => view.items.find((i) => i.item.topic === topic)!.item;

    const numeric = await lina.api.post<{ verdict: string; reply: { text: string } }>(
      `/practice/sessions/${sessionId}/answer`,
      {
        client_turn_id: ids.turn1,
        item_id: byTopic('Brüche kürzen').id,
        text: '0,75',
      },
    );
    expect(numeric.status).toBe(200);
    expect(numeric.body.verdict).toBe('correct');
    expect(numeric.body.reply.text).toBe('Stimmt – gut gemacht!');

    await lina.api.post(`/practice/sessions/${sessionId}/answer`, {
      client_turn_id: ids.turn2,
      item_id: byTopic('Brüche vergleichen').id,
      choice: 0,
    });
    await lina.api.post(`/practice/sessions/${sessionId}/answer`, {
      client_turn_id: ids.turn3,
      item_id: byTopic('Begriffe').id,
      text: 'nenner',
    });

    // A free-text explanation: not decidable by rules → the tutor judges it (structured).
    env.llm.script('tutor', (req) => {
      const text = ScriptedGateway.textOf(req);
      expect(text).toContain('RULE CHECK: not decidable by rules');
      expect(text).toContain('SOLUTION: Damit der Wert des Bruchs gleich bleibt.');
      return {
        intent: 'answer',
        verdict: 'correct',
        reply: 'Genau – der Wert bleibt gleich, nur die Darstellung ändert sich.',
        gave_hint: false,
        revealed_answer: false,
      };
    });
    const free = await lina.api.post<{
      reply: { verdict: string | null; text: string };
      session: SessionView;
    }>(`/practice/sessions/${sessionId}/answer`, {
      client_turn_id: ids.turn4,
      item_id: byTopic('Brüche erweitern').id,
      text: 'Weil sich sonst der Wert vom Bruch ändert',
    });
    expect(free.status).toBe(200);
    expect(free.body.session.items.every((i) => i.status === 'correct')).toBe(true);
    // A retried request (same client_turn_id) replays instead of answering twice.
    const replay = await lina.api.post<{ reply: { text: string } }>(
      `/practice/sessions/${sessionId}/answer`,
      {
        client_turn_id: ids.turn4,
        item_id: byTopic('Brüche erweitern').id,
        text: 'Weil sich sonst der Wert vom Bruch ändert',
      },
    );
    expect(replay.body.reply.text).toBe(
      'Genau – der Wert bleibt gleich, nur die Darstellung ändert sich.',
    );
    expect(env.llm.callsFor('tutor')).toHaveLength(1);

    // Finishing wakes Buddy right away to plan what comes next (here: nothing to add today).
    env.llm.script('buddy_check', (req) => {
      expect(ScriptedGateway.textOf(req)).toContain(
        'the learner just finished practice: 4/4 answered',
      );
      return {
        disposition: 'wait',
        reason: 'Just practised and all correct; nothing to add today.',
        actions: [],
        outreach: null,
      };
    });
    view = (await lina.api.post<SessionView>(`/practice/sessions/${sessionId}/finish`)).body;
    await env.flushBackground();
    expect(view.summary).toEqual({
      answered: 4,
      first_try: 4,
      secure_topics: expect.arrayContaining([
        'Brüche kürzen',
        'Brüche vergleichen',
        'Begriffe',
        'Brüche erweitern',
      ]),
      shaky_topics: [],
    });
    const step = await env.db.one<{ state: string; done_source: string }>(
      `select state, done_source from buddy_steps where id = $1`,
      [practiceStepId],
    );
    expect(step).toEqual({ state: 'done', done_source: 'evidence' });
    const home = (await lina.api.get<BuddyHome>('/buddy')).body;
    expect(home.now).toMatchObject({
      type: 'practice_result',
      result: { answered: 4, first_try: 4 },
    });
    // Spaced repetition got exactly one review per question.
    const reviews = await env.db.one<{ n: number; reps: number }>(
      `select count(*)::int as n, sum(reps)::int as reps from item_states where learner_id = $1`,
      [lina.learnerId],
    );
    expect(reviews).toEqual({ n: 4, reps: 4 });
  });

  it("6 · understands feedback: a preference with the learner's words as provenance", async () => {
    env.clock.minutes(3);
    env.llm.script('buddy_turn', (req) => {
      const text = ScriptedGateway.textOf(req);
      expect(text).toContain('Monday 2026-09-28, 15:05 (Europe/Berlin)');
      return {
        reply: 'Mach ich – ab jetzt kurze Runden von etwa 5 Minuten.',
        options: null,
        actions: [
          {
            tool: 'remember',
            args: {
              kind: 'preference',
              statement: 'Möchte kurze Übungen (ca. 5 Minuten)',
              quote: 'mach die Übungen bitte kürzer',
              until: null,
            },
          },
        ],
      };
    });
    const res = await lina.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: ids.msg2,
      text: 'Das war gut, aber mach die Übungen bitte kürzer, so 5 Minuten.',
    });
    expect(res.body.status).toBe('done');
    const memory = await lina.api.get<{
      memories: Array<{ statement: string; source: string; quote: string }>;
    }>('/buddy/memory');
    expect(memory.body.memories).toEqual([
      expect.objectContaining({
        statement: 'Möchte kurze Übungen (ca. 5 Minuten)',
        source: 'learner_stated',
        quote: 'mach die Übungen bitte kürzer',
      }),
    ]);
  });

  it('7 · adapts: the next wake-up uses the preference, the message reaches the phone with honest status', async () => {
    // Thursday 15:00 local: one day before the test.
    env.clock.set('2026-10-01T13:00:00Z');
    env.llm.script('buddy_check', (req) => {
      const text = ScriptedGateway.textOf(req);
      expect(text).toContain('[preference] Möchte kurze Übungen (ca. 5 Minuten)');
      expect(text).toContain('"Mathearbeit Brüche" is in 1 day(s).');
      expect(text).toMatch(/secure: .*Brüche kürzen/);
      // Wake-ups that piled up while the scheduler was not running are listed once.
      expect(text.match(/is in 1 day\(s\)/g)).toHaveLength(1);
      return {
        disposition: 'act',
        reason: 'Test tomorrow; short review as the learner prefers.',
        actions: [
          {
            tool: 'prepare_practice',
            args: { goal: 'g1', subject: null, minutes: 5, focus_topics: [] },
          },
        ],
        outreach: {
          kind: 'idea',
          topic_key: 'exam:g1:day-before',
          title: 'Morgen ist die Mathearbeit',
          body: 'Ich habe eine kurze 5-Minuten-Runde vorbereitet, falls du nochmal üben magst.',
          why: 'Die Arbeit ist morgen und du wolltest kurze Übungen.',
          relevance: 0.9,
          expires_in_hours: 12,
          goal: 'g1',
          step: 'new',
        },
      };
    });
    await tick(env);

    const out = await env.db.one<{
      status: string;
      ticket_id: string;
      send_at: Date;
      sent_at: Date;
    }>(
      `select status, ticket_id, send_at, sent_at from buddy_outreach
        where learner_id = $1 and status <> 'suppressed'`,
      [lina.learnerId],
    );
    // Sent within the preferred window (15:00–18:30 local) — and only "accepted" by the provider, not "delivered".
    expect(out.status).toBe('accepted');
    expect(out.sent_at.toISOString()).toBe('2026-10-01T13:00:00.000Z');
    expect(env.push.sent).toHaveLength(1);
    expect(env.push.sent[0]).toMatchObject({
      to: 'ExponentPushToken[lina-phone-01]',
      title: 'Morgen ist die Mathearbeit',
      data: { type: 'buddy_outreach' },
    });
    // No scores or personal details on the lock screen.
    expect(env.push.sent[0]!.body).not.toMatch(/\d+\s*\/\s*\d+|richtig|falsch/i);

    // The prepared practice respects "short": questionCountFor(5 min) caps it.
    const prepared = await env.db.one<{ payload: { item_ids: string[]; est_minutes: number } }>(
      `select payload from buddy_steps where learner_id = $1 and kind = 'practice' and state = 'prepared'`,
      [lina.learnerId],
    );
    expect(prepared.payload.item_ids.length).toBeLessThanOrEqual(6);

    // 15 minutes later the provider receipt upgrades the status — still not "read".
    env.clock.minutes(16);
    env.push.receipt(out.ticket_id, { status: 'ok' });
    await tick(env);
    const after = await env.db.one<{ status: string; opened_at: Date | null }>(
      `select status, opened_at from buddy_outreach where ticket_id = $1`,
      [out.ticket_id],
    );
    expect(after).toEqual({ status: 'provider_accepted', opened_at: null });

    // The same text is in the thread, with its delivery status.
    const home = (await lina.api.get<BuddyHome>('/buddy')).body;
    const buddyMsg = home.thread.find((m) => m.outreach?.title === 'Morgen ist die Mathearbeit');
    expect(buddyMsg?.outreach?.status).toBe('provider_accepted');
  });

  it('8 · adapts to a temporary situation: pauses contact, and the pause ends by itself', async () => {
    env.clock.minutes(30); // Thursday 15:46 local
    env.llm.script('buddy_turn', (req) => {
      const text = ScriptedGateway.textOf(req);
      // The context no longer lists the old outreach as unknown; it shows the message status.
      expect(text).toContain('last message 2026-10-01 15:00: "Morgen ist die Mathearbeit"');
      return {
        reply:
          'Gute Besserung! Ich melde mich diese Woche nicht mehr – die Übung bleibt hier, falls du magst.',
        options: null,
        actions: [
          {
            tool: 'remember',
            args: {
              kind: 'constraint',
              statement: 'Ist diese Woche krank',
              quote: 'ich bin krank',
              until: { kind: 'end_of_week', weeks_ahead: 0 },
            },
          },
          {
            tool: 'set_contact',
            args: {
              preferred_start: null,
              preferred_end: null,
              quiet_start: null,
              avoid_weekdays: null,
              pause: { kind: 'end_of_week', weeks_ahead: 0 },
              fewer: false,
              quote: 'diese Woche keine Nachrichten mehr',
            },
          },
        ],
      };
    });
    const res = await lina.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: ids.msg3,
      text: 'Bitte diese Woche keine Nachrichten mehr, ich bin krank.',
    });
    expect(res.body.status).toBe('done');
    const s = await env.db.one<{ paused_until: Date }>(
      `select paused_until from buddy_settings where learner_id = $1`,
      [lina.learnerId],
    );
    // End of Sunday 2026-10-04 in Berlin = 2026-10-04T22:00:00Z.
    expect(s.paused_until.toISOString()).toBe('2026-10-04T22:00:00.000Z');

    // Saturday 15:00 local: the follow-up wake-up. Buddy may think, but nothing is sent while paused.
    env.clock.set('2026-10-03T13:00:00Z');
    env.llm.script('buddy_check', (req) => {
      const text = ScriptedGateway.textOf(req);
      expect(text).toContain('[constraint] Ist diese Woche krank (through 2026-10-04)');
      expect(text).toContain('paused through 2026-10-04');
      return {
        disposition: 'act',
        reason: 'Ask how the test went.',
        actions: [],
        outreach: {
          kind: 'checkin',
          topic_key: 'exam:g1:followup',
          title: 'Wie lief die Mathearbeit?',
          body: 'Wie lief es gestern? Sag mir kurz Bescheid, dann plane ich weiter.',
          why: 'Die Arbeit war gestern.',
          relevance: 0.7,
          expires_in_hours: 48,
          goal: 'g1',
          step: null,
        },
      };
    });
    await tick(env);
    const followup = await env.db.one<{ status: string; status_reason: string }>(
      `select status, status_reason from buddy_outreach where learner_id = $1 and topic_key = $2`,
      [lina.learnerId, `exam:${goalId}:followup`],
    );
    expect(followup).toEqual({ status: 'suppressed', status_reason: 'paused' });
    expect(env.push.sent).toHaveLength(1);

    // In the app, the one open decision is "how did it go?" — answered with a tap, no model involved.
    const home = (await lina.api.get<BuddyHome>('/buddy')).body;
    expect(home.decision).toMatchObject({ type: 'how_did_it_go', goal: { id: goalId } });
    const calls = env.llm.calls.length;
    const answered = await lina.api.post<BuddyHome>(`/buddy/goals/${goalId}/outcome`, {
      outcome: 'good',
    });
    expect(answered.status).toBe(200);
    expect(answered.body.decision).toBeNull();
    expect(env.llm.calls.length).toBe(calls);

    // Next week the temporary situation is gone from what Buddy knows.
    env.clock.set('2026-10-05T08:00:00Z');
    const memory = await lina.api.get<{ memories: Array<{ kind: string }> }>('/buddy/memory');
    expect(memory.body.memories.map((m) => m.kind)).toEqual(['preference']);
  });
});
