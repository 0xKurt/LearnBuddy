// Conversation turns under failure: duplicates, concurrency, stale and
// superseded decisions, invalid model output, outages, interruptions, undo,
// tenant isolation, minors' contact rules, time zones and clock changes.
// docs/architecture.md §Turns, §Tools. ADR 0004 §Reliability.
// requires live verification in Claude Code session (needs a running Postgres)

import type { BuddyHome, SendMessageResponse } from '@learnbuddy/shared-types/contracts';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { LlmError } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import {
  createTestEnv,
  enableContact,
  onboard,
  TEST_TICK_SECRET,
  type Learner,
  type TestEnv,
} from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${(++seq).toString(16).padStart(12, '0')}`;

type Reply = { reply: string; options: string[] | null; actions: unknown[] };
/** A TurnDecision, as returned from a scripted function. */
const say = (reply: string, actions: unknown[] = [], options: string[] | null = null): Reply => ({
  reply,
  options,
  actions,
});
/** The same as a fixed scripted answer. */
const answer = (reply: string, actions: unknown[] = [], options: string[] | null = null) => ({
  json: say(reply, actions, options),
});

async function send(l: Learner, text: string, id = uuid()) {
  const res = await l.api.post<SendMessageResponse>('/buddy/messages', {
    client_message_id: id,
    text,
  });
  return { ...res, id };
}

async function tick(env: TestEnv): Promise<void> {
  const res = await env.app.request('/v1/internal/tick', {
    method: 'POST',
    headers: { 'x-tick-secret': TEST_TICK_SECRET },
  });
  expect(res.status).toBe(200);
  const stats = (await res.json()) as { errors: string[] };
  expect(stats.errors).toEqual([]);
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe.skipIf(!dbReady)('Buddy turns under failure', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
  });
  afterEach(() => {
    const { scriptErrors, unexpected } = env.llm;
    const pending = env.llm.pending();
    const report = {
      scriptErrors: [...scriptErrors],
      unexpected: unexpected.map((u) => u.purpose),
      pending,
    };
    env.llm.reset();
    expect(report).toEqual({ scriptErrors: [], unexpected: [], pending: 0 });
  });
  afterAll(async () => {
    await env?.close();
  });

  it('never runs the same message twice (retry after success, and while still processing)', async () => {
    const l = await onboard(env);
    const id = uuid();
    env.llm.script('buddy_turn', async () => {
      // The app retries (e.g. flaky network) while the first request is still thinking.
      const dup = await l.api.post<SendMessageResponse>('/buddy/messages', {
        client_message_id: id,
        text: 'Hallo',
      });
      expect(dup.status).toBe(202);
      expect(dup.body.status).toBe('processing');
      return say('Hallo! Womit fangen wir an?');
    });
    const first = await send(l, 'Hallo', id);
    expect(first.body.status).toBe('done');
    const again = await send(l, 'Hallo', id);
    expect(again.status).toBe(200);
    expect(again.body.status).toBe('done');
    expect(env.llm.callsFor('buddy_turn')).toHaveLength(1);
    const rows = await env.db.query(
      `select 1 from buddy_messages where learner_id = $1 and role = 'buddy'`,
      [l.learnerId],
    );
    expect(rows).toHaveLength(1);
  });

  it('does not apply a decision made on stale context, and asks again with the fresh state', async () => {
    const l = await onboard(env);
    const settings = await l.api.get<{ version: number }>('/buddy/settings');
    env.llm.script(
      'buddy_turn',
      async () => {
        // While the model thinks, the learner changes a setting in another screen.
        const r = await l.api.patch('/buddy/settings', {
          quiet_start: '19:30',
          version: settings.body.version,
        });
        expect(r.status).toBe(200);
        return say('Notiert!', [
          {
            tool: 'remember',
            args: {
              kind: 'fact',
              statement: 'Spielt Handball',
              quote: 'Ich spiele Handball',
              until: null,
            },
          },
        ]);
      },
      (req) => {
        expect(ScriptedGateway.textOf(req)).toContain('quiet 19:30–07:00');
        return say('Notiert – Handball!', [
          {
            tool: 'remember',
            args: {
              kind: 'fact',
              statement: 'Spielt Handball im Verein',
              quote: 'Ich spiele Handball',
              until: null,
            },
          },
        ]);
      },
    );
    // Contact must be on for the quiet hours to show up in the context.
    await enableContact(env, l.learnerId);
    const res = await send(l, 'Ich spiele Handball.');
    expect(res.body.status).toBe('done');
    const decisions = await env.db.query<{ disposition: string }>(
      `select disposition from buddy_decisions where learner_id = $1 order by created_at, disposition desc`,
      [l.learnerId],
    );
    expect(decisions.map((d) => d.disposition).sort()).toEqual(['applied', 'stale']);
    const memories = await env.db.query<{ statement: string }>(
      `select statement from buddy_memories where learner_id = $1 and status = 'active'`,
      [l.learnerId],
    );
    // Only the answer made on current data was applied.
    expect(memories.map((m) => m.statement)).toEqual(['Spielt Handball im Verein']);
  });

  it('answers only the newest message when the learner writes again during a turn', async () => {
    const l = await onboard(env);
    env.llm.script(
      'buddy_turn',
      async () => {
        const second = await send(l, 'Oh, und Englisch auch!');
        expect(second.body.status).toBe('done');
        return say('Mathe, alles klar.');
      },
      (req) => {
        const text = ScriptedGateway.textOf(req);
        expect(text).toContain('Ich muss Mathe lernen.');
        expect(text).toContain('Oh, und Englisch auch!');
        return say('Mathe und Englisch – womit fangen wir an?', [], ['Mathe', 'Englisch']);
      },
    );
    const first = await send(l, 'Ich muss Mathe lernen.');
    expect(first.body.status).toBe('done');
    const home = (await l.api.get<BuddyHome>('/buddy')).body;
    expect(home.thread.map((m) => [m.role, m.text])).toEqual([
      ['learner', 'Ich muss Mathe lernen.'],
      ['learner', 'Oh, und Englisch auch!'],
      ['buddy', 'Mathe und Englisch – womit fangen wir an?'],
    ]);
    expect(home.thread[2]!.options).toEqual(['Mathe', 'Englisch']);
  });

  it('gives the model one repair round with the reason, then applies the corrected answer', async () => {
    const l = await onboard(env);
    env.llm.script(
      'buddy_turn',
      // The quote is invented — the learner never said it.
      answer('Ich merke mir, dass du Fußball magst.', [
        {
          tool: 'remember',
          args: {
            kind: 'preference',
            statement: 'Mag Fußball',
            quote: 'ich liebe Fußball',
            until: null,
          },
        },
      ]),
      (req) => {
        const text = ScriptedGateway.textOf(req);
        expect(text).toContain('Your previous answer was rejected and nothing was applied');
        expect(text).toContain("is not the learner's exact words");
        return say('Ich merke mir: Fußball am Wochenende.', [
          {
            tool: 'remember',
            args: {
              kind: 'fact',
              statement: 'Spielt am Wochenende Fußball',
              quote: 'am Wochenende Fußball',
              until: null,
            },
          },
        ]);
      },
    );
    const res = await send(l, 'Ich spiele am Wochenende Fußball.');
    expect(res.body.status).toBe('done');
    expect(res.body.home.done.map((a) => a.summary)).toEqual([
      expect.objectContaining({ tool: 'remember', statement: 'Spielt am Wochenende Fußball' }),
    ]);
  });

  it('fails honestly after a second invalid answer, and a retry of the same message works', async () => {
    const l = await onboard(env);
    const bad = answer('Erledigt!', [
      { tool: 'close_goal', args: { goal: 'g7', status: 'done', outcome: null, quote: 'x' } },
    ]);
    env.llm.script('buddy_turn', bad, bad);
    const id = uuid();
    const res = await send(l, 'Die Arbeit ist vorbei.', id);
    expect(res.body).toMatchObject({ status: 'failed', error_code: 'model_invalid' });
    const home = res.body.home;
    // Nothing invented: no reply, no action cards; the message is marked as failed.
    expect(home.thread).toEqual([expect.objectContaining({ role: 'learner', status: 'failed' })]);
    expect(home.done).toEqual([]);

    env.llm.script(
      'buddy_turn',
      answer('Oh, wie lief sie denn?', [], ['Gut', 'Geht so', 'Schwer']),
    );
    const retry = await send(l, 'Die Arbeit ist vorbei.', id);
    expect(retry.body.status).toBe('done');
    expect(retry.body.home.thread.map((m) => m.status)).toEqual(['done', 'done']);
  });

  it('reports an unavailable model or an exhausted budget without pretending', async () => {
    const l = await onboard(env);
    env.llm.script('buddy_turn', { error: new LlmError('unavailable', 'provider down') });
    const down = await send(l, 'Hallo?');
    expect(down.body).toMatchObject({ status: 'failed', error_code: 'model_unavailable' });
    // A call that never happened is not counted against the daily budget.
    const usage = await env.db.maybeOne<{ calls: number }>(
      `select calls from usage_daily where learner_id = $1 and kind = 'buddy_turn'`,
      [l.learnerId],
    );
    expect(usage?.calls ?? 0).toBe(0);

    await env.db.query(
      `insert into usage_daily (learner_id, day, kind, calls) values ($1, '2026-09-28', 'buddy_turn', 80)
       on conflict (learner_id, day, kind) do update set calls = 80`,
      [l.learnerId],
    );
    const before = env.llm.calls.length;
    const limited = await send(l, 'Noch da?');
    expect(limited.body).toMatchObject({ status: 'failed', error_code: 'budget_exhausted' });
    expect(env.llm.calls.length).toBe(before);
  });

  it('resumes an interrupted turn exactly once; the stalled runner can no longer publish', async () => {
    const l = await onboard(env);
    const stuck = deferred<Reply>();
    env.llm.script(
      'buddy_turn',
      () => stuck.promise, // the original request hangs (e.g. the function was frozen)
      answer('Da bin ich wieder – was steht an?'), // the scheduler's recovery run
    );
    const first = send(l, 'Kannst du mir helfen?');
    // Wait until the first request is inside the model call.
    await vi_waitFor(() => env.llm.calls.length > 0 && env.llm.callsFor('buddy_turn').length >= 1);
    env.clock.minutes(4);
    await tick(env);
    const recovered = (await l.api.get<BuddyHome>('/buddy')).body;
    expect(recovered.thread.map((m) => [m.role, m.status])).toEqual([
      ['learner', 'done'],
      ['buddy', 'done'],
    ]);

    // The old runner wakes up with an answer — too late, it no longer owns the message.
    stuck.resolve(
      say('Klar, sehr gern!', [
        {
          tool: 'remember',
          args: { kind: 'fact', statement: 'Braucht Hilfe', quote: 'helfen', until: null },
        },
      ]),
    );
    const late = await first;
    expect(late.body.status).toBe('done');
    const buddyMessages = await env.db.query<{ text: string }>(
      `select text from buddy_messages where learner_id = $1 and role = 'buddy'`,
      [l.learnerId],
    );
    expect(buddyMessages.map((m) => m.text)).toEqual(['Da bin ich wieder – was steht an?']);
    expect(
      await env.db.query(`select 1 from buddy_memories where learner_id = $1`, [l.learnerId]),
    ).toEqual([]);
  });

  it('undo reverses exactly what was done, and refuses when things changed since', async () => {
    const l = await onboard(env);
    env.llm.script(
      'buddy_turn',
      answer('Eingetragen!', [
        {
          tool: 'plan_exam',
          args: {
            title: 'Bio-Test Zellen',
            subject: 'Biologie',
            subject_kind: 'biology',
            day: { kind: 'in_days', days: 7 },
            topics: [],
            quote: 'nächste Woche einen Bio-Test',
          },
        },
      ]),
      answer('Okay, bis Sonntag Ruhe.', [
        {
          tool: 'set_contact',
          args: {
            preferred_start: null,
            preferred_end: null,
            quiet_start: null,
            avoid_weekdays: null,
            pause: { kind: 'end_of_week', weeks_ahead: 0 },
            fewer: false,
            quote: 'bis Sonntag keine Nachrichten',
          },
        },
      ]),
    );
    const planned = await send(l, 'Ich habe nächste Woche einen Bio-Test.');
    const action = planned.body.home.done[0]!;
    expect(action).toMatchObject({ undoable: true, summary: { tool: 'plan_exam' } });
    const undone = await l.api.post<BuddyHome>(`/buddy/actions/${action.id}/undo`);
    expect(undone.status).toBe(200);
    expect(undone.body.next).toEqual([]);
    const jobs = await env.db.query(
      `select 1 from jobs where learner_id = $1 and kind = 'buddy_check' and status = 'queued'`,
      [l.learnerId],
    );
    expect(jobs).toEqual([]);
    expect((await l.api.post(`/buddy/actions/${action.id}/undo`)).status).toBe(409);

    // Undo of a settings change is refused once the settings were changed again.
    const paused = await send(l, 'Bitte bis Sonntag keine Nachrichten.');
    const pause = paused.body.home.done.find((a) => a.summary.tool === 'set_contact')!;
    const s = await l.api.get<{ version: number }>('/buddy/settings');
    await l.api.patch('/buddy/settings', { preferred_start: '16:00', version: s.body.version });
    // The home no longer offers it, and a stale button is refused.
    const home = (await l.api.get<BuddyHome>('/buddy')).body;
    expect(home.done.find((a) => a.id === pause.id)).toMatchObject({ undoable: false });
    const refused = await l.api.post(`/buddy/actions/${pause.id}/undo`);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ error: { details: { reason: 'changed_since' } } });
  });

  it('moves quiet hours only earlier ("nicht nach 19 Uhr"), with undo; later is refused', async () => {
    const l = await onboard(env);
    const contact = (quiet: string, quote: string) => ({
      tool: 'set_contact',
      args: {
        preferred_start: null,
        preferred_end: null,
        quiet_start: quiet,
        avoid_weekdays: null,
        pause: null,
        fewer: false,
        quote,
      },
    });
    env.llm.script(
      'buddy_turn',
      answer('Alles klar – nach 19 Uhr schreibe ich dir nicht mehr.', [
        contact('19:00', 'nach 19 uhr nicht mehr schreiben'),
      ]),
    );
    const earlier = await send(l, 'mama sagt du darfst mir nach 19 uhr nicht mehr schreiben');
    expect(earlier.body.status).toBe('done');
    let st = await l.api.get<{ quiet_start: string; preferred_end: string; version: number }>(
      '/buddy/settings',
    );
    expect(st.body.quiet_start).toBe('19:00');
    expect(st.body.preferred_end <= '19:00').toBe(true);
    const card = earlier.body.home.done.find((a) => a.summary.tool === 'set_contact')!;
    expect(card.summary).toMatchObject({ quiet_start: '19:00' });
    expect((await l.api.post(`/buddy/actions/${card.id}/undo`)).status).toBe(200);
    st = await l.api.get('/buddy/settings');
    expect(st.body.quiet_start).toBe('20:00');

    // Later means more contact: the code refuses, and Buddy has to answer without it.
    env.llm.script(
      'buddy_turn',
      answer('Okay, bis 21 Uhr!', [contact('21:00', 'bis 21 uhr darfst du schreiben')]),
      answer('Später schreiben dürfen nur deine Eltern in den Einstellungen erlauben.'),
    );
    const later = await send(l, 'bis 21 uhr darfst du schreiben');
    expect(later.body.home.thread.at(-1)?.text).toBe(
      'Später schreiben dürfen nur deine Eltern in den Einstellungen erlauben.',
    );
    expect((await l.api.get<{ quiet_start: string }>('/buddy/settings')).body.quiet_start).toBe(
      '20:00',
    );
  });

  it('keeps learners apart: foreign ids are not found, aliases only resolve to own data', async () => {
    const a = await onboard(env);
    const b = await onboard(env);
    env.llm.script(
      'buddy_turn',
      answer('Eingetragen und ich merke es mir.', [
        {
          tool: 'plan_exam',
          args: {
            title: 'Englisch Vokabeltest',
            subject: 'Englisch',
            subject_kind: 'english',
            day: { kind: 'in_days', days: 3 },
            topics: [],
            quote: 'in drei Tagen einen Vokabeltest',
          },
        },
        {
          tool: 'remember',
          args: { kind: 'fact', statement: 'Mag Englisch', quote: 'mag Englisch', until: null },
        },
        { tool: 'request_material', args: { goal: 'new', title: 'Vokabelliste' } },
      ]),
    );
    const res = await send(a, 'Ich mag Englisch und habe in drei Tagen einen Vokabeltest.');
    const done = res.body.home.done;
    const goalId = (
      done.find((x) => x.summary.tool === 'plan_exam')!.summary as { goal_id: string }
    ).goal_id;
    const memoryId = (
      done.find((x) => x.summary.tool === 'remember')!.summary as { memory_id: string }
    ).memory_id;
    const stepId = (
      done.find((x) => x.summary.tool === 'request_material')!.summary as { step_id: string }
    ).step_id;
    const actionId = done[0]!.id;

    expect((await b.api.post(`/buddy/goals/${goalId}/outcome`, { outcome: 'good' })).status).toBe(
      404,
    );
    expect((await b.api.post(`/buddy/steps/${stepId}/skip`)).status).toBe(404);
    expect((await b.api.post(`/buddy/actions/${actionId}/undo`)).status).toBe(404);
    expect(
      (await b.api.patch(`/buddy/memory/${memoryId}`, { retract: true, version: 1 })).status,
    ).toBe(404);
    expect((await b.api.post('/practice/sessions', { goal_id: goalId })).status).toBe(404);
    const foreignMaterial = await b.api.post('/materials', {
      client_request_id: uuid(),
      photo_mimes: ['image/jpeg'],
      step_id: stepId,
    });
    expect(foreignMaterial.status).toBe(404);

    // B's model answer that references "g1" cannot reach A's goal.
    env.llm.script(
      'buddy_turn',
      answer('Test abgesagt.', [
        {
          tool: 'close_goal',
          args: { goal: 'g1', status: 'dropped', outcome: null, quote: 'abgesagt' },
        },
      ]),
      (req) => {
        expect(ScriptedGateway.textOf(req)).toContain('unknown goal g1');
        expect(ScriptedGateway.textOf(req)).not.toContain('Englisch Vokabeltest');
        return say('Ich sehe bei dir keinen Test – welcher war gemeint?');
      },
    );
    expect((await send(b, 'Der Test ist abgesagt.')).body.status).toBe('done');
    const goal = await env.db.one<{ status: string }>(
      `select status from buddy_goals where id = $1`,
      [goalId],
    );
    expect(goal.status).toBe('active');
  });

  it('lets a minor reduce contact alone, but loosening needs the adult', async () => {
    const kid = await onboard(env, { relation: 'child' });
    await enableContact(env, kid.learnerId, { contact_changed_by: 'account_holder' });
    const s1 = await kid.api.get<{ version: number }>('/buddy/settings');
    const pause = await kid.api.patch<{ version: number; paused_until: string }>(
      '/buddy/settings',
      {
        paused_until: '2026-10-02T22:00:00Z',
        version: s1.body.version,
      },
    );
    expect(pause.status).toBe(200);
    const unpause = await kid.api.patch('/buddy/settings', {
      paused_until: null,
      version: pause.body.version,
    });
    expect(unpause.status).toBe(403);
    const quieter = await kid.api.patch('/buddy/settings', {
      quiet_start: '19:00',
      version: pause.body.version,
    });
    expect(quieter.status).toBe(200);
    expect((await kid.api.post('/buddy/contact/opt-in', { enable: true })).status).toBe(403);

    // Through Buddy, too: removing a day without messages is more contact → rejected, then explained.
    await env.db.query(
      `update buddy_settings set avoid_weekdays = '{6,7}', paused_until = null where learner_id = $1`,
      [kid.learnerId],
    );
    env.llm.script(
      'buddy_turn',
      answer('Okay, dann auch am Wochenende.', [
        {
          tool: 'set_contact',
          args: {
            preferred_start: null,
            preferred_end: null,
            quiet_start: null,
            avoid_weekdays: [],
            pause: null,
            fewer: false,
            quote: 'auch am Wochenende schreiben',
          },
        },
      ]),
      (req) => {
        expect(ScriptedGateway.textOf(req)).toContain(
          'only the learner or an adult can do that in the settings',
        );
        return say('Das kann nur ein Erwachsener in den Einstellungen ändern.');
      },
    );
    expect((await send(kid, 'Du kannst mir auch am Wochenende schreiben.')).body.status).toBe(
      'done',
    );
    const after = await env.db.one<{ avoid_weekdays: number[] }>(
      `select avoid_weekdays from buddy_settings where learner_id = $1`,
      [kid.learnerId],
    );
    expect(after.avoid_weekdays).toEqual([6, 7]);
  });

  it("resolves days and times in the learner's zone, relative to when they wrote", async () => {
    // 23:30 on Monday in Tokyo is still Monday 14:30 UTC.
    env.clock.set('2026-09-28T14:30:00Z');
    const tokyo = await onboard(env, { timezone: 'Asia/Tokyo' });
    env.llm.script('buddy_turn', (req) => {
      expect(ScriptedGateway.textOf(req)).toContain('Monday 2026-09-28, 23:30 (Asia/Tokyo)');
      return say('Mach ich: morgen um 16 Uhr.', [
        {
          tool: 'plan_step',
          args: {
            goal: null,
            kind: 'practice',
            title: 'Mathe üben',
            day: { kind: 'in_days', days: 1 },
            time: '16:00',
            agreed: true,
            quote: 'morgen um 16 Uhr',
          },
        },
      ]);
    });
    expect((await send(tokyo, 'Erinnere mich morgen um 16 Uhr ans Üben.')).body.status).toBe(
      'done',
    );
    const job = await env.db.one<{ run_at: Date }>(
      `select run_at from jobs where learner_id = $1 and payload ->> 'reason' = 'step_due'`,
      [tokyo.learnerId],
    );
    expect(job.run_at.toISOString()).toBe('2026-09-29T07:00:00.000Z');

    // A time that exists twice (New York, end of daylight saving) is asked about, not guessed.
    const ny = await onboard(env, { timezone: 'America/New_York' });
    env.llm.script(
      'buddy_turn',
      answer('Gebongt.', [
        {
          tool: 'plan_step',
          args: {
            goal: null,
            kind: 'practice',
            title: 'Vokabeln',
            day: { kind: 'date', date: '2026-11-01' },
            time: '01:30',
            agreed: true,
            quote: 'am 1. November um 1:30',
          },
        },
      ]),
      (req) => {
        expect(ScriptedGateway.textOf(req)).toContain('exists twice (clock change)');
        return say(
          'In der Nacht wird die Uhr umgestellt – 1:30 gibt es zweimal. Lieber 9:00?',
          [],
          ['9:00', '10:00'],
        );
      },
    );
    const res = await send(ny, 'Erinnere mich am 1. November um 1:30.');
    expect(res.body.status).toBe('done');
    expect(res.body.home.done).toEqual([]);
  });
});

/** Polls a condition (used to wait until a request is inside the model call). */
async function vi_waitFor(cond: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 5));
  }
}
