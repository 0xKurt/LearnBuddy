// A sheet whose written questions the checks drop does not pass for read whole (#757).
// Found in the live M5 run of #658 (main, run 2): the reading wrote 60 + 30 pairs of a list and
// 60 questions were stored — 30 pairs in both directions. The 60 pairs of the first answer went
// without a word: a vocabulary pair without both languages is dropped by `usableItems` (it cannot
// be asked both ways or spoken), and the sheet still said it was complete. Now every written
// question the checks drop marks the sheet incomplete (the card and Buddy say so, as for #664),
// and the function log names why. docs/architecture.md §Material.
// requires live verification in Claude Code session (needs a running Postgres; scripted model)

import { randomUUID } from 'node:crypto';

import type { MaterialView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const pair = (n: number, langs: boolean) => ({
  kind: 'vocab',
  prompt: `mot ${n}`,
  answer: `Wort ${n}`,
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Wörter',
  difficulty: 2,
  prompt_lang: langs ? 'fr' : null,
  lang: langs ? 'de' : null,
  figure: null,
  source_excerpt: null,
});

const reading = (items: unknown[]) => ({
  is_learning_material: true,
  readable: true,
  title: 'Vokabeln',
  subject: { name: 'Französisch', kind: 'french' },
  extracted_text: 'mot 1 – Wort 1 …',
  items,
  more_items: false,
  pages: [{ page: 1, read: 'all', problem: null }],
});

describe.skipIf(!dbReady)('written questions the checks drop (#757)', () => {
  let env: TestEnv;
  let lena: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T14:00:00Z' });
    lena = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    env.llm.script('buddy_check', {
      json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null },
    });
  });
  afterEach(() => env.closeChecked());

  async function read(items: unknown[]): Promise<{ id: string; incomplete: boolean; n: number }> {
    env.llm.script('extraction', { json: reading(items) });
    const created = await lena.api.post<{
      material: MaterialView;
      uploads: Array<{ path: string }>;
    }>('/materials', { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'] });
    for (const u of created.body.uploads) env.storage.put(u.path);
    await lena.api.post(`/materials/${created.body.material.id}/submit`);
    await env.flushBackground();
    const m = await env.db.one<{ items_incomplete: boolean; n: number }>(
      `select items_incomplete, (select count(*)::int from items i where i.material_id = m.id) as n
         from materials m where m.id = $1`,
      [created.body.material.id],
    );
    return { id: created.body.material.id, incomplete: m.items_incomplete, n: m.n };
  }

  it('marks the sheet incomplete when pairs without their languages are dropped', async () => {
    const warn = vi.spyOn(console, 'warn');
    const m = await read([pair(1, false), pair(2, false), pair(3, true)]);
    // The one whole pair, asked both ways.
    expect(m.n).toBe(2);
    expect(m.incomplete).toBe(true);
    const view = (await lena.api.get<MaterialView>(`/materials/${m.id}`)).body;
    expect(view.items_incomplete).toBe(true);
    expect(warn.mock.calls.flat().join(' ')).toContain(
      '2 written questions dropped (vocab_languages)',
    );
  });

  it('leaves a sheet whose every question was kept complete', async () => {
    const m = await read([pair(1, true), pair(2, true)]);
    expect(m.n).toBe(4);
    expect(m.incomplete).toBe(false);
  });
});
