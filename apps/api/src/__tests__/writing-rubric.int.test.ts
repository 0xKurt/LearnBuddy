// Eine Schreibaufgabe bekommt Rückmeldung je Pflichtelement, nicht ein Urteil (issue #211,
// Schritt 2 aus #197).
//
// Fünf Behauptungen, jede hier gegen die Datenbank und gegen den Modellaufruf geprüft:
//   - EIN Modellaufruf pro Antwort, auch bei vier Pflichtelementen (gemessen, nicht geschätzt);
//   - was Code zählen kann, zählt Code — und das Modell erfährt davon nichts, kann also einer
//     Angabe, die in ihrem Text steht, nicht widersprechen (CLAUDE.md Regel 1);
//   - ein Urteil des Modells ohne Zitat aus ihrem Text kauft kein Element (Regel 0 aus #224);
//   - hält etwas und nicht alles, bleibt die Frage offen und FSRS bekommt nichts — kein
//     Bruchteil, keine erfundene Zwischennote;
//   - kein „Die Lösung ist", keine Note, keine Zahl im Satz.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

/** Der 600-Zeichen-„Schlüssel", den das Modell zu einer Inhaltsangabe schreibt — keine Lösung. */
const SKETCH = 'Titel, Autor, dann der Inhalt im Präsens, knapp, ohne wörtliche Rede.';

const RUBRIC = {
  form: 'Inhaltsangabe',
  elements: [
    {
      name: 'Einleitungssatz',
      missing: 'Nenne im ersten Satz den Titel und den Autor.',
      // Von Code entschieden: das Modell wird dazu nicht gefragt.
      check: { by: 'mentions', terms: ['Die Verwandlung', 'Kafka'], where: 'opening' },
    },
    {
      name: 'Länge',
      missing: 'Etwas mehr darf es schon sein.',
      check: { by: 'word_count', min: 20, max: null },
    },
    {
      name: 'Präsens',
      missing: 'Eine Inhaltsangabe steht im Präsens.',
      check: { by: 'tense', tense: 'present' },
    },
    {
      name: 'eigenes Urteil',
      missing: 'Sag am Ende, was du selbst davon hältst.',
      check: { by: 'judged' },
    },
  ],
} as const;

/** Ihr Text: Einleitung, lang genug, Präsens, mit eigenem Urteil am Ende. */
const WHOLE =
  'Die Verwandlung von Kafka erzählt von Gregor Samsa, der eines Morgens als Käfer aufwacht. ' +
  'Seine Familie wendet sich langsam von ihm ab, und am Ende stirbt er allein in seinem ' +
  'Zimmer, was ich sehr bedrückend finde.';

/** Derselbe Text ohne den Einleitungssatz — das Abnahmekriterium von #211. */
const WITHOUT_OPENER =
  'Gregor Samsa wacht eines Morgens als Käfer auf. Seine Familie wendet sich langsam von ihm ' +
  'ab, und am Ende stirbt er allein in seinem Zimmer, was ich sehr bedrückend finde.';

const essay = (over: Record<string, unknown> = {}) => ({
  kind: 'long',
  prompt: 'Schreibe eine Inhaltsangabe zu „Die Verwandlung".',
  answer: SKETCH,
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Inhaltsangabe',
  difficulty: 3,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
  rubric: RUBRIC,
  ...over,
});

async function start(env: TestEnv, l: Learner, items: Record<string, unknown>[]) {
  env.llm.script('explain', {
    json: { usable: true, title: 'Inhaltsangabe', subject: null, items },
  });
  const res = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind: 'practice',
    text: 'Inhaltsangabe',
  });
  expect(res.status).toBe(201);
  await env.flushBackground();
  return (await l.api.get<SessionView>(`/practice/sessions/${res.body.id}`)).body;
}

const answer = (l: Learner, s: SessionView, itemId: string, text: string) =>
  l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
    client_turn_id: randomUUID(),
    item_id: itemId,
    text,
  });

/**
 * Was das Modell sagt. `elements` nennt nur, wonach es gefragt wurde — `r3` (Präsens) und `r4`
 * (eigenes Urteil); über `r1` und `r2` erfährt es nichts, weil Code sie zählt.
 */
const judges = (
  verdict: string,
  reply: string,
  elements: Array<{ element: string; met?: boolean; quote?: string; verbs?: string[] }> = [],
) => ({
  json: {
    intent: 'answer',
    verdict,
    reply,
    gave_hint: false,
    revealed_answer: false,
    elements: elements.map((e) => ({ met: false, quote: '', verbs: [], ...e })),
  },
});

const held = (text: string) => ({ element: 'r4', met: true, quote: text });

const reviews = (env: TestEnv, itemId: string) =>
  env.db
    .query<{ n: number }>(`select count(*)::int as n from item_states where item_id = $1`, [itemId])
    .then((r) => r[0]?.n ?? 0);

describe.skipIf(!dbReady)('a writing task is answered element by element', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T09:00:00Z' });
    l = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2014-02-10',
      pin: '4826',
    });
  });
  afterEach(async () => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      unexpected: env.llm.unexpected.map((u) => u.purpose),
      pending: env.llm.pending(),
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: [], pending: 0 });
  });

  it('costs ONE model call per answer, whatever the rubric asks about', async () => {
    const s = await start(env, l, [essay()]);
    const id = s.items[0]!.item.id;
    const before = env.llm.callsFor('tutor').length;
    env.llm.script('tutor', judges('correct', 'Rund.', [held('was ich sehr bedrückend finde')]));
    await answer(l, s, id, WHOLE);
    // Four required elements, one call — not one per element, and not a second round for the
    // ones code decided. A further call would be `unexpected` and a missing one `pending`;
    // the afterEach above fails on either.
    expect(env.llm.callsFor('tutor')).toHaveLength(before + 1);

    // And what the model was asked about: only what code cannot decide. The length and the
    // required entries are not in the request at all, so it cannot contradict them.
    const seen = ScriptedGateway.textOf(env.llm.callsFor('tutor').at(-1)!);
    expect(seen).toContain('REQUIRED ELEMENTS of this Inhaltsangabe');
    expect(seen).toContain('r3 "Präsens"');
    expect(seen).toContain('r4 "eigenes Urteil"');
    expect(seen).not.toContain('Einleitungssatz');
    expect(seen).not.toContain('Länge');
  });

  it('names exactly the missing element and the others as present', async () => {
    const s = await start(env, l, [essay()]);
    const id = s.items[0]!.item.id;
    env.llm.script(
      'tutor',
      // The model is satisfied with the whole text — and code is not: the opening is missing.
      judges('correct', 'Sehr schön geschrieben!', [
        held('was ich sehr bedrückend finde'),
        { element: 'r3', verbs: [] },
      ]),
    );
    const res = await answer(l, s, id, WITHOUT_OPENER);
    const reply = res.body.reply.text;

    // Exactly this element missing, the others there.
    expect(reply).toContain('Einleitungssatz: noch nicht');
    expect(reply).toContain('Länge: steht');
    expect(reply).toContain('Präsens: steht');
    expect(reply).toContain('eigenes Urteil: steht');
    // ONE next step, the element's own sentence — not a list to work through.
    expect(reply).toContain('Fast – fehlt nur noch Einleitungssatz');
    expect(reply).toContain('Nenne im ersten Satz den Titel und den Autor.');

    // The model said "correct"; code counted and it is not. Code wins (CLAUDE.md rule 1).
    expect(res.body.verdict).toBe('partially_correct');
    // No grade, no count, no solution, and not the model's own praise either.
    expect(reply).not.toMatch(/\d\s*(von|\/)\s*\d/);
    expect(reply).not.toContain('Die Lösung ist');
    expect(reply).not.toContain(SKETCH);
    expect(reply).not.toContain('Sehr schön geschrieben');

    // The question stays OPEN — six of eight right is not wrong, and nothing right is thrown
    // away. And FSRS gets nothing: there is no "0,75 of Good" (issue #197, parts precedent).
    const after = (await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    expect(after.items[0]!.status).toBe('open');
    expect(after.items[0]!.answer).toBeNull();
    expect(await reviews(env, id)).toBe(0);
  });

  it('does not accept a judged element whose quote is not in her text', async () => {
    const s = await start(env, l, [essay()]);
    const id = s.items[0]!.item.id;
    env.llm.script(
      'tutor',
      judges('correct', 'Stark.', [
        // A quote the model made up: nothing in her text carries it, so it buys nothing.
        { element: 'r4', met: true, quote: 'Das Werk entfaltet eine existenzielle Wucht' },
      ]),
    );
    const res = await answer(l, s, id, WHOLE);
    expect(res.body.reply.text).toContain('eigenes Urteil: noch nicht');
    // Code cannot see this element, so Buddy asks instead of asserting it is missing.
    expect(res.body.reply.text).toContain('Schau nochmal, ob eigenes Urteil schon drinsteht');
    expect(res.body.verdict).toBe('partially_correct');
  });

  it('says nothing at all about an element the model left out', async () => {
    const s = await start(env, l, [essay()]);
    const id = s.items[0]!.item.id;
    // Only the tense comes back. About "eigenes Urteil" nobody measured anything — and then
    // neither "steht" nor "noch nicht" may be said about it (CLAUDE.md rule 5).
    env.llm.script(
      'tutor',
      judges('correct', 'Das liest sich rund.', [{ element: 'r3', verbs: [] }]),
    );
    const res = await answer(l, s, id, WHOLE);
    const reply = res.body.reply.text;
    expect(reply).toContain('Präsens: steht');
    expect(reply).not.toContain('eigenes Urteil');
    // Nothing points at a place, so Buddy keeps his own sentence …
    expect(reply).toContain('Das liest sich rund.');
    // … and the question does not close on an element nobody checked.
    expect(res.body.verdict).toBe('partially_correct');
    const after = (await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    expect(after.items[0]!.status).toBe('open');
    expect(await reviews(env, id)).toBe(0);
  });

  it('names the verb from her own text when the tense slips', async () => {
    const s = await start(env, l, [essay()]);
    const id = s.items[0]!.item.id;
    env.llm.script(
      'tutor',
      judges('partially_correct', 'Schau auf die Zeitform.', [
        held('was ich sehr bedrückend finde'),
        // "wachte" is not in her text and changes nothing; "stirbt" is, and is named.
        { element: 'r3', verbs: ['wachte', 'stirbt'] },
      ]),
    );
    const res = await answer(l, s, id, WHOLE);
    expect(res.body.reply.text).toContain('Präsens: noch nicht');
    expect(res.body.reply.text).toContain('Nur bei „stirbt“ stimmt die Zeitform noch nicht');
    expect(res.body.reply.text).not.toContain('wachte');
  });

  it('counts a writing task she got right like any other question', async () => {
    const s = await start(env, l, [essay()]);
    const id = s.items[0]!.item.id;
    env.llm.script(
      'tutor',
      judges('partially_correct', 'Nicht schlecht.', [
        held('was ich sehr bedrückend finde'),
        { element: 'r3', verbs: [] },
      ]),
    );
    const res = await answer(l, s, id, WHOLE);
    // Every element holds, so it is right — even though the model only said "partially".
    // The rubric decides the verdict; that is what "feedback per element instead of one
    // judgement" means.
    expect(res.body.verdict).toBe('correct');
    const after = (await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    expect(after.items[0]!.status).toBe('correct');
    // Here something WAS measured, so the schedule may learn from it (issue #197).
    expect(await reviews(env, id)).toBe(1);
    await l.api.post(`/practice/sessions/${s.id}/finish`, {});
    const done = (await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    expect(done.summary?.shaky_topics).toEqual([]);
  });

  it('keeps the honest closing line after the third try, and still no rating', async () => {
    const s = await start(env, l, [essay()]);
    const id = s.items[0]!.item.id;
    for (let n = 0; n < 3; n++) {
      env.llm.script('tutor', judges('incorrect', 'Erzähl mir mehr.', [{ element: 'r4' }]));
      await answer(l, s, id, 'Weiß nicht.');
    }
    const after = (await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    const last =
      after.turns
        .filter((tr) => tr.role === 'tutor')
        .map((tr) => tr.text)
        .at(-1) ?? '';
    // A writing task has nothing to reveal; that stays true with a rubric (issue #197).
    expect(last).toContain('nicht die eine Lösung');
    expect(last).not.toContain(SKETCH);
    expect(after.items[0]!.answer).toBeNull();
    expect(await reviews(env, id)).toBe(0);
  });

  it('leaves a free text without a rubric exactly as it was', async () => {
    const s = await start(env, l, [essay({ rubric: null })]);
    const id = s.items[0]!.item.id;
    // No rubric, no REQUIRED ELEMENTS block, no elements in the answer — the ordinary schema.
    env.llm.script('tutor', {
      json: {
        intent: 'answer',
        verdict: 'partially_correct',
        reply: 'Da steckt schon ein Gedanke drin.',
        gave_hint: false,
        revealed_answer: false,
      },
    });
    const res = await answer(l, s, id, WITHOUT_OPENER);
    expect(ScriptedGateway.textOf(env.llm.callsFor('tutor').at(-1)!)).not.toContain(
      'REQUIRED ELEMENTS',
    );
    expect(res.body.reply.text).toBe('Da steckt schon ein Gedanke drin.');
    expect(res.body.verdict).toBe('partially_correct');
  });

  it('writes no rubric onto a question that is not a free text', async () => {
    const s = await start(env, l, [
      essay({ kind: 'numeric', prompt: 'Was ist 7 · 4?', answer: '28', topic: 'Reihen' }),
    ]);
    const id = s.items[0]!.item.id;
    const stored = await env.db.query<{ rubric: unknown }>(
      `select rubric from items where id = $1`,
      [id],
    );
    // A number has no required elements to tick off, so the rubric is dropped — the question
    // is kept (the same way an unusable figure costs only itself).
    expect(stored[0]!.rubric).toBeNull();
    await answer(l, s, id, '28');
  });
});
