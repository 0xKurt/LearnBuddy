// Deterministic next-run difficulty and review order (#872, docs/architecture.md §Practice).
// requires live verification in Claude Code session (real Postgres; scripted outside world)

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findOrCreateSubject } from '../modules/learning/state.js';
import { selectPracticeItems, type PracticeWish } from '../modules/practice/selection.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

describe.skipIf(!dbReady)('adaptive practice selection (#872)', () => {
  let env: TestEnv;
  let learner: Learner;

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-23T10:00:00Z' });
    learner = await onboard(env);
  });
  afterEach(() => env.closeChecked());

  async function item(
    topic: string | null,
    difficulty: number,
    opts: {
      owner?: Learner;
      subject?: string;
      result?: boolean;
      daysAgo?: number;
      dueDays?: number;
      task?: string;
      part?: string;
      flagged?: boolean;
      selfRated?: boolean;
      status?: string;
      kind?: string;
    } = {},
  ) {
    const owner = opts.owner ?? learner;
    const now = env.clock.now();
    const when = new Date(now.getTime() - (opts.daysAgo ?? 0) * 86_400_000);
    const subject = await findOrCreateSubject(
      env.db,
      owner.learnerId,
      opts.subject ?? 'Mathe',
      'other',
    );
    const row = await env.db.one<{ id: string }>(
      `insert into items (learner_id, subject_id, origin, kind, prompt, answer, topic, difficulty, task_part, created_at)
       values ($1,$2,'buddy',$3,'Aufgabe','4',$4,$5,$6,$7) returning id`,
      [
        owner.learnerId,
        subject.id,
        opts.kind ?? 'numeric',
        topic,
        difficulty,
        opts.task ? JSON.stringify({ group: opts.task, part: opts.part }) : null,
        when,
      ],
    );
    if (opts.result !== undefined) {
      const session = await env.db.one<{ id: string }>(
        `insert into practice_sessions (learner_id, mode, status, started_at, last_activity_at, created_at)
         values ($1,'practice','finished',$2,$2,$2) returning id`,
        [owner.learnerId, when],
      );
      await env.db.query(
        `insert into session_items (session_id, item_id, position, status, first_try_correct, closed_at, flagged_at, answered_by)
         values ($1,$2,0,$3,$4,$5,$6,$7)`,
        [
          session.id,
          row.id,
          opts.status ?? (opts.result ? 'correct' : 'revealed'),
          opts.result,
          when,
          opts.flagged ? when : null,
          opts.selfRated ? 'self_rated' : 'typed',
        ],
      );
    }
    if (opts.dueDays !== undefined)
      await env.db.query(
        `insert into item_states (item_id, learner_id, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review, updated_at)
       values ($1,$2,$3,1,5,0,1,1,0,2,$4,$4)`,
        [row.id, owner.learnerId, new Date(now.getTime() + opts.dueDays * 86_400_000), when],
      );
    return row.id;
  }

  async function history(
    topic: string,
    hits: number,
    total = 5,
    opts: Parameters<typeof item>[2] = {},
    difficulty = 3,
  ) {
    for (let i = 0; i < total; i++)
      await item(topic, difficulty, { ...opts, result: i < hits, dueDays: 1 });
  }
  const select = (
    count: number | 'all' = 1,
    wish: PracticeWish = {},
    run: 'practice' | 'test' | 'speak' = 'practice',
  ) => selectPracticeItems(env.db, learner.learnerId, {}, [], count, env.clock.now(), wish, run);

  it('lowers and raises one step independently per topic, without changing stored difficulty', async () => {
    await history('Brüche', 2);
    await history('Winkel', 5);
    const hardFractions = await item('Brüche', 4);
    const easyFractions = await item('Brüche', 2);
    const easyAngles = await item('Winkel', 2);
    const hardAngles = await item('Winkel', 4);
    expect(await select(4)).toEqual([easyFractions, hardFractions, hardAngles, easyAngles]);
    const stored = await env.db.one<{ difficulty: number }>(
      'select difficulty from items where id = $1',
      [easyFractions],
    );
    expect(stored.difficulty).toBe(2);
    expect(await select(4)).toEqual(await select(4));
  });

  it.each([
    ['at 60%', 6, 10, 2],
    ['at 90%', 9, 10, 4],
    ['below 90%', 8, 10, 2],
    ['too few results', 4, 4, 2],
  ] as const)('keeps the boundary conservative: %s', async (_label, hits, total, expected) => {
    await history('Brüche', hits, total);
    const easy = await item('Brüche', 2);
    const hard = await item('Brüche', 4);
    expect(await select()).toEqual([expected === 4 ? hard : easy]);
  });

  it.each([
    [0, 1],
    [5, 5],
  ] as const)('clamps the next level after %s hits at difficulty %s', async (hits, level) => {
    await history('Brüche', hits, 5, {}, level);
    const extreme = await item('Brüche', hits === 0 ? 5 : 1);
    const bounded = await item('Brüche', level);
    expect(await select()).toEqual([bounded]);
    expect(await select(2)).toEqual([bounded, extreme]);
  });

  it('uses only the last ten results per topic, and ignores old evidence', async () => {
    await history('Brüche', 0, 5, { daysAgo: 2 });
    await history('Brüche', 10, 10, { daysAgo: 1 });
    await history('Winkel', 5, 5, { daysAgo: 31 });
    await item('Brüche', 2);
    const hard = await item('Brüche', 4);
    const easyAngles = await item('Winkel', 2);
    await item('Winkel', 4);
    expect((await select(3))[0]).toBe(hard);
    expect((await select(3))[2]).toBe(easyAngles);
  });

  it('keeps explicit wishes, tests, empty histories and other subjects/learners independent', async () => {
    const other = await onboard(env, { name: 'Mara' });
    await history('Brüche', 5, 5, { owner: other });
    await history('Brüche', 5, 5, { subject: 'Physik' });
    const easy = await item('Brüche', 2);
    const hard = await item('Brüche', 4);
    expect(await select()).toEqual([easy]);
    await history('Brüche', 5);
    expect(await select(1, { difficulty: 'easier' })).toEqual([easy]);
    expect(await select(1, {}, 'test')).toEqual([easy]);
    expect(await select()).toEqual([hard]);
  });

  it('does not count skipped, disputed, self-rated or ungraded free-text outcomes', async () => {
    for (const opts of [
      { status: 'skipped' },
      { flagged: true },
      { selfRated: true },
      { kind: 'long' },
    ]) {
      await history('Brüche', 5, 5, opts);
    }
    const easy = await item('Brüche', 2);
    await item('Brüche', 4);
    expect(await select()).toEqual([easy]);
  });

  it('interleaves due topics before cutting, keeps multipart tasks whole and never pulls future items in', async () => {
    const a = await item('Brüche', 3, { dueDays: -3, task: 'fractions', part: 'a' });
    const b = await item('Brüche', 3, { dueDays: -3, task: 'fractions', part: 'b' });
    const c = await item('Brüche', 3, { dueDays: -2 });
    const d = await item('Brüche', 3, { dueDays: -1 });
    const angle = await item('Winkel', 3, { dueDays: 0 });
    const angle2 = await item('Winkel', 3, { dueDays: 0 });
    const future = await item('Geometrie', 3, { dueDays: 1 });
    await item('Geometrie', 3);
    expect(await select(1, { dueOnly: true })).toEqual([a, b]);
    expect(await select(3, { dueOnly: true })).toEqual([a, b, angle]);
    expect(await select('all', { dueOnly: true })).toEqual([a, b, angle, c, angle2, d]);
    expect(await select('all', { dueOnly: true })).not.toContain(future);
  });

  it('keeps unknown topics in place and alternates whenever another known topic remains', async () => {
    const a = await item('Brüche', 3, { dueDays: 0 });
    const unknown = await item(null, 3, { dueDays: 0 });
    const b = await item('Brüche', 3, { dueDays: 0 });
    const c = await item('Winkel', 3, { dueDays: 0 });
    const d = await item('Winkel', 3, { dueDays: 0 });
    const e = await item('Winkel', 3, { dueDays: 0 });
    expect(await select('all', { dueOnly: true })).toEqual([a, unknown, c, b, d, e]);
  });

  it('can reach another due topic beyond the former 200-question window', async () => {
    const first = await item('Brüche', 3, { dueDays: 0 });
    await env.db.query(
      `with copies as (
         insert into items (learner_id, subject_id, origin, kind, prompt, answer, topic, difficulty, created_at)
         select learner_id, subject_id, origin, kind, prompt, answer, topic, difficulty, created_at
           from items cross join generate_series(1, 200) where id = $1 returning id, learner_id
       )
       insert into item_states (item_id, learner_id, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, updated_at)
       select id, learner_id, $2, 1, 5, 0, 1, 1, 0, 2, $2 from copies`,
      [first, env.clock.now()],
    );
    const different = await item('Winkel', 3, { dueDays: 0 });
    expect(await select(2, { dueOnly: true })).toEqual([first, different]);
  });

  it('preserves due priority over adaptive new items, and keeps unseen topics and speech in source order', async () => {
    await history('Brüche', 5);
    const due = await item('Brüche', 2, { dueDays: 0 });
    const hard = await item('Brüche', 4);
    expect(await select(2)).toEqual([due, hard]);
    const a = await item('Vorlesen', 2, { kind: 'speak', dueDays: 0 });
    const b = await item('Vorlesen', 2, { kind: 'speak', dueDays: 0 });
    const c = await item('Anderer Text', 2, { kind: 'speak', dueDays: 0 });
    expect(await select('all', {}, 'speak')).toEqual([a, b, c]);
  });
});
