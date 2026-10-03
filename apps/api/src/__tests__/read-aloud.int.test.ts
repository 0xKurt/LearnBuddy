// The "Vorlesen" button at every question (issue #238): the server says, per question, whether
// it may be read aloud — and code decides it from what the question is, never the model and
// never the app. A spelling task and a vocabulary prompt that already holds its answer are
// never read; a word problem and an ordinary vocabulary prompt are.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const base = {
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: null,
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
};

const ITEMS = [
  {
    ...base,
    kind: 'numeric',
    prompt: 'Lena hat 12 Äpfel und isst $\\frac{1}{4}$ davon. Wie viele bleiben übrig?',
    answer: '9',
  },
  {
    ...base,
    kind: 'short',
    prompt: 'Schreib das Wort richtig: Farad',
    answer: 'Fahrrad',
    spelling: 'strict',
  },
  {
    ...base,
    kind: 'vocab',
    prompt: 'le chien',
    answer: 'der Hund',
    prompt_lang: 'fr',
    lang: 'de',
  },
  {
    ...base,
    kind: 'vocab',
    prompt: 'le taxi',
    answer: 'das Taxi',
    accepted_answers: ['Taxi'],
    prompt_lang: 'fr',
    lang: 'de',
  },
];

async function start(env: TestEnv, l: Learner): Promise<SessionView> {
  env.llm.script('explain', {
    json: { usable: true, title: 'Gemischt', subject: null, items: ITEMS },
  });
  const res = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind: 'practice',
    text: 'Gemischt',
  });
  expect(res.status).toBe(201);
  await env.flushBackground();
  return (await l.api.get<SessionView>(`/practice/sessions/${res.body.id}`)).body;
}

function flags(s: SessionView): Record<string, boolean> {
  return Object.fromEntries(s.items.map((i) => [i.item.prompt, i.item.read_aloud]));
}

describe.skipIf(!dbReady)('which questions may be read aloud', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T09:00:00Z' });
    l = await onboard(env, {
      relation: 'child',
      name: 'Mia',
      birthDate: '2018-03-10',
      pin: '4826',
    });
  });
  afterEach(() => env.closeChecked());

  it('reads a word problem and a vocabulary prompt, never a spelling task or a given-away word', async () => {
    const s = await start(env, l);
    expect(flags(s)).toEqual({
      [ITEMS[0]!.prompt]: true,
      [ITEMS[1]!.prompt]: false,
      [ITEMS[2]!.prompt]: true,
      [ITEMS[3]!.prompt]: false,
      // Both directions of a pair are stored (issue #113). Hearing "das Taxi" in German does
      // not write "le taxi" for her: producing the foreign word is the task, and it stays one.
      'der Hund': true,
      'das Taxi': true,
    });
  });

  it('keeps the decision after a question is closed, and another learner sees nothing', async () => {
    const s = await start(env, l);
    const first = s.items[0]!.item;
    const r = await l.api.post(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: first.id,
      text: '9',
    });
    expect(r.status).toBe(200);
    const after = (await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    expect(after.items[0]!.status).toBe('correct');
    expect(flags(after)).toEqual(flags(s));

    const other = await onboard(env, {
      relation: 'child',
      name: 'Ben',
      birthDate: '2017-05-01',
      pin: '5937',
    });
    const foreign = await other.api.get(`/practice/sessions/${s.id}`);
    expect(foreign.status).toBe(404);
  });
});
