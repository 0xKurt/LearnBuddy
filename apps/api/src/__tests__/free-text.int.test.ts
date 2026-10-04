// A free text ("Erörtere …") is not a question with one right answer, and the app must stop
// behaving as if it were (issue #197, CLAUDE.md rule 5). Three claims are removed here and
// each one is checked against the database, not against the reply alone:
//   - no "Die Lösung ist: …", because `items.answer` is a 600-character sketch, not the answer;
//   - no FSRS rating, because `Again` states something about memory that nobody measured;
//   - no shaky topic, for the same reason.
// What stays: the way past it, Buddy's judgement of what she wrote, and — where one was
// prepared — a worked way, introduced as ONE way.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import {
  createTestEnv,
  finishRun,
  onboard,
  type Learner,
  type TestEnv,
} from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const ESSAY_KEY =
  'Pro: mehr Schlaf, bessere Konzentration. Contra: Busfahrplan, Betreuung am Nachmittag. Ein Urteil am Ende.';

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

const essay = (over: Record<string, unknown> = {}) =>
  item({
    kind: 'long',
    prompt: 'Erörtere, ob der Unterricht später beginnen sollte.',
    answer: ESSAY_KEY,
    topic: 'Erörterung',
    ...over,
  });

async function start(
  env: TestEnv,
  l: Learner,
  items: Record<string, unknown>[],
  kind = 'practice',
  help: { n: number; hints: string[]; worked_solution: string | null }[] = [],
) {
  env.llm.script('explain', {
    json: { usable: true, title: 'Erörterung', subject: null, items },
  });
  if (help.length) env.llm.script('hints', { json: { items: help } });
  const res = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind,
    text: 'Erörterung',
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

/** What the tutor says; the judgement stays the server's (enforceTutorInvariants). */
const judges = (verdict: string, reply: string) => ({
  json: { intent: 'answer', verdict, reply, gave_hint: false, revealed_answer: false },
});

describe.skipIf(!dbReady)('a free text claims nothing it did not measure', () => {
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
  afterEach(() => env.closeChecked());

  it('never states a solution, never rates memory and names no weakness', async () => {
    const s = await start(env, l, [essay()]);
    const id = s.items[0]!.item.id;
    // No "Lösung zeigen" promise while the question is open: there is none to send.
    expect(s.items[0]!.answer).toBeNull();

    for (const text of ['Ich finde später ist besser.', 'Weil man müde ist.', 'Darum eben.']) {
      env.llm.script('tutor', judges('incorrect', 'Da steckt ein Gedanke drin.'));
      await answer(l, s, id, text);
    }

    const after = (await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    const closed = after.items[0]!;
    // The question is closed — she can move on; that was never the problem.
    expect(closed.status).not.toBe('open');
    // … but nothing was revealed, and the key never reaches the device.
    expect(closed.answer).toBeNull();

    const texts = after.turns.filter((t) => t.role === 'tutor').map((t) => t.text);
    const last = texts.at(-1) ?? '';
    expect(last).not.toContain('Die Lösung ist');
    expect(last).not.toContain(ESSAY_KEY);
    expect(texts.join(' ')).not.toContain(ESSAY_KEY);
    // What it says instead: there is no single right answer here.
    expect(last).toContain('nicht die eine Lösung');

    // No FSRS rating: `Again` would be a statement about memory from a judgement that
    // measured nothing. Checked in the table, not in the reply.
    const states = await env.db.query<{ n: number }>(
      `select count(*)::int as n from item_states where item_id = $1`,
      [id],
    );
    expect(states[0]!.n).toBe(0);

    // And no named weakness.
    await finishRun(env, l, s.id);
    const done = (await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    expect(done.summary?.shaky_topics).toEqual([]);
    expect(done.summary?.secure_topics).toEqual([]);
    // She did write it, though — the count of what she worked through stays honest.
    expect(done.summary?.answered).toBe(1);
  });

  it('introduces a prepared way as one way, not as the solution', async () => {
    const s = await start(env, l, [essay()], 'practice', [
      {
        n: 1,
        hints: ['Sammle zuerst die Gründe dafür.', 'Und dann die Gründe dagegen.'],
        worked_solution: 'Erst die Gründe dafür, dann dagegen, am Ende dein Urteil.',
      },
    ]);
    const id = s.items[0]!.item.id;
    for (const text of ['Später ist besser.', 'Weil man müde ist.', 'Eben darum.']) {
      env.llm.script('tutor', judges('incorrect', 'Erzähl mir mehr.'));
      await answer(l, s, id, text);
    }
    const after = (await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    const last =
      after.turns
        .filter((t) => t.role === 'tutor')
        .map((t) => t.text)
        .at(-1) ?? '';
    expect(last).toContain('ein Weg, nicht der einzige');
    expect(last).toContain('Erst die Gründe dafür');
    // Not the wording used where there IS one worked solution.
    expect(last).not.toContain("Schau, so geht's");
  });

  it('still shows the solution and rates memory for a question that has one', async () => {
    const s = await start(env, l, [
      item({ kind: 'numeric', prompt: 'Was ist 7 · 4?', answer: '28' }),
    ]);
    const id = s.items[0]!.item.id;
    // The rules alone answer the first wrong number and the third (answer.ts): only the
    // SECOND miss goes to the tutor. Scripting more would leave one pending and fail.
    await answer(l, s, id, '21');
    env.llm.script('tutor', judges('incorrect', 'Schau nochmal auf die Reihe.'));
    await answer(l, s, id, '24');
    await answer(l, s, id, '26');
    const after = (await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    const last =
      after.turns
        .filter((t) => t.role === 'tutor')
        .map((t) => t.text)
        .at(-1) ?? '';
    expect(last).toContain('Die Lösung ist: 28');
    expect(after.items[0]!.answer).toBe('28');
    const states = await env.db.query<{ n: number }>(
      `select count(*)::int as n from item_states where item_id = $1`,
      [id],
    );
    expect(states[0]!.n).toBe(1);
    await finishRun(env, l, s.id);
    const done = (await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    expect(done.summary?.shaky_topics).toEqual(['Thema']);
  });

  it('rates a free text she got right like any other question', async () => {
    const s = await start(env, l, [essay()]);
    const id = s.items[0]!.item.id;
    env.llm.script('tutor', judges('correct', 'Beide Seiten stehen da, und am Ende dein Urteil.'));
    const r = await answer(
      l,
      s,
      id,
      'Dafür: mehr Schlaf. Dagegen: der Bus. Ich finde später besser.',
    );
    expect(r.body.verdict).toBe('correct');
    const states = await env.db.query<{ n: number }>(
      `select count(*)::int as n from item_states where item_id = $1`,
      [id],
    );
    // Got right, it IS measured — withholding the rating here would throw away real evidence.
    expect(states[0]!.n).toBe(1);
  });

  it('skipping a free text costs her nothing in the schedule', async () => {
    const s = await start(env, l, [essay()]);
    const id = s.items[0]!.item.id;
    env.llm.script('tutor', judges('incorrect', 'Da ist ein Anfang.'));
    await answer(l, s, id, 'keine Ahnung was ich schreiben soll');
    const r = await l.api.post<SessionView>(`/practice/sessions/${s.id}/reveal`, {
      item_id: id,
    });
    expect(r.status).toBe(200);
    expect(r.body.items[0]!.status).not.toBe('open');
    // Nothing was shown …
    expect(r.body.items[0]!.answer).toBeNull();
    // … so nothing is recorded about her memory either.
    const states = await env.db.query<{ n: number }>(
      `select count(*)::int as n from item_states where item_id = $1`,
      [id],
    );
    expect(states[0]!.n).toBe(0);
  });

  it('keeps a free text out of a mock test started from her own material', async () => {
    const subject = await env.db.one<{ id: string }>(
      `insert into subjects (learner_id, name, kind) values ($1, 'Deutsch', 'german') returning id`,
      [l.learnerId],
    );
    for (const [kind, prompt, ans] of [
      ['long', 'Erörtere, ob der Unterricht später beginnen sollte.', ESSAY_KEY],
      ['short', 'Wie heißt das Satzglied im Nominativ?', 'Subjekt'],
      ['short', 'Welcher Fall antwortet auf „wem"?', 'Dativ'],
      ['short', 'Wie nennt man das Prädikat noch?', 'Satzaussage'],
    ] as const) {
      await env.db.query(
        `insert into items (learner_id, subject_id, kind, prompt, answer, topic, difficulty, origin)
         values ($1, $2, $3, $4, $5, 'Satzglieder', 2, 'typed')`,
        [l.learnerId, subject.id, kind, prompt, ans],
      );
    }

    const test = await l.api.post<SessionView>('/practice/sessions', {
      client_request_id: randomUUID(),
      subject_id: subject.id,
      mode: 'test',
    });
    expect(test.status).toBe(201);
    // A text would get one try, be judged against a key and close as "missed".
    expect(test.body.items.map((i) => i.item.kind)).not.toContain('long');
    expect(test.body.items.length).toBe(3);

    // Practising it is a different matter: there it belongs.
    const practice = await l.api.post<SessionView>('/practice/sessions', {
      client_request_id: randomUUID(),
      subject_id: subject.id,
      mode: 'practice',
    });
    expect(practice.status).toBe(201);
    expect(practice.body.items.map((i) => i.item.kind)).toContain('long');
  });
});
