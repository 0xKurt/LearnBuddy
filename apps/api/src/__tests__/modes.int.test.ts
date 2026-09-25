// Learning modes beyond practice from photos: homework help that never gives
// the solution, explanations with check questions, typed vocabulary in both
// directions, speaking practice judged from the recording, and figures.
// docs/architecture.md §Practice.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, MaterialView, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const item = (over: Record<string, unknown>) => ({
  kind: 'short',
  prompt: 'Frage',
  answer: 'Antwort',
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Thema',
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
  ...over,
});

const tutor = (reply: string, over: Record<string, unknown> = {}) => ({
  json: {
    intent: 'answer',
    verdict: 'incorrect',
    reply,
    gave_hint: true,
    revealed_answer: false,
    ...over,
  },
});

async function answer(l: Learner, session: SessionView, itemId: string, text: string) {
  return l.api.post<AnswerResponse>(`/practice/sessions/${session.id}/answer`, {
    client_turn_id: randomUUID(),
    item_id: itemId,
    text,
  });
}

describe.skipIf(!dbReady)('learning modes', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T14:00:00Z' });
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

  it('helps with photographed homework without ever giving the solution', async () => {
    env.llm.script('extraction', (req) => {
      // The homework prompt, not the "write practice questions" one.
      expect(req.system).toContain('help to solve it THEMSELVES');
      return {
        is_learning_material: true,
        readable: true,
        title: 'Hausaufgabe Brüche',
        subject: { name: 'Mathe', kind: 'math' },
        extracted_text: '1. Berechne 3/4 + 1/8.',
        items: [
          item({
            kind: 'short',
            prompt: 'Berechne $\\frac{3}{4} + \\frac{1}{8}$.',
            answer: '7/8',
            topic: 'Brüche addieren',
          }),
        ],
      };
    });
    const created = await l.api.post<{ material: MaterialView; uploads: Array<{ path: string }> }>(
      '/materials',
      { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'], purpose: 'homework' },
    );
    expect(created.status).toBe(201);
    env.storage.put(created.body.uploads[0]!.path);
    await l.api.post(`/materials/${created.body.material.id}/submit`);
    await env.flushBackground();

    const material = (await l.api.get<MaterialView>(`/materials/${created.body.material.id}`)).body;
    expect(material).toMatchObject({ status: 'ready', purpose: 'homework' });
    expect(material.session_id).not.toBeNull();
    // No "Buddy prepares practice" for homework.
    expect(
      await env.db.query(
        `select 1 from jobs where kind = 'buddy_check' and payload->>'reason' = 'material_ready'`,
      ),
    ).toEqual([]);

    let session = (await l.api.get<SessionView>(`/practice/sessions/${material.session_id}`)).body;
    expect(session).toMatchObject({
      mode: 'help',
      reveal_allowed: false,
      title: 'Hausaufgabe Brüche',
    });
    const task = session.items[0]!.item;
    expect(task.origin).toBe('homework');

    // The tutor gives the solution away twice: repaired once, then replaced by a safe hint.
    env.llm.script(
      'tutor',
      tutor('Das Ergebnis ist 7/8.', { revealed_answer: false }),
      tutor('Also: 7/8!', { revealed_answer: true }),
    );
    const first = await answer(l, session, task.id, 'keine ahnung');
    expect(first.status).toBe(200);
    expect(first.body.reply.text).not.toContain('7/8');
    expect(first.body.reply.text).toContain('Schritt für Schritt');
    // The repair round told the model why.
    expect(ScriptedGateway.textOf(env.llm.callsFor('tutor')[1]!)).toContain(
      'gives the solution away',
    );

    // "Show solution" does not exist for homework.
    const reveal = await l.api.post(`/practice/sessions/${session.id}/reveal`, {
      item_id: task.id,
    });
    expect(reveal.status).toBe(409);
    expect(reveal.body).toMatchObject({ error: { details: { reason: 'reveal_not_allowed' } } });

    // Solved by the learner: confirmed, and the solution still isn't sent.
    const solved = await answer(l, session, task.id, '7/8');
    expect(solved.body.verdict).toBe('correct');
    expect(solved.body.reply.text).toContain('selbst gelöst');
    session = solved.body.session;
    expect(session.items[0]).toMatchObject({ status: 'correct', answer: null });
  });

  it('explains a topic, then checks it — idempotent per request', async () => {
    const request = {
      client_request_id: randomUUID(),
      kind: 'explain',
      text: 'Erklär mir den Dativ',
    };
    env.llm.script('explain', (req) => {
      const text = ScriptedGateway.textOf(req);
      expect(text).toContain('EXPLAIN the topic');
      expect(text).toContain('Erklär mir den Dativ');
      return {
        usable: true,
        title: 'Dativ',
        subject: { name: 'Deutsch', kind: 'german' },
        intro: 'Der Dativ ist der 3. Fall. Du fragst: Wem?',
        items: [
          item({
            prompt: 'Mit welcher Frage findest du den Dativ?',
            answer: 'Wem?',
            topic: 'Dativ',
          }),
          item({
            kind: 'multiple_choice',
            prompt: 'Welcher Satz hat einen Dativ?',
            answer: 'Ich helfe dem Mann.',
            choices: ['Ich sehe den Mann.', 'Ich helfe dem Mann.'],
            correct_choice: 1,
            topic: 'Dativ',
          }),
          item({ kind: 'speak', prompt: 'nicht erlaubt hier', answer: 'x', lang: 'de' }),
        ],
      };
    });
    const res = await l.api.post<SessionView>('/practice/topic', request);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      mode: 'explain',
      intro: 'Der Dativ ist der 3. Fall. Du fragst: Wem?',
      title: 'Dativ',
    });
    // Only kinds that fit an explanation; Buddy's own questions are marked as such.
    expect(res.body.items.map((i) => i.item.kind)).toEqual(['short', 'multiple_choice']);
    expect(res.body.items.every((i) => i.item.origin === 'buddy')).toBe(true);

    const again = await l.api.post<SessionView>('/practice/topic', request);
    expect(again.body.id).toBe(res.body.id);
    expect(env.llm.callsFor('explain')).toHaveLength(1);

    // The tutor sees the explanation it refers to.
    env.llm.script('tutor', (req) => {
      expect(ScriptedGateway.textOf(req)).toContain('EXPLANATION:\nDer Dativ ist der 3. Fall.');
      return {
        intent: 'answer',
        verdict: 'correct',
        reply: 'Genau!',
        gave_hint: false,
        revealed_answer: false,
      };
    });
    const ok = await answer(l, res.body, res.body.items[0]!.item.id, 'Mit wem');
    expect(ok.body.verdict).toBe('correct');
  });

  it('says honestly when a request is nothing to learn from', async () => {
    env.llm.script('explain', {
      json: { usable: false, title: '—', subject: null, intro: null, items: [] },
    });
    const res = await l.api.post('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Wie hacke ich das WLAN der Schule?',
    });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: { details: { reason: 'not_usable' } } });
  });

  it('asks typed vocabulary in both directions and treats missing accents as almost right', async () => {
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Unité 3',
        subject: { name: 'Französisch', kind: 'french' },
        intro: null,
        items: [
          item({
            kind: 'vocab',
            prompt: "l'élève",
            answer: 'der Schüler',
            prompt_lang: 'fr',
            lang: 'de',
            topic: 'Unité 3',
          }),
        ],
      },
    });
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'vocab',
      text: "l'élève – der Schüler",
    });
    expect(res.status).toBe(201);
    const kinds = res.body.items.map((i) => [i.item.prompt, i.item.prompt_lang, i.item.lang]);
    expect(kinds).toEqual([
      ["l'élève", 'fr', 'de'],
      ['der Schüler', 'de', 'fr'],
    ]);
    // German → French, typed without accents: the tutor hears "close" and it is never fully right.
    env.llm.script('tutor', (req) => {
      expect(ScriptedGateway.textOf(req)).toContain('close: right except accents');
      return {
        intent: 'answer',
        verdict: 'correct',
        reply: 'Fast – é!',
        gave_hint: false,
        revealed_answer: false,
      };
    });
    const back = res.body.items[1]!.item;
    const r = await answer(l, res.body, back.id, "l'eleve");
    expect(r.body.verdict).toBe('partially_correct');
  });

  it('listens to a recording: word feedback, retry stays open, a replay is not judged twice', async () => {
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Aussprache',
        subject: { name: 'Französisch', kind: 'french' },
        intro: null,
        items: [
          item({
            kind: 'speak',
            prompt: "Je m'appelle Lena.",
            answer: "Je m'appelle Lena.",
            lang: 'fr',
            topic: 'Vorstellen',
          }),
        ],
      },
    });
    const s = (
      await l.api.post<SessionView>('/practice/topic', {
        client_request_id: randomUUID(),
        kind: 'speak',
        text: "Je m'appelle Lena.",
      })
    ).body;
    const speakId = s.items[0]!.item.id;
    // Typing is not how a speak question is answered.
    expect((await answer(l, s, speakId, 'je mapel')).status).toBe(409);

    const audio = Buffer.alloc(300_000, 7).toString('base64'); // ~400 KB of base64, like 10 s of speech
    env.llm.script(
      'pronounce',
      (req) => {
        const parts = req.contents[0]!.parts;
        expect(parts.some((p) => 'inlineData' in p && p.inlineData.mimeType === 'audio/mp4')).toBe(
          true,
        );
        expect(ScriptedGateway.textOf(req)).toContain("TARGET (fr): Je m'appelle Lena.");
        return {
          audible: true,
          heard: 'Je mapelle Lena',
          overall: 'retry',
          words: [
            { text: 'Je', ok: true, tip: null },
            { text: "m'appelle", ok: false, tip: 'Das ‹ll› klingt wie ‹l›, Betonung am Ende.' },
            { text: 'Lena', ok: true, tip: 'unnötig' },
          ],
          reply: 'Fast! Achte auf „m’appelle“.',
        };
      },
      {
        json: {
          audible: true,
          heard: "Je m'appelle Lena",
          overall: 'good',
          words: [
            { text: 'Je', ok: true, tip: null },
            { text: "m'appelle", ok: true, tip: null },
            { text: 'Lena', ok: true, tip: null },
          ],
          reply: 'Klingt super!',
        },
      },
    );
    const turnId = randomUUID();
    const first = await l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/speak`, {
      client_turn_id: turnId,
      item_id: speakId,
      mime: 'audio/m4a',
      audio_base64: audio,
    });
    expect(first.status).toBe(200);
    expect(first.body.verdict).toBe('incorrect');
    expect(first.body.reply.pronunciation).toEqual({
      heard: 'Je mapelle Lena',
      overall: 'retry',
      words: [
        { text: 'Je', ok: true, tip: null },
        { text: "m'appelle", ok: false, tip: 'Das ‹ll› klingt wie ‹l›, Betonung am Ende.' },
        { text: 'Lena', ok: true, tip: null },
      ],
    });
    expect(first.body.session.items[0]!.status).toBe('open');
    // The same recording sent again (lost answer) is not judged again.
    const replay = await l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/speak`, {
      client_turn_id: turnId,
      item_id: speakId,
      mime: 'audio/m4a',
      audio_base64: audio,
    });
    expect(replay.body.reply.id).toBe(first.body.reply.id);
    expect(env.llm.callsFor('pronounce')).toHaveLength(1);

    const second = await l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/speak`, {
      client_turn_id: randomUUID(),
      item_id: speakId,
      mime: 'audio/webm',
      audio_base64: audio,
    });
    expect(second.body.verdict).toBe('correct');
    expect(second.body.session.items[0]!.status).toBe('correct');
    // Recordings are never stored.
    const stored = await env.db.query<{ text: string }>(
      `select text from practice_turns where role = 'learner'`,
    );
    expect(stored.map((r) => r.text)).toEqual(['🎤 Je mapelle Lena', "🎤 Je m'appelle Lena"]);
  });

  it('keeps figures the app can draw and drops broken ones without losing the question', async () => {
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Funktionen',
        subject: { name: 'Mathe', kind: 'math' },
        intro: null,
        items: [
          item({
            prompt: 'Wo schneidet der Graph die x-Achse?',
            answer: '2',
            figure: {
              type: 'function_plot',
              functions: [
                { expr: '0.5*x^2-2', label: 'f' },
                { expr: 'x+*', label: null },
              ],
              x_min: -4,
              x_max: 4,
              y_min: -3,
              y_max: 5,
              points: [],
            },
          }),
          item({
            prompt: 'Welcher Bruch ist dargestellt?',
            answer: '3/4',
            figure: { type: 'fraction', shape: 'circle', fractions: [{ parts: 4, filled: 5 }] },
          }),
        ],
      },
    });
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Funktionen und Brüche',
    });
    expect(res.status).toBe(201);
    const [plot, fraction] = res.body.items.map((i) => i.item);
    expect(plot!.figure).toMatchObject({
      type: 'function_plot',
      functions: [{ expr: '0.5*x^2-2', label: 'f' }],
    });
    expect(fraction!.figure).toBeNull();
    expect(fraction!.prompt).toBe('Welcher Bruch ist dargestellt?');
  });
});
