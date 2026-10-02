// A written path, judged by code (issue #209).
//
// In a class test the WAY is marked, not only the result. Until now one number was compared
// against the key, so a correct calculation with a mistyped last line got the same verdict as
// no idea at all — and a typed path went to the model, whose judgement nothing checked.
//
// The proof that matters here is the same as for #212: no tutor is scripted, and the harness
// fails loudly on an unscripted model call. So "code decided this" is not an assertion anyone
// has to trust.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const item = (over: Record<string, unknown>) => ({
  kind: 'numeric',
  prompt: 'Löse: $2x + 3 = 7$',
  answer: '2',
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Gleichungen',
  difficulty: 3,
  prompt_lang: 'de',
  lang: null,
  figure: null,
  source_excerpt: null,
  ...over,
});

async function start(
  env: TestEnv,
  l: Learner,
  items: Record<string, unknown>[],
  kind: 'practice' | 'help' = 'practice',
) {
  env.llm.script('explain', {
    json: { usable: true, title: 'Gleichungen', subject: null, items },
  });
  const res = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind,
    text: kind === 'help' ? items[0]!.prompt : 'Gleichungen',
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

const PATH_OK = '2x + 3 = 7\n2x = 4\nx = 2';

describe.skipIf(!dbReady)('a written path is judged by code, step by step', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T09:00:00Z' });
    l = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2012-02-10',
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

  it('accepts a sound path and judges it on the value it arrives at', async () => {
    const s = await start(env, l, [item({})]);
    const id = s.items[0]!.item.id;
    const r = await answer(l, s, id, PATH_OK);
    expect(r.body.verdict).toBe('correct');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
    const si = await env.db.one<{ first_try_correct: boolean }>(
      `select first_try_correct from session_items where session_id = $1 and item_id = $2`,
      [s.id, id],
    );
    // A path written out is not "help": she got it right on the first try.
    expect(si.first_try_correct).toBe(true);
  });

  it('names the line where the path stops following itself', async () => {
    const s = await start(env, l, [item({ prompt: 'Löse: $2x - 6 = 0$', answer: '3' })]);
    const id = s.items[0]!.item.id;
    // The sign of the 6 flips between line 2 and line 3.
    const r = await answer(l, s, id, '2x - 6 = 0\n2x = 6\nx = -3');
    expect(r.body.verdict).toBe('partially_correct');
    expect(r.body.reply.text).toBe(
      'Dein Weg stimmt bis zum Schluss – nur der letzte Schritt nicht. Schau nochmal auf die letzte Zeile.',
    );
    expect(r.body.session.items[0]!.status).toBe('open');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('points at an earlier line when that is where it broke', async () => {
    const s = await start(env, l, [
      item({ kind: 'formula', prompt: 'Multipliziere aus: $2(x+3)$', answer: '2x + 6' }),
    ]);
    const id = s.items[0]!.item.id;
    const r = await answer(l, s, id, '2(x + 3)\n2x + 3\n2x + 3');
    expect(r.body.verdict).toBe('partially_correct');
    expect(r.body.reply.text).toBe(
      'Bis Zeile 1 stimmt alles. Von dort zur nächsten Zeile geht etwas verloren – schau dir diesen Schritt nochmal an.',
    );
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('does not cry wolf about a step written differently', async () => {
    const s = await start(env, l, [
      item({ kind: 'formula', prompt: 'Multipliziere aus: $(x+1)(x-1)$', answer: 'x^2 - 1' }),
    ]);
    const id = s.items[0]!.item.id;
    const r = await answer(l, s, id, '(x+1)(x-1)\nx·x - 1\nx^2 - 1');
    expect(r.body.verdict).toBe('correct');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('leaves a path it cannot check to the model', async () => {
    const s = await start(env, l, [item({})]);
    const id = s.items[0]!.item.id;
    env.llm.script('tutor', {
      json: {
        intent: 'answer',
        verdict: 'partially_correct',
        reply: 'Der Ansatz passt. Rechne den letzten Schritt nochmal.',
        gave_hint: false,
        revealed_answer: false,
      },
    });
    // A line in words: code must not guess, and must not claim a broken step either.
    const r = await answer(l, s, id, '2x + 3 = 7\ndann ziehe ich 3 ab\nx = 2');
    expect(r.body.verdict).toBe('partially_correct');
    expect(env.llm.callsFor('tutor')).toHaveLength(1);
  });

  // Homework help used to shut EVERY fixed near-miss reply out, and so threw away the one thing
  // code knew precisely: which step broke (issue #274). The reason for the exclusion was that a
  // fixed reply shows the solution — true of a spelling, untrue of a line number.
  it('names the broken line in homework help too, where a tip is the whole point', async () => {
    const s = await start(
      env,
      l,
      [item({ kind: 'formula', prompt: 'Multipliziere aus: $2(x+3)$', answer: '2x + 6' })],
      'help',
    );
    const id = s.items[0]!.item.id;
    const r = await answer(l, s, id, '2(x + 3)\n2x + 3\n2x + 3');
    expect(r.body.verdict).toBe('partially_correct');
    expect(r.body.reply.text).toBe(
      'Bis Zeile 1 stimmt alles. Von dort zur nächsten Zeile geht etwas verloren – schau dir diesen Schritt nochmal an.',
    );
    // The question stays open, and nothing was asked of a model.
    expect(r.body.session.items[0]!.status).toBe('open');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  // The other half of #274: what still may NOT happen in homework help.
  it('still shows no spelling in homework help — there the tutor judges', async () => {
    const s = await start(
      env,
      l,
      [
        item({
          kind: 'short',
          prompt: 'Wie heißt die Hauptstadt von Frankreich?',
          answer: 'Paris',
          topic: 'Europa',
        }),
      ],
      'help',
    );
    const id = s.items[0]!.item.id;
    env.llm.script('tutor', {
      json: {
        intent: 'answer',
        verdict: 'partially_correct',
        reply: 'Fast – schau dir das Wort nochmal genau an.',
        gave_hint: false,
        revealed_answer: false,
      },
    });
    // A slip: the near miss whose fixed reply would spell the answer out. Homework help never
    // shows the solution, so the tutor judges — and that is unchanged by #274.
    const r = await answer(l, s, id, 'Pariis');
    expect(r.body.reply.text).not.toContain('Paris');
    expect(env.llm.callsFor('tutor')).toHaveLength(1);
  });

  it('leaves a single-line answer exactly as it was', async () => {
    const s = await start(env, l, [item({})]);
    const id = s.items[0]!.item.id;
    const r = await answer(l, s, id, '2');
    expect(r.body.verdict).toBe('correct');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });
});
