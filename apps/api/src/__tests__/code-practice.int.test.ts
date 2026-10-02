// Informatik, end to end (issue #262).
//
// Die Zusagen, die diese Datei hält:
//
//   1. **Jeder Schlüssel kommt aus einer Ausführung**, nie vom Modell: die Ausgabe, die Zeile des
//      Fehlers, die erwarteten Werte. Ein Modellschlüssel, der davon abweicht, kostet die Frage —
//      und nur sie, nie den Satz.
//   2. **Keine Antwort ruft ein Modell.** Das `afterEach` lässt den Lauf fallen, sobald ein Tutor
//      oder irgendein anderer unerwarteter Modellaufruf passiert: ein Modell, das über ein Programm
//      urteilt, das es nicht ausführen kann, wäre genau die unsichere Aussage aus Regel 5.
//   3. **Ihre Funktion läuft gegen die Tests** („x von y bestanden"), ein Teiltreffer lässt die
//      Frage offen, und eine Endlosschleife hält den Server nicht auf.
//   4. **Die Fehlerzeile wird angetippt**: nur eine Zeilennummer dieses Programms ist eine Antwort.
//   5. **Das Modell legt kein Programm neben eine eigene Frage**: `code` steht nicht in `ModelFigure`.
//
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, CodeTask, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { codeItem } from '../modules/practice/code.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const WAIT = { json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null } };

const PREDICT: CodeTask = {
  task: 'predict_output',
  language: 'python',
  program: 'zahlen = [3, 1, 2]\nzahlen.sort()\nfor z in zahlen:\n    print(z * 10)',
  output: '10\n20\n30',
};

const FIND: CodeTask = {
  task: 'find_error',
  language: 'python',
  program:
    'punkte = {"Ada": 3, "Bo": 5}\nsumme = 0\nfor name in ["Ada", "Cem"]:\n    summe += punkte[name]\nprint(summe)',
  line: 4,
};

const WRITE: CodeTask = {
  task: 'write_function',
  language: 'python',
  name: 'groesste',
  params: ['liste'],
  statement: 'Sie gibt die größte Zahl der Liste zurück, ohne max zu benutzen.',
  tests: [
    { args: '[3, 9, 2]', expected: '9' },
    { args: '[-5, -2]', expected: '-2' },
    { args: '[7]', expected: '7' },
    { args: '[1, 1, 0]', expected: '1' },
  ],
  solution:
    'def groesste(liste):\n    best = liste[0]\n    for x in liste:\n        if x > best:\n            best = x\n    return best',
};

describe.skipIf(!dbReady)(
  'Informatik: Programme lesen, Fehler finden, Funktionen schreiben',
  () => {
    let env: TestEnv;
    let l: Learner;

    async function prepare(
      codes: unknown[],
      opts: { items?: unknown[]; kind?: 'practice' | 'test' } = {},
    ): Promise<SessionView> {
      env.llm.script('explain', () => ({
        usable: true,
        title: 'Python',
        subject: { name: 'Informatik', kind: 'other' },
        items: opts.items ?? [],
        bars: [],
        staffs: [],
        codes,
      }));
      const res = await l.api.post<SessionView>('/practice/topic', {
        client_request_id: randomUUID(),
        kind: opts.kind ?? 'practice',
        text: 'Python üben',
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      await env.flushBackground();
      return res.body;
    }

    async function answer(
      sessionId: string,
      itemId: string,
      body: { text?: string; choice?: number },
    ) {
      return l.api.post<AnswerResponse>(`/practice/sessions/${sessionId}/answer`, {
        client_turn_id: randomUUID(),
        item_id: itemId,
        ...body,
      });
    }

    beforeEach(async () => {
      env = await createTestEnv({ start: '2026-10-02T15:00:00Z' });
      l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2011-02-10' });
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

    it('makes questions only from programs it ran, with the key from that run', async () => {
      const wrongOutput = { ...PREDICT, output: '30\n20\n10' };
      const wrongLine = { ...FIND, line: 3 };
      const session = await prepare([PREDICT, wrongOutput, FIND, wrongLine, WRITE]);
      // Zwei Aufgaben hatten einen falschen Modellschlüssel: sie fehlen, der Rest ist da.
      expect(session.items.map((si) => si.item.topic)).toEqual([
        'Programme lesen',
        'Fehler finden',
        'Funktionen schreiben',
      ]);
      const rows = await env.db.query<{ answer: string; code_task: CodeTask; kind: string }>(
        `select i.answer, i.code_task, i.kind from session_items si join items i on i.id = si.item_id
        where si.session_id = $1 order by si.position`,
        [session.id],
      );
      expect(rows.map((r) => r.answer)).toEqual([
        '10\n20\n30',
        'Zeile 4',
        WRITE.task === 'write_function' ? WRITE.solution : '',
      ]);
      // Die gespeicherte Aufgabe ist die eine Quelle: ein zweiter Lauf ergibt dieselbe Frage.
      for (const r of rows) expect(codeItem(r.code_task, 'de')?.answer).toBe(r.answer);

      const [read, find, write] = session.items;
      // Was sie sieht: das Programm als gefärbte Zeilen, und nie die Lösung.
      expect(read?.item.figure).toMatchObject({ type: 'code', language: 'python' });
      expect(read?.item.figure?.type === 'code' && read.item.figure.lines).toHaveLength(4);
      expect(read?.item.surface).toEqual({ mode: 'code_type', purpose: 'output', starter: '' });
      expect(find?.item.surface).toEqual({ mode: 'code_line', lines: 5 });
      expect(write?.item.figure).toBeNull();
      expect(write?.item.surface).toEqual({
        mode: 'code_type',
        purpose: 'program',
        starter: 'def groesste(liste):\n    ',
      });
      for (const si of session.items) {
        expect(si.answer).toBeNull();
        expect(JSON.stringify(si.item)).not.toContain('Zeile 4');
      }
    });

    it('checks the predicted output line by line, with no model', async () => {
      const session = await prepare([PREDICT]);
      const item = session.items[0]?.item;
      const partly = await answer(session.id, item?.id as string, { text: '10\n30\n20' });
      expect(partly.status, JSON.stringify(partly.body)).toBe(200);
      expect(partly.body.verdict).toBe('partially_correct');
      expect(partly.body.reply.text).toBe('Die erste von 3 Zeilen stimmt.');
      expect(partly.body.session.items[0]?.status).toBe('open');

      const ok = await answer(session.id, item?.id as string, { text: '10\n20\n30' });
      expect(ok.body.verdict).toBe('correct');
    });

    it('takes a tapped line and nothing else for the failing line', async () => {
      const session = await prepare([FIND]);
      const item = session.items[0]?.item;
      const words = await answer(session.id, item?.id as string, { text: 'die vierte' });
      expect(words.status).toBe(422);
      const outside = await answer(session.id, item?.id as string, { text: '9' });
      expect(outside.status).toBe(422);

      const wrong = await answer(session.id, item?.id as string, { text: '3' });
      expect(wrong.status, JSON.stringify(wrong.body)).toBe(200);
      expect(wrong.body.verdict).toBe('incorrect');
      expect(wrong.body.reply.text).toContain('Schritt für Schritt');
      // Im Gespräch steht die Zeile in Worten.
      const mine = wrong.body.session.turns.find((tr) => tr.role === 'learner');
      expect(mine?.text).toBe('Zeile 3');

      const right = await answer(session.id, item?.id as string, { text: '4' });
      expect(right.body.verdict).toBe('correct');
    });

    it('runs her function against the tests: x of y, an open question, then right', async () => {
      const session = await prepare([WRITE]);
      const item = session.items[0]?.item;
      // Fängt mit 0 an statt mit dem ersten Element: falsch für lauter negative Zahlen.
      const partly = await answer(session.id, item?.id as string, {
        text: 'def groesste(liste):\n    best = 0\n    for x in liste:\n        if x > best:\n            best = x\n    return best',
      });
      expect(partly.status, JSON.stringify(partly.body)).toBe(200);
      expect(partly.body.verdict).toBe('partially_correct');
      expect(partly.body.reply.text).toBe(
        '3 von 4 Tests bestanden. groesste([-5, -2]) soll -2 ergeben, deine Funktion gibt 0 zurück.',
      );
      expect(partly.body.session.items[0]?.status).toBe('open');
      expect(
        await env.db.query(`select 1 from item_states where item_id = $1`, [item?.id]),
      ).toEqual([]);

      // Eine Endlosschleife: der Lauf endet an der Schrittgrenze, und sie erfährt es.
      const loop = await answer(session.id, item?.id as string, {
        text: 'def groesste(liste):\n    while True:\n        pass',
      });
      expect(loop.body.verdict).toBe('incorrect');
      expect(loop.body.reply.text).toContain('Endlosschleife');

      const right = await answer(session.id, item?.id as string, {
        text: 'def groesste(liste):\n    return sorted(liste)[-1]',
      });
      expect(right.body.verdict).toBe('correct');
      expect(right.body.reply.text).toMatch(/^Alle 4 Tests bestanden\./);
    });

    it('shows the solution after the third wrong program, as everywhere', async () => {
      const session = await prepare([WRITE]);
      const item = session.items[0]?.item;
      for (let i = 0; i < 3; i++) {
        await answer(session.id, item?.id as string, {
          text: 'def groesste(liste):\n    return 0',
        });
      }
      const after = await l.api.get<SessionView>(`/practice/sessions/${session.id}`);
      expect(after.body.items[0]?.status).toBe('revealed');
      expect(after.body.items[0]?.item.surface).toBeNull();
    });

    it('does not let the model put a program next to a question of its own', async () => {
      const session = await prepare([], {
        items: [
          {
            kind: 'short',
            prompt: 'Was gibt das Programm aus?',
            answer: '3',
            accepted_answers: [],
            unit: null,
            choices: null,
            correct_choice: null,
            topic: 'Programme lesen',
            difficulty: 2,
            source_excerpt: null,
            figure: {
              type: 'code',
              language: 'python',
              lines: [[{ text: 'print(4)', kind: 'plain' }]],
            },
          },
        ],
      });
      expect(session.items).toHaveLength(1);
      expect(session.items[0]?.item.figure).toBeNull();
    });

    it('brings programs into a practice test as well', async () => {
      const session = await prepare([PREDICT, FIND], { kind: 'test' });
      expect(session.mode).toBe('test');
      expect(session.items.every((si) => si.item.figure?.type === 'code')).toBe(true);
    });

    it('keeps one computed source per question in the database', async () => {
      const session = await prepare([PREDICT]);
      const id = session.items[0]?.item.id;
      await expect(
        env.db.query(`update items set staff_task = '{}'::jsonb where id = $1`, [id]),
      ).rejects.toThrow(/items_one_computed_source/);
    });
  },
);
