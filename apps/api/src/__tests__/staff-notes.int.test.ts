// Die Notenzeile, end to end (issue #226).
//
// Was diese Datei wirklich prüft, sind die Zusagen des Issues:
//
//   1. **„Notennamen üben" ergibt acht Fragen, und jede wird ohne Modellaufruf geprüft.** Das
//      `afterEach` unten lässt den Lauf fallen, sobald irgendein unerwarteter Modellaufruf
//      passiert ist — ein Tutor-Aufruf hier würde heißen, dass ein Modell über eine gezeichnete
//      Notenzeile geschrieben hat, die es nicht sehen kann (Regel 5).
//   2. **Das Modell schreibt keine Notenzeile.** Es wählt eine Aufgabe; Frage, Zeichnung,
//      Optionen und Schlüssel kommen aus `practice/staff.ts`, und ein `figure` vom Typ `staff`,
//      das das Modell trotzdem mitschickt, kommt gar nicht erst durch den Vertrag.
//   3. **Eine Notenzeile, die sie schreibt, wird Zeichen für Zeichen verglichen**, bleibt bei
//      einem Teiltreffer offen, und die Rückmeldung nennt die Stelle.
//   4. **Die Aufgabe ist die eine Quelle der Frage**: ein Test rechnet sie nach und vergleicht
//      mit dem, was gespeichert wurde.
//
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView, StaffTask } from '@learnbuddy/shared-types/contracts';
import { renderStaffLine } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { staffAgain, staffItem } from '../modules/practice/staff.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

/** Buddy plans what comes next when a run finishes; he has nothing to say about this one. */
const WAIT = { json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null } };

/** Acht Notennamen im Violin- und im Bassschlüssel — was „Notennamen üben" heißt. */
const NOTE_NAMES: StaffTask[] = [
  { task: 'name_note', clef: 'treble', pitch: { name: 'E', octave: 4 } },
  { task: 'name_note', clef: 'treble', pitch: { name: 'G', octave: 4 } },
  { task: 'name_note', clef: 'treble', pitch: { name: 'B', octave: 4 } },
  { task: 'name_note', clef: 'treble', pitch: { name: 'D', octave: 5 } },
  { task: 'name_note', clef: 'treble', pitch: { name: 'F', octave: 5 } },
  { task: 'name_note', clef: 'bass', pitch: { name: 'G', octave: 2 } },
  { task: 'name_note', clef: 'bass', pitch: { name: 'D', octave: 3 } },
  { task: 'name_note', clef: 'bass', pitch: { name: 'A', octave: 3 } },
];

const WRITE: StaffTask = {
  task: 'write_line',
  clef: 'treble',
  time: '4/4',
  bars: [
    [
      { el: 'note', pitch: { name: 'E', octave: 4 }, value: 'quarter', dotted: false },
      { el: 'note', pitch: { name: 'G', octave: 4 }, value: 'quarter', dotted: false },
      { el: 'note', pitch: { name: 'B', octave: 4 }, value: 'half', dotted: false },
    ],
  ],
};

const INTERVAL: StaffTask = {
  task: 'interval',
  clef: 'treble',
  lower: { name: 'C', octave: 5 },
  upper: { name: 'G', octave: 5 },
};

describe.skipIf(!dbReady)('die Notenzeile', () => {
  let env: TestEnv;
  let l: Learner;

  async function prepare(
    staffs: StaffTask[],
    opts: { items?: unknown[]; kind?: 'practice' | 'test'; text?: string } = {},
  ): Promise<SessionView> {
    env.llm.script('explain', () => ({
      usable: true,
      title: 'Notennamen',
      subject: { name: 'Musik', kind: 'art_music' },
      items: opts.items ?? [],
      bars: [],
      staffs,
    }));
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: opts.kind ?? 'practice',
      text: opts.text ?? 'Notennamen üben',
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
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    env.llm.byDefault('buddy_check', WAIT);
  });
  afterEach(async () => {
    await env.closeChecked();
    // Jeder Aufruf hier wäre ein Modell, das über eine Zeichnung urteilt, die es nicht hat.
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('macht aus acht Aufgaben acht Fragen, jede mit ihrer gezeichneten Zeile', async () => {
    const session = await prepare(NOTE_NAMES);
    expect(session.items).toHaveLength(8);
    for (const [n, si] of session.items.entries()) {
      const task = NOTE_NAMES[n] as StaffTask;
      const want = staffItem(task, 'de');
      expect(want, task.task).not.toBeNull();
      expect(si.item.kind).toBe('multiple_choice');
      expect(si.item.prompt).toBe(want?.prompt);
      expect(si.item.choices).toEqual(want?.choices);
      expect(si.item.figure).toEqual(want?.figure);
      // Eine offene Frage trägt ihre Lösung nicht. Die Zeichnung enthält den Ton natürlich —
      // ihn abzulesen IST die Aufgabe; was sie nicht enthält, ist ein Feld mit der Antwort darin.
      expect(si.answer).toBeNull();
      expect(JSON.stringify(si.item.figure)).not.toContain('"answer"');
      // Angetippt wird hier, nicht geschrieben: keine Fläche, nichts zum Anordnen.
      expect(si.item.surface).toBeNull();
      expect(si.item.task_view).toBeNull();
    }
    // Die gespeicherte Aufgabe ist die EINE Quelle: ein Test rechnet aus ihr nach.
    const rows = await env.db.query<{ answer: string; staff_task: StaffTask; figure: unknown }>(
      `select i.answer, i.staff_task, i.figure from session_items si join items i on i.id = si.item_id
        where si.session_id = $1 order by si.position`,
      [session.id],
    );
    expect(rows.map((r) => r.staff_task)).toEqual(NOTE_NAMES);
    expect(rows.map((r) => r.answer)).toEqual(NOTE_NAMES.map((t) => staffItem(t, 'de')?.answer));
    expect(rows.map((r) => r.figure)).toEqual(NOTE_NAMES.map((t) => staffItem(t, 'de')?.figure));
  });

  it('entscheidet jede angetippte Antwort selbst — richtig und falsch', async () => {
    const session = await prepare([NOTE_NAMES[0] as StaffTask, INTERVAL]);
    const first = session.items[0]?.item;
    const want = staffItem(NOTE_NAMES[0] as StaffTask, 'de');
    const right = want?.correct_choice as number;

    const wrong = await answer(session.id, first?.id as string, {
      choice: (right + 1) % (first?.choices?.length ?? 2),
    });
    expect(wrong.status, JSON.stringify(wrong.body)).toBe(200);
    expect(wrong.body.verdict).toBe('incorrect');
    // Code sagt, wo sie hinschauen kann — der Tutor hätte die Zeile nie gesehen.
    expect(wrong.body.reply.text).toContain('Violinschlüssel');
    // Und es ist wörtlich die Zeile, die Code dafür hat — kein Modell hat sie geschrieben.
    expect(wrong.body.reply.text).toBe(staffAgain('de', NOTE_NAMES[0] as StaffTask));
    expect(wrong.body.session.items[0]?.status).toBe('open');

    const ok = await answer(session.id, first?.id as string, { choice: right });
    expect(ok.body.verdict).toBe('correct');
    const state = await env.db.query<{ last_outcome: string }>(
      `select last_outcome from item_states where item_id = $1`,
      [first?.id],
    );
    expect(state).toEqual([{ last_outcome: 'with_help' }]);

    // Und das Intervall genauso, beim ersten Versuch.
    const second = session.items[1]?.item;
    const interval = staffItem(INTERVAL, 'de');
    const res = await answer(session.id, second?.id as string, {
      choice: interval?.correct_choice as number,
    });
    expect(res.body.verdict).toBe('correct');
    expect(interval?.answer).toBe('reine Quinte');
  });

  it('gibt einer Schreibaufgabe eine leere Zeile und prüft sie Zeichen für Zeichen', async () => {
    const session = await prepare([WRITE]);
    const item = session.items[0]?.item;
    expect(item?.kind).toBe('short');
    // Die Fläche sagt Schlüssel, Taktart und Taktzahl — alles, was die Frage schon sagt.
    expect(item?.surface).toEqual({
      mode: 'notes',
      clef: 'treble',
      time: '4/4',
      bars: 1,
      tempo: 80,
    });
    expect(item?.figure).toBeNull();

    // Eine Note zu hoch: zwei von drei Zeichen halten, die Frage bleibt offen, und nichts geht
    // in den Lernplan — es ist nichts abgeschlossen, also wird nichts behauptet.
    const partly = await answer(session.id, item?.id as string, { text: 'E4q A4q B4h' });
    expect(partly.status, JSON.stringify(partly.body)).toBe(200);
    expect(partly.body.verdict).toBe('partially_correct');
    expect(partly.body.reply.text).toContain('von 3 Zeichen');
    expect(partly.body.session.items[0]?.status).toBe('open');
    // Ihre Zeile steht in Worten im Gespräch, nicht als Maschinenform.
    const mine = partly.body.session.turns.find((tr) => tr.role === 'learner');
    expect(mine?.text).toBe('E als Viertelnote, A als Viertelnote, H als halbe Note');
    expect(await env.db.query(`select 1 from item_states where item_id = $1`, [item?.id])).toEqual(
      [],
    );

    // Beim zweiten Versuch wird die Stelle genannt.
    const again = await answer(session.id, item?.id as string, { text: 'E4q A4q B4h' });
    expect(again.body.reply.text).toContain('Takt 1');

    // Und die richtige Zeile stimmt — in jeder Oktave desselben Namens.
    const right = await answer(session.id, item?.id as string, { text: 'E5q G5q B5h' });
    expect(right.body.verdict).toBe('correct');
    const state = await env.db.query<{ last_outcome: string }>(
      `select last_outcome from item_states where item_id = $1`,
      [item?.id],
    );
    expect(state).toEqual([{ last_outcome: 'with_help' }]);
    // Die Lösung, die „Lösung zeigen" später zeigt, ist lesbar und nicht die Maschinenform.
    const row = await env.db.one<{ answer: string }>(`select answer from items where id = $1`, [
      item?.id,
    ]);
    expect(row.answer).toBe('E als Viertelnote, G als Viertelnote, H als halbe Note');
    expect(row.answer).not.toBe(renderStaffLine(WRITE.task === 'write_line' ? WRITE.bars : []));
  });

  it('lässt das Modell keine Notenzeile neben eine eigene Frage legen', async () => {
    // Ein `figure` vom Typ `staff` steht nicht in `ModelFigure`: der Vertrag nimmt es nicht an,
    // die Figur fällt weg (`.catch(null)`), und die Frage bleibt — ohne erfundene Notenzeile.
    const session = await prepare([], {
      items: [
        {
          kind: 'short',
          prompt: 'Wie heißt diese Note?',
          answer: 'C',
          accepted_answers: [],
          unit: null,
          choices: null,
          correct_choice: null,
          topic: 'Noten lesen',
          difficulty: 2,
          source_excerpt: null,
          figure: {
            type: 'staff',
            clef: 'treble',
            time: '4/4',
            bars: [[{ el: 'note', pitch: { name: 'C', octave: 4 }, value: 'quarter' }]],
            tempo: 80,
          },
        },
      ],
    });
    expect(session.items).toHaveLength(1);
    expect(session.items[0]?.item.figure).toBeNull();
  });

  it('zeigt Notennamen nur, wo der Name nicht die Antwort ist (#312)', async () => {
    const rhythm: StaffTask = {
      task: 'time_signature',
      clef: 'treble',
      time: '2/4',
      bars: [
        [
          { el: 'note', pitch: { name: 'G', octave: 4 }, value: 'quarter', dotted: false },
          { el: 'rest', value: 'quarter', dotted: false },
        ],
      ],
    };
    const session = await prepare([NOTE_NAMES[1] as StaffTask, INTERVAL, rhythm]);
    const labels = session.items.map((si) =>
      si.item.figure?.type === 'staff' ? si.item.figure.labels : 'keine Notenzeile',
    );
    // „Wie heißt diese Note?" — ohne Namen; das Intervall und der Rhythmus mit den gegebenen
    // Noten beschriftet (die Pause hat keinen Namen und zählt nicht mit).
    expect(labels).toEqual([[], [0, 1], [0]]);

    // Eine Zeile von vor #312 hat kein Feld `labels`: sie kommt unbeschriftet zurück, wie sie
    // immer aussah, und nicht als kaputte Figur.
    await env.db.query(
      `update items i set figure = i.figure - 'labels' from session_items si
        where si.item_id = i.id and si.session_id = $1`,
      [session.id],
    );
    const again = (await l.api.get<SessionView>(`/practice/sessions/${session.id}`)).body;
    expect(
      again.items.map((si) => (si.item.figure?.type === 'staff' ? si.item.figure.labels : null)),
    ).toEqual([[], [], []]);
  });

  it('bringt Notenfragen auch in einen Übungstest', async () => {
    const session = await prepare([NOTE_NAMES[0] as StaffTask, INTERVAL], { kind: 'test' });
    expect(session.mode).toBe('test');
    expect(session.items).toHaveLength(2);
    expect(session.items.every((si) => si.item.figure?.type === 'staff')).toBe(true);
  });
});
