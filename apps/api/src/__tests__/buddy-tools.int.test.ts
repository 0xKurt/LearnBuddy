// Buddy's act tools never do less (or more) than they report: contact only gets quieter,
// moves and ends are applied or refused, undo restores what the action changed.
// docs/architecture.md §Tools. Only the model is scripted.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { BuddyHome, SendMessageResponse } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LlmRequest } from '../llm/gateway.js';
import { findOrCreateSubject } from '../modules/buddy/plan.js';
import { loadBuddyState } from '../modules/buddy/state.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const say = (reply: string, actions: unknown[] = []) => ({ reply, options: null, actions });

async function send(l: Learner, text: string) {
  return l.api.post<SendMessageResponse>('/buddy/messages', {
    client_message_id: randomUUID(),
    text,
  });
}

/** The model tries `action`; when it is refused, it says so (and the refusal is returned). */
function tryAction(env: TestEnv, action: unknown): { refusal: () => string | null } {
  let refusal: string | null = null;
  env.llm.script('buddy_turn', { json: say('Mache ich.', [action]) }, (req: LlmRequest) => {
    const text = ScriptedGateway.textOf(req);
    const m = /action 1 \([a-z_]+\): ([^\n"]+)/.exec(text);
    refusal = m ? m[1]! : null;
    return say('Das geht so nicht.');
  });
  return { refusal: () => refusal };
}

describe.skipIf(!dbReady)('Buddy act tools', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
    l = await onboard(env);
  });
  afterEach(async () => {
    const report = { scriptErrors: [...env.llm.scriptErrors], unexpected: env.llm.unexpected };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: [] });
  });

  it('update_step with a state and a new day is refused, never half applied (update-step-state-drops-move)', async () => {
    await env.db.query(
      `insert into buddy_steps (learner_id, kind, title, state, planned_date)
       values ($1, 'practice', 'Vokabeln', 'planned', '2026-09-29')`,
      [l.learnerId],
    );
    const t = tryAction(env, {
      tool: 'update_step',
      args: {
        step: 'st1',
        day: { kind: 'weekday', weekday: 5, weeks_ahead: 0 },
        time: null,
        state: 'skipped',
        quote: 'Vokabeln lieber Freitag',
      },
    });
    expect((await send(l, 'Vokabeln lieber Freitag')).status).toBe(200);
    expect(t.refusal()).toMatch(/either its state or its day/);
    const st = await env.db.one<{ state: string; planned_date: string }>(
      `select state, planned_date::text from buddy_steps where learner_id = $1`,
      [l.learnerId],
    );
    expect(st).toEqual({ state: 'planned', planned_date: '2026-09-29' });
  });

  it('undoing "the test is over" opens its steps again (restore-goal-leaves-steps-cancelled)', async () => {
    const goal = await env.db.one<{ id: string }>(
      `insert into buddy_goals (learner_id, kind, title, due_date)
       values ($1, 'exam', 'Mathearbeit', '2026-10-02') returning id`,
      [l.learnerId],
    );
    await env.db.query(
      `insert into buddy_steps (learner_id, goal_id, kind, title, state, planned_date)
       values ($1, $2, 'practice', 'Brüche üben', 'planned', '2026-09-30')`,
      [l.learnerId, goal.id],
    );
    env.llm.script('buddy_turn', {
      json: say('Dann ist die Mathearbeit erledigt.', [
        {
          tool: 'close_goal',
          args: { goal: 'g1', status: 'dropped', outcome: null, quote: 'Mathearbeit fällt aus' },
        },
      ]),
    });
    expect((await send(l, 'Die Mathearbeit fällt aus')).status).toBe(200);
    const action = await env.db.one<{ id: string }>(
      `select id from buddy_actions where learner_id = $1 and tool = 'close_goal'`,
      [l.learnerId],
    );
    expect((await l.api.post(`/buddy/actions/${action.id}/undo`)).status).toBe(200);
    const st = await env.db.one<{ state: string }>(
      `select state from buddy_steps where goal_id = $1`,
      [goal.id],
    );
    expect(st.state).toBe('planned');
  });

  it('a temporary situation said again with a new end gets that end (remember-dedupe-misreports, M-54)', async () => {
    const broken = (quote: string, days: number) => ({
      tool: 'remember',
      args: {
        kind: 'constraint',
        statement: 'Hat den Arm gebrochen',
        quote,
        until: { kind: 'end_of_day', days },
      },
    });
    env.llm.script('buddy_turn', { json: say('Gute Besserung!', [broken('Arm gebrochen', 7)]) });
    expect((await send(l, 'Ich hab mir den Arm gebrochen')).status).toBe(200);
    const first = await env.db.one<{ valid_until: Date }>(
      `select valid_until from buddy_memories where learner_id = $1 and status = 'active'`,
      [l.learnerId],
    );
    // The same again with a longer end: kept, not silently dropped.
    env.llm.script('buddy_turn', {
      json: say('Okay, drei Wochen.', [broken('noch drei Wochen', 21)]),
    });
    expect((await send(l, 'Der Gips bleibt noch drei Wochen')).status).toBe(200);
    const longer = await env.db.query<{ valid_until: Date }>(
      `select valid_until from buddy_memories where learner_id = $1 and status = 'active'`,
      [l.learnerId],
    );
    expect(longer).toHaveLength(1);
    expect(longer[0]!.valid_until.getTime()).toBeGreaterThan(
      first.valid_until.getTime() + 10 * 86_400_000,
    );
    // Correcting it moves the end, too.
    env.llm.script('buddy_turn', {
      json: say('Okay, zwei Wochen.', [
        {
          tool: 'correct_memory',
          args: {
            memory: 'm1',
            statement: 'Hat den Arm gebrochen',
            quote: 'nur noch zwei Wochen',
            until: { kind: 'end_of_day', days: 14 },
          },
        },
      ]),
    });
    expect((await send(l, 'Doch nur noch zwei Wochen')).status).toBe(200);
    const corrected = await env.db.one<{ valid_until: Date }>(
      `select valid_until from buddy_memories where learner_id = $1 and status = 'active'`,
      [l.learnerId],
    );
    expect(corrected.valid_until.getTime()).toBeLessThan(longer[0]!.valid_until.getTime());
  });

  it('a new preparation never cancels practice her agreed reminder prepared (p2-prepare-practice-cancels-reminder-prepared-step)', async () => {
    const goal = await env.db.tx(async (tx) => {
      const subject = await findOrCreateSubject(tx, l.learnerId, 'Mathe', 'math');
      const g = await tx.one<{ id: string }>(
        `insert into buddy_goals (learner_id, kind, title, subject_id, due_date)
         values ($1, 'exam', 'Mathearbeit', $2, '2026-10-02') returning id`,
        [l.learnerId, subject.id],
      );
      const m = await tx.one<{ id: string }>(
        `insert into materials (learner_id, client_request_id, goal_id, subject_id, status, photo_count, created_at)
         values ($1, gen_random_uuid(), $2, $3, 'ready', 1, $4) returning id`,
        [l.learnerId, g.id, subject.id, env.clock.now()],
      );
      for (let i = 0; i < 6; i++)
        await tx.query(
          `insert into items (learner_id, material_id, subject_id, kind, prompt, answer, topic)
           values ($1, $2, $3, 'short', $4, 'x', 'Brüche')`,
          [l.learnerId, m.id, subject.id, `Frage ${i}`],
        );
      return g;
    });
    const agreed = await env.db.one<{ id: string }>(
      `insert into buddy_steps (learner_id, goal_id, kind, title, state, planned_date, agreed, payload, prepared_at)
       values ($1, $2, 'practice', 'Mathearbeit', 'prepared', '2026-09-28', true, '{"item_ids": []}', $3)
       returning id`,
      [l.learnerId, goal.id, env.clock.now()],
    );
    env.llm.script('buddy_turn', {
      json: say('Hier ist noch eine Runde.', [
        {
          tool: 'prepare_practice',
          args: { goal: 'g1', subject: null, minutes: 10, focus_topics: [] },
        },
      ]),
    });
    expect((await send(l, 'Gib mir noch mehr Mathe')).status).toBe(200);
    const st = await env.db.one<{ state: string }>(`select state from buddy_steps where id = $1`, [
      agreed.id,
    ]);
    expect(st.state).toBe('prepared');
  });

  it('a memory keeps only what she said: no invented day or time (live finding 4)', async () => {
    const t = tryAction(env, {
      tool: 'remember',
      args: {
        kind: 'preference',
        statement: 'Spielt Handball und hat sonntags Nachmittag Handballtraining',
        quote: 'hab gleich Handballtraining',
        until: null,
      },
    });
    expect((await send(l, 'Muss los, hab gleich Handballtraining')).status).toBe(200);
    expect(t.refusal()).toMatch(/did not say \(sonntag, nachmittag\)/);
    const none = await env.db.query(`select 1 from buddy_memories where learner_id = $1`, [
      l.learnerId,
    ]);
    expect(none).toHaveLength(0);

    // What she said, with the day she said, is kept.
    env.llm.script('buddy_turn', {
      json: say('Merk ich mir!', [
        {
          tool: 'remember',
          args: {
            kind: 'fact',
            statement: 'Hat sonntags Handballtraining',
            quote: 'sonntags hab ich Handballtraining',
            until: null,
          },
        },
      ]),
    });
    expect((await send(l, 'sonntags hab ich Handballtraining')).status).toBe(200);
    const kept = await env.db.one<{ statement: string }>(
      `select statement from buddy_memories where learner_id = $1 and status = 'active'`,
      [l.learnerId],
    );
    expect(kept.statement).toBe('Hat sonntags Handballtraining');

    // A correction keeps what was known and adds only what she says now.
    const fix = tryAction(env, {
      tool: 'correct_memory',
      args: {
        memory: 'm1',
        statement: 'Hat sonntags um 15 Uhr Handballtraining',
        quote: 'Handballtraining ist jetzt länger',
        until: null,
      },
    });
    expect((await send(l, 'Handballtraining ist jetzt länger')).status).toBe(200);
    expect(fix.refusal()).toMatch(/did not say \(15\)/);
  });

  it('undoing a forget never makes a second copy (p2-J-memory-F7)', async () => {
    const remember = {
      tool: 'remember',
      args: { kind: 'fact', statement: 'Spielt Geige', quote: 'Geige', until: null },
    };
    env.llm.script('buddy_turn', { json: say('Schön!', [remember]) });
    await send(l, 'Ich spiele Geige');
    env.llm.script('buddy_turn', {
      json: say('Okay, vergessen.', [
        { tool: 'forget', args: { memory: 'm1', quote: 'vergiss das mit der Geige' } },
      ]),
    });
    await send(l, 'vergiss das mit der Geige');
    env.llm.script('buddy_turn', { json: say('Ah, doch!', [remember]) });
    await send(l, 'Doch, ich spiele Geige');
    const forget = await env.db.one<{ id: string }>(
      `select id from buddy_actions where learner_id = $1 and tool = 'forget'`,
      [l.learnerId],
    );
    // The same is known again: the undo is done, without a second copy.
    expect((await l.api.post(`/buddy/actions/${forget.id}/undo`)).status).toBe(200);
    const active = await env.db.query(
      `select 1 from buddy_memories where learner_id = $1 and status = 'active'`,
      [l.learnerId],
    );
    expect(active).toHaveLength(1);
  });

  it("homework tasks are not counted as practice questions in Buddy's picture (p2-HW-06)", async () => {
    await env.db.tx(async (tx) => {
      const subject = await findOrCreateSubject(tx, l.learnerId, 'Mathe', 'math');
      const m = await tx.one<{ id: string }>(
        `insert into materials (learner_id, client_request_id, subject_id, status, photo_count, created_at, purpose)
         values ($1, gen_random_uuid(), $2, 'ready', 1, $3, 'homework') returning id`,
        [l.learnerId, subject.id, env.clock.now()],
      );
      for (let i = 0; i < 3; i++)
        await tx.query(
          `insert into items (learner_id, material_id, subject_id, kind, prompt, answer, topic, origin)
           values ($1, $2, $3, 'short', $4, 'x', 'Brüche', 'homework')`,
          [l.learnerId, m.id, subject.id, `Aufgabe ${i}`],
        );
    });
    const state = await loadBuddyState(env.db, l.learnerId, env.clock.now());
    expect(state.subjects.map((x) => x.item_count)).toEqual([0]);
    expect(state.materials.map((x) => x.item_count)).toEqual([0]);
    expect(state.topics).toEqual([]);
    expect(state.totals.items).toBe(0);
  });

  it('the thread offers "Rückgängig" only when it would work (audit M-56)', async () => {
    env.llm.script('buddy_turn', {
      json: say('Schick mir ein Foto davon.', [
        { tool: 'request_material', args: { goal: null, title: 'Arbeitsblatt Brüche' } },
      ]),
    });
    await send(l, 'Ich hab ein Arbeitsblatt');
    const undoable = async () => {
      const home = (await l.api.get<BuddyHome>('/buddy')).body;
      return home.thread.flatMap((m) => m.actions).map((a) => a.undoable);
    };
    expect(await undoable()).toEqual([true]);
    // The photo arrived: the request is done and cannot be taken back.
    await env.db.query(
      `update buddy_steps set state = 'done', done_source = 'evidence', finished_at = $2
        where learner_id = $1 and kind = 'capture'`,
      [l.learnerId, env.clock.now()],
    );
    expect(await undoable()).toEqual([false]);
  });
});
