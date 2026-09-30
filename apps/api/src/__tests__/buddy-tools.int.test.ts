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
    // To the end of the line, quotes included: a rejection that names a sheet or a memory
    // carries them, and stopping at the first one silently truncated the reason.
    const m = /action 1 \([a-z_]+\): (.+)/.exec(text);
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
        repeat: null,
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
    // Availability, never its cause (issue #108): what it means for learning is kept.
    const away = (quote: string, days: number) => ({
      tool: 'remember',
      args: {
        about: 'availability',
        kind: 'constraint',
        statement: 'Kann gerade nicht üben',
        quote,
        until: { kind: 'end_of_day', days },
      },
    });
    env.llm.script('buddy_turn', {
      json: say('Dann pausieren wir.', [away('kann gerade nicht üben', 7)]),
    });
    expect((await send(l, 'Ich kann gerade nicht üben')).status).toBe(200);
    const first = await env.db.one<{ valid_until: Date }>(
      `select valid_until from buddy_memories where learner_id = $1 and status = 'active'`,
      [l.learnerId],
    );
    // The same again with a longer end: kept, not silently dropped.
    env.llm.script('buddy_turn', {
      json: say('Okay, drei Wochen.', [away('noch drei Wochen', 21)]),
    });
    expect((await send(l, 'Das geht noch drei Wochen so')).status).toBe(200);
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
            about: 'availability',
            memory: 'm1',
            statement: 'Kann gerade nicht üben',
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
        about: 'everyday',
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
            about: 'everyday',
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
        about: 'everyday',
        memory: 'm1',
        statement: 'Hat sonntags um 15 Uhr Handballtraining',
        quote: 'Handballtraining ist jetzt länger',
        until: null,
      },
    });
    expect((await send(l, 'Handballtraining ist jetzt länger')).status).toBe(200);
    expect(fix.refusal()).toMatch(/did not say \(15\)/);
  });

  it('a day is named the way she says it: the weekday within a week, never "in 4 days" (live finding 9)', async () => {
    for (const [title, due] of [
      ['Mathearbeit', '2026-10-01'],
      ['Vokabeltest', '2026-10-12'],
    ] as const) {
      await env.db.query(
        `insert into buddy_goals (learner_id, kind, title, due_date) values ($1, 'exam', $2, $3)`,
        [l.learnerId, title, due],
      );
    }
    env.llm.script('buddy_turn', (req: LlmRequest) => {
      const text = ScriptedGateway.textOf(req);
      // Code renders the words; the prompt says to use them.
      expect(text).toContain('"Mathearbeit" on Thursday 2026-10-01 (in 3 days; say "Donnerstag")');
      expect(text).toContain('say "Montag, 12. Oktober"');
      expect(req.system).toContain('never "in 4 days"');
      return say('Die Mathearbeit ist am Donnerstag.');
    });
    expect((await send(l, 'Wann ist nochmal die Mathearbeit?')).status).toBe(200);
  });

  it('undoing a forget never makes a second copy (p2-J-memory-F7)', async () => {
    const remember = {
      tool: 'remember',
      args: {
        about: 'everyday',
        kind: 'fact',
        statement: 'Spielt Geige',
        quote: 'Geige',
        until: null,
      },
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

  // "vergiss alles" is one wish, not sixty. Alias by alias it ran into the six-action cap
  // and the rest stayed silently — the worst possible answer to that request (issue #114).
  it('forgets everything at once, past the action cap, and takes it back as one (issue #114)', async () => {
    const note = (statement: string, quote: string) => ({
      tool: 'remember',
      args: { about: 'everyday', kind: 'fact', statement, quote, until: null },
    });
    // Eight notes: more than one answer could ever retract one by one.
    for (let i = 1; i <= 8; i++) {
      env.llm.script('buddy_turn', {
        json: say('Gemerkt.', [note(`Mag Sache ${i}`, `Sache ${i}`)]),
      });
      await send(l, `Ich mag Sache ${i}`);
    }
    expect(
      await env.db.query(
        `select 1 from buddy_memories where learner_id = $1 and status = 'active'`,
        [l.learnerId],
      ),
    ).toHaveLength(8);

    env.llm.script('buddy_turn', {
      json: say('Alles weg.', [
        { tool: 'forget', args: { memory: null, all: true, quote: 'vergiss alles über mich' } },
      ]),
    });
    const res = await send(l, 'vergiss alles über mich');
    expect(res.body.status).toBe('done');
    expect(
      await env.db.query(
        `select 1 from buddy_memories where learner_id = $1 and status = 'active'`,
        [l.learnerId],
      ),
    ).toHaveLength(0);

    const card = res.body.home.thread.flatMap((m) => m.actions).at(-1)!;
    expect(card.summary).toMatchObject({ tool: 'forget', memory_id: null, forgotten: 8 });
    // One card, one undo — and everything comes back.
    expect(card.undoable).toBe(true);
    expect((await l.api.post(`/buddy/actions/${card.id}/undo`)).status).toBe(200);
    expect(
      await env.db.query(
        `select 1 from buddy_memories where learner_id = $1 and status = 'active'`,
        [l.learnerId],
      ),
    ).toHaveLength(8);
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

  // Issue #111: until now every sheet ended in a button. She says it in the conversation,
  // where she is anyway — the screenshot of a private chat above all (corpus case material-052).
  describe('her sheets, from the conversation', () => {
    /** Buddy's previous answer asked whether the sheet should go — what the delete needs. */
    async function askedFirst(text: string) {
      env.llm.script('buddy_turn', {
        json: {
          reply: 'Soll das Blatt wirklich weg?',
          options: null,
          actions: [],
          asks_permission: true,
        },
      });
      await send(l, text);
    }

    async function sheet(title: string | null, questions = 2) {
      return env.db.tx(async (tx) => {
        const subject = await findOrCreateSubject(tx, l.learnerId, 'Mathe', 'math');
        const m = await tx.one<{ id: string }>(
          `insert into materials (learner_id, client_request_id, subject_id, status, photo_count, title, created_at)
           values ($1, gen_random_uuid(), $2, 'ready', 1, $3, $4) returning id`,
          [l.learnerId, subject.id, title, env.clock.now()],
        );
        for (let i = 0; i < questions; i++)
          await tx.query(
            `insert into items (learner_id, material_id, subject_id, kind, prompt, answer, topic)
             values ($1, $2, $3, 'short', $4, 'x', 'Brüche')`,
            [l.learnerId, m.id, subject.id, `Frage ${i}`],
          );
        return m.id;
      });
    }

    it('deletes the sheet she means, with its questions and its photos', async () => {
      const keep = await sheet('Mathe Brüche');
      const gone = await sheet('Screenshot');
      await askedFirst('das is n screenshot von meinem chat mit lisa, loesch das bitte');
      env.llm.script('buddy_turn', {
        json: say('Ist weg.', [
          { tool: 'delete_material', args: { material: 'sh1', quote: 'ja weg damit' } },
        ]),
      });
      await send(l, 'ja weg damit');

      // sh1 is the newest sheet — the screenshot, not the one she is learning from.
      const rows = await env.db.query<{ id: string; archived_at: Date | null }>(
        `select id, archived_at from materials where learner_id = $1`,
        [l.learnerId],
      );
      expect(rows.find((r) => r.id === gone)?.archived_at).not.toBeNull();
      expect(rows.find((r) => r.id === keep)?.archived_at).toBeNull();
      const items = await env.db.query<{ archived_at: Date | null }>(
        `select archived_at from items where material_id = $1`,
        [gone],
      );
      expect(items.map((i) => i.archived_at === null)).toEqual([false, false]);
      // The same erasure the library button plans, not a second half-done path.
      const jobs = await env.db.query<{ kind: string }>(
        `select kind from jobs where learner_id = $1 and payload->>'material_id' = $2`,
        [l.learnerId, gone],
      );
      expect(jobs.filter((j) => j.kind === 'purge_photos').length).toBe(2);
    });

    it('the card names the sheet and offers no undo — nothing comes back', async () => {
      await sheet('Chat mit Lisa');
      await askedFirst('loesch das bitte');
      env.llm.script('buddy_turn', {
        json: say('Ist weg.', [
          { tool: 'delete_material', args: { material: 'sh1', quote: 'ja bitte' } },
        ]),
      });
      await send(l, 'ja bitte');
      const home = (await l.api.get<BuddyHome>('/buddy')).body;
      const acts = home.thread.flatMap((m) => m.actions);
      expect(acts.map((a) => a.undoable)).toEqual([false]);
      expect(acts[0]!.summary).toEqual({
        tool: 'delete_material',
        material_id: expect.any(String),
        title: 'Chat mit Lisa',
      });
    });

    it('is never done straight away: without Buddy having asked, it is refused', async () => {
      await sheet('Englisch Vokabelliste');
      // "I am done with it" is not "erase it" — the live run of buddy.33 had the model delete
      // a whole vocabulary sheet on exactly this sentence. Nothing here can be taken back, so
      // the confirmation is enforced in code, not asked for in the prompt.
      const t = tryAction(env, {
        tool: 'delete_material',
        args: { material: 'sh1', quote: 'bin ich durch' },
      });
      await send(l, 'mit der vokabelliste bin ich durch');
      expect(t.refusal()).toMatch(/cannot be taken back/);
      const mine = await env.db.one<{ archived_at: Date | null }>(
        `select archived_at from materials where learner_id = $1`,
        [l.learnerId],
      );
      expect(mine.archived_at).toBeNull();
    });

    it('the forgotten back joins the sheet it was forgotten from (#118)', async () => {
      const id = await sheet('Mathe Brüche');
      env.llm.script('buddy_turn', {
        json: say('Schick mir die Rückseite.', [
          {
            tool: 'request_material',
            args: { goal: null, title: 'Rückseite Mathe Brüche', material: 'sh1' },
          },
        ]),
      });
      await send(l, 'ich hab die rueckseite vergessen');
      const step = await env.db.one<{ kind: string; payload: { completes?: string } }>(
        `select kind, payload from buddy_steps where learner_id = $1`,
        [l.learnerId],
      );
      expect(step.kind).toBe('capture');
      expect(step.payload.completes).toBe(id);
      // The home card carries it, so the camera opens on that sheet instead of a new one.
      const home = (await l.api.get<BuddyHome>('/buddy')).body;
      expect(home.now).toMatchObject({ type: 'capture_needed', completes: id });
    });

    it('a page cannot join a sheet that could not be read', async () => {
      await env.db.query(
        `insert into materials (learner_id, client_request_id, status, photo_count, title, created_at, failed_at)
         values ($1, gen_random_uuid(), 'failed', 1, 'Unlesbar', $2, $2)`,
        [l.learnerId, env.clock.now()],
      );
      const t = tryAction(env, {
        tool: 'request_material',
        args: { goal: null, title: 'Rückseite', material: 'sh1' },
      });
      await send(l, 'ich hab die rueckseite vergessen');
      expect(t.refusal()).toMatch(/could not be read/);
    });

    it('takes one question off a sheet, found by its own words (#120)', async () => {
      const id = await sheet('Prozente', 0);
      await env.db.query(
        `insert into items (learner_id, material_id, kind, prompt, answer, topic)
         select $1, $2, 'short', p, 'x', 'Prozente' from unnest($3::text[]) p`,
        [
          l.learnerId,
          id,
          [
            'Wie viel sind 20 % von 80?',
            'Erkläre den Unterschied zwischen Grundwert und Prozentwert.',
          ],
        ],
      );
      await askedFirst('die eine frage von dem blatt is doof, nimm die raus');
      env.llm.script('buddy_turn', {
        json: say('Ist raus.', [
          {
            tool: 'delete_item',
            args: { material: 'sh1', question: 'Wie viel sind 20 % von 80?', quote: 'ja die' },
          },
        ]),
      });
      await send(l, 'ja die');
      const left = await env.db.query<{ prompt: string; archived_at: Date | null }>(
        `select prompt, archived_at from items where material_id = $1 order by prompt`,
        [id],
      );
      expect(left.map((i) => [i.prompt.slice(0, 8), i.archived_at === null])).toEqual([
        ['Erkläre ', true],
        ['Wie viel', false],
      ]);
    });

    it('never guesses which question she meant', async () => {
      const id = await sheet('Prozente', 0);
      await env.db.query(
        `insert into items (learner_id, material_id, kind, prompt, answer, topic)
         select $1, $2, 'short', p, 'x', 'Prozente' from unnest($3::text[]) p`,
        [l.learnerId, id, ['Wie viel sind 20 % von 80?', 'Wie viel sind 20 % von 60?']],
      );
      await askedFirst('nimm die prozent frage raus');
      const t = tryAction(env, {
        tool: 'delete_item',
        args: { material: 'sh1', question: 'Wie viel sind 20 %', quote: 'ja die' },
      });
      await send(l, 'ja die');
      expect(t.refusal()).toMatch(/2 questions .* fit that/);
      const left = await env.db.query<{ archived_at: Date | null }>(
        `select archived_at from items where material_id = $1`,
        [id],
      );
      expect(left.every((i) => i.archived_at === null)).toBe(true);
    });

    it('a question is not taken off before Buddy has asked', async () => {
      const id = await sheet('Prozente', 0);
      await env.db.query(
        `insert into items (learner_id, material_id, kind, prompt, answer, topic)
         values ($1, $2, 'short', 'Wie viel sind 20 % von 80?', 'x', 'Prozente')`,
        [l.learnerId, id],
      );
      const t = tryAction(env, {
        tool: 'delete_item',
        args: { material: 'sh1', question: 'Wie viel sind 20 % von 80?', quote: 'is doof' },
      });
      await send(l, 'die frage is doof');
      expect(t.refusal()).toMatch(/cannot be taken back/);
    });

    it('renames a sheet, and undo puts the old name back', async () => {
      const id = await sheet('IMG_2291');
      env.llm.script('buddy_turn', {
        json: say('Heißt jetzt so.', [
          {
            tool: 'rename_material',
            args: { material: 'sh1', title: 'Brüche Übung', quote: 'nenn das Brüche Übung' },
          },
        ]),
      });
      await send(l, 'nenn das Brüche Übung');
      const named = async () =>
        (await env.db.one<{ title: string }>(`select title from materials where id = $1`, [id]))
          .title;
      expect(await named()).toBe('Brüche Übung');

      const home = (await l.api.get<BuddyHome>('/buddy')).body;
      const act = home.thread.flatMap((m) => m.actions).find((a) => a.undoable)!;
      await l.api.post(`/buddy/actions/${act.id}/undo`, {});
      expect(await named()).toBe('IMG_2291');
    });

    it('a sheet that is not hers is not a sheet Buddy can touch', async () => {
      await sheet('Meins');
      const other = await onboard(env);
      const t = tryAction(env, {
        tool: 'delete_material',
        args: { material: 'sh1', quote: 'weg damit' },
      });
      await send(other, 'weg damit');
      // sh1 does not exist in the other learner's own state — there is nothing to reach for.
      expect(t.refusal()).toMatch(/there is no sheet sh1/);
      const mine = await env.db.one<{ archived_at: Date | null }>(
        `select archived_at from materials where learner_id = $1`,
        [l.learnerId],
      );
      expect(mine.archived_at).toBeNull();
    });

    it('deleting needs her own words, not a quote she never said', async () => {
      await sheet('Blatt');
      await askedFirst('was ist mit dem blatt?');
      const t = tryAction(env, {
        tool: 'delete_material',
        args: { material: 'sh1', quote: 'mach alles weg' },
      });
      await send(l, 'was steht auf dem blatt?');
      expect(t.refusal()).toMatch(/quote/i);
      const mine = await env.db.one<{ archived_at: Date | null }>(
        `select archived_at from materials where learner_id = $1`,
        [l.learnerId],
      );
      expect(mine.archived_at).toBeNull();
    });
  });

  // Issue #112: a rhythm she asked for, and the limits code puts around it.
  describe('a repeating reminder', () => {
    const plan = (over: Record<string, unknown>) => ({
      tool: 'plan_step',
      args: {
        goal: null,
        kind: 'practice',
        title: 'Vokabeln üben',
        day: { kind: 'in_days', days: 1 },
        time: '17:00',
        in_minutes: null,
        repeat: null,
        repeat_until: null,
        agreed: true,
        quote: 'erinner mich jeden tag um 5',
        subject: null,
        focus_topics: [],
        ...over,
      },
    });

    it('is one step with a rhythm, not one step per day', async () => {
      env.llm.script('buddy_turn', {
        json: say('Mache ich, jeden Tag um 17:00.', [plan({ repeat: 'daily' })]),
      });
      await send(l, 'erinner mich jeden tag um 5');
      const rows = await env.db.query<{ repeat: string | null; planned_time: string }>(
        `select repeat, planned_time from buddy_steps where learner_id = $1`,
        [l.learnerId],
      );
      expect(rows).toEqual([{ repeat: 'daily', planned_time: '17:00' }]);
    });

    it('starts on the next day that fits when she named none', async () => {
      // The clock is 10:00 Berlin on Monday 28.09. A rhythm usually comes without a first
      // day — she says when it repeats, not when it starts — and the server works that out
      // instead of the model guessing a date (rule 2).
      env.llm.script('buddy_turn', {
        json: say('An Schultagen um halb vier.', [
          plan({
            repeat: 'weekdays',
            day: { kind: 'unknown' },
            time: '15:30',
            quote: 'immer an schultagen um halb vier',
          }),
        ]),
      });
      await send(l, 'erinner mich immer an schultagen um halb vier');
      const today = await env.db.one<{ planned_date: string }>(
        `select planned_date from buddy_steps where learner_id = $1`,
        [l.learnerId],
      );
      expect(today.planned_date).toBe('2026-09-28'); // today: 15:30 is still ahead

      // A time that is already past today moves it on.
      env.llm.script('buddy_turn', {
        json: say('An Schultagen früh.', [
          plan({
            repeat: 'weekdays',
            day: { kind: 'unknown' },
            time: '08:00',
            title: 'Früh üben',
            quote: 'und morgens um 8',
          }),
        ]),
      });
      await send(l, 'und morgens um 8');
      const early = await env.db.one<{ planned_date: string }>(
        `select planned_date from buddy_steps where learner_id = $1 and title = 'Früh üben'`,
        [l.learnerId],
      );
      expect(early.planned_date).toBe('2026-09-29');
    });

    it('needs her agreement and a time — Buddy does not put himself on a schedule', async () => {
      const t = tryAction(env, plan({ repeat: 'daily', agreed: false, quote: null }));
      await send(l, 'ich lern grad Vokabeln');
      expect(t.refusal()).toMatch(/needs her agreement and a time/);
      expect(
        await env.db.query(
          `select 1 from buddy_steps where learner_id = $1 and repeat is not null`,
          [l.learnerId],
        ),
      ).toEqual([]);
    });

    it('an end before the first day is refused, not silently ignored', async () => {
      // First day in five days, but it should end today: that is not a repetition.
      const t = tryAction(
        env,
        plan({
          repeat: 'daily',
          day: { kind: 'in_days', days: 5 },
          repeat_until: { kind: 'end_of_day', days: 0 },
        }),
      );
      await send(l, 'erinner mich jeden tag um 5');
      expect(t.refusal()).toMatch(/would end .* before its first day|already be over/);
    });

    it('she can end it, and the next one still stands', async () => {
      env.llm.script('buddy_turn', {
        json: say('Klar, jeden Tag.', [plan({ repeat: 'daily' })]),
      });
      await send(l, 'erinner mich jeden tag um 5');
      env.llm.script('buddy_turn', {
        json: say('Kommt nicht mehr regelmäßig.', [
          {
            tool: 'update_step',
            args: {
              step: 'st1',
              day: null,
              time: null,
              state: null,
              repeat: 'never',
              quote: 'nicht mehr jeden tag',
            },
          },
        ]),
      });
      await send(l, 'nicht mehr jeden tag');
      const row = await env.db.one<{ repeat: string | null; state: string }>(
        `select repeat, state from buddy_steps where learner_id = $1`,
        [l.learnerId],
      );
      // Fewer reminders, not none: the one she already has keeps standing.
      expect(row).toEqual({ repeat: null, state: 'planned' });
    });

    it('saying she practised does not quietly end the repetition', async () => {
      env.llm.script('buddy_turn', {
        json: say('Klar, jeden Tag.', [plan({ repeat: 'daily' })]),
      });
      await send(l, 'erinner mich jeden tag um 5');
      env.llm.script('buddy_turn', {
        json: say('Stark!', [
          { tool: 'mark_step_done', args: { step: 'st1', quote: 'hab ich gemacht' } },
        ]),
      });
      await send(l, 'hab ich gemacht');
      const row = await env.db.one<{ repeat: string | null; state: string; planned_date: string }>(
        `select repeat, state, planned_date from buddy_steps where learner_id = $1`,
        [l.learnerId],
      );
      expect(row.repeat).toBe('daily');
      expect(row.state).toBe('planned');
      expect(row.planned_date).toBe('2026-09-29'); // tomorrow, counted from today
    });
  });
});
