// Whether an undo still applies, asked for a whole page at once (#712, review of #789), against a
// real Postgres.
// requires live verification in Claude Code session (needs a running Postgres)
//
// `undoAppliesAll` asks every simple kind's condition in one statement (its parameters renumbered)
// and runs the kinds a row cannot say in code. What must hold, for EVERY undo kind there is:
//   · it applies while the thing it changed is still as the action left it;
//   · it does not once that thing changed since or is gone;
//   · asked alone or in the middle of a mixed page, the answer is the same — the code-path kinds
//     between the probes must not shift the numbered parameters of the ones after them.
// Whether an action is already taken back or past its undo window is decided before any kind's
// check, for all kinds alike; the home test proves that (home-queries.int.test.ts).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { UndoSpec } from '../modules/buddy/toolKit.js';
import { undoAppliesAll } from '../modules/buddy/undo.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

type Case = { name: string; undo: UndoSpec; applies: boolean };

describe.skipIf(!dbReady)('whether her undos still apply, every kind', () => {
  let env: TestEnv;
  let l: Learner;
  const cases: Case[] = [];

  const one = <T extends Record<string, unknown>>(sql: string, params: unknown[]) =>
    env.db.one<T>(sql, params);
  const memory = async (statement: string, status: 'active' | 'retracted') =>
    (
      await one<{ id: string }>(
        `insert into buddy_memories (learner_id, kind, statement, source, status, created_at)
         values ($1, 'fact', $2, 'learner_edited', $3, $4) returning id`,
        [l.learnerId, statement, status, env.clock.now()],
      )
    ).id;
  const goal = async (title: string) =>
    one<{ id: string; version: number }>(
      `insert into buddy_goals (learner_id, kind, title, due_date)
       values ($1, 'exam', $2, '2026-10-30') returning id, version`,
      [l.learnerId, title],
    );
  const step = async (title: string, state: string) =>
    one<{ id: string; version: number }>(
      `insert into buddy_steps (learner_id, kind, title, state, planned_date)
       values ($1, 'practice', $2, $3, '2026-10-20') returning id, version`,
      [l.learnerId, title, state],
    );
  const job = async (key: string) =>
    (
      await one<{ id: string }>(
        `insert into jobs (learner_id, kind, run_at, dedupe_key, payload)
         values ($1, 'buddy_check', $2, $3, '{"reason":"routine"}') returning id`,
        [l.learnerId, env.clock.now(), key],
      )
    ).id;
  const sheet = async (archived: boolean) =>
    (
      await one<{ id: string }>(
        `insert into materials (learner_id, client_request_id, status, photo_count, archived_at, created_at)
         values ($1, gen_random_uuid(), 'ready', 1, $2, $3) returning id`,
        [l.learnerId, archived ? env.clock.now() : null, env.clock.now()],
      )
    ).id;

  beforeAll(async () => {
    env = await createTestEnv();
    l = await onboard(env);
    const add = (name: string, undo: UndoSpec, applies: boolean) =>
      cases.push({ name, undo, applies });

    // Memories: retract / restore / un-forget (one and several).
    add(
      'retract_memory, still active',
      { type: 'retract_memory', memory_id: await memory('Mag Pferde', 'active') },
      true,
    );
    add(
      'retract_memory, retracted since',
      { type: 'retract_memory', memory_id: await memory('Spielt Geige', 'retracted') },
      false,
    );
    add(
      'restore_memory, new one active',
      {
        type: 'restore_memory',
        old_id: await memory('Alt', 'retracted'),
        new_id: await memory('Neu', 'active'),
      },
      true,
    );
    add(
      'restore_memory, new one gone',
      {
        type: 'restore_memory',
        old_id: await memory('Alt 2', 'retracted'),
        new_id: await memory('Neu 2', 'retracted'),
      },
      false,
    );
    add(
      'unretract_memory, still retracted',
      { type: 'unretract_memory', memory_id: await memory('Hat einen Hund', 'retracted') },
      true,
    );
    add(
      'unretract_memory, active again',
      { type: 'unretract_memory', memory_id: await memory('Mag Mathe', 'active') },
      false,
    );
    add(
      'unretract_memories, one can come back',
      {
        type: 'unretract_memories',
        memory_ids: [await memory('Liest gern', 'retracted'), await memory('Schwimmt', 'active')],
      },
      true,
    );
    add(
      'unretract_memories, none can',
      { type: 'unretract_memories', memory_ids: [await memory('Malt', 'active')] },
      false,
    );

    // Her level.
    const me = await one<{ level: string; grade: number | null }>(
      `select level, grade from learners where id = $1`,
      [l.learnerId],
    );
    add(
      'restore_level, unchanged',
      {
        type: 'restore_level',
        level: 'school',
        grade: 5,
        expect_level: me.level,
        expect_grade: me.grade,
      },
      true,
    );
    add(
      'restore_level, changed since',
      {
        type: 'restore_level',
        level: 'school',
        grade: 5,
        expect_level: me.level,
        expect_grade: (me.grade ?? 0) + 1,
      },
      false,
    );

    // Goals.
    add('drop_goal, still active', { type: 'drop_goal', goal_id: (await goal('Bio')).id }, true);
    const gone = await goal('Chemie');
    await env.db.query(`delete from buddy_goals where id = $1`, [gone.id]);
    add('drop_goal, deleted', { type: 'drop_goal', goal_id: gone.id }, false);
    const g = await goal('Physik');
    const restoreGoal = (expect_version: number): UndoSpec => ({
      type: 'restore_goal',
      goal_id: g.id,
      title: 'Physik',
      due_date: null,
      topics: [],
      status: 'active',
      outcome: null,
      expect_version,
    });
    add('restore_goal, unchanged', restoreGoal(g.version), true);
    add('restore_goal, changed since', restoreGoal(g.version + 1), false);

    // Steps.
    add(
      'cancel_step, still planned',
      { type: 'cancel_step', step_id: (await step('Üben', 'planned')).id },
      true,
    );
    add(
      'cancel_step, skipped since',
      { type: 'cancel_step', step_id: (await step('Geübt', 'skipped')).id },
      false,
    );
    const s = await step('Lesen', 'planned');
    const restoreStep = (expect_version: number): UndoSpec => ({
      type: 'restore_step',
      step_id: s.id,
      state: 'planned',
      planned_date: '2026-10-21',
      planned_time: null,
      done_source: null,
      expect_version,
    });
    add('restore_step, unchanged', restoreStep(s.version), true);
    add('restore_step, changed since', restoreStep(s.version + 1), false);

    // Settings and voice.
    const v = (
      await one<{ version: number }>(`select version from buddy_settings where learner_id = $1`, [
        l.learnerId,
      ])
    ).version;
    const settings = (expect_version: number): UndoSpec => ({
      type: 'restore_settings',
      preferred_start: '15:00',
      preferred_end: '18:00',
      avoid_weekdays: [],
      paused_until: null,
      expect_version,
    });
    add('restore_settings, unchanged', settings(v), true);
    add('restore_settings, changed since', settings(v + 1), false);
    add(
      'restore_voice, unchanged',
      { type: 'restore_voice', voice: 'warm', speed: 1, expect_version: v },
      true,
    );
    add(
      'restore_voice, changed since',
      { type: 'restore_voice', voice: 'warm', speed: 1, expect_version: v + 1 },
      false,
    );

    // A scheduled check.
    add('cancel_check, still queued', { type: 'cancel_check', job_id: await job('check:a') }, true);
    const done = await job('check:b');
    await env.db.query(`delete from jobs where id = $1`, [done]);
    add('cancel_check, gone', { type: 'cancel_check', job_id: done }, false);

    // The learning domain's own kind (provider): a sheet renamed back.
    add(
      'rename_material_back, sheet there',
      { type: 'rename_material_back', material_id: await sheet(false), title: 'Alt' },
      true,
    );
    add(
      'rename_material_back, sheet archived',
      { type: 'rename_material_back', material_id: await sheet(true), title: 'Alt' },
      false,
    );
  });
  afterAll(async () => {
    await env?.close();
  });

  it('answers every kind, alone, as its state says', async () => {
    const answers: Record<string, boolean> = {};
    for (const c of cases)
      answers[c.name] = (await undoAppliesAll(env.db, l.learnerId, [c.undo]))[0]!;
    expect(answers).toEqual(Object.fromEntries(cases.map((c) => [c.name, c.applies])));
  });

  it('answers a mixed page exactly as each alone, code-path kinds in the middle', async () => {
    // Probes, then the in-code kinds, then probes again: renumbered parameters must still line up.
    const inCode = (c: Case) =>
      ['unretract_memory', 'unretract_memories', 'rename_material_back'].includes(c.undo.type);
    const probes = cases.filter((c) => !inCode(c));
    const half = Math.floor(probes.length / 2);
    const mixed = [...probes.slice(0, half), ...cases.filter(inCode), ...probes.slice(half)];
    expect(mixed).toHaveLength(cases.length);
    const page = await undoAppliesAll(
      env.db,
      l.learnerId,
      mixed.map((c) => c.undo),
    );
    expect(page).toEqual(mixed.map((c) => c.applies));
  });
});
