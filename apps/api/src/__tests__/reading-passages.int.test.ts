// Leseverständnis end to end (issue #233): a photographed reading text becomes ONE group of
// questions that share the text. Code checks every question against the text before anything is
// stored (Regel 0, reject — never repair): a line that does not exist, evidence that is not in
// the text, a true/false statement that copies it, a text that is not on the sheet. The session
// shows the text above every question of the group, with one alias; where the answer stands
// only once the question is closed. MC, true/false and the order are decided by rules; a short
// answer is judged on its content, never on its spelling (#197).
// docs/architecture.md §Practice ("Lesetexte").
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  AnswerResponse,
  MaterialView,
  SessionItemView,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const LINES = [
  'Mia wohnt mit ihrer Familie in einem kleinen Dorf am Rand des Wal-',
  'des. Jeden Morgen fährt sie mit dem Fahrrad zur Schule, die drei',
  'Kilometer entfernt im Nachbarort liegt.',
  '',
  'An einem Dienstag im November war der Weg vereist. Mia stürzte',
  'an der alten Brücke und verletzte sich am Knie. Ein Bauer, der',
  'gerade mit seinem Traktor vorbeikam, half ihr auf und brachte sie',
  'zur Schule. Seitdem grüßt Mia ihn jeden Morgen.',
];

const TRANSCRIPT = `# Der Schulweg\n\nMia wohnt mit ihrer Familie in einem kleinen Dorf am Rand des Waldes. Jeden Morgen fährt sie mit dem Fahrrad zur Schule, die drei Kilometer entfernt im Nachbarort liegt.\n\nAn einem Dienstag im November war der Weg vereist. Mia stürzte an der alten Brücke und verletzte sich am Knie. Ein Bauer, der gerade mit seinem Traktor vorbeikam, half ihr auf und brachte sie zur Schule. Seitdem grüßt Mia ihn jeden Morgen.`;

const EVENTS = ['Der Weg ist vereist.', 'Mia stürzt an der Brücke.', 'Ein Bauer hilft ihr.'];

/** The six questions the reading writes: five hold, one names a line the text does not have. */
const QUESTIONS = [
  {
    kind: 'short',
    prompt: 'Womit fährt Mia zur Schule?',
    answer: 'mit dem Fahrrad',
    accepted_answers: ['Fahrrad'],
    evidence: 'fährt sie mit dem Fahrrad zur Schule',
    difficulty: 1,
  },
  {
    kind: 'multiple_choice',
    prompt: 'Wie weit ist die Schule entfernt?',
    choices: ['einen Kilometer', 'drei Kilometer', 'zehn Kilometer'],
    correct_choice: 1,
    evidence: 'die drei Kilometer entfernt im Nachbarort liegt',
    difficulty: 1,
  },
  {
    kind: 'true_false',
    statement: 'Mia ist im Sommer gestürzt.',
    is_true: false,
    evidence: 'An einem Dienstag im November war der Weg vereist',
    difficulty: 2,
  },
  // Dropped: the text has seven lines (the empty one is not counted).
  {
    kind: 'short',
    prompt: 'Was erzählt Z. 14 über den Bauern?',
    answer: 'der Bauer hilft',
    accepted_answers: [],
    evidence: 'Ein Bauer, der gerade mit seinem Traktor vorbeikam, half ihr auf',
    difficulty: 2,
  },
  {
    kind: 'order',
    prompt: 'Bring die Ereignisse in die Reihenfolge der Geschichte.',
    elements: EVENTS,
    difficulty: 2,
  },
  {
    kind: 'short',
    prompt: 'Wer hilft Mia in Z. 6–7?',
    answer: 'ein Bauer',
    accepted_answers: [],
    evidence: 'Ein Bauer, der gerade mit seinem Traktor vorbeikam, half ihr auf',
    difficulty: 2,
  },
];

const reading = (over: Record<string, unknown> = {}) => ({
  title: 'Der Schulweg',
  lines: LINES,
  lang: 'de',
  topic: 'Mias Schulweg',
  questions: QUESTIONS,
  ...over,
});

const sheet = (over: Record<string, unknown> = {}) => ({
  json: {
    is_learning_material: true,
    readable: true,
    title: 'Der Schulweg',
    subject: { name: 'Deutsch', kind: 'german' },
    extracted_text: TRANSCRIPT,
    items: [],
    structured: [],
    reading: [reading()],
    ...over,
  },
});

describe.skipIf(!dbReady)('reading texts', () => {
  let env: TestEnv;
  let l: Learner;

  /** A photographed sheet, read by the scripted model; the material when it is done. */
  async function photograph(
    answer: ReturnType<typeof sheet>,
    purpose: 'study' | 'homework' = 'study',
    /** A sheet that is read for study wakes Buddy once; a failed one or homework does not. */
    wakesBuddy = purpose === 'study',
  ): Promise<MaterialView> {
    env.llm.script('extraction', answer);
    if (wakesBuddy) {
      env.llm.script('buddy_check', {
        json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null },
      });
    }
    const created = await l.api.post<{ material: MaterialView; uploads: Array<{ path: string }> }>(
      '/materials',
      { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'], purpose },
    );
    expect(created.status).toBe(201);
    for (const u of created.body.uploads) env.storage.put(u.path);
    expect((await l.api.post(`/materials/${created.body.material.id}/submit`)).status).toBe(202);
    await env.flushBackground();
    const m = await l.api.get<MaterialView>(`/materials/${created.body.material.id}`);
    return m.body;
  }

  async function practise(m: MaterialView): Promise<SessionView> {
    const started = await l.api.post<SessionView>('/practice/sessions', { material_id: m.id });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    return started.body;
  }

  const answer = (
    s: SessionView,
    si: SessionItemView,
    body: Record<string, unknown>,
    turn?: string,
  ) =>
    l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: turn ?? randomUUID(),
      item_id: si.item.id,
      ...body,
    });

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-03T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  // A tutor call here would mean code sent an answer to the model that a rule decides.
  afterEach(() => env.closeChecked());

  it('a photo of a reading text gives one group of five questions sharing one text', async () => {
    const m = await photograph(sheet());
    expect(m.status).toBe('ready');
    const rows = await env.db.query<{
      kind: string;
      prompt: string;
      choices: string[] | null;
      correct_choice: number | null;
      hints: string[];
      spelling: string | null;
      read_passage: { title: string; lines: string[]; lang: string };
    }>(
      `select kind, prompt, choices, correct_choice, hints, spelling, read_passage
         from items where material_id = $1 order by seq`,
      [m.id],
    );
    // The question naming line 14 of an eight-line text was never created.
    expect(rows.map((r) => r.prompt)).toEqual([
      'Womit fährt Mia zur Schule?',
      'Wie weit ist die Schule entfernt?',
      'Mia ist im Sommer gestürzt.',
      'Bring die Ereignisse in die Reihenfolge der Geschichte.',
      'Wer hilft Mia in Z.\u00A06–7?',
    ]);
    expect(rows.map((r) => r.kind)).toEqual([
      'short',
      'multiple_choice',
      'multiple_choice',
      'order',
      'short',
    ]);
    for (const r of rows) {
      expect(r.read_passage).toEqual({ title: 'Der Schulweg', lines: LINES, lang: 'de' });
    }
    // True/false: two options code wrote; the key points at "Falsch".
    expect(rows[2]).toMatchObject({ choices: ['Richtig', 'Falsch'], correct_choice: 1 });
    // The one hint is where to look again, counted by code from the evidence.
    expect(rows[0]!.hints).toEqual(['Lies nochmal Zeile 2.']);
    // The empty line between the paragraphs is not counted, as in print.
    expect(rows[4]!.hints).toEqual(['Lies nochmal die Zeilen 5 bis 6.']);
    expect(rows[0]!.spelling).toBe('gentle');

    const s = await practise(m);
    expect(s.items).toHaveLength(5);
    const refs = s.items.map((i) => i.item.passage?.ref);
    expect(refs).toEqual(['t1', 't1', 't1', 't1', 't1']);
    for (const si of s.items) {
      expect(si.item.passage).toMatchObject({ title: 'Der Schulweg', lines: LINES, lang: 'de' });
      // While a question is open, its place in the text is half the answer: not sent.
      expect(si.item.passage?.evidence).toBeNull();
    }
    // The lines a question names itself are sent: the text opens there.
    expect(s.items.map((i) => i.item.passage?.named ?? null)).toEqual([
      null,
      null,
      null,
      null,
      { from: 6, to: 7 },
    ]);
    // The material list names the questions; the text belongs to the session.
    const listed = await l.api.get<{ items: Array<{ passage: unknown }> }>(
      `/materials/${m.id}/items`,
    );
    expect(listed.body.items.every((i) => i.passage === null)).toBe(true);
  });

  it('decides MC, true/false, the order and a short answer by rules; spelling never counts', async () => {
    const s = await practise(await photograph(sheet()));
    const [bike, distance, summer, order, farmer] = s.items;

    // A short answer with a slip of the pen: what she understood is right (#197).
    const slip = await answer(s, bike!, { text: 'mit dem Farrad' });
    expect(slip.status, JSON.stringify(slip.body)).toBe(200);
    expect(slip.body.verdict).toBe('correct');
    const closed = slip.body.session.items[0]!;
    expect(closed.status).toBe('correct');
    // Closed: the text says where the answer stood, and still stands above the question.
    expect(closed.item.passage).toMatchObject({ ref: 't1', evidence: { from: 2, to: 2 } });

    const right = await answer(s, distance!, { choice: 1 });
    expect(right.body.verdict).toBe('correct');
    expect(right.body.session.items[1]!.item.passage?.evidence).toEqual({ from: 2, to: 3 });

    // True/false: a miss leaves one option, so the solution is shown — and with it the place.
    const wrong = await answer(s, summer!, { choice: 0 });
    expect(wrong.body.verdict).toBe('incorrect');
    expect(wrong.body.session.items[2]!.status).toBe('revealed');
    expect(wrong.body.session.items[2]!.answer).toBe('Falsch');
    expect(wrong.body.session.items[2]!.item.passage?.evidence).toEqual({ from: 4, to: 4 });

    const view = order!.item.task_view;
    const elements = view?.type === 'order' ? view.elements : [];
    const byText = new Map(elements.map((e) => [e.text, e.id]));
    const ordered = await answer(s, order!, {
      parts: { type: 'order', order: EVENTS.map((x) => byText.get(x) ?? 'zz') },
    });
    expect(ordered.body.verdict).toBe('correct');
    // An order is about the whole text: no place to point at.
    expect(ordered.body.session.items[3]!.item.passage?.evidence).toBeNull();

    // The hint is the place in the text, at once and without a model.
    const tip = await l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/hint`, {
      client_turn_id: randomUUID(),
      item_id: farmer!.item.id,
    });
    expect(tip.status).toBe(200);
    expect(tip.body.reply.text).toBe('Lies nochmal die Zeilen 5 bis 6.');
    const last = await answer(s, farmer!, { text: 'Ein Bauer' });
    expect(last.body.verdict).toBe('correct');

    const decided = await env.db.query<{ evaluated_by: string }>(
      `select evaluated_by from practice_turns
        where session_id = $1 and role = 'learner' and verdict is not null`,
      [s.id],
    );
    expect(decided.every((d) => d.evaluated_by === 'rule')).toBe(true);
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('a Belegstelle: she taps the lines of the text, the text is her board, code counts (#368)', async () => {
    const m = await photograph(
      sheet({
        reading: [
          reading({
            questions: [
              QUESTIONS[0],
              {
                kind: 'evidence',
                statement: 'Mia ist dem Bauern dankbar.',
                // Lines 6–7: the empty line between the paragraphs is not counted.
                evidence:
                  'half ihr auf und brachte sie zur Schule. Seitdem grüßt Mia ihn jeden Morgen',
                difficulty: 2,
              },
              // Dropped: it names the line, which is the answer.
              {
                kind: 'evidence',
                statement: 'In Z. 4 steht, dass der Weg vereist war.',
                evidence: 'war der Weg vereist',
                difficulty: 2,
              },
              // Dropped: the evidence is not in the text.
              {
                kind: 'evidence',
                statement: 'Mia hat einen Hund.',
                evidence: 'Mia geht mit ihrem Hund spazieren',
                difficulty: 2,
              },
            ],
          }),
        ],
      }),
    );
    const s = await practise(m);
    expect(s.items.map((i) => i.item.prompt)).toEqual([
      'Womit fährt Mia zur Schule?',
      'Mia ist dem Bauern dankbar.',
    ]);
    const beleg = s.items[1]!;
    const view = beleg.item.task_view;
    expect(view).toMatchObject({ type: 'mark', mode: 'lines', words: [], lines: LINES });
    // The text is her board: not sent a second time above the question while it is open.
    expect(beleg.item.passage).toBeNull();
    expect(s.items[0]!.item.passage).not.toBeNull();
    // No hint names the line: the lines are the answer.
    expect(beleg.hints_left).toBe(0);

    const wrong = await answer(s, beleg, {
      parts: {
        type: 'mark',
        marks: [
          { at: 'l6', category: null },
          { at: 'l1', category: null },
        ],
      },
    });
    expect(wrong.status, JSON.stringify(wrong.body)).toBe(200);
    expect(wrong.body.verdict).toBe('incorrect');
    expect(wrong.body.reply.text).toBe('Noch nicht ganz: 1 richtig, 1 fehlt noch, 1 zu viel.');
    // A line that is not one of the text is refused, not graded.
    const nowhere = await answer(s, beleg, {
      parts: { type: 'mark', marks: [{ at: 'l99', category: null }] },
    });
    expect(nowhere.status).toBe(422);
    const right = await answer(s, beleg, {
      parts: {
        type: 'mark',
        marks: [
          { at: 'l7', category: null },
          { at: 'l6', category: null },
        ],
      },
    });
    expect(right.body.verdict).toBe('correct');
    // Closed: the text is back above it, with the lines that back the statement.
    const closed = right.body.session.items[1]!;
    expect(closed.item.task_view).toBeNull();
    expect(closed.item.passage).toMatchObject({ ref: 't1', evidence: { from: 6, to: 7 } });
    // Her answer in the conversation, in her language.
    const said = await env.db.query<{ text: string }>(
      `select text from practice_turns where session_id = $1 and item_id = $2 and role = 'learner'
        order by created_at`,
      [s.id, beleg.item.id],
    );
    expect(said.map((x) => x.text)).toEqual(['Z. 1, 6', 'Z. 6–7']);
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('answering twice with one turn id counts once; another learner sees nothing of it', async () => {
    const s = await practise(await photograph(sheet()));
    const si = s.items[1]!;
    const turn = randomUUID();
    const first = await answer(s, si, { choice: 0 }, turn);
    const again = await answer(s, si, { choice: 0 }, turn);
    expect(first.body.verdict).toBe('incorrect');
    expect(again.body.verdict).toBe('incorrect');
    expect(again.body.session.items[1]!.attempts).toBe(1);

    const other = await onboard(env, { relation: 'child', name: 'Tom', birthDate: '2013-05-01' });
    expect((await other.api.get(`/practice/sessions/${s.id}`)).status).toBe(404);
    const theirs = await other.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: si.item.id,
      choice: 1,
    });
    expect(theirs.status).toBe(404);
  });

  it('a text that is not on the sheet, or a group of one, stores nothing of it', async () => {
    // The text is not in the reading's own transcription: invented next to the photo.
    const invented = await photograph(
      sheet({ extracted_text: 'Rechne: 3 + 4 = ?', items: [plainQuestion()] }),
    );
    expect(invented.status).toBe('ready');
    const kept = await env.db.query<{ prompt: string; read_passage: unknown }>(
      `select prompt, read_passage from items where material_id = $1`,
      [invented.id],
    );
    expect(kept).toEqual([{ prompt: 'Was ist 3 + 4?', read_passage: null }]);

    // Only one question holds: no group, and with nothing else on the sheet the reading failed
    // as a reading — the photo was fine.
    const single = await photograph(
      sheet({ reading: [reading({ questions: [QUESTIONS[0], QUESTIONS[3]] })] }),
      'study',
      false,
    );
    expect(single.status).toBe('failed');
    expect(single.failure_reason).toBe('model_error');
  });

  it('homework keeps its printed tasks: no reading group is read there', async () => {
    const m = await photograph(sheet({ items: [plainQuestion()] }), 'homework');
    const rows = await env.db.query<{ read_passage: unknown }>(
      `select read_passage from items where material_id = $1`,
      [m.id],
    );
    expect(rows).toEqual([{ read_passage: null }]);
  });
});

function plainQuestion() {
  return {
    kind: 'numeric',
    prompt: 'Was ist 3 + 4?',
    answer: '7',
    accepted_answers: [],
    unit: null,
    choices: null,
    correct_choice: null,
    topic: 'Addition',
    difficulty: 1,
    source_excerpt: null,
  };
}
