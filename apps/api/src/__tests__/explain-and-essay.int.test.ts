// „Erklär mal" (issue #236) und der lange Text (issue #258): ein Mechanismus, gegen die Datenbank
// und gegen den Modellaufruf geprüft.
//
//   - Eine Abfrage („Frag mich ab") besteht nur aus offenen Fragen MIT Kernpunkten; eine ohne
//     wird verworfen, nicht als etwas anderes behalten (Regel 0: Erzeugung).
//   - Ein erfundenes Zitat kauft keinen Kernpunkt; eine Antwort mit zwei von drei Punkten bekommt
//     genau EINE Nachfrage — zum dritten (Abnahme von #236).
//   - Die Antwort auf die Nachfrage ergänzt die erste Erklärung, sie ersetzt sie nicht.
//   - Eine Zahl oder Formel im Kernpunkt prüft Code exakt, was immer das Modell sagt.
//   - Ein Aufsatz darf 1500 Wörter lang sein, jede andere Antwort nicht; ein erfundenes Zitat
//     wird als Stelle verworfen, und es gibt nie eine Note (Abnahme von #258).
//   - Fehlerwege: dieselbe Antwort zweimal, eine geschlossene Frage, die Sitzung einer anderen,
//     ein Modell, das nicht antwortet.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LlmError } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const PROMPT = 'Erkläre, wie die Fotosynthese funktioniert.';

/** A key point: the aspect she sees, and what it says (for the judge only). */
const point = (name: string, ask: string, says: string, exact: string[][] = []) => ({
  name,
  point: says,
  missing: `${name} fehlt noch.`,
  ask,
  check: { by: 'judged', exact },
});

const KEY_POINTS = {
  kind: 'explain',
  form: 'Erklärung',
  elements: [
    point(
      'Energiequelle',
      'Woher bekommt die Pflanze die Energie dafür?',
      'Licht liefert die Energie',
    ),
    point(
      'Ausgangsstoffe',
      'Woraus baut die Pflanze den Zucker?',
      'Aus CO₂ und Wasser wird Zucker',
      [['CO2', 'Kohlenstoffdioxid', 'Kohlendioxid']],
    ),
    point('Ort in der Zelle', 'Und wo in der Zelle passiert das?', 'Findet im Chloroplasten statt'),
  ],
};

const draft = (over: Record<string, unknown> = {}) => ({
  kind: 'long',
  prompt: PROMPT,
  answer: 'Mit Licht als Energie baut die Pflanze im Chloroplasten aus CO₂ und Wasser Zucker.',
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Fotosynthese',
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
  rubric: KEY_POINTS,
  ...over,
});

async function startExplain(env: TestEnv, l: Learner, items: Record<string, unknown>[]) {
  env.llm.script('explain', {
    json: { usable: true, title: 'Fotosynthese', subject: null, items },
  });
  const res = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind: 'oral',
    text: 'Frag mich Fotosynthese ab',
  });
  expect(res.status).toBe(201);
  await env.flushBackground();
  return (await l.api.get<SessionView>(`/practice/sessions/${res.body.id}`)).body;
}

const answer = (l: Learner, s: SessionView, itemId: string, text: string, id = randomUUID()) =>
  l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
    client_turn_id: id,
    item_id: itemId,
    text,
  });

type Claim = { element: string; met?: boolean; quote?: string };
const judges = (elements: Claim[], spots: Array<{ quote: string; tip: string }> = []) => ({
  json: {
    intent: 'answer',
    verdict: 'partially_correct',
    reply: 'Schon gut erklärt!',
    gave_hint: false,
    revealed_answer: false,
    elements: elements.map((e) => ({ met: false, quote: '', verbs: [], ...e })),
    spots,
  },
});

const points = (res: { body: AnswerResponse }) =>
  (res.body.reply.rubric?.points ?? []).map((p) => `${p.name}: ${p.met ? 'drin' : 'fehlt'}`);

describe.skipIf(!dbReady)('"Erklär mal": an oral quiz checked point by point (#236)', () => {
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

  it('holds only open questions with their key points', async () => {
    const s = await startExplain(env, l, [
      draft(),
      // Without key points it would be judged as one string against a sample: dropped.
      draft({ prompt: 'Erkläre die Zellatmung.', rubric: null }),
      // A key point that is the question itself would be "met" by repeating it: dropped.
      draft({
        prompt: 'Erkläre den Wasserkreislauf.',
        rubric: {
          ...KEY_POINTS,
          elements: [
            point('Erkläre den Wasserkreislauf', 'Wie?', 'Wasser verdunstet'),
            ...KEY_POINTS.elements.slice(1),
          ],
        },
      }),
      // A key point whose name gives its content away, right under the follow-up: dropped.
      draft({
        prompt: 'Erkläre, wie ein Regenbogen entsteht.',
        rubric: {
          ...KEY_POINTS,
          elements: [
            ...KEY_POINTS.elements.slice(0, 2),
            point('Brechung', 'Was passiert im Tropfen?', 'Brechung des Lichts im Tropfen'),
          ],
        },
      }),
      // Not something to explain: not in an oral quiz.
      draft({ kind: 'numeric', prompt: 'Wie viel ist 7 · 8?', answer: '56', rubric: null }),
    ]);
    expect(s.items.map((i) => i.item.prompt)).toEqual([PROMPT]);
    // The app learns that it is a question to explain — never its key points.
    expect(s.items[0]!.item.rubric).toBe('explain');
    expect(JSON.stringify(s)).not.toContain('Chloroplasten statt');
    expect(s.mode).toBe('practice');
    // The generator was told what an oral quiz is, and saw no surface it could fill instead.
    const asked = ScriptedGateway.textOf(env.llm.callsFor('explain').at(-1)!);
    expect(asked).toContain('QUIZZED ORALLY');
  });

  it('two of three points: exactly one follow-up, about the third', async () => {
    const s = await startExplain(env, l, [draft()]);
    const id = s.items[0]!.item.id;
    const said = 'Die Pflanze braucht Licht als Energie und macht aus CO2 und Wasser Zucker.';
    env.llm.script(
      'tutor',
      judges([
        { element: 'r1', met: true, quote: 'braucht Licht als Energie' },
        { element: 'r2', met: true, quote: 'aus CO2 und Wasser Zucker' },
        { element: 'r3', met: false },
      ]),
    );
    const res = await answer(l, s, id, said);
    // One model call for the answer, and it was asked about the key points.
    expect(env.llm.callsFor('tutor')).toHaveLength(1);
    expect(ScriptedGateway.textOf(env.llm.callsFor('tutor')[0]!)).toContain('KEY POINTS');
    // The judge is told what each point SAYS; she only ever sees its aspect.
    expect(ScriptedGateway.textOf(env.llm.callsFor('tutor')[0]!)).toContain(
      'r3 "Findet im Chloroplasten statt"',
    );

    expect(points(res)).toEqual([
      'Energiequelle: drin',
      'Ausgangsstoffe: drin',
      'Ort in der Zelle: fehlt',
    ]);
    // ONE follow-up, the third point's own — not the model's prose, not a list.
    expect(res.body.reply.text).toBe('Das trägt schon. Und wo in der Zelle passiert das?');
    expect(res.body.reply.text.match(/\?/g)).toHaveLength(1);
    expect(res.body.verdict).toBe('partially_correct');
    // No grade, no count, no "solution".
    expect(JSON.stringify(res.body.reply)).not.toMatch(/\d\s*(von|\/)\s*\d/);
    expect(res.body.reply.text).not.toContain('Lösung');
    const after = (await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    expect(after.items[0]!.status).toBe('open');
  });

  it('counts her answer to the follow-up together with the first one', async () => {
    const s = await startExplain(env, l, [draft()]);
    const id = s.items[0]!.item.id;
    env.llm.script(
      'tutor',
      judges([
        { element: 'r1', met: true, quote: 'braucht Licht' },
        { element: 'r2', met: true, quote: 'aus CO2 und Wasser Zucker' },
        { element: 'r3' },
      ]),
    );
    await answer(l, s, id, 'Sie braucht Licht und macht aus CO2 und Wasser Zucker.');
    // The quotes come from BOTH answers — the first one still counts.
    env.llm.script(
      'tutor',
      judges([
        { element: 'r1', met: true, quote: 'braucht Licht' },
        { element: 'r2', met: true, quote: 'aus CO2 und Wasser Zucker' },
        { element: 'r3', met: true, quote: 'im Chloroplasten' },
      ]),
    );
    const res = await answer(l, s, id, 'Im Chloroplasten.');
    // The model saw her first answer and the follow-up in the conversation.
    const seen = ScriptedGateway.textOf(env.llm.callsFor('tutor').at(-1)!);
    expect(seen).toContain('macht aus CO2 und Wasser Zucker');
    expect(seen).toContain('Und wo in der Zelle passiert das?');
    expect(res.body.verdict).toBe('correct');
    expect(points(res).every((p) => p.endsWith('drin'))).toBe(true);
    const after = (await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    expect(after.items[0]!.status).toBe('correct');
  });

  it('does not accept a key point whose quote she never said', async () => {
    const s = await startExplain(env, l, [draft()]);
    const id = s.items[0]!.item.id;
    env.llm.script(
      'tutor',
      judges([
        { element: 'r1', met: true, quote: 'Licht' },
        // Invented: "Chloroplast" is nowhere in what she said.
        { element: 'r3', met: true, quote: 'das passiert in den Chloroplasten' },
        { element: 'r2', met: true, quote: 'aus CO2 und Wasser' },
      ]),
    );
    const res = await answer(l, s, id, 'Mit Licht, und aus CO2 und Wasser wird Zucker.');
    expect(points(res)).toContain('Ort in der Zelle: fehlt');
    expect(res.body.verdict).toBe('partially_correct');
    expect(res.body.reply.text).toContain('Und wo in der Zelle passiert das?');
  });

  it('checks a formula in a key point exactly, whatever the model says', async () => {
    const s = await startExplain(env, l, [draft()]);
    const id = s.items[0]!.item.id;
    env.llm.script(
      'tutor',
      judges([
        { element: 'r1', met: true, quote: 'mit Licht' },
        // "Gase" is not CO₂ — the model's "met" does not buy the value.
        { element: 'r2', met: true, quote: 'aus Gasen und Wasser' },
        { element: 'r3', met: true, quote: 'im Chloroplasten' },
      ]),
    );
    const res = await answer(
      l,
      s,
      id,
      'Im Chloroplasten wird mit Licht aus Gasen und Wasser Zucker.',
    );
    expect(points(res)).toContain('Ausgangsstoffe: fehlt');
    expect(res.body.reply.text).toBe('Das trägt schon. Woraus baut die Pflanze den Zucker?');
  });

  it('replays the same answer instead of judging it twice, and refuses a closed question', async () => {
    const s = await startExplain(env, l, [draft()]);
    const id = s.items[0]!.item.id;
    const turn = randomUUID();
    env.llm.script(
      'tutor',
      judges([
        { element: 'r1', met: true, quote: 'Licht' },
        { element: 'r2', met: true, quote: 'CO2 und Wasser' },
        { element: 'r3', met: true, quote: 'Chloroplasten' },
      ]),
    );
    const said = 'Licht, CO2 und Wasser, Chloroplasten.';
    const first = await answer(l, s, id, said, turn);
    const again = await answer(l, s, id, said, turn);
    // Same reply, same list — and no second model call (afterEach fails on one).
    expect(again.body.reply).toEqual(first.body.reply);
    expect(first.body.verdict).toBe('correct');
    // A further answer to the closed question is refused, not judged.
    expect((await answer(l, s, id, 'Noch was.')).status).toBe(409);
  });

  it('does not let another learner answer in her session', async () => {
    const s = await startExplain(env, l, [draft()]);
    const other = await onboard(env, {
      relation: 'child',
      name: 'Mia',
      birthDate: '2013-05-01',
      pin: '1937',
    });
    const res = await answer(other, s, s.items[0]!.item.id, 'Licht.');
    expect(res.status).toBe(404);
  });

  it('claims nothing when the model is down', async () => {
    const s = await startExplain(env, l, [draft()]);
    const id = s.items[0]!.item.id;
    env.llm.script('tutor', { error: new LlmError('unavailable', 'down') });
    const res = await answer(l, s, id, 'Licht und CO2.');
    // Nobody judged it: no verdict, no list, no follow-up pretending to know what is missing.
    expect(res.body.verdict).toBeNull();
    expect(res.body.reply.rubric).toBeNull();
    // …and no "solution" to look at: a free text has none (#197, #236).
    expect(res.body.reply.text).not.toContain('Lösung');
    expect(res.body.reply.text).toContain('schick sie gleich nochmal');
  });
});

// ─────────────── der lange Text (#258) ───────────────

const ESSAY_RUBRIC = {
  kind: 'text',
  form: 'Erörterung',
  elements: [
    {
      name: 'Absätze',
      missing: 'Teile deinen Text in Einleitung, Hauptteil und Schluss.',
      ask: null,
      check: { by: 'paragraphs', min: 3 },
    },
    {
      name: 'Länge',
      missing: 'Etwas ausführlicher darf es sein.',
      ask: null,
      check: { by: 'word_count', min: 300, max: null },
    },
    {
      name: 'eigene Position',
      missing: 'Sag am Schluss, wo du selbst stehst.',
      ask: null,
      check: { by: 'judged', exact: [] },
    },
  ],
};

const essayItem = (over: Record<string, unknown> = {}) =>
  draft({
    prompt: 'Erörtere: Sollten Schuluniformen Pflicht sein?',
    answer: 'Einleitung mit These, Argumente mit Beispielen, Gegenargument, Schluss mit Position.',
    topic: 'Erörterung',
    rubric: ESSAY_RUBRIC,
    ...over,
  });

async function startPractice(env: TestEnv, l: Learner, items: Record<string, unknown>[]) {
  env.llm.script('explain', { json: { usable: true, title: 'Erörterung', subject: null, items } });
  const res = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind: 'practice',
    text: 'Erörterung üben',
  });
  expect(res.status).toBe(201);
  await env.flushBackground();
  return (await l.api.get<SessionView>(`/practice/sessions/${res.body.id}`)).body;
}

/** About 1500 words in three paragraphs, with a position at the end. */
function longEssay(): string {
  // An ordinary German sentence (6.5 characters a word with its space), as an essay has them.
  const sentence = 'Viele finden, dass eine Uniform den Alltag in der Schule leichter macht. ';
  const body = sentence.repeat(62).trim();
  return [
    'Ob Schuluniformen Pflicht sein sollten, wird seit Jahren diskutiert.',
    body,
    `${body} Deshalb bin ich für Schuluniformen, weil sie mehr Ruhe bringen.`,
  ].join('\n');
}

describe.skipIf(!dbReady)('a long text gets feedback per element, never a grade (#258)', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T09:00:00Z' });
    l = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2010-02-10',
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

  it('takes an essay of 1500 words, and only an essay', async () => {
    const s = await startPractice(env, l, [
      essayItem(),
      draft({
        kind: 'short',
        prompt: 'Was ist eine These?',
        answer: 'Eine Behauptung',
        rubric: null,
      }),
    ]);
    const essay = s.items.find((i) => i.item.kind === 'long')!.item.id;
    // The app learns that it is a writing task with a rubric — never the rubric itself.
    expect(s.items.map((i) => i.item.rubric)).toEqual(['text', null]);
    expect(JSON.stringify(s)).not.toContain('Teile deinen Text');
    const short = s.items.find((i) => i.item.kind === 'short')!.item.id;
    const text = longEssay();
    expect(text.split(/\s+/).length).toBeGreaterThan(1400);
    expect(text.length).toBeGreaterThan(2000);
    expect(text.length).toBeLessThanOrEqual(15_000);

    // A short answer of that length is not an answer to a short question.
    const tooLong = await answer(l, s, short, text);
    expect(tooLong.status).toBe(422);
    expect(JSON.stringify(tooLong.body)).toContain('too_long');
    // Beyond the essay field, nothing.
    expect((await answer(l, s, essay, 'x'.repeat(15_001))).status).toBe(422);

    env.llm.script(
      'tutor',
      judges(
        [{ element: 'r3', met: true, quote: 'Deshalb bin ich für Schuluniformen' }],
        [
          {
            quote: 'dass eine Uniform den Alltag in der Schule leichter macht',
            tip: 'Belege das mit einem Beispiel aus deiner Schule.',
          },
          // Invented: she never wrote this.
          { quote: 'Uniformen fördern die Disziplin enorm', tip: 'Führe das weiter aus.' },
          // A grade in disguise: dropped, whatever its quote.
          { quote: 'mehr Ruhe bringen', tip: 'Das gibt glatt eine 2+.' },
          {
            quote: 'wird seit Jahren diskutiert',
            tip: 'Formuliere deine These schon in der Einleitung.',
          },
        ],
      ),
    );
    const res = await answer(l, s, essay, text);
    expect(res.status).toBe(200);
    const fb = res.body.reply.rubric!;
    expect(fb.points).toEqual([
      { name: 'Absätze', met: true },
      { name: 'Länge', met: true },
      { name: 'eigene Position', met: true },
    ]);
    expect(fb.spots.map((sp) => sp.quote)).toEqual([
      'dass eine Uniform den Alltag in der Schule leichter macht',
      'wird seit Jahren diskutiert',
    ]);
    // Never a grade, a score or a count — in the sentence, the list, or a tip.
    const shown = [
      res.body.reply.text,
      ...fb.points.map((p) => p.name),
      ...fb.spots.map((sp) => sp.tip),
    ];
    for (const x of shown) expect(x).not.toMatch(/\d/);
    // The essay is kept as she wrote it.
    const stored = await env.db.query<{ n: number }>(
      `select length(text)::int as n from practice_turns where item_id = $1 and role = 'learner'`,
      [essay],
    );
    expect(stored.map((r) => r.n)).toEqual([text.length]);
  });

  it("drops a grade in Buddy's own words when everything holds", async () => {
    const s = await startPractice(env, l, [essayItem()]);
    const id = s.items[0]!.item.id;
    env.llm.script('tutor', {
      json: {
        ...judges([{ element: 'r3', met: true, quote: 'Deshalb bin ich für Schuluniformen' }]).json,
        // Everything holds, so his sentence would stand — but it carries a grade.
        reply: 'Super Erörterung, das wäre eine glatte 1-!',
      },
    });
    const res = await answer(l, s, id, longEssay());
    expect(res.body.verdict).toBe('correct');
    expect(res.body.reply.text).toBe('Das trägt – alles drin.');
    expect(res.body.reply.text).not.toMatch(/\d/);
  });

  it('names the missing structure as the one next step', async () => {
    const s = await startPractice(env, l, [essayItem()]);
    const id = s.items[0]!.item.id;
    env.llm.script('tutor', judges([{ element: 'r3', met: true, quote: 'Deshalb bin ich dafür' }]));
    // One block, long enough, with a position: the paragraphs are what is missing.
    const oneBlock = `${'Uniformen sparen am Morgen viel Zeit und Streit. '.repeat(50)}Deshalb bin ich dafür.`;
    const res = await answer(l, s, id, oneBlock);
    expect(res.body.reply.rubric?.points[0]).toEqual({ name: 'Absätze', met: false });
    expect(res.body.reply.text).toBe(
      'Fast – fehlt nur noch Absätze: Teile deinen Text in Einleitung, Hauptteil und Schluss.',
    );
    expect(res.body.verdict).toBe('partially_correct');
  });
});
