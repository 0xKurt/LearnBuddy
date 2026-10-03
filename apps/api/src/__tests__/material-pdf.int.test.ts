// Worksheets as PDF (WhatsApp, IServ, Schul-Cloud, Dateien): a PDF goes to the model
// as it is, each PDF page is a page of the material, and the 20-page limit holds for
// photos and PDF pages together. A file that cannot be read as a PDF, PDFs too large
// for the model call or too many pages end at submit with an honest reason — and the
// files are deleted at once. docs/architecture.md §Material, docs/privacy.md.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { MaterialView } from '@learnbuddy/shared-types/contracts';
import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const WAIT = { json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null } };

const item = (prompt: string, answer: string) => ({
  kind: 'short',
  prompt,
  answer,
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Brüche',
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
});

const sheet = (pages: unknown) => ({
  is_learning_material: true,
  readable: true,
  pages,
  title: 'Brüche erweitern',
  subject: { name: 'Mathe', kind: 'math' },
  extracted_text: 'Erweitere 1/2 mit 3.',
  items: [item('Erweitere 1/2 mit 3.', '3/6'), item('Erweitere 2/3 mit 2.', '4/6')],
  other_subject: null,
});

async function pdfOf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) doc.addPage([595, 842]).drawText(`Seite ${i + 1}`);
  return doc.save();
}

type Created = { material: MaterialView; uploads: Array<{ position: number; path: string }> };

async function reserve(l: Learner, mimes: string[]): Promise<Created> {
  const res = await l.api.post<Created>('/materials', {
    client_request_id: randomUUID(),
    photo_mimes: mimes,
  });
  expect(res.status).toBe(201);
  return res.body;
}

describe.skipIf(!dbReady)('worksheets as PDF', () => {
  let env: TestEnv;
  let lena: Learner;
  let tom: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T14:00:00Z' });
    lena = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    tom = await onboard(env, { relation: 'child', name: 'Tom', birthDate: '2013-05-01' });
    env.llm.byDefault('buddy_check', WAIT);
  });
  afterEach(() => env.closeChecked());

  it('reads a PDF and a photo as one sheet: its pages count, the model gets the PDF', async () => {
    const created = await reserve(lena, ['application/pdf', 'image/jpeg']);
    expect(created.uploads.map((u) => u.path.split('.').at(-1))).toEqual(['pdf', 'jpg']);
    env.storage.put(created.uploads[0]!.path, await pdfOf(3));
    env.storage.put(created.uploads[1]!.path);
    env.llm.script('extraction', {
      json: sheet([
        { page: 1, read: 'all', problem: null },
        { page: 2, read: 'none', problem: 'not_material' },
        { page: 3, read: 'all', problem: null },
        { page: 4, read: 'none', problem: 'not_material' },
      ]),
    });
    const id = created.material.id;
    // Tom cannot send her material.
    expect((await tom.api.post(`/materials/${id}/submit`)).status).toBe(404);
    const submitted = await lena.api.post<MaterialView>(`/materials/${id}/submit`);
    expect(submitted.status).toBe(202);
    expect(submitted.body).toMatchObject({ status: 'queued', photo_count: 4 });
    // A repeat (the answer was lost) changes nothing.
    expect((await lena.api.post(`/materials/${id}/submit`)).status).toBe(202);
    await env.flushBackground();

    const m = (await lena.api.get<MaterialView>(`/materials/${id}`)).body;
    expect(m).toMatchObject({
      status: 'ready',
      item_count: 2,
      photo_count: 4,
      page_problems: [
        { page: 2, read: 'none', problem: 'not_material' },
        { page: 4, read: 'none', problem: 'not_material' },
      ],
    });
    const calls = env.llm.callsFor('extraction');
    expect(calls).toHaveLength(1);
    const parts = calls[0]!.contents[0]!.parts;
    const labels = parts.flatMap((p) => ('text' in p ? [p.text] : []));
    expect(labels).toContain('PDF with pages 1–3 of 4 (one page report per PDF page):');
    expect(labels).toContain('Photo 4 of 4:');
    const mimes = parts.flatMap((p) => ('inlineData' in p ? [p.inlineData.mimeType] : []));
    expect(mimes).toEqual(['application/pdf', 'image/jpeg']);

    const pages = await env.db.query<{ position: number; page_count: number | null }>(
      `select position, page_count from material_photos where material_id = $1 order by position`,
      [id],
    );
    expect(pages).toEqual([
      { position: 0, page_count: 3 },
      { position: 1, page_count: null },
    ]);
    // The photo of something else goes at once; the PDF (one foreign page among the
    // sheet's pages) is kept for the retention like any sheet, then deleted.
    const purges = await env.db.query<{ payload: { positions?: number[] }; run_at: Date }>(
      `select payload, run_at from jobs where kind = 'purge_photos' and payload ->> 'material_id' = $1
        order by run_at`,
      [id],
    );
    expect(purges.map((p) => p.payload.positions ?? null)).toEqual([[1], null]);
    expect(purges[1]!.run_at.toISOString()).toBe('2026-10-05T14:00:00.000Z');
  });

  it('a PDF alone: every page is reported, a cut-off page is named', async () => {
    const created = await reserve(lena, ['application/pdf']);
    env.storage.put(created.uploads[0]!.path, await pdfOf(2));
    env.llm.script('extraction', {
      json: sheet([
        { page: 1, read: 'all', problem: null },
        { page: 2, read: 'part', problem: 'cut_off' },
      ]),
    });
    expect((await lena.api.post(`/materials/${created.material.id}/submit`)).status).toBe(202);
    await env.flushBackground();
    const m = (await lena.api.get<MaterialView>(`/materials/${created.material.id}`)).body;
    expect(m).toMatchObject({
      status: 'ready',
      photo_count: 2,
      page_problems: [{ page: 2, read: 'part', problem: 'cut_off' }],
    });
    // No page is foreign: nothing is deleted before the retention.
    const now = await env.db.one<{ n: number }>(
      `select count(*)::int as n from jobs where kind = 'purge_photos'
         and payload ->> 'material_id' = $1 and payload ? 'positions'`,
      [created.material.id],
    );
    expect(now.n).toBe(0);
  });

  it('more than 20 pages in all: refused at submit, the files are deleted at once', async () => {
    const created = await reserve(lena, ['image/jpeg', 'application/pdf']);
    env.storage.put(created.uploads[0]!.path);
    env.storage.put(created.uploads[1]!.path, await pdfOf(20));
    const res = await lena.api.post<{ error: { code: string; details: Record<string, unknown> } }>(
      `/materials/${created.material.id}/submit`,
    );
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({
      code: 'invalid_input',
      details: { reason: 'too_many_pages', pages: 21, max: 20 },
    });
    // Nothing is read, the material is gone from her view, and its files leave Storage now.
    expect((await lena.api.get(`/materials/${created.material.id}`)).status).toBe(404);
    const purge = await env.db.one<{ run_at: Date }>(
      `select run_at from jobs where kind = 'purge_photos' and payload ->> 'material_id' = $1`,
      [created.material.id],
    );
    expect(purge.run_at.toISOString()).toBe('2026-09-28T14:00:00.000Z');
    expect(env.llm.callsFor('extraction')).toHaveLength(0);
  });

  it('a file that is not a PDF, or PDFs too large for the model call, are refused', async () => {
    const broken = await reserve(lena, ['application/pdf']);
    env.storage.put(broken.uploads[0]!.path, new TextEncoder().encode('%PDF-1.7 kaputt'));
    const a = await lena.api.post<{ error: { details: Record<string, unknown> } }>(
      `/materials/${broken.material.id}/submit`,
    );
    expect(a.status).toBe(422);
    expect(a.body.error.details).toMatchObject({ reason: 'file_unreadable', position: 0 });

    const big = await reserve(lena, ['application/pdf']);
    env.storage.put(big.uploads[0]!.path, new Uint8Array(15 * 1024 * 1024 + 1));
    const b = await lena.api.post<{ error: { details: Record<string, unknown> } }>(
      `/materials/${big.material.id}/submit`,
    );
    expect(b.status).toBe(422);
    expect(b.body.error.details).toMatchObject({ reason: 'file_too_large', max_mb: 15 });

    // Other files are a new material: the refused one blocks nothing.
    const again = await lena.api.post<Created>('/materials', {
      client_request_id: randomUUID(),
      photo_mimes: ['application/pdf'],
    });
    expect(again.status).toBe(201);
    expect(env.llm.callsFor('extraction')).toHaveLength(0);
  });

  it('Storage out while counting pages: she is told to retry, nothing is lost', async () => {
    const created = await reserve(lena, ['application/pdf']);
    env.storage.put(created.uploads[0]!.path, await pdfOf(1));
    env.storage.failNext('download');
    const res = await lena.api.post<{ error: { details: Record<string, unknown> } }>(
      `/materials/${created.material.id}/submit`,
    );
    expect(res.status).toBe(503);
    expect(res.body.error.details).toMatchObject({ reason: 'storage_unavailable' });
    expect(
      (await lena.api.get<MaterialView>(`/materials/${created.material.id}`)).body.status,
    ).toBe('awaiting_upload');
    env.llm.script('extraction', { json: sheet([{ page: 1, read: 'all', problem: null }]) });
    expect((await lena.api.post(`/materials/${created.material.id}/submit`)).status).toBe(202);
    await env.flushBackground();
    expect(
      (await lena.api.get<MaterialView>(`/materials/${created.material.id}`)).body.status,
    ).toBe('ready');
  });

  it('only the listed file types are taken', async () => {
    const res = await lena.api.post('/materials', {
      client_request_id: randomUUID(),
      photo_mimes: ['application/zip'],
    });
    expect(res.status).toBe(422);
  });
});
