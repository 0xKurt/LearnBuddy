// What happens to a sheet after it is read, fails or is deleted: photos really leave
// Storage, "Blatt löschen" really deletes, a Storage or model outage is not her fault, and a
// deleted sheet leaves running sessions and prepared practice. Also memories she removed.
// docs/privacy.md §What is stored; docs/architecture.md §Material.
// requires live verification in Claude Code session (needs a running Postgres; Storage
// outages are injected with testing/fakes.ts MemoryStorage.failNext)

import { randomUUID } from 'node:crypto';

import type { BuddyHome, MaterialView, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LlmError } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import {
  createTestEnv,
  onboard,
  TEST_TICK_SECRET,
  type Learner,
  type TestEnv,
} from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();
const DAY = 86_400_000;

const item = (prompt: string, answer: string) => ({
  kind: 'short',
  prompt,
  answer,
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Hauptstädte',
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
});

const sheet = (pages: unknown = [], title = 'Europa geheim') => ({
  is_learning_material: true,
  readable: true,
  pages,
  title,
  subject: { name: 'Erdkunde', kind: 'geography' },
  extracted_text: 'Notiz über Klassenkamerad Max: Hauptstädte Europas',
  items: [item('Hauptstadt von Frankreich?', 'Paris'), item('Hauptstadt von Italien?', 'Rom')],
});

const WAIT = { json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null } };

async function tick(env: TestEnv): Promise<void> {
  const res = await env.app.request('/v1/internal/tick', {
    method: 'POST',
    headers: { 'x-tick-secret': TEST_TICK_SECRET },
  });
  expect(res.status).toBe(200);
  expect(((await res.json()) as { errors: string[] }).errors).toEqual([]);
}

async function create(
  env: TestEnv,
  l: Learner,
  opts: { photos?: number; purpose?: 'study' | 'homework'; completes?: string } = {},
) {
  const created = await l.api.post<{ material: MaterialView; uploads: Array<{ path: string }> }>(
    '/materials',
    {
      client_request_id: randomUUID(),
      photo_mimes: Array.from({ length: opts.photos ?? 1 }, () => 'image/jpeg'),
      ...(opts.completes ? { completes: opts.completes } : { purpose: opts.purpose ?? 'study' }),
    },
  );
  expect(created.status).toBe(201);
  return { id: created.body.material.id, paths: created.body.uploads.map((u) => u.path) };
}

async function send(
  env: TestEnv,
  l: Learner,
  opts: {
    photos?: number;
    purpose?: 'study' | 'homework';
    completes?: string;
    result?: unknown;
  } = {},
): Promise<{ id: string; paths: string[]; view: MaterialView }> {
  if (opts.result !== null) env.llm.script('extraction', { json: opts.result ?? sheet() });
  const m = await create(env, l, opts);
  for (const p of m.paths) env.storage.put(p);
  expect((await l.api.post(`/materials/${m.id}/submit`)).status).toBe(202);
  await env.flushBackground();
  const view = (await l.api.get<MaterialView>(`/materials/${m.id}`)).body;
  return { ...m, view };
}

async function contextVersion(env: TestEnv, learnerId: string): Promise<number> {
  return (
    await env.db.one<{ context_version: number }>(
      `select context_version from buddy_settings where learner_id = $1`,
      [learnerId],
    )
  ).context_version;
}

describe.skipIf(!dbReady)('material lifecycle and erasure', () => {
  let env: TestEnv;
  let lena: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T14:00:00Z' });
    lena = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    env.llm.byDefault('buddy_check', WAIT);
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

  it('a reading given up by the scheduler still purges its photos and tells Buddy (repro-14)', async () => {
    const m = await create(env, lena);
    for (const p of m.paths) env.storage.put(p);
    // The model call never returns: three leases expire, the job is parked.
    env.llm.available = false;
    expect((await lena.api.post(`/materials/${m.id}/submit`)).status).toBe(202);
    await env.flushBackground();
    env.llm.available = true;
    await env.db.query(
      `update jobs set status = 'failed', attempts = 3, last_error = 'lease_expired'
        where kind = 'extract_material' and payload ->> 'material_id' = $1`,
      [m.id],
    );
    await env.db.query(`update materials set status = 'processing' where id = $1`, [m.id]);
    const before = await contextVersion(env, lena.learnerId);
    await tick(env);
    const view = (await lena.api.get<MaterialView>(`/materials/${m.id}`)).body;
    expect(view).toMatchObject({ status: 'failed', failure_reason: 'model_error' });
    expect(await contextVersion(env, lena.learnerId)).toBeGreaterThan(before);
    const purge = await env.db.maybeOne(
      `select 1 from jobs where kind = 'purge_photos' and payload ->> 'material_id' = $1
          and status = 'queued'`,
      [m.id],
    );
    expect(purge).not.toBeNull();
    env.clock.advance(7 * DAY + 60_000);
    await tick(env);
    expect(m.paths.some((p) => env.storage.objects.has(p))).toBe(false);
  });

  it('photos no job will purge any more are found by the safety net', async () => {
    const m = await create(env, lena);
    for (const p of m.paths) env.storage.put(p);
    // Failed long ago by an older version that planned no purge.
    await env.db.query(
      `update materials set status = 'failed', failure_reason = 'model_error' where id = $1`,
      [m.id],
    );
    env.clock.advance(8 * DAY);
    await tick(env);
    await tick(env);
    expect(env.storage.objects.has(m.paths[0]!)).toBe(false);
    expect((await lena.api.get<MaterialView>(`/materials/${m.id}`)).body.photos_deleted).toBe(true);
  });

  it('a purge that hits a Storage outage is retried, not parked', async () => {
    env.storage.failNext('remove', 4);
    const m = await send(env, lena);
    expect((await lena.api.delete(`/materials/${m.id}`)).status).toBeLessThan(300);
    for (let i = 0; i < 6; i++) {
      await tick(env);
      env.clock.minutes(30);
    }
    expect(env.storage.objects.has(m.paths[0]!)).toBe(false);
    const parked = await env.db.query(`select 1 from jobs where status = 'failed'`);
    expect(parked).toEqual([]);
  });

  it('"Blatt löschen" deletes the transcript, the questions and her answers — also from the export (D-7)', async () => {
    const m = await send(env, lena, { photos: 2 });
    expect(m.view).toMatchObject({ status: 'ready', item_count: 2 });
    const started = await lena.api.post<SessionView>('/practice/sessions', {
      material_id: m.id,
    });
    expect(started.status).toBe(201);
    const first = started.body.items[0]!.item;
    // Her answer to it (as the answer endpoint stores it).
    await env.db.query(
      `insert into practice_turns (session_id, learner_id, item_id, seq, role, text, verdict, evaluated_by, created_at)
       values ($1, $2, $3, 1, 'learner', 'Paris ist es, sagt Max', 'correct', 'rule', $4)`,
      [started.body.id, lena.learnerId, first.id, env.clock.now()],
    );
    expect((await lena.api.delete(`/materials/${m.id}`)).status).toBeLessThan(300);
    await tick(env);

    const row = await env.db.one<{
      extracted_text: string | null;
      title: string | null;
      content_purged_at: Date | null;
    }>(`select extracted_text, title, content_purged_at from materials where id = $1`, [m.id]);
    expect(row).toMatchObject({ extracted_text: null, title: null });
    expect(row.content_purged_at).not.toBeNull();
    const left = await env.db.one<{ items: number; turns: number }>(
      `select (select count(*) from items where material_id = $1)::int as items,
              (select count(*) from practice_turns where learner_id = $2)::int as turns`,
      [m.id, lena.learnerId],
    );
    expect(left).toEqual({ items: 0, turns: 0 });
    const exported = JSON.stringify((await lena.api.get('/account/export')).body);
    expect(exported).not.toContain('Klassenkamerad');
    expect(exported).not.toContain('Hauptstadt von Frankreich');
    expect(exported).not.toContain('Europa geheim');
    expect(exported).not.toContain('sagt Max');
    // The history keeps what is not content: a session happened.
    expect(
      (
        await env.db.one<{ n: number }>(
          `select count(*)::int as n from practice_sessions where learner_id = $1`,
          [lena.learnerId],
        )
      ).n,
    ).toBe(1);
  });

  it('"Frage löschen" deletes that question for good; deleting it again is fine', async () => {
    const m = await send(env, lena);
    const items = await env.db.query<{ id: string }>(
      `select id from items where material_id = $1 order by seq`,
      [m.id],
    );
    const gone = items[0]!.id;
    expect((await lena.api.delete(`/materials/${m.id}/items/${gone}`)).status).toBeLessThan(300);
    await tick(env);
    expect(await env.db.maybeOne(`select 1 from items where id = $1`, [gone])).toBeNull();
    expect((await lena.api.delete(`/materials/${m.id}/items/${gone}`)).status).toBeLessThan(300);
    // Another learner's id stays unknown.
    const tom = await onboard(env, { name: 'Tom' });
    expect((await tom.api.delete(`/materials/${m.id}/items/${gone}`)).status).toBe(404);
  });

  it('deleting during the reading yields no ready sheet, no questions and no wake-up (repro-13)', async () => {
    const m = await create(env, lena);
    for (const p of m.paths) env.storage.put(p);
    env.llm.script('extraction', async () => {
      // She deletes the sheet while the model reads it.
      expect((await lena.api.delete(`/materials/${m.id}`)).status).toBeLessThan(300);
      return sheet();
    });
    expect((await lena.api.post(`/materials/${m.id}/submit`)).status).toBe(202);
    await env.flushBackground();
    const row = await env.db.one<{ status: string }>(`select status from materials where id = $1`, [
      m.id,
    ]);
    expect(row.status).not.toBe('ready');
    expect(
      await env.db.query(`select 1 from items where material_id = $1 and archived_at is null`, [
        m.id,
      ]),
    ).toEqual([]);
    expect(
      await env.db.query(`select 1 from jobs where kind = 'buddy_check' and learner_id = $1`, [
        lena.learnerId,
      ]),
    ).toEqual([]);
    expect(env.llm.callsFor('buddy_check')).toHaveLength(0);
  });

  it('photos that arrive after the sheet was deleted are removed too', async () => {
    const m = await create(env, lena, { photos: 2 });
    env.storage.put(m.paths[0]!);
    expect((await lena.api.delete(`/materials/${m.id}`)).status).toBeLessThan(300);
    await tick(env);
    expect(env.storage.objects.has(m.paths[0]!)).toBe(false);
    // The second photo was still on its way through a signed URL.
    env.storage.put(m.paths[1]!);
    // Submitting a deleted sheet is refused and removes what arrived.
    expect((await lena.api.post(`/materials/${m.id}/submit`)).status).toBe(404);
    await tick(env);
    expect(env.storage.objects.has(m.paths[1]!)).toBe(false);
    // And without a submit: the second purge after the upload URLs expired.
    env.storage.put(m.paths[1]!);
    env.clock.hours(2);
    env.clock.minutes(1);
    await tick(env);
    expect(env.storage.objects.has(m.paths[1]!)).toBe(false);
  });

  it('a deleted sheet leaves running practice, prepared practice and its homework help (p2-HW-05)', async () => {
    const study = await send(env, lena);
    const started = await lena.api.post<SessionView>('/practice/sessions', {
      material_id: study.id,
    });
    const itemIds = started.body.items.map((i) => i.item.id);
    const step = await env.db.one<{ id: string }>(
      `insert into buddy_steps (learner_id, kind, title, state, payload, created_at)
       values ($1, 'practice', 'Hauptstädte', 'prepared', $2, $3) returning id`,
      [lena.learnerId, { item_ids: itemIds, est_minutes: 5 }, env.clock.now()],
    );
    expect((await lena.api.delete(`/materials/${study.id}`)).status).toBeLessThan(300);
    const session = (await lena.api.get<SessionView>(`/practice/sessions/${started.body.id}`)).body;
    expect(session.current_item_id).toBeNull();
    const s = await env.db.one<{ state: string; payload: { item_ids: string[] } }>(
      `select state, payload from buddy_steps where id = $1`,
      [step.id],
    );
    expect(s).toMatchObject({ state: 'planned', payload: { item_ids: [] } });

    const hw = await send(env, lena, { purpose: 'homework' });
    let home = (await lena.api.get<BuddyHome>('/buddy')).body;
    expect(home.now).toMatchObject({ type: 'resume_practice', mode: 'help' });
    expect((await lena.api.delete(`/materials/${hw.id}`)).status).toBeLessThan(300);
    home = (await lena.api.get<BuddyHome>('/buddy')).body;
    expect(home.now?.type === 'resume_practice').toBe(false);
    await tick(env);
  });

  it('a Storage outage while reading is retried, and never blamed on missing photos (M-16)', async () => {
    const m = await create(env, lena);
    for (const p of m.paths) env.storage.put(p);
    env.storage.failNext('download', 1);
    env.llm.script('extraction', { json: sheet() });
    expect((await lena.api.post(`/materials/${m.id}/submit`)).status).toBe(202);
    await env.flushBackground();
    let view = (await lena.api.get<MaterialView>(`/materials/${m.id}`)).body;
    expect(view.failure_reason).not.toBe('photos_missing');
    expect(view.status).toBe('queued');
    env.clock.minutes(2);
    await tick(env);
    view = (await lena.api.get<MaterialView>(`/materials/${m.id}`)).body;
    expect(view).toMatchObject({ status: 'ready', item_count: 2 });

    // Checking the upload while Storage is down: an honest 503, not "photos missing".
    const other = await create(env, lena);
    for (const p of other.paths) env.storage.put(p);
    env.storage.failNext('list', 1);
    const res = await lena.api.post(`/materials/${other.id}/submit`);
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: { details: { reason: 'storage_unavailable' } } });
  });

  it('labels every photo in the reading request so page numbers name real photos', async () => {
    await send(env, lena, { photos: 3 });
    const req = env.llm.callsFor('extraction')[0]!;
    const texts = req.contents[0]!.parts.flatMap((p) => ('text' in p ? [p.text] : []));
    expect(texts).toEqual(
      expect.arrayContaining(['Photo 1 of 3:', 'Photo 2 of 3:', 'Photo 3 of 3:']),
    );
  });

  it('refused runs (daily budget, outage) do not use up her retries (M-14)', async () => {
    const m = await send(env, lena, { result: { ...sheet(), readable: false, items: [] } });
    expect(m.view).toMatchObject({ status: 'failed', failure_reason: 'unreadable' });
    // Today's budget is spent: two refused retries.
    await env.db.query(
      `insert into usage_daily (learner_id, day, kind, calls) values ($1, '2026-09-28', 'extraction', 99)
       on conflict (learner_id, day, kind) do update set calls = 99`,
      [lena.learnerId],
    );
    for (let i = 0; i < 2; i++) {
      expect((await lena.api.post(`/materials/${m.id}/retry`)).status).toBe(202);
      await env.flushBackground();
      const v = (await lena.api.get<MaterialView>(`/materials/${m.id}`)).body;
      expect(v.failure_reason).toBe('budget_exhausted');
    }
    // Tomorrow: a real run is still possible.
    env.clock.advance(DAY);
    env.llm.script('extraction', { json: sheet() });
    expect((await lena.api.post(`/materials/${m.id}/retry`)).status).toBe(202);
    await env.flushBackground();
    expect((await lena.api.get<MaterialView>(`/materials/${m.id}`)).body.status).toBe('ready');
  });

  it('after the photos are purged, retrying is refused honestly (M-15)', async () => {
    const m = await send(env, lena, { result: { ...sheet(), readable: false, items: [] } });
    env.clock.advance(7 * DAY + 60_000);
    await tick(env);
    const v = (await lena.api.get<MaterialView>(`/materials/${m.id}`)).body;
    expect(v.photos_deleted).toBe(true);
    const res = await lena.api.post(`/materials/${m.id}/retry`);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { details: { reason: 'photos_deleted' } } });
  });

  it('a page added to a sheet wakes Buddy about that sheet again (repro-16)', async () => {
    const root = await send(env, lena);
    expect(env.llm.callsFor('buddy_check')).toHaveLength(1);
    const part = await send(env, lena, { completes: root.id, result: sheet([], 'x') });
    expect(part.view.merged_into).toBe(root.id);
    await tick(env);
    expect(env.llm.callsFor('buddy_check')).toHaveLength(2);
    const job = await env.db.one<{ material: string }>(
      `select payload ->> 'material_id' as material from jobs
        where kind = 'buddy_check' and learner_id = $1 order by created_at desc, seq desc limit 1`,
      [lena.learnerId],
    );
    expect(job.material).toBe(root.id);
  });

  it('a late reading still shows its page notice (from reading, not from upload)', async () => {
    const m = await create(env, lena, { photos: 2 });
    for (const p of m.paths) env.storage.put(p);
    // Sent yesterday; the reading only finishes now.
    await env.db.query(`update materials set created_at = $2 where id = $1`, [
      m.id,
      new Date(env.clock.now().getTime() - 30 * 3_600_000),
    ]);
    env.llm.script('extraction', {
      json: sheet([
        { page: 1, read: 'all', problem: null },
        { page: 2, read: 'none', problem: 'blurry' },
      ]),
    });
    expect((await lena.api.post(`/materials/${m.id}/submit`)).status).toBe(202);
    await env.flushBackground();
    const home = (await lena.api.get<BuddyHome>('/buddy')).body;
    expect(home.notice).toMatchObject({ type: 'pages_missing', material_id: m.id });
    env.clock.hours(25);
    expect((await lena.api.get<BuddyHome>('/buddy')).body.notice).toBeNull();
  });

  it('a removed memory keeps its undo window, then its words are erased everywhere (D-7)', async () => {
    const msg = await env.db.one<{ id: string }>(
      `insert into buddy_messages (learner_id, role, text, created_at)
       values ($1, 'learner', 'Ich habe ADHS', $2) returning id`,
      [lena.learnerId, env.clock.now()],
    );
    const mem = await env.db.one<{ id: string }>(
      `insert into buddy_memories (learner_id, kind, statement, source, source_message_id, quote, created_at)
       values ($1, 'fact', 'Hat ADHS', 'learner_stated', $2, 'ADHS', $3) returning id`,
      [lena.learnerId, msg.id, env.clock.now()],
    );
    await env.db.query(
      `insert into buddy_actions (learner_id, tool, args, result, created_at)
       values ($1, 'remember', $2, $3, $4)`,
      [
        lena.learnerId,
        { kind: 'fact', statement: 'Hat ADHS', quote: 'ADHS' },
        {
          tool: 'remember',
          memory_id: mem.id,
          statement: 'Hat ADHS',
          kind: 'fact',
          valid_until: null,
        },
        env.clock.now(),
      ],
    );
    const list = await lena.api.get<{ memories: Array<{ id: string; version: number }> }>(
      '/buddy/memory',
    );
    const version = list.body.memories.find((x) => x.id === mem.id)!.version;
    expect(
      (await lena.api.patch(`/buddy/memory/${mem.id}`, { retract: true, version })).status,
    ).toBe(200);
    env.clock.advance(6 * DAY);
    await tick(env);
    // Still within the undo window.
    expect(
      await env.db.maybeOne(`select 1 from buddy_memories where id = $1`, [mem.id]),
    ).not.toBeNull();
    env.clock.advance(DAY + 60_000);
    await tick(env);
    expect(
      await env.db.maybeOne(`select 1 from buddy_memories where id = $1`, [mem.id]),
    ).toBeNull();
    const action = await env.db.one<{
      args: Record<string, unknown>;
      result: { statement: string };
    }>(`select args, result from buddy_actions where learner_id = $1`, [lena.learnerId]);
    expect(JSON.stringify(action)).not.toContain('ADHS');
    expect(action.result.statement).toBe('…');
    const exported = JSON.stringify((await lena.api.get('/account/export')).body);
    expect(exported).not.toContain('Hat ADHS');
  });

  it('an outage of the model while reading does not use up a run either', async () => {
    const m = await create(env, lena);
    for (const p of m.paths) env.storage.put(p);
    for (let i = 0; i < 3; i++)
      env.llm.script('extraction', { error: new LlmError('unavailable', 'down') });
    expect((await lena.api.post(`/materials/${m.id}/submit`)).status).toBe(202);
    await env.flushBackground();
    for (let i = 0; i < 4; i++) {
      env.clock.minutes(5);
      await tick(env);
    }
    const v = (await lena.api.get<MaterialView>(`/materials/${m.id}`)).body;
    expect(v).toMatchObject({ status: 'failed', failure_reason: 'model_error' });
    const runs = await env.db.one<{ result: { uncounted?: boolean } }>(
      `select result from jobs where kind = 'extract_material' and payload ->> 'material_id' = $1`,
      [m.id],
    );
    expect(runs.result.uncounted).toBe(true);
  });
});
