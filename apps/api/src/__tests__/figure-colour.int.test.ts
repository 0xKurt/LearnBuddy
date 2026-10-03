// A crop whose COLOUR is the content keeps it (issue #223 point 1).
//
// Every crop used to go through `.greyscale()`. For a worksheet of line drawings that is
// deliberate — it reads like a scan — but where the colour IS the content it took the question
// away: a map, a painting, a colour wheel, an indicator, a stained specimen, a chart with a
// colour key. Measured on the page this test builds, the old clean-up returned the blue, the
// green and the red area as three almost equal greys, so "welche Farbe zeigt der Indikator?"
// had no answer left on her own sheet.
//
// What decides is ONE validated fact the reading reports per figure
// (`colour_carries_meaning`); `materials/images.ts` is the only thing that decides what happens
// to the pixels because of it (CLAUDE.md rule 1). These tests send the SAME page twice and
// change nothing but that fact, so what is proven is the decision and not the picture.
// docs/architecture.md §Material.
// requires live verification in Claude Code session (needs a running Postgres; sharp runs for
// real on an in-test JPEG, only the model and Storage are testing/fakes.ts)

import { randomUUID } from 'node:crypto';

import type { MaterialView } from '@learnbuddy/shared-types/contracts';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

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
  topic: 'Europa',
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
  title: 'Klimazonen',
  subject: { name: 'Erdkunde', kind: 'geography' },
  extracted_text: 'Die Karte zeigt drei Zonen',
  items: [item('Welche Farbe hat die kalte Zone?', 'blau')],
});

/**
 * One figure box over the top-left of the page, with the colour fact as given. `undefined`
 * leaves the field out altogether — a broken answer, not a judgement about the picture.
 */
const figures = (colour: boolean | undefined) => ({
  assets: [
    {
      page_index: 0,
      box: [0.02, 0.02, 0.6, 0.6],
      label: 'Karte mit drei Zonen',
      item_indices: [0],
      ...(colour === undefined ? {} : { colour_carries_meaning: colour }),
    },
  ],
});

/**
 * A photographed page whose figure is a colour-coded map: a blue, a green and a red area with
 * black outlines and a caption line under them. The paper is neutral and real black ink is on
 * the page, so the contrast stretch both paths share has nothing to overdo — what the two
 * stored crops differ by is the greyscale step, nothing else.
 */
async function colourPage(): Promise<Uint8Array> {
  const block = (w: number, h: number, c: { r: number; g: number; b: number }) => ({
    input: { create: { width: w, height: h, channels: 3 as const, background: c } },
  });
  const ink = { r: 18, g: 18, b: 20 };
  return sharp({
    create: { width: 600, height: 400, channels: 3, background: { r: 250, g: 250, b: 248 } },
  })
    .composite([
      // Black frames, each a little larger than the area that sits on it.
      { ...block(124, 184, ink), left: 28, top: 18 },
      { ...block(124, 184, ink), left: 158, top: 18 },
      { ...block(124, 184, ink), left: 288, top: 18 },
      { ...block(120, 180, { r: 40, g: 90, b: 210 }), left: 30, top: 20 },
      { ...block(120, 180, { r: 60, g: 160, b: 70 }), left: 160, top: 20 },
      { ...block(120, 180, { r: 215, g: 65, b: 50 }), left: 290, top: 20 },
      // A caption, so the crop holds printed text like a real figure does.
      { ...block(380, 8, ink), left: 30, top: 215 },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}

/** A plain black-on-white worksheet figure: nothing in it that colour could carry. */
async function greyPage(): Promise<Uint8Array> {
  const strokes = Array.from({ length: 10 }, (_, i) => ({
    input: {
      create: { width: 300, height: 3, channels: 3 as const, background: { r: 18, g: 18, b: 20 } },
    },
    left: 30,
    top: 25 + i * 18,
  }));
  return sharp({
    create: { width: 600, height: 400, channels: 3, background: { r: 250, g: 250, b: 247 } },
  })
    .composite(strokes)
    .jpeg({ quality: 92 })
    .toBuffer();
}

type Colours = {
  /** Every pixel has R = G = B: the crop carries no hue at all. */
  grey: boolean;
  /** The largest max(R,G,B) − min(R,G,B) in the crop. */
  maxChroma: number;
  /** Pixels that are clearly blue rather than red, and the other way round. */
  blueish: number;
  reddish: number;
};

/** What a stored crop really holds, read off its pixels. */
async function coloursOf(bytes: Uint8Array): Promise<Colours> {
  const { data, info } = await sharp(Buffer.from(bytes))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out: Colours = { grey: true, maxChroma: 0, blueish: 0, reddish: 0 };
  for (let i = 0; i + 2 < data.length; i += info.channels) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (chroma > 0) out.grey = false;
    if (chroma > out.maxChroma) out.maxChroma = chroma;
    if (b - r >= 60) out.blueish++;
    if (r - b >= 60) out.reddish++;
  }
  return out;
}

/** Create → upload the given page → submit → extraction and the figures pass run. */
async function send(env: TestEnv, l: Learner, page: Uint8Array): Promise<string> {
  const created = await l.api.post<{ material: MaterialView; uploads: Array<{ path: string }> }>(
    '/materials',
    { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'] },
  );
  expect(created.status).toBe(201);
  for (const u of created.body.uploads) env.storage.put(u.path, page);
  expect((await l.api.post(`/materials/${created.body.material.id}/submit`)).status).toBe(202);
  await env.flushBackground();
  const view = await l.api.get<MaterialView>(`/materials/${created.body.material.id}`);
  expect(view.body.status).toBe('ready');
  return created.body.material.id;
}

/** The one crop stored for this sheet, as bytes. */
async function crop(env: TestEnv, materialId: string): Promise<Uint8Array> {
  const rows = await env.db.query<{ storage_path: string; item_ids: string[] }>(
    `select mi.storage_path,
            array(select i.id::text from items i where i.image_id = mi.id) as item_ids
       from material_images mi where mi.material_id = $1`,
    [materialId],
  );
  expect(rows).toHaveLength(1);
  // The crop hangs on the question it helps answer, whichever clean-up it got.
  expect(rows[0]!.item_ids).toHaveLength(1);
  const bytes = env.storage.objects.get(rows[0]!.storage_path);
  expect(bytes).toBeDefined();
  return bytes!;
}

describe.skipIf(!dbReady)('a crop whose colour is the content (issue #223 point 1)', () => {
  let env: TestEnv;
  let lena: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T14:00:00Z' });
    lena = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    env.llm.byDefault('buddy_check', WAIT);
  });
  afterEach(() => env.closeChecked());

  it('keeps the colours when they carry meaning, and greys the same page when they do not', async () => {
    const page = await colourPage();

    env.llm.script('extraction', { json: sheet() });
    env.llm.script('figures', { json: figures(true) });
    const kept = await coloursOf(await crop(env, await send(env, lena, page)));
    // Blue stayed blue and red stayed red: the question about the colour can be answered.
    expect(kept.grey).toBe(false);
    expect(kept.maxChroma).toBeGreaterThan(100);
    expect(kept.blueish).toBeGreaterThan(1000);
    expect(kept.reddish).toBeGreaterThan(1000);

    // The same pixels, the same box, one fact different.
    env.llm.script('extraction', { json: sheet() });
    env.llm.script('figures', { json: figures(false) });
    const greyed = await coloursOf(await crop(env, await send(env, lena, page)));
    expect(greyed).toMatchObject({ grey: true, maxChroma: 0, blueish: 0, reddish: 0 });
  });

  it('greys the crop when the reading reports no colour fact at all, and keeps the figure', async () => {
    // A missing field is a broken answer, not a judgement about the picture: the figure is
    // still attached to its question and gets exactly the clean-up it got before this change.
    env.llm.script('extraction', { json: sheet() });
    env.llm.script('figures', { json: figures(undefined) });
    const bytes = await crop(env, await send(env, lena, await colourPage()));
    expect(await coloursOf(bytes)).toMatchObject({ grey: true, maxChroma: 0 });
  });

  it('costs a black-and-white figure nothing when the reading calls its colour meaningful', async () => {
    // The wrong answer in the cheap direction: a plain line drawing kept "in colour" has no
    // colour to keep. It is a slightly less crisp scan, never a question without an answer.
    env.llm.script('extraction', { json: sheet() });
    env.llm.script('figures', { json: figures(true) });
    const bytes = await crop(env, await send(env, lena, await greyPage()));
    const got = await coloursOf(bytes);
    expect(got.blueish).toBe(0);
    expect(got.reddish).toBe(0);
    // No hue anywhere worth the name — a JPEG of black on white carries a little noise.
    expect(got.maxChroma).toBeLessThan(40);
  });

  it('asks the model for the fact, as a required field, and never for a filter', async () => {
    env.llm.script('extraction', { json: sheet() });
    env.llm.script('figures', { json: figures(true) });
    await send(env, lena, await colourPage());
    const call = env.llm.callsFor('figures')[0]!;
    const Asked = z.object({
      properties: z.object({
        assets: z.object({
          items: z.object({
            required: z.array(z.string()),
            properties: z.object({
              colour_carries_meaning: z.object({ type: z.literal('boolean') }),
            }),
          }),
        }),
      }),
    });
    const asked = Asked.parse(call.schema).properties.assets.items;
    expect(asked.required).toContain('colour_carries_meaning');
    // One fact about the picture — the model never names a filter, a parameter or an order.
    expect(call.system).toContain('colour_carries_meaning');
    expect(call.system).not.toMatch(/greyscale|sharpen|crop in colour/i);
    expect(call.promptVersion).toBe('figures-v2');
  });
});
