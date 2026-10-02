// Schemata und Bäume, end to end (issues #247 und #256).
//
// Die Zusagen der beiden Issues, gegen eine echte Datenbank:
//
//   1. **Das Modell liefert den Graphen, Code macht die Frage.** Frage, Figur, Schlüssel und
//      Brett kommen aus `practice/graph.ts`; ein `figure` vom Typ `diagram`, das das Modell
//      neben eine eigene Frage legt, kommt nicht durch den Vertrag.
//   2. **Was nicht stimmt, wird keine Frage** (Regel 0, Erzeugung): ein offener Kreislauf, Äste,
//      die nicht 1 ergeben, ein mehrdeutiger Stammbaum, ein Automat, über den das Modell sich
//      irrt. Eine verworfene Aufgabe kostet nur sich selbst, nie den Satz.
//   3. **Jede Antwort entscheidet Code** (Regel 0, Antwort): das `afterEach` lässt den Lauf
//      fallen, sobald ein Tutor gerufen wurde — er sähe die Zeichnung nicht.
//   4. **Fremde Fragen bleiben fremd**: eine andere Lernende kann auf diese Frage nicht antworten.
//
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  AnswerPart,
  AnswerResponse,
  DfaTask,
  DiagramTask,
  GraphTask,
  PedigreeTask,
  ProbTask,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { graphAgain, graphItem } from '../modules/practice/graph.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const WAIT = { json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null } };

/** Der Wasserkreislauf mit zwei Lücken — die Abnahme von #247. */
const WATER: DiagramTask = {
  g: 'diagram',
  title: 'Wasserkreislauf',
  shape: 'cycle',
  ask: 'gap',
  nodes: [
    { id: 'n1', text: 'Meer' },
    { id: 'n2', text: 'Wasserdampf' },
    { id: 'n3', text: 'Wolken' },
    { id: 'n4', text: 'Regen' },
    { id: 'n5', text: 'Fluss' },
  ],
  edges: [
    { from: 'n1', to: 'n2', label: 'Verdunstung' },
    { from: 'n2', to: 'n3', label: 'Kondensation' },
    { from: 'n3', to: 'n4', label: 'Niederschlag' },
    { from: 'n4', to: 'n5', label: '' },
    { from: 'n5', to: 'n1', label: '' },
  ],
  gaps: ['n2', 'n4'],
};

const COIN: ProbTask = {
  g: 'prob',
  title: 'Zweimal Münze werfen',
  ask: 'path',
  targets: ['b1'],
  nodes: [
    { id: 'a1', text: 'Kopf', parent: null, p: '1/2' },
    { id: 'a2', text: 'Zahl', parent: null, p: '1/2' },
    { id: 'b1', text: 'Kopf', parent: 'a1', p: '1/2' },
    { id: 'b2', text: 'Zahl', parent: 'a1', p: '1/2' },
    { id: 'b3', text: 'Kopf', parent: 'a2', p: '1/2' },
    { id: 'b4', text: 'Zahl', parent: 'a2', p: '1/2' },
  ],
};

/** Gesunde Eltern 1 × 2 mit einer kranken Tochter: nur autosomal-rezessiv passt. */
const FAMILY: PedigreeTask = {
  g: 'pedigree',
  mode: 'ar',
  ask: 'mode',
  targets: [],
  people: [
    { id: 'p1', sex: 'm', ill: false, parents: [] },
    { id: 'p2', sex: 'f', ill: false, parents: [] },
    { id: 'p3', sex: 'm', ill: false, parents: ['p1', 'p2'] },
    { id: 'p4', sex: 'f', ill: true, parents: ['p1', 'p2'] },
    { id: 'p5', sex: 'f', ill: false, parents: [] },
    { id: 'p6', sex: 'm', ill: false, parents: ['p3', 'p5'] },
  ],
};

const ENDS_IN_B: DfaTask = {
  g: 'dfa',
  states: [
    { id: 'q1', accept: false },
    { id: 'q2', accept: true },
  ],
  moves: [
    { from: 'q1', to: 'q1', sym: 'a' },
    { from: 'q1', to: 'q2', sym: 'b' },
    { from: 'q2', to: 'q1', sym: 'a' },
    { from: 'q2', to: 'q2', sym: 'b' },
  ],
  word: 'abab',
  accepts: true,
};

describe.skipIf(!dbReady)('Schemata und Bäume', () => {
  let env: TestEnv;
  let l: Learner;

  async function prepare(
    graphs: unknown[],
    opts: { items?: unknown[]; kind?: 'practice' | 'test' | 'help' } = {},
  ): Promise<{ status: number; body: SessionView }> {
    env.llm.script('explain', () => ({
      usable: true,
      title: 'Schemata',
      subject: { name: 'Biologie', kind: 'biology' },
      items: opts.items ?? [],
      bars: [],
      staffs: [],
      graphs,
    }));
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: opts.kind ?? 'practice',
      text: 'Schemata üben',
    });
    await env.flushBackground();
    return res;
  }

  async function answer(
    who: Learner,
    sessionId: string,
    itemId: string,
    body: { text?: string; choice?: number; parts?: AnswerPart[] },
  ) {
    return who.api.post<AnswerResponse>(`/practice/sessions/${sessionId}/answer`, {
      client_turn_id: randomUUID(),
      item_id: itemId,
      ...body,
    });
  }

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2010-02-10' });
    env.llm.byDefault('buddy_check', WAIT);
  });
  afterEach(async () => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      unexpected: env.llm.unexpected.map((u) => u.purpose),
      tutor: env.llm.callsFor('tutor').length,
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: [], tutor: 0 });
  });

  it('macht aus dem Wasserkreislauf eine Lückenfrage mit zwei Feldern (#247)', async () => {
    const { status, body: session } = await prepare([WATER]);
    expect(status).toBe(201);
    expect(session.items).toHaveLength(1);
    const item = session.items[0]?.item;
    const want = graphItem(WATER, 'de');
    expect(item?.kind).toBe('table_fill');
    expect(item?.prompt).toBe('Wasserkreislauf: Was gehört in die leeren Kästchen?');
    expect(item?.figure).toEqual(want?.figure);
    // The two gaps are empty, numbered boxes; their words are nowhere in the figure.
    expect(JSON.stringify(item?.figure)).not.toContain('Wasserdampf');
    expect(JSON.stringify(item?.figure)).not.toContain('"Regen"');
    expect(item?.board?.form).toBe('table_fill');

    // One right, one wrong: partly right, the question stays open, no model.
    const partly = await answer(l, session.id, item?.id as string, {
      parts: [
        { slot: 'c1', value: 'Wasserdampf' },
        { slot: 'c2', value: 'Schnee' },
      ],
    });
    expect(partly.status, JSON.stringify(partly.body)).toBe(200);
    expect(partly.body.verdict).toBe('partially_correct');
    expect(partly.body.session.items[0]?.status).toBe('open');

    const right = await answer(l, session.id, item?.id as string, {
      parts: [
        { slot: 'c1', value: 'wasserdampf' },
        { slot: 'c2', value: 'Regen' },
      ],
    });
    expect(right.body.verdict).toBe('correct');

    // The stored task is the one source: recomputed, it gives exactly what was stored.
    const row = await env.db.one<{ graph_task: GraphTask; answer: string; figure: unknown }>(
      `select graph_task, answer, figure from items where id = $1`,
      [item?.id],
    );
    expect(row.graph_task).toEqual(WATER);
    expect(row.answer).toBe('Wasserdampf; Regen');
    expect(row.figure).toEqual(want?.figure);
  });

  it('rechnet eine Pfadwahrscheinlichkeit aus und nimmt jede Schreibweise (#256)', async () => {
    const both: ProbTask = { ...COIN, targets: ['b2', 'b3'] };
    const { body: session } = await prepare([COIN, both]);
    expect(session.items.map((si) => si.item.kind)).toEqual(['numeric', 'numeric']);
    expect(session.items[0]?.item.prompt).toContain('„Kopf – Kopf“');
    const [one, two] = session.items.map((si) => si.item.id) as [string, string];
    // 1/4 asked: 0,25 is the same amount, and code wrote the question, so the form is free.
    const decimal = await answer(l, session.id, one, { text: '0,25' });
    expect(decimal.body.verdict).toBe('correct');
    // Kopf–Zahl or Zahl–Kopf: 1/4 + 1/4.
    const wrong = await answer(l, session.id, two, { text: '1/4' });
    expect(wrong.body.verdict).toBe('incorrect');
    expect(wrong.body.reply.text).toBe(graphAgain('de', both));
    const right = await answer(l, session.id, two, { text: '1/2' });
    expect(right.body.verdict).toBe('correct');
  });

  it('versteckt einen Ast und fragt nach seiner Wahrscheinlichkeit', async () => {
    const urn: ProbTask = {
      g: 'prob',
      title: 'Kugel ziehen',
      ask: 'gap',
      targets: ['a2'],
      nodes: [
        { id: 'a1', text: 'rot', parent: null, p: '0.3' },
        { id: 'a2', text: 'blau', parent: null, p: '0.7' },
      ],
    };
    const { body: session } = await prepare([urn]);
    const fig = session.items[0]?.item.figure;
    expect(fig?.type === 'prob_tree' && fig.nodes.map((n) => n.p)).toEqual(['0.3', '?']);
    const res = await answer(l, session.id, session.items[0]?.item.id as string, { text: '7/10' });
    expect(res.body.verdict).toBe('correct');
  });

  it('fragt nach dem Erbgang, wenn genau einer passt, und nach dem Genotyp', async () => {
    const genotype: PedigreeTask = { ...FAMILY, ask: 'genotype', targets: ['p1'] };
    const { body: session } = await prepare([FAMILY, genotype]);
    expect(session.items).toHaveLength(2);
    const mode = session.items[0]?.item;
    expect(mode?.kind).toBe('multiple_choice');
    expect(mode?.choices).toEqual([
      'autosomal-dominant',
      'autosomal-rezessiv',
      'X-chromosomal-dominant',
      'X-chromosomal-rezessiv',
    ]);
    const wrong = await answer(l, session.id, mode?.id as string, { choice: 0 });
    expect(wrong.body.verdict).toBe('incorrect');
    expect(wrong.body.reply.text).toBe(graphAgain('de', FAMILY));
    const right = await answer(l, session.id, mode?.id as string, { choice: 1 });
    expect(right.body.verdict).toBe('correct');

    // The healthy father of an ill daughter carries one allele: Aa, and nothing else fits.
    const g = session.items[1]?.item;
    expect(g?.prompt).toBe('Der Erbgang ist autosomal-rezessiv. Welchen Genotyp hat Person 1?');
    expect(g?.choices).toEqual(['AA', 'Aa', 'aa']);
    const res = await answer(l, session.id, g?.id as string, { choice: 1 });
    expect(res.body.verdict).toBe('correct');
  });

  it('rechnet aus, ob der Automat das Wort annimmt', async () => {
    const no: DfaTask = { ...ENDS_IN_B, word: 'abba', accepts: false };
    const { body: session } = await prepare([ENDS_IN_B, no]);
    // The view never carries the key; what code computed is what the stored question holds.
    expect([
      graphItem(ENDS_IN_B, 'de')?.correct_choice,
      graphItem(no, 'de')?.correct_choice,
    ]).toEqual([0, 1]);
    expect(session.items[0]?.item.choices).toEqual([
      'Ja, es wird akzeptiert',
      'Nein, es wird nicht akzeptiert',
    ]);
    const res = await answer(l, session.id, session.items[1]?.item.id as string, { choice: 1 });
    expect(res.body.verdict).toBe('correct');
    const fig = session.items[0]?.item.figure;
    expect(fig?.type).toBe('automaton');
  });

  it('legt aus ungültigen Graphen keine Frage an — und behält den Rest', async () => {
    const open: DiagramTask = { ...WATER, edges: WATER.edges.slice(0, 4) };
    const notOne: ProbTask = {
      ...COIN,
      nodes: COIN.nodes.map((n) => (n.id === 'a2' ? { ...n, p: '1/3' } : n)),
    };
    // One ill son of healthy parents: recessive, but autosomal or X-linked — ambiguous.
    const ambiguous: PedigreeTask = {
      ...FAMILY,
      people: FAMILY.people.map((p) =>
        p.id === 'p4' ? { ...p, ill: false } : p.id === 'p3' ? { ...p, ill: true } : p,
      ),
    };
    const wrongClaim: DfaTask = { ...ENDS_IN_B, accepts: false };
    const leak: DiagramTask = { ...WATER, title: 'Regen und Meer' };
    const dangling = { ...WATER, edges: [...WATER.edges, { from: 'n5', to: 'n9', label: '' }] };
    // Four graphs, all four wrong: nothing to practise, and the run says so.
    const none = await prepare([open, ambiguous, leak, dangling]);
    expect(none.status).toBe(422);
    const res = await prepare([notOne, ambiguous, wrongClaim, COIN]);
    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]?.item.prompt).toContain('Zweimal Münze werfen');
    for (const t of [open, notOne, ambiguous, wrongClaim, leak])
      expect(graphItem(t, 'de')).toBeNull();
  });

  it('nichts Brauchbares heißt keine Übung, nicht eine leere', async () => {
    const res = await prepare([{ ...WATER, gaps: [] }]);
    expect(res.status).toBe(422);
  });

  it('lässt das Modell kein Schema neben eine eigene Frage legen', async () => {
    const { body: session } = await prepare([], {
      items: [
        {
          kind: 'short',
          prompt: 'Was kommt nach dem Regen?',
          answer: 'Fluss',
          accepted_answers: [],
          unit: null,
          choices: null,
          correct_choice: null,
          topic: 'Wasser',
          difficulty: 2,
          source_excerpt: null,
          figure: {
            type: 'diagram',
            shape: 'chain',
            boxes: [{ text: 'Regen', blank: false }],
            arrows: [],
            legend: [],
          },
        },
      ],
    });
    expect(session.items).toHaveLength(1);
    expect(session.items[0]?.item.figure).toBeNull();
  });

  it('keine Schemata in der Hausaufgabenhilfe', async () => {
    const res = await prepare([WATER], { kind: 'help' });
    expect(res.status).toBe(422);
  });

  it('eine andere Lernende kann auf diese Frage nicht antworten', async () => {
    const { body: session } = await prepare([COIN]);
    const other = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2011-05-01' });
    const res = await answer(other, session.id, session.items[0]?.item.id as string, {
      text: '1/4',
    });
    expect(res.status).toBe(404);
  });
});
