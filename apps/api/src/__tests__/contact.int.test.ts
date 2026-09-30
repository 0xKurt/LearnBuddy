// Contact promises (CLAUDE.md rule 6; audit I-10, N-3; ADR 0006): Buddy can only reduce contact
// to the phone, messages in the app are never limited or counted, an agreed reminder never
// vanishes, and a reminder keeps its subject.
// docs/architecture.md §Proactivity, §Delivery.
// requires live verification in Claude Code session (needs a running Postgres)

import type { BuddyHome, SendMessageResponse } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  findOrCreateSubject,
  scheduleExamWakeups,
  scheduleStepReminder,
} from '../modules/buddy/plan.js';
import { minutesOf } from '../lib/time.js';
import { loadSettings } from '../modules/buddy/state.js';
import { enqueueJob } from '../modules/scheduler/jobs.js';
import { runTick } from '../modules/scheduler/tick.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import {
  createTestEnv,
  enableContact,
  onboard,
  type Learner,
  type TestEnv,
} from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

let seq = 0;
const uuid = () => `00000000-0000-4000-c000-${(++seq).toString(16).padStart(12, '0')}`;

async function send(l: Learner, text: string, id = uuid()) {
  const res = await l.api.post<SendMessageResponse>('/buddy/messages', {
    client_message_id: id,
    text,
  });
  return { ...res, id };
}

const reply = (text: string, actions: unknown[] = []) => ({
  json: { concern: false, reply: text, options: null, actions },
});

async function tick(env: TestEnv): Promise<void> {
  const stats = await runTick(env.deps);
  expect(stats.errors).toEqual([]);
}

/** An agreed reminder she asked for, planned through the real planning code. */
async function agreedStep(
  env: TestEnv,
  learnerId: string,
  opts: { title: string; date: string; time: string; at: string },
): Promise<string> {
  return env.db.tx(async (tx) => {
    const step = await tx.one<{ id: string; version: number }>(
      `insert into buddy_steps (learner_id, kind, title, state, planned_date, planned_time, agreed)
       values ($1, 'practice', $2, 'planned', $3, $4, true) returning id, version`,
      [learnerId, opts.title, opts.date, opts.time],
    );
    await scheduleStepReminder(tx, learnerId, step, new Date(opts.at));
    return step.id;
  });
}

async function outreach(env: TestEnv, learnerId: string) {
  return env.db.query<{ status: string; status_reason: string | null; origin: string }>(
    `select status, status_reason, origin from buddy_outreach where learner_id = $1 order by created_at, seq`,
    [learnerId],
  );
}

async function thread(env: TestEnv, learnerId: string): Promise<string[]> {
  const rows = await env.db.query<{ text: string }>(
    `select text from buddy_messages where learner_id = $1 and outreach_id is not null order by seq`,
    [learnerId],
  );
  return rows.map((r) => r.text);
}

async function mathItems(env: TestEnv, learnerId: string, n: number): Promise<string> {
  return env.db.tx(async (tx) => {
    const subject = await findOrCreateSubject(tx, learnerId, 'Mathe', 'math');
    const material = await tx.one<{ id: string }>(
      `insert into materials (learner_id, client_request_id, subject_id, status, photo_count, title, created_at)
       values ($1, gen_random_uuid(), $2, 'ready', 1, 'Brüche', $3) returning id`,
      [learnerId, subject.id, env.clock.now()],
    );
    for (let i = 0; i < n; i++) {
      await tx.query(
        `insert into items (learner_id, material_id, subject_id, kind, prompt, answer, topic)
         values ($1, $2, $3, 'short', $4, $5, 'Brüche')`,
        [learnerId, material.id, subject.id, `Frage ${i + 1}`, `Antwort ${i + 1}`],
      );
    }
    return subject.id;
  });
}

const idea = (topic: string, expires = 12) => ({
  json: {
    disposition: 'act',
    reason: 'useful now',
    actions: [],
    outreach: {
      kind: 'idea',
      topic_key: topic,
      title: 'Idee',
      body: 'Ich hätte da eine kurze Übung für dich.',
      why: 'Die Arbeit ist bald.',
      relevance: 0.9,
      expires_in_hours: expires,
      goal: null,
      step: null,
    },
  },
});

describe.skipIf(!dbReady)('contact promises', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
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

  const pauseAction = {
    tool: 'set_contact',
    args: {
      preferred_start: null,
      preferred_end: null,
      quiet_start: null,
      quiet_end: null,
      avoid_weekdays: null,
      pause: { kind: 'end_of_week', weeks_ahead: 0 },
      quote: 'bis Sonntag nichts aufs Handy',
    },
  };

  it('the longest pause there is can actually be set (issue #119)', async () => {
    const l = await onboard(env);
    await enableContact(env, l.learnerId);
    // An UntilSpec ends at midnight AFTER its last day, so measuring the limit in
    // milliseconds made the longest expressible pause always too long by the rest of today.
    // A learner asking for silence then got model_invalid — an error instead of an answer.
    env.llm.script(
      'buddy_turn',
      reply('Ich bin still. So weit reicht es: 60 Tage.', [
        {
          ...pauseAction,
          args: {
            ...pauseAction.args,
            pause: { kind: 'end_of_day', days: 60 },
            quote: 'schreib mir nicht mehr',
          },
        },
      ]),
    );
    await send(l, 'schreib mir nicht mehr');
    const settings = await l.api.get<{ paused_until: string | null }>('/buddy/settings');
    // The 60th day is her last quiet one, so the pause ends at midnight after it — the cap is
    // reached exactly, neither refused nor quietly shortened.
    expect(settings.body.paused_until).toBe('2026-11-27T23:00:00.000Z'); // 28.09. + 60 Tage
  });

  it('under 16 she cannot undo a pause without the adult (rule 6, ADR 0006)', async () => {
    const l = await onboard(env, { relation: 'child', pin: '4711' });
    await enableContact(env, l.learnerId);
    env.llm.script('buddy_turn', reply('Okay, bis Sonntag Ruhe auf dem Handy.', [pauseAction]));
    const res = await send(l, 'Bitte bis Sonntag nichts aufs Handy');
    expect(res.body.status).toBe('done');
    const card = res.body.home.thread.flatMap((m) => m.actions)[0]!;
    expect(card.summary).toMatchObject({ tool: 'set_contact' });
    expect(card.summary).not.toHaveProperty('max_per_week');
    // Not offered to her …
    expect(card.undoable).toBe(false);
    // … and refused if she tries anyway.
    const denied = await l.api.post<{ error: { code: string } }>(`/buddy/actions/${card.id}/undo`);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('admin_required');
    const settings = await l.api.get<{ paused_until: string | null }>('/buddy/settings');
    expect(settings.body.paused_until).not.toBeNull();
    // The adult can.
    const session = await l.api.post<{ admin_token: string }>('/account/admin-session', {
      pin: '4711',
    });
    const parent = l.api.with({ 'x-admin-token': session.body.admin_token });
    const undone = await parent.post<BuddyHome>(`/buddy/actions/${card.id}/undo`);
    expect(undone.status).toBe(200);
    const after = await l.api.get<{ paused_until: string | null }>('/buddy/settings');
    expect(after.body.paused_until).toBeNull();
  });

  it('a 16-year-old undoes her own pause and turns contact on herself, without a PIN (ADR 0006)', async () => {
    // 16 since March; her parents set the profile up.
    const l = await onboard(env, { relation: 'child', birthDate: '2010-03-10' });
    await enableContact(env, l.learnerId);
    env.llm.script('buddy_turn', reply('Okay, bis Sonntag Ruhe auf dem Handy.', [pauseAction]));
    const res = await send(l, 'Bitte bis Sonntag nichts aufs Handy');
    const card = res.body.home.thread.flatMap((m) => m.actions)[0]!;
    expect(card.undoable).toBe(true);
    expect((await l.api.post(`/buddy/actions/${card.id}/undo`)).status).toBe(200);
    const s = await l.api.get<{ version: number; can_loosen: boolean }>('/buddy/settings');
    expect(s.body.can_loosen).toBe(true);
    const off = await l.api.patch<{ version: number }>('/buddy/settings', {
      contact_enabled: false,
      version: s.body.version,
    });
    expect(off.status).toBe(200);
    const on = await l.api.patch<{ contact_enabled: boolean }>('/buddy/settings', {
      contact_enabled: true,
      version: off.body.version,
    });
    expect(on.status).toBe(200);
    expect(on.body.contact_enabled).toBe(true);
  });

  it('Buddy may write several times a day in the app: nothing is counted (ADR 0006, repro-02)', async () => {
    await env.close();
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z', push: 'disabled' });
    const l = await onboard(env);
    await enableContact(env, l.learnerId);
    await env.db.query(
      `insert into buddy_goals (learner_id, kind, title, due_date) values ($1, 'exam', 'Mathearbeit', '2026-10-02')`,
      [l.learnerId],
    );
    const checks = [
      ['check:a', '2026-09-28T13:00:00Z', 'practice:a'],
      ['check:b', '2026-09-28T14:00:00Z', 'practice:b'],
      ['check:c', '2026-09-28T15:00:00Z', 'practice:c'],
      // The same topic again the same day: said once is enough.
      ['check:d', '2026-09-28T16:00:00Z', 'practice:a'],
    ] as const;
    for (const [key, at] of checks) {
      await enqueueJob(env.db, {
        learnerId: l.learnerId,
        kind: 'buddy_check',
        runAt: new Date(at),
        dedupeKey: key,
        payload: { reason: 'checkin_requested', note: key },
      });
    }
    for (const [, at, topic] of checks) {
      env.clock.set(at);
      env.llm.script('buddy_check', idea(topic));
      await tick(env);
    }
    const rows = await outreach(env, l.learnerId);
    expect(rows.map((r) => r.status)).toEqual(['in_app', 'in_app', 'in_app', 'suppressed']);
    expect(rows[3]!.status_reason).toBe('duplicate_topic');
    // Three unanswered messages in a row: no gate stops the next one.
    expect(await thread(env, l.learnerId)).toHaveLength(3);
  });

  it('with contact to the phone off, Buddy still writes in the app (ADR 0006)', async () => {
    const l = await onboard(env);
    await env.db.query(
      `insert into buddy_goals (learner_id, kind, title, due_date) values ($1, 'exam', 'Mathearbeit', '2026-10-02')`,
      [l.learnerId],
    );
    await enqueueJob(env.db, {
      learnerId: l.learnerId,
      kind: 'buddy_check',
      runAt: new Date('2026-09-28T13:00:00Z'),
      dedupeKey: 'check:off',
      payload: { reason: 'checkin_requested', note: 'x' },
    });
    env.clock.set('2026-09-28T13:00:00Z');
    env.llm.script('buddy_check', idea('practice:off'));
    await tick(env);
    const rows = await outreach(env, l.learnerId);
    expect(rows).toMatchObject([{ status: 'in_app', status_reason: 'contact_disabled' }]);
    expect(await thread(env, l.learnerId)).toEqual(['Ich hätte da eine kurze Übung für dich.']);
    expect(env.push.attempts).toHaveLength(0);
  });

  // "Morgens vor neun bitte nichts" is LESS contact, and ADR 0006 lets Buddy do that — but
  // until issue #114 the tool only carried the evening start, so the one end a child actually
  // asks about went through the settings form or not at all.
  it('she can push the morning end later, and never pull it earlier (issue #114)', async () => {
    const l = await onboard(env, { relation: 'child', pin: '4711' });
    await enableContact(env, l.learnerId, { quiet_start: '20:00', quiet_end: '07:00' });
    const setQuietEnd = (end: string | null, quote: string) => ({
      tool: 'set_contact',
      args: {
        preferred_start: null,
        preferred_end: null,
        quiet_start: null,
        quiet_end: end,
        avoid_weekdays: null,
        pause: null,
        quote,
      },
    });

    // Later end = quieter morning: allowed, and undoable by her.
    env.llm.script(
      'buddy_turn',
      reply('Alles klar, morgens ist bis 9 Uhr Ruhe.', [
        setQuietEnd('09:00', 'morgens erst ab 9 bitte'),
      ]),
    );
    const ok = await send(l, 'morgens erst ab 9 bitte');
    expect(ok.body.status).toBe('done');
    const settings = await l.api.get<{ quiet_end: string; preferred_start: string }>(
      '/buddy/settings',
    );
    expect(settings.body.quiet_end).toBe('09:00');
    // The preferred window cannot start inside the quiet hours any more.
    expect(minutesOf(settings.body.preferred_start)).toBeGreaterThanOrEqual(minutesOf('09:00'));
    const card = ok.body.home.thread.flatMap((m) => m.actions).at(-1)!;
    expect(card.summary).toMatchObject({ tool: 'set_contact', quiet_end: '09:00' });
    // Not offered as undoable to a child: taking the quieter morning back is MORE contact,
    // and that needs the adult (ADR 0006) — the same rule that let her set it in the first place.
    expect(card.undoable).toBe(false);

    // Earlier end = more contact: refused in code, whatever the wording.
    env.llm.script(
      'buddy_turn',
      reply('Ich schaue mal.', [setQuietEnd('06:00', 'schreib mir schon ab 6')]),
      reply('Das kann ich nicht — frag bitte deine Eltern in den Einstellungen.', []),
    );
    const denied = await send(l, 'schreib mir schon ab 6');
    expect(denied.body.status).toBe('done');
    expect((await l.api.get<{ quiet_end: string }>('/buddy/settings')).body.quiet_end).toBe(
      '09:00',
    );
  });

  // The question this whole corpus started from (#106 → #112): "erinner mich in einer Stunde".
  // The model used to have to read the clock out of STATE, add, decide the midnight roll-over
  // and write HH:MM — and code could not check the result against the wish.
  it('resolves "in an hour" on the server, and refuses it inside the quiet hours (issue #112)', async () => {
    const l = await onboard(env);
    await enableContact(env, l.learnerId, { quiet_start: '20:00', quiet_end: '07:00' });
    const inMinutes = (n: number, quote: string) => ({
      tool: 'plan_step',
      args: {
        goal: null,
        kind: 'practice',
        title: 'Vokabeln üben',
        day: { kind: 'unknown' },
        time: null,
        in_minutes: n,
        repeat: null,
        repeat_until: null,
        agreed: true,
        quote,
        subject: null,
        focus_topics: [],
      },
    });

    env.clock.set('2026-09-28T14:00:00Z'); // 16:00 local
    env.llm.script(
      'buddy_turn',
      reply('Mach ich — in einer Stunde.', [inMinutes(60, 'erinner mich in einer stunde')]),
    );
    const ok = await send(l, 'erinner mich in einer stunde');
    expect(ok.body.status).toBe('done');
    const step = await env.db.one<{ planned_date: string; planned_time: string }>(
      `select planned_date, to_char(planned_time, 'HH24:MI') as planned_time
         from buddy_steps where learner_id = $1 order by created_at desc limit 1`,
      [l.learnerId],
    );
    // 16:00 + 60 min, computed by the server against its own clock — not by the model.
    expect(step.planned_time).toBe('17:00');
    expect(step.planned_date).toBe('2026-09-28');
    // And the reminder really stands at that minute: the scheduler finds it there, not before.
    await tick(env);
    expect(await outreach(env, l.learnerId)).toEqual([]);
    env.clock.set('2026-09-28T15:00:00Z'); // 17:00 local — the minute she asked for
    await tick(env);
    // No phone registered here, so it waits in the app — the point is that it is due NOW.
    expect((await outreach(env, l.learnerId)).map((r) => r.status)).toEqual(['in_app']);

    // 19:30 + 60 min lands at 20:30, inside the quiet hours: refused, with the reason.
    env.clock.set('2026-09-28T17:30:00Z'); // 19:30 local
    env.llm.script(
      'buddy_turn',
      reply('Ich schaue mal.', [inMinutes(60, 'in einer stunde nochmal')]),
      reply('Um die Zeit ist Ruhe — morgen früh?', []),
    );
    const late = await send(l, 'in einer stunde nochmal');
    expect(late.body.status).toBe('done');
    // Refused in code, so no second step exists — and she is told, not left guessing.
    expect(
      await env.db.query(`select 1 from buddy_steps where learner_id = $1`, [l.learnerId]),
    ).toHaveLength(1);
    expect(late.body.home.thread.at(-1)!.text).toBe('Um die Zeit ist Ruhe — morgen früh?');
  });

  // Issue #112: "erinner mich jeden tag um 5" — the most ordinary thing a child asks a learning
  // companion, and until now only answerable as a handful of single steps, then silence.
  describe('a reminder she wants again and again', () => {
    /** The repetition as plan_step writes it, driven through the real planning code. */
    async function repeating(
      learnerId: string,
      opts: {
        date: string;
        time: string;
        at: string;
        repeat: 'daily' | 'weekdays' | 'weekly';
        until?: string;
      },
    ): Promise<string> {
      return env.db.tx(async (tx) => {
        const step = await tx.one<{ id: string; version: number }>(
          `insert into buddy_steps (learner_id, kind, title, state, planned_date, planned_time,
                                    agreed, repeat, repeat_until)
           values ($1, 'practice', 'Vokabeln üben', 'planned', $2, $3, true, $4, $5)
           returning id, version`,
          [learnerId, opts.date, opts.time, opts.repeat, opts.until ?? null],
        );
        await scheduleStepReminder(tx, learnerId, step, new Date(opts.at));
        return step.id;
      });
    }
    const dateOf = async (stepId: string) =>
      (
        await env.db.one<{ planned_date: string; repeat: string | null }>(
          `select planned_date, repeat from buddy_steps where id = $1`,
          [stepId],
        )
      ).planned_date;

    it('comes again the next day, and keeps coming', async () => {
      const l = await onboard(env);
      await enableContact(env, l.learnerId);
      // Monday 28.09.2026, 17:00 local.
      const id = await repeating(l.learnerId, {
        date: '2026-09-28',
        time: '17:00',
        at: '2026-09-28T15:00:00Z',
        repeat: 'daily',
      });
      env.clock.set('2026-09-28T15:00:00Z');
      await tick(env);
      expect(await dateOf(id)).toBe('2026-09-29');

      env.clock.set('2026-09-29T15:00:00Z');
      await tick(env);
      expect(await dateOf(id)).toBe('2026-09-30');
      // Two reminders, both hers, both actually sent — not one and then silence.
      expect((await outreach(env, l.learnerId)).map((r) => r.origin)).toEqual(['agreed', 'agreed']);
    });

    it('a repetition for school days skips the weekend', async () => {
      const l = await onboard(env);
      await enableContact(env, l.learnerId);
      // Friday 02.10.2026.
      const id = await repeating(l.learnerId, {
        date: '2026-10-02',
        time: '17:00',
        at: '2026-10-02T15:00:00Z',
        repeat: 'weekdays',
      });
      env.clock.set('2026-10-02T15:00:00Z');
      await tick(env);
      expect(await dateOf(id)).toBe('2026-10-05'); // Monday, not Saturday
    });

    it('a weekly one keeps its weekday', async () => {
      const l = await onboard(env);
      await enableContact(env, l.learnerId);
      const id = await repeating(l.learnerId, {
        date: '2026-09-28', // Monday
        time: '17:00',
        at: '2026-09-28T15:00:00Z',
        repeat: 'weekly',
      });
      env.clock.set('2026-09-28T15:00:00Z');
      await tick(env);
      expect(await dateOf(id)).toBe('2026-10-05'); // the next Monday
    });

    it('stops at the end she named, and says nothing after it', async () => {
      const l = await onboard(env);
      await enableContact(env, l.learnerId);
      const id = await repeating(l.learnerId, {
        date: '2026-09-28',
        time: '17:00',
        at: '2026-09-28T15:00:00Z',
        repeat: 'daily',
        until: '2026-09-28',
      });
      env.clock.set('2026-09-28T15:00:00Z');
      await tick(env);
      const row = await env.db.one<{ repeat: string | null; planned_date: string }>(
        `select repeat, planned_date from buddy_steps where id = $1`,
        [id],
      );
      // The last one was today: the repetition is cleared, the step stays where it was.
      expect(row.repeat).toBeNull();
      expect(row.planned_date).toBe('2026-09-28');
      expect((await outreach(env, l.learnerId)).length).toBe(1);
    });

    it('a phone that was off for a week owes her one reminder, not seven', async () => {
      const l = await onboard(env);
      await enableContact(env, l.learnerId);
      const id = await repeating(l.learnerId, {
        date: '2026-09-28',
        time: '17:00',
        at: '2026-09-28T15:00:00Z',
        repeat: 'daily',
      });
      // The tick only runs a week later: the step must not walk forward day by day.
      env.clock.set('2026-10-05T15:00:00Z');
      await tick(env);
      expect(await dateOf(id)).toBe('2026-10-06');
      expect((await outreach(env, l.learnerId)).length).toBe(1);
    });
  });

  describe('an agreed reminder never vanishes (H-37, repro-15)', () => {
    it('1B: deferred by quiet hours, then paused → it waits in the app, saying it is late', async () => {
      const l = await onboard(env);
      await enableContact(env, l.learnerId, { quiet_start: '17:00', quiet_end: '19:00' });
      await agreedStep(env, l.learnerId, {
        title: 'Brüche üben',
        date: '2026-09-28',
        time: '17:30',
        at: '2026-09-28T15:30:00Z',
      });
      env.clock.set('2026-09-28T15:30:00Z');
      await tick(env);
      expect((await outreach(env, l.learnerId)).map((r) => r.status)).toEqual(['scheduled']);
      const s = await l.api.get<{ version: number }>('/buddy/settings');
      const paused = await l.api.patch('/buddy/settings', {
        paused_until: '2026-09-30T22:00:00.000Z',
        version: s.body.version,
      });
      expect(paused.status).toBe(200);
      env.clock.set('2026-09-28T17:00:00Z'); // 19:00, the end of the quiet hours
      await tick(env);
      expect(await outreach(env, l.learnerId)).toMatchObject([{ status: 'in_app' }]);
      expect(await thread(env, l.learnerId)).toEqual([
        'Ich wollte dich um 17:30 erinnern – sorry, das kommt verspätet. Wie verabredet: Brüche üben.',
      ]);
      expect(env.push.attempts).toHaveLength(0);
    });

    it('1B′: quiet hours moved over the agreed time → it waits in the app', async () => {
      const l = await onboard(env);
      await enableContact(env, l.learnerId, { quiet_start: '17:00' });
      await agreedStep(env, l.learnerId, {
        title: 'Brüche üben',
        date: '2026-09-28',
        time: '17:30',
        at: '2026-09-28T15:30:00Z',
      });
      env.clock.set('2026-09-28T15:30:00Z');
      await tick(env);
      expect(await outreach(env, l.learnerId)).toMatchObject([
        { status: 'in_app', status_reason: 'no_slot' },
      ]);
      expect(await thread(env, l.learnerId)).toEqual(['Wie verabredet: Brüche üben.']);
    });

    it('1C: the scheduler is 7 hours late → it waits in the app, saying it is late', async () => {
      const l = await onboard(env);
      await enableContact(env, l.learnerId);
      await agreedStep(env, l.learnerId, {
        title: 'Vokabeln',
        date: '2026-09-29',
        time: '08:00',
        at: '2026-09-29T06:00:00Z',
      });
      env.clock.set('2026-09-29T13:00:00Z');
      await tick(env);
      expect(await outreach(env, l.learnerId)).toMatchObject([{ status: 'in_app' }]);
      expect(await thread(env, l.learnerId)).toEqual([
        'Ich wollte dich um 08:00 erinnern – sorry, das kommt verspätet. Wie verabredet: Vokabeln.',
      ]);
    });

    it('1D: 7 hours late into quiet hours → still in the app', async () => {
      const l = await onboard(env);
      await enableContact(env, l.learnerId);
      await agreedStep(env, l.learnerId, {
        title: 'Vokabeln',
        date: '2026-09-28',
        time: '15:00',
        at: '2026-09-28T13:00:00Z',
      });
      env.clock.set('2026-09-28T20:00:00Z'); // 22:00 local
      await tick(env);
      expect(await outreach(env, l.learnerId)).toMatchObject([{ status: 'in_app' }]);
      expect((await thread(env, l.learnerId))[0]).toContain('um 15:00 erinnern');
    });
  });

  it('a reminder for English with only maths questions prepares nothing and says only what was agreed (H-30)', async () => {
    const l = await onboard(env);
    await mathItems(env, l.learnerId, 6);
    const stepId = await agreedStep(env, l.learnerId, {
      title: 'Englisch Vokabeln',
      date: '2026-09-28',
      time: '16:00',
      at: '2026-09-28T14:00:00Z',
    });
    env.clock.set('2026-09-28T14:00:00Z');
    await tick(env);
    expect(await thread(env, l.learnerId)).toEqual(['Wie verabredet: Englisch Vokabeln.']);
    const step = await env.db.one<{ state: string }>(
      `select state from buddy_steps where id = $1`,
      [stepId],
    );
    expect(step.state).toBe('planned');
  });

  it('an outreach message about an unknown goal is refused, not sent without its link (p2-outreach-links-silently-dropped)', async () => {
    const l = await onboard(env);
    await enableContact(env, l.learnerId);
    await env.db.query(
      `insert into buddy_goals (learner_id, kind, title, due_date) values ($1, 'exam', 'Mathearbeit', '2026-10-02')`,
      [l.learnerId],
    );
    await enqueueJob(env.db, {
      learnerId: l.learnerId,
      kind: 'buddy_check',
      runAt: new Date('2026-09-28T13:00:00Z'),
      dedupeKey: 'check:links',
      payload: { reason: 'checkin_requested', note: 'links' },
    });
    env.clock.set('2026-09-28T13:00:00Z');
    const about = (goal: string) => {
      const x = idea('practice:a');
      return { json: { ...x.json, outreach: { ...x.json.outreach, goal } } };
    };
    const wrong = about('g9');
    const right = about('g1');
    env.llm.script('buddy_check', wrong, (req) => {
      expect(ScriptedGateway.textOf(req)).toContain('outreach: unknown goal g9');
      return right.json;
    });
    await tick(env);
    const row = await env.db.one<{ goal_id: string | null }>(
      `select goal_id from buddy_outreach where learner_id = $1`,
      [l.learnerId],
    );
    expect(row.goal_id).not.toBeNull();
  });

  it('doing the practice a message was about answers it, without tapping the push (previous-unanswered-needs-push-tap)', async () => {
    const l = await onboard(env);
    await enableContact(env, l.learnerId);
    await env.db.query(
      `insert into buddy_goals (learner_id, kind, title, due_date) values ($1, 'exam', 'Mathearbeit', '2026-10-02')`,
      [l.learnerId],
    );
    const step = await env.db.one<{ id: string }>(
      `insert into buddy_steps (learner_id, kind, title, state, planned_date, finished_at, done_source)
       values ($1, 'practice', 'Brüche', 'done', '2026-09-28', $2, 'evidence') returning id`,
      [l.learnerId, new Date('2026-09-28T12:00:00Z')],
    );
    await env.db.query(
      `insert into buddy_outreach (learner_id, kind, origin, topic_key, dedupe_key, title, body, status,
                                   send_at, sent_at, expires_at, step_id, created_at)
       values ($1, 'idea', 'buddy', 'practice:old', 'old', 'Idee', 'Übung ist bereit', 'accepted',
               $2, $2, $3, $4, $2)`,
      [l.learnerId, new Date('2026-09-28T11:00:00Z'), new Date('2026-09-28T20:00:00Z'), step.id],
    );
    await enqueueJob(env.db, {
      learnerId: l.learnerId,
      kind: 'buddy_check',
      runAt: new Date('2026-09-29T13:00:00Z'),
      dedupeKey: 'check:answered',
      payload: { reason: 'checkin_requested', note: 'answered' },
    });
    env.clock.set('2026-09-29T13:00:00Z');
    env.llm.script('buddy_check', idea('practice:new'));
    await tick(env);
    const rows = await outreach(env, l.learnerId);
    expect(rows[1]).toBeDefined();
    expect(rows[1]!.status_reason).not.toBe('previous_unanswered');
    expect(rows[1]!.status).not.toBe('suppressed');
  });

  it('a reminder job that runs again sends nothing twice (agreed-reminder-duplicate-on-rerun)', async () => {
    const l = await onboard(env);
    await mathItems(env, l.learnerId, 6);
    const stepId = await env.db.tx(async (tx) => {
      const subject = await findOrCreateSubject(tx, l.learnerId, 'Mathe', 'math');
      const step = await tx.one<{ id: string; version: number }>(
        `insert into buddy_steps (learner_id, kind, title, state, planned_date, planned_time, agreed, payload)
         values ($1, 'practice', 'Brüche üben', 'planned', '2026-09-28', '16:00', true, $2)
         returning id, version`,
        [l.learnerId, { subject_id: subject.id, focus_topics: [] }],
      );
      await scheduleStepReminder(tx, l.learnerId, step, new Date('2026-09-28T14:00:00Z'));
      return step.id;
    });
    env.clock.set('2026-09-28T14:00:00Z');
    await tick(env);
    const step = await env.db.one<{ state: string }>(
      `select state from buddy_steps where id = $1`,
      [stepId],
    );
    expect(step.state).toBe('prepared');
    // The worker died after the reminder was stored: the job runs once more.
    await env.db.query(
      `update jobs set status = 'queued', finished_at = null, result = null
        where kind = 'buddy_check' and payload ->> 'step_id' = $1`,
      [stepId],
    );
    await tick(env);
    expect(await outreach(env, l.learnerId)).toHaveLength(1);
  });

  it('plan_step keeps the subject she named, and an agreed reminder is never silently unscheduled (M-58)', async () => {
    const l = await onboard(env);
    await mathItems(env, l.learnerId, 6);
    env.clock.set('2026-09-28T15:00:00Z'); // 17:00 local: the usual 15:00 is over
    const step = (time: string | null, days: number) => ({
      tool: 'plan_step',
      args: {
        goal: null,
        kind: 'practice',
        title: 'Brüche üben',
        day: { kind: 'in_days', days },
        time,
        in_minutes: null,
        repeat: null,
        repeat_until: null,
        agreed: true,
        quote: 'erinner mich ans Brüche üben',
        subject: 'f1',
        focus_topics: ['Brüche'],
      },
    });
    env.llm.script(
      'buddy_turn',
      reply('Mach ich!', [step(null, 0)]),
      reply('Ich erinnere dich morgen.', [step(null, 1)]),
    );
    const res = await send(l, 'Bitte erinner mich ans Brüche üben');
    expect(res.body.status).toBe('done');
    const rejected = await env.db.one<{ errors: string[] }>(
      `select errors from buddy_decisions where learner_id = $1 and disposition = 'rejected'`,
      [l.learnerId],
    );
    expect(rejected.errors.join(' ')).toContain('already over');
    const planned = await env.db.one<{ payload: { subject_id: string; focus_topics: string[] } }>(
      `select payload from buddy_steps where learner_id = $1 and agreed`,
      [l.learnerId],
    );
    expect(planned.payload.focus_topics).toEqual(['Brüche']);
    expect(planned.payload.subject_id).toBeTruthy();
    const jobs = await env.db.query(
      `select 1 from jobs where learner_id = $1 and payload ->> 'reason' = 'step_due' and status = 'queued'`,
      [l.learnerId],
    );
    expect(jobs).toHaveLength(1);
  });

  it('rules tightened after scheduling hold at send time (M-59)', async () => {
    const l = await onboard(env);
    await enableContact(env, l.learnerId);
    await l.api.post('/buddy/push-tokens', {
      token: 'ExponentPushToken[device-0001]',
      platform: 'ios',
    });
    await mathItems(env, l.learnerId, 3);
    await enqueueJob(env.db, {
      learnerId: l.learnerId,
      kind: 'buddy_check',
      runAt: new Date('2026-09-28T16:45:00Z'),
      dedupeKey: 'check:evening',
      payload: { reason: 'checkin_requested', note: 'x' },
    });
    // Monday 18:45: outside the preferred window, so the idea waits for Tuesday 15:00.
    env.clock.set('2026-09-28T16:45:00Z');
    env.llm.script('buddy_check', idea('practice:tue', 24));
    await tick(env);
    expect((await outreach(env, l.learnerId)).map((r) => r.status)).toEqual(['scheduled']);
    // Then: "bitte dienstags keine Nachrichten".
    const s = await l.api.get<{ version: number }>('/buddy/settings');
    expect(
      (await l.api.patch('/buddy/settings', { avoid_weekdays: [2], version: s.body.version }))
        .status,
    ).toBe(200);
    env.clock.set('2026-09-29T13:00:00Z');
    await tick(env);
    // Not to the phone on her day off — it waits in the app instead (ADR 0006).
    expect(await outreach(env, l.learnerId)).toMatchObject([
      { status: 'in_app', status_reason: 'no_slot' },
    ]);
    expect(env.push.attempts).toHaveLength(0);
    expect(await thread(env, l.learnerId)).toHaveLength(1);
  });

  it('a countdown delivered on the exam day says "Heute", not "Morgen" (M-60)', async () => {
    await env.close();
    env = await createTestEnv({
      start: '2026-09-28T08:00:00Z',
      model: 'disabled',
      push: 'disabled',
    });
    const l = await onboard(env);
    // Mondays without messages: the d-1 message (Monday) moves to the exam day.
    await enableContact(env, l.learnerId, { avoid_weekdays: [1] });
    await env.db.tx(async (tx) => {
      const subjectId = await (async () => {
        const subject = await findOrCreateSubject(tx, l.learnerId, 'Mathe', 'math');
        return subject.id;
      })();
      const goal = await tx.one<{ id: string }>(
        `insert into buddy_goals (learner_id, kind, title, subject_id, due_date)
         values ($1, 'exam', 'Mathearbeit', $2, '2026-09-29') returning id`,
        [l.learnerId, subjectId],
      );
      const material = await tx.one<{ id: string }>(
        `insert into materials (learner_id, client_request_id, goal_id, subject_id, status, photo_count, title, created_at)
         values ($1, gen_random_uuid(), $2, $3, 'ready', 1, 'Blatt', $4) returning id`,
        [l.learnerId, goal.id, subjectId, env.clock.now()],
      );
      for (let i = 0; i < 4; i++) {
        await tx.query(
          `insert into items (learner_id, material_id, subject_id, kind, prompt, answer, topic)
           values ($1, $2, $3, 'short', $4, 'x', 'Brüche')`,
          [l.learnerId, material.id, subjectId, `Frage ${i}`],
        );
      }
      const settings = await loadSettings(tx, l.learnerId);
      await scheduleExamWakeups(tx, l.learnerId, goal.id, '2026-09-29', settings, env.clock.now());
    });
    env.clock.set('2026-09-28T13:00:00Z'); // Monday 15:00: the d-1 wake-up
    await tick(env);
    expect(await thread(env, l.learnerId)).toEqual([]);
    env.clock.set('2026-09-29T05:00:00Z'); // Tuesday 07:00, the exam day
    await tick(env);
    const [text] = await thread(env, l.learnerId);
    expect(text).toMatch(/^Heute ist „Mathearbeit“/);
  });

  it('stopping contact does not bring the opt-in card straight back (M-62)', async () => {
    const l = await onboard(env);
    await enableContact(env, l.learnerId);
    await env.db.query(
      `insert into buddy_goals (learner_id, kind, title, due_date) values ($1, 'exam', 'Mathearbeit', '2026-10-02')`,
      [l.learnerId],
    );
    const s = await l.api.get<{ version: number }>('/buddy/settings');
    const off = await l.api.patch('/buddy/settings', {
      contact_enabled: false,
      version: s.body.version,
    });
    expect(off.status).toBe(200);
    const home = await l.api.get<BuddyHome>('/buddy');
    expect(home.body.decision).toBeNull();
  });

  it('a send whose outcome is unknown still leaves its text in the thread (M-63)', async () => {
    const l = await onboard(env);
    await env.db.query(
      `insert into buddy_outreach (learner_id, kind, origin, topic_key, dedupe_key, title, body, status,
                                   send_at, expires_at, lease_until, created_at)
       values ($1, 'idea', 'buddy', 't', 'd', 'Idee', 'Kurze Übung gefällig?', 'sending',
               $2, $3, $4, $2)`,
      [
        l.learnerId,
        new Date('2026-09-28T07:50:00Z'),
        new Date('2026-09-28T20:00:00Z'),
        new Date('2026-09-28T07:52:00Z'),
      ],
    );
    await tick(env);
    expect(await outreach(env, l.learnerId)).toMatchObject([{ status: 'send_uncertain' }]);
    expect(await thread(env, l.learnerId)).toEqual(['Kurze Übung gefällig?']);
  });

  it('"Heute nicht" moves prepared practice to tomorrow instead of skipping it for good (M-57)', async () => {
    const l = await onboard(env);
    const stepId = (
      await env.db.one<{ id: string }>(
        `insert into buddy_steps (learner_id, kind, title, state, planned_date, payload, prepared_at)
         values ($1, 'practice', 'Brüche', 'prepared', '2026-09-28', $2, $3) returning id`,
        [
          l.learnerId,
          { item_ids: ['00000000-0000-4000-8000-000000000001'], est_minutes: 5 },
          env.clock.now(),
        ],
      )
    ).id;
    const before = await l.api.get<BuddyHome>('/buddy');
    expect(before.body.now).toMatchObject({ type: 'practice_ready', step_id: stepId });
    const later = await l.api.post<BuddyHome>(`/buddy/steps/${stepId}/skip`);
    expect(later.status).toBe(200);
    expect(later.body.now).toBeNull();
    expect(later.body.next).toMatchObject([{ kind: 'step', id: stepId, date: '2026-09-29' }]);
    env.clock.set('2026-09-29T08:00:00Z');
    const tomorrow = await l.api.get<BuddyHome>('/buddy');
    expect(tomorrow.body.now).toMatchObject({ type: 'practice_ready', step_id: stepId });
  });
});
