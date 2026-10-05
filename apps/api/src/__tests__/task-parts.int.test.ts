// Tasks in parts end to end (issue #297): one situation, subtasks a), b), c), and Folgefehler.
// The model writes the situation, the parts and how a later part's result follows from earlier
// ones; code letters the parts, recomputes every formula against the keys before anything is
// stored, and keeps the task on every part (`items.task_part`, migration 0100). A later part that
// goes on correctly from HER wrong earlier result is right, and the reply says so — decided by code,
// no model call per answer. docs/architecture.md §Practice ("Aufgaben mit Teilaufgaben").
// requires live verification in Claude Code session (needs a running Postgres; scripted model)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';
import { TARIFF_STEM as STEM, tariffTask as tariff } from '../testing/scenarios/taskParts.js';

const dbReady = await testDatabaseAvailable();

const PLAIN = {
  kind: 'numeric',
  prompt: 'Berechne 15 % von 80 €.',
  answer: '12',
  accepted_answers: [],
  unit: '€',
  choices: null,
  correct_choice: null,
  topic: 'Prozentrechnung',
  difficulty: 2,
  source_excerpt: null,
  tolerance: null,
};

describe.skipIf(!dbReady)('tasks in parts with Folgefehler (#297)', () => {
  let env: TestEnv;
  let l: Learner;

  async function prepare(partTasks: unknown[], items: unknown[] = []): Promise<SessionView> {
    env.llm.script('explain', () => ({
      usable: true,
      title: 'Handytarif',
      subject: { name: 'Mathe', kind: 'math' },
      items,
      part_tasks: partTasks,
    }));
    const count = items.length + partTasks.length * 3;
    env.llm.script('hints', () => ({
      items: Array.from({ length: count }, (_, i) => ({
        n: i + 1,
        hints: ['Lies die Lage noch einmal genau.'],
        worked_solution: null,
      })),
    }));
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Lineare Funktionen, Aufgaben wie in der Klassenarbeit',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    return (await l.api.get<SessionView>(`/practice/sessions/${res.body.id}`)).body;
  }

  function answer(s: SessionView, itemId: string, text: string, turn = randomUUID()) {
    return l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: turn,
      item_id: itemId,
      text,
    });
  }

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-05T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2010-04-02' });
  });
  // A tutor call would mean code could not decide what it must decide: the script fails on any
  // unexpected or unused model call.
  afterEach(async () => {
    await env.closeChecked();
  });

  it('letters the parts, keeps the situation on each and shows no formula or key', async () => {
    const s = await prepare([tariff()]);
    expect(s.items.map((i) => i.item.task_part?.part)).toEqual(['a', 'b', 'c']);
    for (const si of s.items) {
      expect(si.item.task_part).toEqual({
        ref: 'p1',
        part: si.item.task_part?.part,
        letters: ['a', 'b', 'c'],
        stem: STEM,
      });
    }
    // The prompt is the part's own question; the app letters it.
    expect(s.items[1]!.item.prompt).toBe('Wie hoch ist ihre Rechnung im Mai insgesamt?');
    const rows = await env.db.query<{ task_part: { group: string; from: string | null } }>(
      `select i.task_part from session_items si join items i on i.id = si.item_id
        where si.session_id = $1 order by si.position`,
      [s.id],
    );
    expect(new Set(rows.map((r) => r.task_part.group)).size).toBe(1);
    expect(rows.map((r) => r.task_part.from)).toEqual([null, 'a + 12', 'b / 80']);
    const body = JSON.stringify(s);
    expect(body).not.toContain('a + 12');
    expect(body).not.toContain(rows[0]!.task_part.group);
  });

  it('counts b) right when it goes on correctly from her WRONG a) — and says so', async () => {
    const s = await prepare([tariff()]);
    const [a, b] = s.items.map((i) => i.item.id) as [string, string];
    const wrongA = await answer(s, a, '10 €');
    expect(wrongA.body.verdict).toBe('incorrect');
    const followed = await answer(s, b, '22 €');
    expect(followed.status, JSON.stringify(followed.body)).toBe(200);
    expect(followed.body.verdict).toBe('correct');
    expect(followed.body.reply.text).toBe(
      'Richtig weitergerechnet – mit deinem Ergebnis aus a). Das stimmte zwar nicht, aber dein Weg hier passt. Das zählt als richtig.',
    );
    const view = followed.body.session;
    expect(view.items[0]!.status).toBe('open');
    expect(view.items[1]!.status).toBe('correct');
    const by = await env.db.one<{ evaluated_by: string }>(
      `select evaluated_by from practice_turns
        where session_id = $1 and item_id = $2 and role = 'learner'`,
      [s.id, b],
    );
    expect(by.evaluated_by).toBe('rule');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('a b) that follows from neither her a) nor the key stays wrong', async () => {
    const s = await prepare([tariff()]);
    const [a, b] = s.items.map((i) => i.item.id) as [string, string];
    expect((await answer(s, a, '10 €')).body.verdict).toBe('incorrect');
    const wrong = await answer(s, b, '23 €');
    expect(wrong.body.verdict).toBe('incorrect');
    expect(wrong.body.reply.text).not.toContain('weitergerechnet');
  });

  it('without an answer of hers to a), the key alone decides b)', async () => {
    const s = await prepare([tariff()]);
    const b = s.items[1]!.item.id;
    // Her 22 € would follow from a wrong a) of 10 € — but she has written no a) in this run.
    expect((await answer(s, b, '22 €')).body.verdict).toBe('incorrect');
  });

  it('a formula that does not compute drops the whole task before anything is stored', async () => {
    const s = await prepare([tariff('a + 10')], [PLAIN]);
    expect(s.items).toHaveLength(1);
    expect(s.items[0]!.item.task_part).toBeNull();
    const stored = await env.db.one<{ n: number }>(
      `select count(*)::int as n from items where learner_id = $1 and task_part is not null`,
      [l.learnerId],
    );
    expect(stored.n).toBe(0);
  });

  it('one turn id counts once; another learner gets 404 for her task', async () => {
    const s = await prepare([tariff()]);
    const a = s.items[0]!.item.id;
    const turn = randomUUID();
    const first = await answer(s, a, '10 €', turn);
    const again = await answer(s, a, '10 €', turn);
    expect(first.body.verdict).toBe('incorrect');
    expect(again.body.verdict).toBe('incorrect');
    expect(again.body.session.items[0]!.attempts).toBe(1);

    const other = await onboard(env, { relation: 'child', name: 'Tom', birthDate: '2010-05-01' });
    expect((await other.api.get(`/practice/sessions/${s.id}`)).status).toBe(404);
    const theirs = await other.api.post(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: s.items[1]!.item.id,
      text: '22 €',
    });
    expect(theirs.status).toBe(404);
  });
});
