// No drawing on a word or a sentence to say (issue #375) through the real API on a real Postgres.
//
// A vocab or speak card never carries a figure: its schema has no `figure` (nor `read`, the
// reading of one), and a figure the model writes anyway is DROPPED while the card stays — the
// rule `usableItems` follows for every field a kind never keeps (a spelling mode on a number, a
// tolerance on a word). The figure is gone before anything reads it, so even a broken one (a clock
// at 25 o'clock, which costs any other question) does not cost the card. A practice run is sent
// and keeps exactly what it was and kept before: its other questions keep their figures.
// The listening side (only a clock, coins, a dot field or base-ten blocks as an option's picture)
// is in `listening.int.test.ts`. docs/architecture.md §Practice ("Explain profiles").
// requires live verification in Claude Code session (needs a running Postgres; scripted model)

import { randomUUID } from 'node:crypto';

import type { SessionView, StartTopicRequest } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { explainSchemaFor } from '../modules/practice/setProfiles.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';
import { schemaErrors } from '../testing/schemaCheck.js';

const dbReady = await testDatabaseAvailable();

const THREE_QUARTERS = { type: 'fraction', shape: 'circle', fractions: [{ parts: 4, filled: 3 }] };
/** No clock has 25 hours: a figure that costs any question it is the figure of. */
const BROKEN_CLOCK = { type: 'clock', c: [{ h: 25, m: 0 }], h24: false, ask: 'time' };

const item = (kind: string, prompt: string, answer: string, extra: object = {}) => ({
  kind,
  prompt,
  answer,
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Wörter',
  difficulty: 2,
  source_excerpt: null,
  ...extra,
});

const VOCAB = [
  item('vocab', 'le chat', 'die Katze', { prompt_lang: 'fr', lang: 'de', figure: THREE_QUARTERS }),
  item('vocab', 'le chien', 'der Hund', { prompt_lang: 'fr', lang: 'de', figure: BROKEN_CLOCK }),
];
const SPEAK = [item('speak', 'Bonjour', 'Bonjour', { lang: 'fr', figure: THREE_QUARTERS })];
const NUMERIC = item('numeric', 'Wie viel ist drei Viertel von 8?', '6', {
  topic: 'Brüche',
  figure: THREE_QUARTERS,
});

describe.skipIf(!dbReady)('no figure on a vocab or speak card (#375)', () => {
  let env: TestEnv;
  let l: Learner;

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-04T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterEach(() => env.closeChecked());

  async function run(kind: StartTopicRequest['kind'], items: object[]) {
    env.llm.script('explain', () => ({
      usable: true,
      title: 'Übung',
      subject: { name: 'Französisch', kind: 'french' },
      items,
    }));
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind,
      text: 'Französisch und Brüche üben',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    const [call] = env.llm.callsFor('explain');
    const stored = await env.db.query<{ kind: string; prompt: string; figure: unknown }>(
      `select kind, prompt, figure from items where learner_id = $1 order by prompt`,
      [l.learnerId],
    );
    return { schema: call!.schema!, stored };
  }

  it.each([
    ['vocab', VOCAB],
    ['speak', SPEAK],
  ] as const)(
    'a %s run is sent no figure, and a figure written anyway is not stored',
    async (kind, items) => {
      const { schema, stored } = await run(kind, items);
      expect(schema).toEqual(explainSchemaFor(kind, null));
      // The decoder could not write a figure on such a card …
      expect(schemaErrors(schema, { usable: true, title: 'x', subject: null, items })).not.toEqual(
        [],
      );
      // … and code keeps every card, without its figure — a broken one costs nothing either.
      const prompts = items.map((i) => i.prompt);
      const both = kind === 'vocab' ? [...prompts, ...items.map((i) => i.answer)] : prompts;
      expect(stored.map((r) => r.prompt).sort()).toEqual([...both].sort());
      expect(stored.every((r) => r.figure === null)).toBe(true);
    },
  );

  it('a practice run is unchanged: its figures stay, a vocab card in it keeps none', async () => {
    const { schema, stored } = await run('practice', [NUMERIC, VOCAB[0]!]);
    expect(schema).toEqual(explainSchemaFor('practice', null));
    expect(JSON.stringify(schema)).toContain('"figure"');
    const figureOf = (prompt: string) => stored.find((r) => r.prompt === prompt)?.figure;
    expect(figureOf(NUMERIC.prompt)).toEqual(THREE_QUARTERS);
    expect(figureOf('le chat')).toBeNull();
    expect(figureOf('die Katze')).toBeNull();
  });
});
