// What follows a ready sheet runs beside Buddy's look at it, not before (F4-a, KI-Audit 14.10.,
// issue #654). Measured: the check started 1.72 s after `ready`, because the search index and the
// concept-image pass ran first — only order, no dependency — and that pass downloaded every photo a
// second time. Now Buddy's check starts while the image pass still works, and the pass crops from
// the pages the reading already loaded. docs/architecture.md §Material.
// requires live verification in Claude Code session (needs a running Postgres; sharp runs for
// real on an in-test JPEG, only the model and Storage are testing/fakes.ts)

import { randomUUID } from 'node:crypto';

import type { MaterialView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { pageJpeg } from '../testing/pagePhoto.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

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

const SHEET = {
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
};

describe.skipIf(!dbReady)('what follows a ready sheet (#654)', () => {
  let env: TestEnv;
  let lena: Learner;
  let release = () => undefined as void;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T14:00:00Z' });
    lena = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterEach(async () => {
    release();
    await env.closeChecked();
  });

  it("starts Buddy's check while the image pass still works, and downloads each photo once", async () => {
    env.llm.script('extraction', { json: SHEET });
    const figuresDone = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    // The image pass is slow: it answers only when the test lets it.
    env.llm.script('figures', async () => {
      await figuresDone;
      return { assets: [] };
    });
    env.llm.script('buddy_check', {
      json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null },
    });
    const downloads = vi.spyOn(env.storage, 'download');

    const created = await lena.api.post<{
      material: MaterialView;
      uploads: Array<{ path: string }>;
    }>('/materials', { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'] });
    for (const u of created.body.uploads) env.storage.put(u.path, await pageJpeg());
    expect((await lena.api.post(`/materials/${created.body.material.id}/submit`)).status).toBe(202);
    // Wait (bounded) until Buddy has looked — with the image pass still held.
    for (let i = 0; i < 100 && env.llm.callsFor('buddy_check').length === 0; i++)
      await new Promise((r) => setTimeout(r, 10));
    expect(env.llm.callsFor('figures')).toHaveLength(1);
    expect(env.llm.callsFor('buddy_check')).toHaveLength(1);

    release();
    await env.flushBackground();
    // One photo, read once: the image pass cropped from the bytes the reading loaded.
    expect(downloads).toHaveBeenCalledTimes(1);
  });
});
