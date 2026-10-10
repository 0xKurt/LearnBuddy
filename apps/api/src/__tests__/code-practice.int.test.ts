// Informatik end to end (issue #262), on a real Postgres:
//
//   1. **Every key comes from a run.** A practice run with programs and a query stores only the
//      tasks whose run matched what the model claimed; one the model misread is dropped.
//   2. **No model judges an answer.** Output, tapped line, her function and her query are run and
//      compared by code — the `afterEach` fails the file on any tutor call, and answering works
//      while the model is down.
//   3. **What she sees never carries the key**: the program, the table and a surface, no solution
//      while the question is open — and the proven solution once it is closed.
//   4. The failure paths: the same answer sent twice, another learner's question, a line that is
//      no line of the program, two computed sources on one question.
//
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, CodeTask, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LlmError } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const WAIT = { json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null } };

const PREDICT: CodeTask = {
  task: 'predict_output',
  program: 'summe = 0\nfor i in range(1, 4):\n    summe = summe + i\n    print(summe)',
  output: '1\n3\n6',
};
const MISREAD: CodeTask = { task: 'predict_output', program: 'print(2 ** 3)', output: '6' };
const FIND: CodeTask = {
  task: 'find_error',
  program: 'werte = [4, 0, 2]\nfor w in werte:\n    print(8 / w)',
  line: 3,
};
const WRITE: CodeTask = {
  task: 'write_function',
  name: 'verdoppeln',
  params: ['zahl'],
  statement: 'Die Funktion gibt das Doppelte der Zahl zurück.',
  tests: [
    { args: '2', expected: '4' },
    { args: '0', expected: '0' },
    { args: '-3', expected: '-6' },
    { args: '1.5', expected: '3.0' },
  ],
  solution: 'def verdoppeln(zahl):\n    return zahl * 2',
};
const QUERY: CodeTask = {
  task: 'sql_query',
  table: 'schueler',
  columns: [
    { name: 'name', type: 'TEXT' },
    { name: 'klasse', type: 'TEXT' },
  ],
  rows: [
    ['Ada', '7a'],
    ['Ben', '7b'],
    ['Cem', '7a'],
  ],
  statement: 'Finde die Namen aller Schüler der Klasse 7a.',
  query: "SELECT name FROM schueler WHERE klasse = '7a'",
  result: [['Ada'], ['Cem']],
};

describe.skipIf(!dbReady)('Informatik: Programme und Abfragen', () => {
  let env: TestEnv;
  let l: Learner;

  async function prepare(codes: CodeTask[], kind: 'practice' | 'test' = 'practice') {
    env.llm.script('explain', () => ({
      usable: true,
      title: 'Python',
      subject: { name: 'Informatik', kind: 'computer_science' },
      items: [],
      codes,
    }));
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind,
      text: 'Python und SQL üben',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    return res.body;
  }

  async function answer(
    sessionId: string,
    itemId: string,
    text: string,
    opts: { turn?: string; as?: Learner } = {},
  ) {
    return (opts.as ?? l).api.post<AnswerResponse>(`/practice/sessions/${sessionId}/answer`, {
      client_turn_id: opts.turn ?? randomUUID(),
      item_id: itemId,
      text,
    });
  }

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-10T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2011-02-10' });
    env.llm.byDefault('buddy_check', WAIT);
  });
  afterEach(async () => {
    await env.closeChecked();
    // Any call here would be a model judging a program it never ran (rule 5).
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('stores only the tasks whose run matched, each with its program or table and surface', async () => {
    const session = await prepare([PREDICT, MISREAD, FIND, WRITE, QUERY]);
    expect(session.items).toHaveLength(4);
    const [predict, find, write, query] = session.items.map((si) => si.item);
    expect(predict?.figure).toMatchObject({ type: 'code', numbered: true });
    expect(predict?.surface).toEqual({ mode: 'code_type', purpose: 'output', starter: '' });
    expect(find?.surface).toEqual({ mode: 'code_line', lines: 3 });
    expect(write?.surface).toMatchObject({ mode: 'code_type', purpose: 'program' });
    expect(query?.figure).toMatchObject({ type: 'table', header: ['name', 'klasse'] });
    expect(query?.surface).toEqual({ mode: 'code_type', purpose: 'query', starter: '' });
    for (const si of session.items) {
      expect(si.item.code).toBe(true);
      // Open: never the key.
      expect(si.answer).toBeNull();
    }
    const stored = await env.db.query<{ code_task: CodeTask; answer: string }>(
      `select code_task, answer from items where learner_id = $1 order by created_at, id`,
      [l.learnerId],
    );
    expect(stored.map((s) => s.code_task.task).sort()).toEqual([
      'find_error',
      'predict_output',
      'sql_query',
      'write_function',
    ]);
  });

  it('checks an output line by line and a tapped line against the run — no model, even when it is down', async () => {
    const session = await prepare([PREDICT, FIND]);
    env.llm.byDefault('tutor', { error: new LlmError('unavailable', 'outage') });
    const [predict, find] = session.items.map((si) => si.item.id);

    const partly = await answer(session.id, predict!, '1\n3\n7');
    expect(partly.body.verdict).toBe('partially_correct');
    expect(partly.body.reply.text).toBe('Die ersten 2 von 3 Zeilen stimmen.');
    const right = await answer(session.id, predict!, '1\n3\n6');
    expect(right.body.verdict).toBe('correct');

    // "Which line?" takes a line of the program, nothing else.
    expect((await answer(session.id, find!, 'Zeile drei')).status).toBe(422);
    expect((await answer(session.id, find!, '7')).status).toBe(422);
    const wrong = await answer(session.id, find!, '1');
    expect(wrong.body.verdict).toBe('incorrect');
    expect(wrong.body.reply.text).toMatch(/Diese Zeile läuft noch durch/);
    const found = await answer(session.id, find!, '3');
    expect(found.body.verdict).toBe('correct');
    // Her tapped line stands in the thread in words.
    const turns = await env.db.query<{ text: string }>(
      `select text from practice_turns where item_id = $1 and role = 'learner' order by seq`,
      [find],
    );
    expect(turns.map((t) => t.text)).toEqual(['Zeile 1', 'Zeile 3']);
  });

  it('runs her function against the tests and her query on the table', async () => {
    const session = await prepare([WRITE, QUERY]);
    const [write, query] = session.items.map((si) => si.item.id);

    const some = await answer(
      session.id,
      write!,
      'def verdoppeln(zahl):\n    return abs(zahl) * 2',
    );
    expect(some.body.verdict).toBe('partially_correct');
    expect(some.body.reply.text).toBe(
      '3 von 4 Tests bestanden. verdoppeln(-3) soll -6 ergeben, deine Funktion gibt 6 zurück.',
    );
    const all = await answer(session.id, write!, 'def verdoppeln(zahl):\n    return zahl + zahl');
    expect(all.body.verdict).toBe('correct');
    expect(all.body.reply.text).toMatch(/^Alle 4 Tests bestanden\./);

    const many = await answer(session.id, query!, 'select name from schueler');
    expect(many.body.verdict).toBe('incorrect');
    expect(many.body.reply.text).toMatch(/3 Zeilen, gesucht sind 2/);
    const ok = await answer(session.id, query!, "select name from schueler where klasse='7a'");
    expect(ok.body.verdict).toBe('correct');
  });

  it('shows the proven solution once the question is closed, and never in between', async () => {
    const session = await prepare([WRITE]);
    const id = session.items[0]!.item.id;
    const wrong = 'def verdoppeln(zahl):\n    return zahl + 1';
    await answer(session.id, id, wrong);
    await answer(session.id, id, wrong);
    const open = await l.api.get<SessionView>(`/practice/sessions/${session.id}`);
    expect(open.body.items[0]?.answer).toBeNull();
    const third = await answer(session.id, id, wrong);
    expect(third.body.verdict).toBe('incorrect');
    const closed = await l.api.get<SessionView>(`/practice/sessions/${session.id}`);
    expect(closed.body.items[0]?.status).not.toBe('open');
    expect(closed.body.items[0]?.answer).toBe('def verdoppeln(zahl):\n    return zahl * 2');
  });

  it('says nothing but the test line during a test, and closes on a partial program', async () => {
    const session = await prepare([PREDICT, WRITE], 'test');
    const id = session.items[1]!.item.id;
    const partly = await answer(session.id, id, 'def verdoppeln(zahl):\n    return abs(zahl) * 2');
    expect(partly.body.verdict).toBe('incorrect');
    expect(partly.body.reply.text).not.toMatch(/Tests/);
  });

  it('counts an answer sent twice once, and keeps another learner out', async () => {
    const session = await prepare([PREDICT]);
    const id = session.items[0]!.item.id;
    const turn = randomUUID();
    const a = await answer(session.id, id, '1\n3', { turn });
    const b = await answer(session.id, id, '1\n3', { turn });
    expect(b.status).toBe(200);
    expect(b.body.reply.id).toBe(a.body.reply.id);
    expect(b.body.session.items[0]?.attempts).toBe(1);

    const other = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2011-05-01' });
    const foreign = await answer(session.id, id, '1\n3\n6', { as: other });
    expect(foreign.status).toBe(404);
    const untouched = await l.api.get<SessionView>(`/practice/sessions/${session.id}`);
    expect(untouched.body.items[0]?.attempts).toBe(1);
  });

  it('refuses a question with two computed sources (migration 0104)', async () => {
    await expect(
      env.db.query(
        `insert into items (learner_id, kind, prompt, answer, origin, difficulty, staff_task, code_task)
         values ($1, 'short', 'x', 'y', 'buddy', 2, '{}'::jsonb, '{}'::jsonb)`,
        [l.learnerId],
      ),
    ).rejects.toThrow(/items_one_computed_source/);
  });
});
