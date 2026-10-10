// Concept images (issue #50): real crops from the photographed pages — never generated
// pictures. The vision pass proposes boxes, sharp crops for real, the crop hangs on the
// questions it helps answer and leaves Storage when the material or the question does.
// Images are a bonus: whatever fails (vision, Storage, budget), the sheet stays ready.
// docs/architecture.md §Material; docs/privacy.md §What is stored.
// requires live verification in Claude Code session (needs a running Postgres; sharp
// runs for real on an in-test JPEG, only the model and Storage are testing/fakes.ts)

import { randomUUID } from 'node:crypto';

import type { MaterialView, SessionView } from '@learnbuddy/shared-types/contracts';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LlmError } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { pageJpeg } from '../testing/pagePhoto.js';
import {
  createTestEnv,
  onboard,
  TEST_TICK_SECRET,
  type Learner,
  type TestEnv,
} from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const item = (prompt: string, answer: string) => ({
  kind: 'short',
  prompt,
  answer,
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Uhrzeit',
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
});

const sheet = () => ({
  is_learning_material: true,
  readable: true,
  pages: [],
  title: 'Die Uhr',
  subject: { name: 'Sachkunde', kind: 'math' },
  extracted_text: 'Zifferblatt, Stunden und Minuten',
  items: [
    item('Wie viele Stunden zeigt das Zifferblatt?', '12'),
    item('Wie viele Minuten hat eine Stunde?', '60'),
  ],
});

/** One figure box on page 0, attached to the questions named. */
const figures = (itemIndices: number[]) => ({
  assets: [
    {
      page_index: 0,
      box: [0.05, 0.05, 0.55, 0.55],
      label: 'Zifferblatt mit Zeigern',
      item_indices: itemIndices,
    },
  ],
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

/** Create → upload a real JPEG page → submit → extraction (and the figures pass) run. */
async function send(env: TestEnv, l: Learner): Promise<{ id: string; view: MaterialView }> {
  const created = await l.api.post<{ material: MaterialView; uploads: Array<{ path: string }> }>(
    '/materials',
    { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'] },
  );
  expect(created.status).toBe(201);
  const id = created.body.material.id;
  for (const u of created.body.uploads) env.storage.put(u.path, await pageJpeg());
  expect((await l.api.post(`/materials/${id}/submit`)).status).toBe(202);
  await env.flushBackground();
  const view = (await l.api.get<MaterialView>(`/materials/${id}`)).body;
  return { id, view };
}

function cropPaths(env: TestEnv): string[] {
  return [...env.storage.objects.keys()].filter((p) => /\/figure-[0-9a-f-]+\.png$/.test(p));
}

type ImageRow = { id: string; material_id: string; storage_path: string; label: string };

async function imageRows(env: TestEnv, materialId: string): Promise<ImageRow[]> {
  return env.db.query<ImageRow>(
    `select id, material_id, storage_path, label from material_images where material_id = $1`,
    [materialId],
  );
}

describe.skipIf(!dbReady)('concept images (issue #50)', () => {
  let env: TestEnv;
  let lena: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T14:00:00Z' });
    lena = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    env.llm.byDefault('buddy_check', WAIT);
  });
  afterEach(() => env.closeChecked());

  it('crops the figure the vision pass found and shows it with the question', async () => {
    env.llm.script('extraction', { json: sheet() });
    env.llm.script('figures', { json: figures([0]) });
    const m = await send(env, lena);
    expect(m.view.status).toBe('ready');

    // The vision pass saw the page and the questions with their indices.
    const call = env.llm.callsFor('figures')[0]!;
    const text = call.contents[0]!.parts.filter((p) => 'text' in p).map((p) =>
      'text' in p ? p.text : '',
    );
    expect(text.join('\n')).toContain('[0] Wie viele Stunden zeigt das Zifferblatt?');
    expect(call.contents[0]!.parts.some((p) => 'inlineData' in p)).toBe(true);

    // A real PNG crop is in Storage, and the row knows its size and label.
    const rows = await imageRows(env, m.id);
    expect(rows).toHaveLength(1);
    expect(cropPaths(env)).toEqual([rows[0]!.storage_path]);
    const meta = await sharp(
      Buffer.from(env.storage.objects.get(rows[0]!.storage_path)!),
    ).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBeGreaterThanOrEqual(16);

    // Exactly the named question carries the image; the other has none.
    const items = await env.db.query<{ prompt: string; image_id: string | null }>(
      `select prompt, image_id from items where material_id = $1 order by seq`,
      [m.id],
    );
    expect(items[0]).toMatchObject({ image_id: rows[0]!.id });
    expect(items[1]).toMatchObject({ image_id: null });

    // The session view carries a signed URL, size and label for that question only.
    const started = await lena.api.post<SessionView>('/practice/sessions', { material_id: m.id });
    expect(started.status).toBe(201);
    const withImage = started.body.items.filter((i) => i.item.image !== null);
    expect(withImage).toHaveLength(1);
    expect(withImage[0]!.item.image).toMatchObject({ label: 'Zifferblatt mit Zeigern' });
    expect(withImage[0]!.item.image!.url).toContain('signed');
    expect(withImage[0]!.item.image!.width).toBeGreaterThan(0);
    expect(withImage[0]!.item.image!.height).toBeGreaterThan(0);

    // A Storage that cannot sign right now costs the image, never the session (rule 5).
    env.storage.failNext('sign');
    const again = await lena.api.get<SessionView>(`/practice/sessions/${started.body.id}`);
    expect(again.status).toBe(200);
    expect(again.body.items.every((i) => i.item.image === null)).toBe(true);
    const healed = await lena.api.get<SessionView>(`/practice/sessions/${started.body.id}`);
    expect(healed.body.items.some((i) => i.item.image !== null)).toBe(true);
  });

  it('a vision pass that finds nothing, nonsense or fails leaves the sheet ready without images', async () => {
    // Nonsense: a page that was never sent, and an unparseable answer.
    env.llm.script('extraction', { json: sheet() });
    env.llm.script('figures', {
      json: { assets: [{ page_index: 7, box: [0, 0, 1, 1], label: 'x', item_indices: [0] }] },
    });
    const a = await send(env, lena);
    expect(a.view.status).toBe('ready');
    expect(await imageRows(env, a.id)).toEqual([]);

    env.llm.script('extraction', { json: sheet() });
    env.llm.script('figures', { json: 'kein JSON-Objekt' });
    const b = await send(env, lena);
    expect(b.view.status).toBe('ready');
    expect(await imageRows(env, b.id)).toEqual([]);

    // A model outage during the pass is logged, never a failure of the reading.
    env.llm.script('extraction', { json: sheet() });
    env.llm.script('figures', { error: new LlmError('unavailable', 'down') });
    const c = await send(env, lena);
    expect(c.view.status).toBe('ready');
    expect(await imageRows(env, c.id)).toEqual([]);
    expect(cropPaths(env)).toEqual([]);
  });

  it('an exhausted figures budget skips the pass; the sheet is ready', async () => {
    await env.db.query(
      `insert into usage_daily (learner_id, day, kind, calls) values ($1, '2026-09-28', 'figures', 12)`,
      [lena.learnerId],
    );
    env.llm.script('extraction', { json: sheet() });
    const m = await send(env, lena);
    expect(m.view.status).toBe('ready');
    expect(env.llm.callsFor('figures')).toEqual([]);
    expect(await imageRows(env, m.id)).toEqual([]);
  });

  it('a Storage outage while uploading the crop costs the image, not the sheet', async () => {
    env.llm.script('extraction', { json: sheet() });
    env.llm.script('figures', { json: figures([0]) });
    const created = await lena.api.post<{
      material: MaterialView;
      uploads: Array<{ path: string }>;
    }>('/materials', { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'] });
    for (const u of created.body.uploads) env.storage.put(u.path, await pageJpeg());
    env.storage.failNext('upload');
    expect((await lena.api.post(`/materials/${created.body.material.id}/submit`)).status).toBe(202);
    await env.flushBackground();
    const view = (await lena.api.get<MaterialView>(`/materials/${created.body.material.id}`)).body;
    expect(view.status).toBe('ready');
    expect(await imageRows(env, created.body.material.id)).toEqual([]);
    expect(cropPaths(env)).toEqual([]);
  });

  it('deleting the material erases its crops from Storage with the content (D-7)', async () => {
    env.llm.script('extraction', { json: sheet() });
    env.llm.script('figures', { json: figures([0, 1]) });
    const m = await send(env, lena);
    expect(cropPaths(env)).toHaveLength(1);

    expect((await lena.api.delete(`/materials/${m.id}`)).status).toBe(204);
    await tick(env);
    expect(await imageRows(env, m.id)).toEqual([]);
    expect(cropPaths(env)).toEqual([]);
    // Nothing still owed to Storage.
    expect(await env.db.query(`select path from storage_deletions`)).toEqual([]);
  });

  it('a deleted question keeps the shared crop alive until the last question goes', async () => {
    env.llm.script('extraction', { json: sheet() });
    env.llm.script('figures', { json: figures([0, 1]) });
    const m = await send(env, lena);
    const items = await env.db.query<{ id: string }>(
      `select id from items where material_id = $1 order by seq`,
      [m.id],
    );
    expect(items).toHaveLength(2);

    // Both questions show the same figure: deleting one keeps it for the other.
    expect((await lena.api.delete(`/materials/${m.id}/items/${items[0]!.id}`)).status).toBe(204);
    await tick(env);
    expect(await imageRows(env, m.id)).toHaveLength(1);
    expect(cropPaths(env)).toHaveLength(1);

    // The last question that showed it goes: the crop leaves Storage too.
    expect((await lena.api.delete(`/materials/${m.id}/items/${items[1]!.id}`)).status).toBe(204);
    await tick(env);
    expect(await imageRows(env, m.id)).toEqual([]);
    expect(cropPaths(env)).toEqual([]);
  });
});
