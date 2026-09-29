// Memory that stays usable (issue #20): from ~45 things Buddy knows, the model is asked once
// per kind what says the same thing twice and what a newer item contradicts. What must hold:
// nothing happens below the threshold; a merge keeps its provenance (the originals point at
// the sentence that carries them now); an item that changed while the model was asked is
// never overwritten; an unusable answer writes nothing and the job says so; and the erasure
// paths are untouched.
// requires live verification in Claude Code session (needs a running Postgres; scripted model)

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CONSOLIDATE_AT, applyConsolidation } from '../modules/buddy/consolidate.js';
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
const DAY = 86_400_000;

type MemoryRow = {
  id: string;
  statement: string;
  status: string;
  source: string;
  version: number;
  merged_into: string | null;
  closed_at: Date | null;
};

async function tick(env: TestEnv): Promise<void> {
  const res = await env.app.request('/v1/internal/tick', {
    method: 'POST',
    headers: { 'x-tick-secret': TEST_TICK_SECRET },
  });
  expect(res.status).toBe(200);
  await env.flushBackground();
}

/** Memories as they stand after she typed them into the memory screen. */
async function remember(
  env: TestEnv,
  l: Learner,
  items: Array<{ kind: 'fact' | 'preference' | 'goal'; statement: string }>,
): Promise<void> {
  const base = env.clock.now().getTime() - items.length * 60_000;
  for (const [i, item] of items.entries()) {
    await env.db.query(
      `insert into buddy_memories (learner_id, kind, statement, source, created_at)
       values ($1, $2, $3, 'learner_edited', $4)`,
      [l.learnerId, item.kind, item.statement, new Date(base + i * 60_000)],
    );
  }
}

/** Filler so the learner is at the threshold; none of it is ever merged. */
function filler(n: number, from = 1): Array<{ kind: 'fact'; statement: string }> {
  return Array.from({ length: n }, (_, i) => ({
    kind: 'fact' as const,
    statement: `Ich finde Thema ${from + i} spannend`,
  }));
}

async function memories(env: TestEnv, l: Learner): Promise<MemoryRow[]> {
  return env.db.query<MemoryRow>(
    `select id, statement, status, source, version, merged_into, closed_at
       from buddy_memories where learner_id = $1 order by created_at, seq`,
    [l.learnerId],
  );
}

async function job(
  env: TestEnv,
  l: Learner,
): Promise<{ status: string; result: Record<string, number> } | null> {
  return env.db.maybeOne<{ status: string; result: Record<string, number> }>(
    `select status, result from jobs
      where learner_id = $1 and kind = 'consolidate_memories' order by seq desc limit 1`,
    [l.learnerId],
  );
}

/** The alias this run gave a statement (the model never sees an id). */
function aliasFor(text: string, part: string): string | null {
  const line = text.split('\n').find((l) => l.includes(part));
  return /- (m\d{1,3}) /.exec(line ?? '')?.[1] ?? null;
}

describe.skipIf(!dbReady)('memory consolidation', () => {
  let env: TestEnv;

  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-09-29T02:00:00Z' });
  });
  afterAll(async () => {
    await env?.close();
  });

  it('leaves a learner below the threshold alone', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2013-05-04' });
    await remember(env, l, filler(CONSOLIDATE_AT - 1));
    const before = env.llm.callsFor('consolidate').length;
    await tick(env);
    expect(env.llm.callsFor('consolidate').length).toBe(before);
    expect(await job(env, l)).toBeNull();
    const rows = await memories(env, l);
    expect(rows.filter((r) => r.status === 'active')).toHaveLength(CONSOLIDATE_AT - 1);
  });

  it('says duplicates once and drops what a newer item contradicts', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    await remember(env, l, [
      { kind: 'fact', statement: 'Ich habe einen Hund' },
      ...filler(CONSOLIDATE_AT - 5, 100),
      { kind: 'preference', statement: 'Ich übe am liebsten allein' },
      { kind: 'fact', statement: 'Bei uns zu Hause lebt ein Hund' },
      { kind: 'preference', statement: 'Ich übe am liebsten mit meiner Freundin zusammen' },
    ]);
    // A temporary situation: it ends by itself and is never part of a consolidation.
    await env.db.query(
      `insert into buddy_memories (learner_id, kind, statement, source, valid_until, created_at)
       values ($1, 'constraint', 'Diese Woche habe ich viel Sport', 'learner_edited', $2, $3)`,
      [l.learnerId, new Date(env.clock.now().getTime() + 5 * DAY), env.clock.now()],
    );
    env.llm.byDefault('consolidate', (req) => {
      const text = ScriptedGateway.textOf(req);
      const dogA = aliasFor(text, 'Ich habe einen Hund');
      const dogB = aliasFor(text, 'Bei uns zu Hause lebt ein Hund');
      const alone = aliasFor(text, 'Ich übe am liebsten allein');
      const together = aliasFor(text, 'mit meiner Freundin zusammen');
      return {
        merge:
          dogA && dogB
            ? [{ memories: [dogA, dogB], statement: 'Sie hat zu Hause einen Hund.' }]
            : [],
        invalidate: alone && together ? [{ memory: alone, outdated_by: together }] : [],
      };
    });
    await tick(env);

    const rows = await memories(env, l);
    const merged = rows.find((r) => r.statement === 'Sie hat zu Hause einen Hund.');
    expect(merged).toBeDefined();
    expect(merged!.status).toBe('active');
    // Not her literal words and not her edit: the screen says where the sentence comes from.
    expect(merged!.source).toBe('consolidated');
    // Provenance: both originals are closed and point at the sentence that carries them now.
    for (const part of ['Ich habe einen Hund', 'Bei uns zu Hause lebt ein Hund']) {
      const original = rows.find((r) => r.statement === part)!;
      expect(original.status).toBe('superseded');
      expect(original.merged_into).toBe(merged!.id);
      expect(original.closed_at).not.toBeNull();
    }
    // A contradiction has no successor: it is closed, nothing carries it on.
    const alone = rows.find((r) => r.statement === 'Ich übe am liebsten allein')!;
    expect(alone.status).toBe('superseded');
    expect(alone.merged_into).toBeNull();
    expect(
      rows.find((r) => r.statement === 'Ich übe am liebsten mit meiner Freundin zusammen')!.status,
    ).toBe('active');

    // The temporary situation was never shown to the model and stands untouched: merging it
    // would need an end date, and the model never writes one.
    expect(
      env.llm
        .callsFor('consolidate')
        .some((req) => ScriptedGateway.textOf(req).includes('Diese Woche habe ich viel Sport')),
    ).toBe(false);
    expect(rows.find((r) => r.statement === 'Diese Woche habe ich viel Sport')?.status).toBe(
      'active',
    );

    // Two items of room, and the job says exactly what it did.
    expect(rows.filter((r) => r.status === 'active')).toHaveLength(CONSOLIDATE_AT - 2);
    const done = await job(env, l);
    expect(done?.status).toBe('done');
    expect(done?.result).toMatchObject({ groups: 2, merged: 2, invalidated: 1, discarded: 0 });

    // What she sees in "Was Buddy über dich weiß" carries the new source.
    const view = await l.api.get<{ memories: Array<{ statement: string; source: string }> }>(
      '/buddy/memory',
    );
    expect(view.status).toBe(200);
    expect(
      view.body.memories.find((m) => m.statement === 'Sie hat zu Hause einen Hund.')?.source,
    ).toBe('consolidated');

    // One run a day: a second tick plans nothing new.
    const calls = env.llm.callsFor('consolidate').length;
    await tick(env);
    expect(env.llm.callsFor('consolidate').length).toBe(calls);
  });

  it('never overwrites an item she changed while the model was being asked', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Nora', birthDate: '2012-11-02' });
    await remember(env, l, [
      { kind: 'fact', statement: 'Ich spiele Klavier' },
      ...filler(CONSOLIDATE_AT - 2, 200),
      { kind: 'fact', statement: 'Klavier spiele ich auch' },
    ]);
    let changed = false;
    env.llm.byDefault('consolidate', async (req) => {
      const text = ScriptedGateway.textOf(req);
      const a = aliasFor(text, 'Ich spiele Klavier');
      const b = aliasFor(text, 'Klavier spiele ich auch');
      // While the model is thinking, she corrects one of them in the memory screen: the
      // route closes the old row, writes the new one and bumps the context.
      if (!changed && a && b) {
        changed = true;
        const row = await env.db.one<{ id: string; version: number }>(
          `select id, version from buddy_memories
            where learner_id = $1 and statement = 'Ich spiele Klavier' and status = 'active'`,
          [l.learnerId],
        );
        const patched = await l.api.patch(`/buddy/memory/${row.id}`, {
          statement: 'Ich spiele Klavier und Gitarre',
          version: row.version,
        });
        expect(patched.status).toBe(200);
      }
      return {
        merge: a && b ? [{ memories: [a, b], statement: 'Sie spielt Klavier.' }] : [],
        invalidate: [],
      };
    });
    await tick(env);

    const rows = await memories(env, l);
    expect(rows.find((r) => r.statement === 'Sie spielt Klavier.')).toBeUndefined();
    // Her correction stands, and the other item was not closed either.
    expect(rows.find((r) => r.statement === 'Ich spiele Klavier und Gitarre')?.status).toBe(
      'active',
    );
    expect(rows.find((r) => r.statement === 'Klavier spiele ich auch')?.status).toBe('active');
    const done = await job(env, l);
    expect(done?.status).toBe('done');
    expect(done?.result).toMatchObject({ groups: 1, merged: 0, invalidated: 0, discarded: 1 });
  });

  it('refuses an application whose items changed, also with the context untouched', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Jo', birthDate: '2011-07-07' });
    await remember(env, l, [
      { kind: 'fact', statement: 'Ich habe eine Katze' },
      { kind: 'fact', statement: 'Bei uns lebt eine Katze' },
    ]);
    const rows = await memories(env, l);
    const fence = await env.db.one<{ context_version: number }>(
      `select context_version from buddy_settings where learner_id = $1`,
      [l.learnerId],
    );
    const input = {
      learnerId: l.learnerId,
      now: env.clock.now(),
      merges: [
        {
          rows: rows.map((r) => ({
            id: r.id,
            kind: 'fact',
            statement: r.statement,
            // The version the model's group was read with — one behind what stands now.
            version: r.version - 1,
            created_at: env.clock.now(),
          })),
          statement: 'Sie hat zu Hause eine Katze.',
        },
      ],
      invalid: [],
    };
    expect(await applyConsolidation(env.db, { ...input, fence: fence.context_version })).toBe(
      'stale',
    );
    // And a context that moved on rejects it just as well.
    expect(await applyConsolidation(env.db, { ...input, fence: fence.context_version - 1 })).toBe(
      'stale',
    );
    expect((await memories(env, l)).every((r) => r.status === 'active')).toBe(true);
  });

  it('writes nothing when the answer is unusable, and the job says so', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Tim', birthDate: '2012-01-20' });
    await remember(env, l, filler(CONSOLIDATE_AT, 300));
    env.llm.byDefault('consolidate', { json: { nonsense: true } });
    await tick(env);

    const rows = await memories(env, l);
    expect(rows.filter((r) => r.status === 'active')).toHaveLength(CONSOLIDATE_AT);
    const done = await job(env, l);
    expect(done?.status).toBe('done');
    expect(done?.result).toMatchObject({ groups: 1, merged: 0, invalidated: 0, discarded: 1 });
  });

  it('refuses a merged sentence that says more than the items it replaces', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Ida', birthDate: '2013-09-09' });
    await remember(env, l, [
      { kind: 'fact', statement: 'Ich habe Handballtraining' },
      ...filler(CONSOLIDATE_AT - 2, 400),
      { kind: 'fact', statement: 'Handball mache ich auch' },
    ]);
    env.llm.byDefault('consolidate', (req) => {
      const text = ScriptedGateway.textOf(req);
      const a = aliasFor(text, 'Ich habe Handballtraining');
      const b = aliasFor(text, 'Handball mache ich auch');
      return {
        // A day nobody said: the same guard `remember` uses refuses it (live finding 4).
        merge:
          a && b
            ? [{ memories: [a, b], statement: 'Sie hat sonntags um 3 Handballtraining.' }]
            : [],
        invalidate: [],
      };
    });
    await tick(env);

    const rows = await memories(env, l);
    expect(rows.filter((r) => r.status === 'active')).toHaveLength(CONSOLIDATE_AT);
    expect(rows.some((r) => r.statement.includes('sonntags'))).toBe(false);
    expect((await job(env, l))?.result).toMatchObject({ discarded: 1 });
  });

  it('erasure is untouched: closed items go after the undo window, the sentence stays', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Emma', birthDate: '2014-06-06' });
    await remember(env, l, [
      { kind: 'fact', statement: 'Ich fahre Einrad' },
      ...filler(CONSOLIDATE_AT - 2, 500),
      { kind: 'fact', statement: 'Einradfahren kann ich' },
    ]);
    env.llm.byDefault('consolidate', (req) => {
      const text = ScriptedGateway.textOf(req);
      const a = aliasFor(text, 'Ich fahre Einrad');
      const b = aliasFor(text, 'Einradfahren kann ich');
      return {
        merge: a && b ? [{ memories: [a, b], statement: 'Sie fährt Einrad.' }] : [],
        invalidate: [],
      };
    });
    await tick(env);
    const merged = (await memories(env, l)).find((r) => r.statement === 'Sie fährt Einrad.');
    expect(merged?.status).toBe('active');

    // Eight days later the undo window is over: the originals are erased, and the chain
    // pointing at their successor does not stop that.
    env.clock.advance(8 * DAY);
    env.llm.byDefault('consolidate', { json: { merge: [], invalidate: [] } });
    await tick(env);
    const rows = await memories(env, l);
    expect(rows.some((r) => r.statement === 'Ich fahre Einrad')).toBe(false);
    expect(rows.some((r) => r.statement === 'Einradfahren kann ich')).toBe(false);
    expect(rows.find((r) => r.statement === 'Sie fährt Einrad.')?.status).toBe('active');

    // And everything goes with the account (the cascade, not a job).
    await env.db.query(`delete from learners where id = $1`, [l.learnerId]);
    expect(await memories(env, l)).toEqual([]);
  });
});
