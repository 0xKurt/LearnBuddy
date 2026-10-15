// The home is read inside one snapshot on one connection (modules/buddy/home.ts), so every
// statement is a round trip of its own (#712, #637): at the production distance (3.2 ms, #447)
// each one adds to every turn and every poll. Facts that are read together are asked together.
// requires live verification in Claude Code session (scripted model, fake auth)

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

describe.skipIf(!dbReady)('the home’s round trips', () => {
  let env: TestEnv;
  let l: Learner;

  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-10-14T13:30:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterAll(async () => env.close());

  it('reads a plain home in at most 35 statements', async () => {
    const res = await env.app.request('/v1/buddy', {
      headers: { authorization: `Bearer ${l.token}` },
    });
    expect(res.status).toBe(200);
    const queries = Number(
      /db;dur=\d+;desc="(\d+) queries"/.exec(res.headers.get('server-timing') ?? '')?.[1],
    );
    // 39 before #712: the system status took four statements, what is working two.
    expect(queries).toBeLessThanOrEqual(35);
  });

  /** One remembered fact with its undoable action, as a turn of Buddy's would leave it. */
  async function remembered(
    learner: Learner,
    statement: string,
    status: 'applied' | 'undone' = 'applied',
  ): Promise<string> {
    const mem = await env.db.one<{ id: string }>(
      `insert into buddy_memories (learner_id, kind, statement, source, created_at)
       values ($1, 'fact', $2, 'learner_edited', $3) returning id`,
      [learner.learnerId, statement, env.clock.now()],
    );
    await env.db.query(
      `insert into buddy_actions (learner_id, tool, args, result, undo, status, created_at)
       values ($1, 'remember', $2, $3, $4, $6, $5)`,
      [
        learner.learnerId,
        { kind: 'fact', statement },
        { tool: 'remember', memory_id: mem.id, statement, kind: 'fact', valid_until: null },
        { type: 'retract_memory', memory_id: mem.id },
        env.clock.now(),
        status,
      ],
    );
    return mem.id;
  }

  const homeOf = async (learner: Learner) => {
    const res = await env.app.request('/v1/buddy', {
      headers: { authorization: `Bearer ${learner.token}` },
    });
    const queries = Number(
      /db;dur=\d+;desc="(\d+) queries"/.exec(res.headers.get('server-timing') ?? '')?.[1],
    );
    return { queries, home: (await res.json()) as BuddyHome };
  };

  it('asks whether her undos still work in one statement, however many there are (#712)', async () => {
    // Nothing to take back: no undo is asked at all.
    const none = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2014-03-01' });
    const five = await onboard(env, { relation: 'child', name: 'Ella', birthDate: '2014-04-01' });
    const ids: string[] = [];
    for (const fact of ['Mag Pferde', 'Spielt Geige', 'Hat einen Hund', 'Mag Mathe', 'Liest gern'])
      ids.push(await remembered(five, fact));
    // One of them changed since: its undo no longer applies, the others still do.
    await env.db.query(`update buddy_memories set status = 'retracted' where id = $1`, [ids[0]]);
    // One already taken back: never offered, and never asked about.
    await remembered(five, 'Tanzt gern', 'undone');

    const a = await homeOf(none);
    const b = await homeOf(five);
    // Five undoable actions cost ONE statement more than none (on main: five more).
    expect(b.queries).toBe(a.queries + 1);
    expect(b.home.done.filter((d) => d.undoable)).toHaveLength(4);
    expect(b.home.done).toHaveLength(6);
  });
});
