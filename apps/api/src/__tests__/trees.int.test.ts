// Tree figures end to end (issue #256): a probability tree, a pedigree and an automaton — what
// the model writes, what is stored, what the app gets back and what is graded, on a real
// Postgres. Every key here is computed by code; a figure or key that does not hold is never
// stored (Regel 0: rejected, never repaired).
//
// Model calls are scripted; every answer below is graded by code (a number, an option), so the
// harness's failure on an unscripted call proves no tutor was asked.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';
import { evenOnes, recessivePedigree, TREE_ITEMS, urn } from '../testing/scenarios/trees.js';

const dbReady = await testDatabaseAvailable();

const [path, edge, mode, genotype, automaton, plain] = TREE_ITEMS as [
  (typeof TREE_ITEMS)[number],
  ...(typeof TREE_ITEMS)[number][],
];

/** Questions code must refuse, each next to the one it is a broken copy of. */
const BROKEN = [
  // The key contradicts the tree: two reds are 3/10, not 9/25 (that is with putting back).
  { ...path, prompt: 'Zweimal Rot, aber falsch gerechnet?', answer: '9/25' },
  // The branches of the first node add up to 6/5.
  {
    ...path,
    prompt: 'Zweimal Rot aus einem kaputten Baum?',
    figure: { ...urn('path', [3]), n: urn().n.map((x, i) => (i === 1 ? { ...x, e: '4/5' } : x)) },
  },
  // A number about a probability tree that declares no key: nothing to check it against.
  { ...path, prompt: 'Wie viele Äste hat der Baum?', answer: '6', figure: urn() },
  // The model points at the wrong mode.
  { ...mode, prompt: 'Welcher Erbgang, falsch angekreuzt?', correct_choice: 0 },
  // A pedigree that AD, AR and XR all explain: "which mode?" has no single answer.
  {
    ...mode,
    prompt: 'Welcher Erbgang liegt hier vor?',
    figure: {
      type: 'pedigree',
      p: [
        { s: 'm', a: true, fa: -1, mo: -1 },
        { s: 'f', a: false, fa: -1, mo: -1 },
        { s: 'm', a: true, fa: 0, mo: 1 },
        { s: 'f', a: false, fa: 0, mo: 1 },
      ],
      md: 'ad',
      ask: 'mode',
      at: 0,
    },
  },
  // The healthy brother may be AA or Aa: no single genotype.
  { ...genotype, prompt: 'Welchen Genotyp hat Person 5?', figure: recessivePedigree('gt', 4) },
  // 100 has one 1: not accepted, but the model says it is.
  { ...automaton, prompt: 'Wird das Wort 100 akzeptiert?', figure: evenOnes('100') },
  // A word with a symbol the automaton does not know.
  { ...automaton, prompt: 'Wird das Wort 102 akzeptiert?', figure: evenOnes('102') },
];

async function start(env: TestEnv, l: Learner, items: unknown[]) {
  env.llm.script('explain', { json: { usable: true, title: 'Bäume', subject: null, items } });
  const res = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind: 'practice',
    text: 'Baumdiagramme, Stammbäume und Automaten',
  });
  expect(res.status).toBe(201);
  await env.flushBackground();
  return (await l.api.get<SessionView>(`/practice/sessions/${res.body.id}`)).body;
}

const answer = (l: Learner, s: SessionView, itemId: string, body: Record<string, unknown>) =>
  l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
    client_turn_id: randomUUID(),
    item_id: itemId,
    ...body,
  });

describe.skipIf(!dbReady)('tree figures are checked, stored and graded by code', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-03T09:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2012-02-10' });
  });
  afterEach(() => env.closeChecked());

  it('stores only the questions whose tree and key hold', async () => {
    const s = await start(env, l, [...TREE_ITEMS, ...BROKEN]);
    const prompts = s.items.map((i) => i.item.prompt);
    expect(prompts).toEqual(TREE_ITEMS.map((i) => i.prompt));
    // Nothing of the broken questions reached the database either.
    const stored = await env.db.query<{ prompt: string }>(
      `select prompt from items where learner_id = $1`,
      [l.learnerId],
    );
    expect(stored.map((r) => r.prompt).sort()).toEqual([...prompts].sort());
    expect(s.items[0]?.item.figure).toMatchObject({ type: 'tree', pr: true, ask: 'path' });
    expect(s.items[5]?.item.figure).toMatchObject({ type: 'tree', pr: false });
  });

  it('writes the options of a mode, a genotype and a word question itself', async () => {
    const s = await start(env, l, TREE_ITEMS);
    const byPrompt = (p: string) => s.items.find((i) => i.item.prompt === p)!.item;
    // The model wrote "X-dominant"; code writes the four modes in the question's language.
    expect(byPrompt(mode!.prompt).choices).toEqual([
      'autosomal-dominant',
      'autosomal-rezessiv',
      'X-chromosomal-dominant',
      'X-chromosomal-rezessiv',
    ]);
    // In math notation: as words, "AA" and "aa" would be one option to `choiceProblem`.
    expect(byPrompt(genotype!.prompt).choices).toEqual(['$AA$', '$Aa$', '$aa$']);
    expect(byPrompt(automaton!.prompt).choices).toEqual([
      'Ja, es wird akzeptiert',
      'Nein, es wird nicht akzeptiert',
    ]);
  });

  it('writes the options in English for an English question', async () => {
    const s = await start(env, l, [
      { ...mode, prompt: 'Which mode of inheritance does this pedigree show?', prompt_lang: 'en' },
    ]);
    expect(s.items[0]?.item.choices).toEqual([
      'autosomal dominant',
      'autosomal recessive',
      'X-linked dominant',
      'X-linked recessive',
    ]);
  });

  it('grades every answer by code, no tutor', async () => {
    const s = await start(env, l, TREE_ITEMS);
    const id = (p: string) => s.items.find((i) => i.item.prompt === p)!.item.id;
    const verdict = async (p: string, body: Record<string, unknown>) =>
      (await answer(l, s, id(p), body)).body.verdict;
    expect(await verdict(path!.prompt, { text: '3/10' })).toBe('correct');
    expect(await verdict(edge!.prompt, { text: '1/2' })).toBe('incorrect');
    expect(await verdict(edge!.prompt, { text: '1/4' })).toBe('correct');
    expect(await verdict(mode!.prompt, { choice: 1 })).toBe('correct');
    expect(await verdict(genotype!.prompt, { choice: 2 })).toBe('incorrect');
    expect(await verdict(genotype!.prompt, { choice: 1 })).toBe('correct');
    expect(await verdict(automaton!.prompt, { choice: 0 })).toBe('correct');
    expect(await verdict(plain!.prompt, { text: '8' })).toBe('correct');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });
});
