// The mechanical checkers through the answer endpoint (issues #235, #227, #263): Regel 0 — what
// code can decide, code decides; the model never does when code can be certain.
//
// The proof is the one #209, #212 and #227 use: nothing is scripted for the tutor where code
// decides, and the harness fails loudly on an unscripted model call. A verdict that arrives with
// zero tutor calls was reached by code. Where the tutor IS asked (the value is right and only the
// form differs), the test checks what it is told and that its "wrong" does not survive.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const item = (over: Record<string, unknown>) => ({
  kind: 'formula',
  prompt: 'Frage',
  answer: 'Antwort',
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Algebra',
  difficulty: 2,
  prompt_lang: 'de',
  lang: null,
  figure: null,
  source_excerpt: null,
  ...over,
});

const FACTORISE = item({ prompt: 'Faktorisiere $x^{2}+2x+1$.', answer: '(x+1)^2' });
const EXPAND = item({ prompt: 'Multipliziere aus: $2(x+3)$', answer: '2x + 6' });
const SYSTEM = item({
  kind: 'short',
  prompt: 'Löse das Gleichungssystem: $x + y = 5$ und $x - y = 1$.',
  answer: 'x = 3, y = 2',
  topic: 'Gleichungssysteme',
});
const INEQUALITY = item({
  kind: 'short',
  prompt: 'Löse die Ungleichung $3 - 2x > -1$.',
  answer: 'x < 2',
  topic: 'Ungleichungen',
});
const ANTIDERIVATIVE = item({
  prompt: 'Gib alle Stammfunktionen von $f(x) = x^3$ an.',
  answer: 'F(x) = x^4/4 + C',
  topic: 'Integralrechnung',
});
const DECAY = item({
  prompt: 'Stelle die Zerfallsgleichung für den Alpha-Zerfall von Uran-238 auf.',
  answer: '²³⁸₉₂U → ²³⁴₉₀Th + ⁴₂He',
  topic: 'Radioaktivität',
});
const REDOX = item({
  prompt: 'Stelle die Teilgleichung der Oxidation von Eisen zu Eisen(III)-Ionen auf.',
  answer: 'Fe → Fe^{3+} + 3e^-',
  topic: 'Redoxreaktionen',
});

async function start(env: TestEnv, l: Learner, kind: 'test' | 'practice', items: unknown[]) {
  env.llm.script('explain', {
    json: { usable: true, title: 'Prüfer', subject: { name: 'Mathe', kind: 'math' }, items },
  });
  const res = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind,
    text: 'Prüfer',
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

const idOf = (s: SessionView, prompt: string) => {
  const found = s.items.find((i) => i.item.prompt === prompt);
  if (!found) throw new Error(`no item: ${prompt}`);
  return found.item.id;
};

describe.skipIf(!dbReady)('the mechanical checkers, through the answer endpoint', () => {
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
  afterEach(() => env.closeChecked());

  it('decides form, systems, inequalities, integrals and decays with no tutor call', async () => {
    const all = [FACTORISE, EXPAND, SYSTEM, INEQUALITY, ANTIDERIVATIVE, DECAY, REDOX];
    const s = await start(env, l, 'test', all);
    expect(s.items).toHaveLength(all.length);
    const cases: Array<[Record<string, unknown>, string, string]> = [
      // The key's form in another order is right (#235) …
      [FACTORISE, '(x+1)(x+1)', 'correct'],
      [EXPAND, '6 + 2x', 'correct'],
      // … the solution of a system with its values swapped, an inequality whose sign was not
      // turned, an antiderivative that was not integrated, are wrong (#263, #235).
      [SYSTEM, 'x = 2, y = 3', 'incorrect'],
      [INEQUALITY, 'x > 2', 'incorrect'],
      [ANTIDERIVATIVE, '3x^2 + C', 'incorrect'],
      // A decay whose mass numbers do not add up, a half-equation with an electron missing:
      // partly right and named (#263).
      [DECAY, 'U-238 → Th-234 + He-3', 'partially_correct'],
      [REDOX, 'Fe → Fe³⁺ + 2e⁻', 'partially_correct'],
    ];
    for (const [it, text, verdict] of cases) {
      const r = await answer(l, s, idOf(s, it.prompt as string), text);
      expect(r.body.verdict, `${it.prompt as string} ← ${text}`).toBe(verdict);
    }

    expect(env.llm.callsFor('tutor')).toHaveLength(0);
    const stored = await env.db.query<{ evaluated_by: string }>(
      `select evaluated_by from practice_turns
        where session_id = $1 and role = 'learner' order by seq`,
      [s.id],
    );
    expect(stored.map((r) => r.evaluated_by)).toEqual(cases.map(() => 'rule'));
  });

  it('calls the task typed back partly right, says why, and asks no model', async () => {
    const s = await start(env, l, 'practice', [FACTORISE, EXPAND]);
    // The acceptance of issue #235: "Faktorisiere x²+2x+1" answered with x²+2x+1.
    const r = await answer(l, s, idOf(s, FACTORISE.prompt as string), 'x²+2x+1');
    expect(r.body.verdict).toBe('partially_correct');
    expect(r.body.reply.text).toBe(
      'Gleichwertig – aber das steht genau so schon in der Aufgabe. Forme es noch um.',
    );
    // Wrong-but-close is still wrong, by the rules (the first wrong try needs no model either) …
    const wrong = await answer(l, s, idOf(s, EXPAND.prompt as string), '2x + 5');
    expect(wrong.body.verdict).toBe('incorrect');
    // … and the task's own term written back is the near miss, also after a wrong try.
    const typedBack = await answer(l, s, idOf(s, EXPAND.prompt as string), '2(x+3)');
    expect(typedBack.body.verdict).toBe('partially_correct');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('names the number that does not add up in a decay', async () => {
    const s = await start(env, l, 'practice', [DECAY]);
    const r = await answer(l, s, s.items[0]!.item.id, '²³⁸U → ²³⁴Th + ³He');
    expect(r.body.verdict).toBe('partially_correct');
    expect(r.body.reply.text).toBe(
      'Fast – die Massenzahlen stimmen noch nicht: links 238, rechts 237.',
    );
    const ok = await answer(l, s, s.items[0]!.item.id, 'U-238 → α + Th-234');
    expect(ok.body.verdict).toBe('correct');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('holds a confirmed value at "partly right" when the model says wrong (#227)', async () => {
    const shape = item({ prompt: 'Vereinfache $x^2 + x + x + 1$.', answer: '(x+1)^2' });
    const s = await start(env, l, 'practice', [shape]);
    // Expanded for a factored key: the same value, another shape. The tutor decides whether the
    // question asked for the shape — and is told what the shapes are.
    env.llm.script('tutor', (req) => {
      const text = ScriptedGateway.textOf(req);
      expect(text).toContain('RULE CHECK: the VALUE is right');
      expect(text).toContain(
        'FORM CHECK (read by code, not judged): the key is factored (a product with a bracket), her answer is expanded (a sum)',
      );
      return {
        intent: 'answer',
        verdict: 'incorrect',
        reply: 'Leider falsch.',
        gave_hint: false,
        revealed_answer: false,
      };
    });
    const r = await answer(l, s, s.items[0]!.item.id, 'x^2 + 2x + 1');
    expect(env.llm.callsFor('tutor')).toHaveLength(1);
    // Never "wrong" for a value code confirmed, and never the model's words for "wrong".
    expect(r.body.verdict).toBe('partially_correct');
    expect(r.body.reply.text).toBe(
      'Der Wert stimmt – du hast es nur anders geschrieben. Schau noch, in welcher Form die Aufgabe das Ergebnis haben möchte.',
    );
    const stored = await env.db.one<{ verdict: string; evaluated_by: string }>(
      `select verdict, evaluated_by from practice_turns
        where session_id = $1 and role = 'learner'`,
      [s.id],
    );
    expect(stored).toEqual({ verdict: 'partially_correct', evaluated_by: 'model' });
  });

  it('lets the model call a confirmed value right when the form was not the question', async () => {
    const lgs = item({
      kind: 'short',
      prompt: 'Löse: $x + y = 5$, $x - y = 1$.',
      answer: 'x = 3, y = 2',
    });
    const s = await start(env, l, 'practice', [lgs]);
    env.llm.script('tutor', {
      json: {
        intent: 'answer',
        verdict: 'correct',
        reply: 'Genau.',
        gave_hint: false,
        revealed_answer: false,
      },
    });
    const r = await answer(l, s, s.items[0]!.item.id, 'x = 6/2; y = 2');
    expect(r.body.verdict).toBe('correct');
    expect(env.llm.callsFor('tutor')).toHaveLength(1);
  });

  it('never asks a question whose key its own maths proves wrong', async () => {
    const good = item({ prompt: 'Multipliziere aus: $3(x-1)$', answer: '3x - 3' });
    const s = await start(env, l, 'test', [
      good,
      // The system's solution is x = 3, y = 2, not the key's.
      item({ kind: 'short', prompt: 'Löse: $x + y = 5$ und $x - y = 1$.', answer: 'x = 2, y = 3' }),
      // The derivative of x³ − 2x is 3x² − 2.
      item({ prompt: 'Leite ab: $f(x) = x^3 - 2x$.', answer: "f'(x) = 3x^2 - 2x" }),
      // 238 ≠ 234 + 3.
      item({ prompt: 'Alpha-Zerfall von U-238', answer: '²³⁸₉₂U → ²³⁴₉₀Th + ³₂He' }),
      // An unbalanced reaction as key.
      item({ prompt: 'Knallgas', answer: 'H2 + O2 → H2O' }),
    ]);
    expect(s.items.map((i) => i.item.prompt)).toEqual([good.prompt]);
  });
});
