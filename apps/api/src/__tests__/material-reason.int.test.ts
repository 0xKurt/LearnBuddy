// A sheet's task that asks her to justify her answer stays a free text the tutor reads (#642,
// item 9): a comparison with "Begründe" had become a plain choice of two, graded by its index,
// and the reason she was asked for had nowhere to go. docs/architecture.md §Material.
// requires live verification in Claude Code session (needs a running Postgres; scripted model)

import { randomUUID } from 'node:crypto';

import type { MaterialView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const COMPARE = 'Welcher Bruch ist größer: $\\frac{2}{3}$ oder $\\frac{3}{5}$? Begründe.';
const COMPARE_BARE = 'Welcher Bruch ist kleiner: $\\frac{1}{4}$ oder $\\frac{1}{3}$? Begründe.';
const PLAIN = 'Welcher Bruch ist größer: $\\frac{3}{4}$ oder $\\frac{2}{4}$?';
const SOLUTION =
  'Auf den Nenner 15 gebracht ist $\\frac{2}{3} = \\frac{10}{15}$ und $\\frac{3}{5} = \\frac{9}{15}$. Also ist $\\frac{2}{3}$ größer.';

const choice = (over: Record<string, unknown>) => ({
  kind: 'multiple_choice',
  accepted_answers: [],
  unit: null,
  topic: 'Brüche vergleichen',
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
  hints: [],
  worked_solution: null,
  ...over,
});

const sheet = {
  is_learning_material: true,
  readable: true,
  title: 'Brüche vergleichen',
  subject: { name: 'Mathe', kind: 'math' },
  extracted_text: '1. Welcher Bruch ist größer: 2/3 oder 3/5? Begründe.',
  items: [
    // Marked as asking for a reason, written as a choice anyway: kept as a free text, its key
    // the worked solution that gives the reason.
    choice({
      prompt: COMPARE,
      answer: '$\\frac{2}{3}$',
      choices: ['$\\frac{2}{3}$', '$\\frac{3}{5}$'],
      correct_choice: 0,
      asks_reason: true,
      worked_solution: SOLUTION,
    }),
    // The same, without a reason written anywhere: there is no key to read hers against.
    choice({
      prompt: COMPARE_BARE,
      answer: '$\\frac{1}{4}$',
      choices: ['$\\frac{1}{4}$', '$\\frac{1}{3}$'],
      correct_choice: 0,
      asks_reason: true,
    }),
    // A comparison that asks for no reason stays the choice it is.
    choice({
      prompt: PLAIN,
      answer: '$\\frac{3}{4}$',
      choices: ['$\\frac{3}{4}$', '$\\frac{2}{4}$'],
      correct_choice: 0,
    }),
  ],
};

const WAIT = { json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null } };

async function upload(env: TestEnv, l: Learner, read: typeof sheet = sheet): Promise<string> {
  env.llm.script('extraction', { json: read });
  env.llm.script('buddy_check', WAIT);
  const created = await l.api.post<{ material: MaterialView; uploads: Array<{ path: string }> }>(
    '/materials',
    { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'], purpose: 'study' },
  );
  expect(created.status).toBe(201);
  for (const u of created.body.uploads) env.storage.put(u.path);
  expect((await l.api.post(`/materials/${created.body.material.id}/submit`)).status).toBe(202);
  await env.flushBackground();
  return created.body.material.id;
}

describe.skipIf(!dbReady)('a sheet task that asks for a reason', () => {
  let env: TestEnv;
  let lena: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-14T14:00:00Z' });
    lena = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2014-02-10',
      pin: '4826',
    });
  });
  afterEach(() => env.closeChecked());

  it('keeps a free text with the reason as its key, never a choice graded by index', async () => {
    const id = await upload(env, lena);
    const rows = await env.db.query<{
      prompt: string;
      kind: string;
      answer: string;
      choices: string[] | null;
      correct_choice: number | null;
    }>(
      `select prompt, kind, answer, choices, correct_choice from items
        where material_id = $1 order by prompt`,
      [id],
    );
    expect(rows).toEqual([
      { prompt: COMPARE, kind: 'long', answer: SOLUTION, choices: null, correct_choice: null },
      {
        prompt: PLAIN,
        kind: 'multiple_choice',
        answer: '$\\frac{3}{4}$',
        choices: ['$\\frac{3}{4}$', '$\\frac{2}{4}$'],
        correct_choice: 0,
      },
    ]);
  });

  // Rule 5: the task that went for want of a key must not leave the sheet looking whole.
  it('says the sheet is not whole when a task asking for a reason had to go', async () => {
    const incomplete = async (id: string) =>
      (
        await env.db.one<{ items_incomplete: boolean }>(
          `select items_incomplete from materials where id = $1`,
          [id],
        )
      ).items_incomplete;
    expect(await incomplete(await upload(env, lena))).toBe(true);
    // Every task kept, the converted one included: the sheet is whole (without the second item,
    // the one with no worked solution).
    const kept = { ...sheet, items: sheet.items.filter((_, i) => i !== 1) };
    expect(await incomplete(await upload(env, lena, kept))).toBe(false);
  });
});
