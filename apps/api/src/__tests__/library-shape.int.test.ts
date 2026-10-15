// Her library with 200 sheets: the same cards, from a leaner query (#717, Codex #11, #637), against
// a real Postgres.
// requires live verification in Claude Code session (needs a running Postgres)
//
// The card query selected `m.*` and ran the newest-session lookup twice and the question count
// twice per sheet. What must hold:
//   · every card says exactly what the old query made of it (the old query stands here as the
//     reference, over 200 sheets with questions, speaking items, homework and sessions);
//   · the plan reads each sheet's practice sessions once, not twice.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { libraryView } from '../modules/materials/library.js';
import { toView, type MaterialViewRow } from '../modules/materials/view.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

/** The card query as it was before #717: the reference for what every card must say. */
const BEFORE = `select m.*, s.name as subject_name,
            (select count(*) from items i where i.material_id = m.id and i.archived_at is null)::int as item_count,
            (select count(*) from items i
              where i.material_id = m.id and i.archived_at is null
                and i.kind = 'speak' and i.origin <> 'homework')::int as speak_count,
            (select ps.id from practice_sessions ps where ps.material_id = m.id
              order by ps.started_at desc, ps.seq desc limit 1) as session_id,
            (select ps.status from practice_sessions ps where ps.material_id = m.id
              order by ps.started_at desc, ps.seq desc limit 1) as session_status
       from materials m left join subjects s on s.id = m.subject_id
      where m.learner_id = $1 and m.archived_at is null and m.merged_into is null
        and (m.status <> 'awaiting_upload' or m.send_requested_at is not null)
      order by m.created_at desc, m.seq desc
      limit 200`;

describe.skipIf(!dbReady)('her library with 200 sheets', () => {
  let env: TestEnv;
  let l: Learner;

  beforeAll(async () => {
    env = await createTestEnv();
    l = await onboard(env);
    const subject = await env.db.one<{ id: string }>(
      `insert into subjects (learner_id, name, kind) values ($1, 'Mathe', 'math') returning id`,
      [l.learnerId],
    );
    // 200 sheets: every third without a subject, with 0–4 questions (some speaking, some
    // homework, some archived) and 0–2 practice sessions each.
    await env.db.query(
      `with sheets as (
         insert into materials (learner_id, client_request_id, subject_id, status, photo_count, created_at)
         select $1, gen_random_uuid(), case when g % 3 = 0 then null else $2::uuid end,
                'ready', 1, $3::timestamptz + g * interval '1 minute'
           from generate_series(1, 200) g
         returning id, created_at),
       numbered as (select id, row_number() over (order by created_at) as n from sheets),
       questions as (
         insert into items (learner_id, material_id, kind, prompt, answer, topic, difficulty, origin, archived_at)
         select $1, s.id, case when q % 2 = 0 then 'speak' else 'short' end, 'Frage', 'x', 'Brüche', 2,
                case when q = 3 then 'homework' else 'material' end,
                case when q = 4 then $3::timestamptz end
           from numbered s cross join generate_series(1, (s.n % 5)::int) q
         returning 1)
       insert into practice_sessions (learner_id, material_id, mode, status, title, client_request_id,
                                      started_at, last_activity_at)
       select $1, s.id, 'practice', case when k = 1 then 'finished' else 'active' end, 'Brüche',
              gen_random_uuid(), $3::timestamptz + k * interval '1 hour', $3::timestamptz
         from numbered s cross join generate_series(1, (s.n % 3)::int) k`,
      [l.learnerId, subject.id, env.clock.now()],
    );
  });
  afterAll(async () => {
    await env?.close();
  });

  it('shows every card exactly as the old query did', async () => {
    const reference = (await env.db.query<MaterialViewRow>(BEFORE, [l.learnerId])).map(toView);
    const library = await libraryView(env.db, l.learnerId);
    const cards = [...library.subjects.flatMap((s) => s.materials), ...library.unsorted];
    expect(cards).toHaveLength(200);
    const byId = new Map(reference.map((v) => [v.id, v]));
    for (const card of cards) expect(card).toEqual(byId.get(card.id));
    // The cases that matter are there: speaking counts, sessions, both states.
    expect(cards.some((c) => c.speak_count > 0)).toBe(true);
    expect(cards.some((c) => c.session_status === 'active')).toBe(true);
    expect(cards.some((c) => c.session_id === null)).toBe(true);
  });

  it('says how long both take at 200 sheets (EXPLAIN ANALYZE, for the PR)', async () => {
    const { VIEW_SELECT } = await import('../modules/materials/view.js');
    const after = `${VIEW_SELECT}
      where m.learner_id = $1 and m.archived_at is null and m.merged_into is null
        and (m.status <> 'awaiting_upload' or m.send_requested_at is not null)
      order by m.created_at desc, m.seq desc
      limit 200`;
    const ms = async (sql: string) => {
      const times: number[] = [];
      for (let run = 0; run < 5; run++) {
        const plan = await env.db.query<{ 'QUERY PLAN': string }>(`explain analyze ${sql}`, [
          l.learnerId,
        ]);
        const line = plan.map((r) => r['QUERY PLAN']).find((t) => t.startsWith('Execution Time'));
        times.push(Number(/([\d.]+) ms/.exec(line ?? '')?.[1]));
      }
      return Math.min(...times);
    };
    console.log(
      `[library-shape] 200 sheets: before ${await ms(BEFORE)} ms, after ${await ms(after)} ms`,
    );
  });

  it('reads the practice sessions of a sheet once', async () => {
    const { VIEW_SELECT } = await import('../modules/materials/view.js');
    const plan = await env.db.query<{ 'QUERY PLAN': string }>(
      `explain ${VIEW_SELECT} where m.learner_id = $1`,
      [l.learnerId],
    );
    // One scan node on practice_sessions in the plan (the old query had one per subquery).
    const scans = plan
      .map((r) => r['QUERY PLAN'])
      .filter((line) => / on practice_sessions\b/.test(line));
    expect(scans).toHaveLength(1);
  });
});
