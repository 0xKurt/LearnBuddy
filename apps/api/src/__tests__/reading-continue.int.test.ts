// A continued reading writes only the questions still missing (F6, KI-Audit 14.10., issue #658).
// It used to be told to write "the same faithful transcription as before" and "the same page
// reports" — which the code then threw away, keeping the first reading's. That is the slowest
// part of an answer to write again for nothing. Now it is told both are stored already, and an
// empty transcription and no page reports keep what the first reading stored.
// docs/architecture.md §Material.
// requires live verification in Claude Code session (needs a running Postgres; scripted model)

import { randomUUID } from 'node:crypto';

import type { MaterialView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const pair = (n: number) => ({
  kind: 'vocab',
  prompt: `mot ${n}`,
  answer: `Wort ${n}`,
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Wörter',
  difficulty: 2,
  prompt_lang: 'fr',
  lang: 'de',
  figure: null,
  source_excerpt: null,
});

const reading = (over: Record<string, unknown>) => ({
  is_learning_material: true,
  readable: true,
  title: 'Lange Liste',
  subject: { name: 'Französisch', kind: 'french' },
  ...over,
});

describe.skipIf(!dbReady)('a continued reading (#658)', () => {
  let env: TestEnv;
  let lena: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T14:00:00Z' });
    lena = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterEach(() => env.closeChecked());

  it('is not asked to write the transcription again, and its empty one keeps the first', async () => {
    env.llm.script('extraction', {
      json: reading({
        extracted_text: 'mot 1 – Wort 1\nmot 2 – Wort 2\nmot 3 – Wort 3',
        items: [pair(1), pair(2)],
        more_items: true,
        pages: [{ page: 1, read: 'part', problem: 'cut_off' }],
      }),
    });
    env.llm.script('extraction', {
      json: reading({ extracted_text: '', items: [pair(3)], more_items: false, pages: [] }),
    });
    env.llm.script('buddy_check', {
      json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null },
    });
    const created = await lena.api.post<{
      material: MaterialView;
      uploads: Array<{ path: string }>;
    }>('/materials', { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'] });
    for (const u of created.body.uploads) env.storage.put(u.path);
    await lena.api.post(`/materials/${created.body.material.id}/submit`);
    await env.flushBackground();

    const [, second] = env.llm.callsFor('extraction');
    expect(second!.system).toContain('extracted_text: "" — the transcription is stored already');
    expect(second!.system).not.toContain('the same faithful transcription as before');

    const m = await env.db.one<{ extracted_text: string; page_problems: unknown }>(
      `select extracted_text, page_problems from materials where id = $1`,
      [created.body.material.id],
    );
    expect(m.extracted_text).toBe('mot 1 – Wort 1\nmot 2 – Wort 2\nmot 3 – Wort 3');
    expect(m.page_problems).toEqual([{ page: 1, read: 'part', problem: 'cut_off' }]);
    const view = (await lena.api.get<MaterialView>(`/materials/${created.body.material.id}`)).body;
    expect(view.status).toBe('ready');
  });
});
