// Lesetext und Markieren (issues #233, #234) on a real Postgres, end to end through the API:
//
//   1. A photographed reading text becomes ONE group: five questions, one shared text with its
//      lines, every question carrying it. A question that names a line the text does not have is
//      dropped before it exists (issue #233 acceptance). Answers are judged by the rules; the
//      text stays on screen; the closed question names the lines its answer stands in.
//   2. A reading run Buddy writes (`kind: 'read'`): the model sees the reading text and nothing
//      else, and a text whose questions do not hold is refused as "nothing to learn".
//   3. A marking task: her marks are compared with the key as a set — counted, never named, never
//      a model — and marks that do not fit the task are refused; another learner's question is
//      not hers to answer.
//
// No model is asked for any verdict: `afterEach` fails on any unexpected call.
// docs/architecture.md §Practice ("Reading texts", "Structured items").
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  AnswerResponse,
  MaterialView,
  SessionView,
  StructuredAnswer,
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

const QUESTIONS = [
  {
    kind: 'short',
    prompt: 'Wie kommt Mia jeden Morgen zur Schule?',
    answer: 'mit dem Fahrrad',
    accepted_answers: ['Fahrrad'],
    evidence: 'Jeden Morgen fährt sie mit dem Fahrrad zur Schule',
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
    statement: 'Mia hat sich auf dem Weg zur Schule verletzt.',
    is_true: true,
    evidence: 'Mia stürzte an der alten Brücke und verletzte sich am Knie',
    difficulty: 2,
  },
  // Line 14 does not exist: this question is never asked.
  {
    kind: 'short',
    prompt: 'Was sagt der Bauer in Z. 14?',
    answer: 'nichts',
    accepted_answers: [],
    evidence: 'half ihr auf',
    difficulty: 2,
  },
  {
    kind: 'order',
    prompt: 'Bring die Ereignisse in die richtige Reihenfolge.',
    elements: ['Mia stürzt an der Brücke', 'Ein Bauer hilft ihr auf', 'Mia grüßt den Bauern'],
    difficulty: 2,
  },
  {
    kind: 'mark',
    prompt: 'Setze in diesem Satz aus Z. 6–7 die Kommas.',
    mode: 'gaps',
    text: 'Ein Bauer, der gerade mit seinem Traktor vorbeikam, half ihr auf.',
    targets: null,
    categories: null,
    corrected: null,
    difficulty: 3,
  },
];

const READING = {
  title: 'Der Schulweg',
  lines: LINES,
  lang: 'de',
  topic: 'Mias Schulweg',
  questions: QUESTIONS,
};

/** Buddy's look at the new sheet: nothing to do here. */
const WAIT = { json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null } };

const answer = (l: Learner, sessionId: string, body: Record<string, unknown>) =>
  l.api.post<AnswerResponse>(`/practice/sessions/${sessionId}/answer`, {
    client_turn_id: randomUUID(),
    ...body,
  });

describe.skipIf(!dbReady)('reading texts and marking', () => {
  let env: TestEnv;
  let l: Learner;

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
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

  it('reads a photographed text into one group of five questions sharing its text', async () => {
    env.llm.byDefault('hints', { json: { items: [] } });
    env.llm.byDefault('buddy_check', WAIT);
    env.llm.script('extraction', (req) => {
      expect(req.system).toContain('READING TEXTS ("reading")');
      expect(req.system).toContain('Marking tasks ("structured", type "mark")');
      return {
        is_learning_material: true,
        readable: true,
        title: 'Der Schulweg',
        subject: { name: 'Deutsch', kind: 'german' },
        extracted_text: LINES.join('\n'),
        items: [],
        structured: [],
        reading: [READING],
      };
    });
    const created = await l.api.post<{ material: MaterialView; uploads: Array<{ path: string }> }>(
      '/materials',
      { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'] },
    );
    expect(created.status).toBe(201);
    env.storage.put(created.body.uploads[0]!.path);
    await l.api.post(`/materials/${created.body.material.id}/submit`);
    await env.flushBackground();

    const material = (await l.api.get<MaterialView>(`/materials/${created.body.material.id}`)).body;
    expect(material.status).toBe('ready');
    const start = await l.api.post<SessionView>('/practice/sessions', {
      client_request_id: randomUUID(),
      mode: 'practice',
      material_id: material.id,
    });
    expect(start.status).toBe(201);
    const session = start.body;
    // Five questions — the one about line 14 never existed.
    expect(session.items.map((i) => i.item.kind)).toEqual([
      'short',
      'multiple_choice',
      'multiple_choice',
      'order',
      'mark',
    ]);
    expect(session.items.some((i) => i.item.prompt.includes('Z. 14'))).toBe(false);
    // One text, shared: every question carries it, with the same alias and all its lines.
    for (const si of session.items) {
      expect(si.item.passage).toEqual({
        ref: 't1',
        title: 'Der Schulweg',
        lines: LINES,
        lang: 'de',
      });
    }
    const rows = await env.db.query<{ n: string }>(
      `select count(distinct read_passage::text) as n from items where material_id = $1`,
      [material.id],
    );
    expect(Number(rows[0]?.n)).toBe(1);

    // A short answer, right by the rules — and a slip of the pen is no mark (no language marking).
    const [short, mc, tf] = session.items;
    const r1 = await answer(l, session.id, { item_id: short!.item.id, text: 'mit dem Farrad' });
    expect(r1.status).toBe(200);
    expect(r1.body.verdict).toBe('correct');
    const closed = r1.body.session.items.find((i) => i.item.id === short!.item.id)!;
    // Closed: the lines its answer stands in (the place she is shown), and the text stays.
    expect(closed.evidence).toEqual({ from: 2, to: 2 });
    expect(closed.item.passage?.ref).toBe('t1');
    // An open question names no lines: that would be the answer's place before she looked.
    expect(r1.body.session.items.find((i) => i.item.id === mc!.item.id)?.evidence).toBeNull();

    // Multiple choice and true/false: a tap, exact.
    const r2 = await answer(l, session.id, { item_id: mc!.item.id, choice: 1 });
    expect(r2.body.verdict).toBe('correct');
    expect(tf!.item.choices).toEqual(['Richtig', 'Falsch']);
    // "Tipp" on a reading question: where to look — at once, without a model.
    const hint = await l.api.post<AnswerResponse>(`/practice/sessions/${session.id}/hint`, {
      client_turn_id: randomUUID(),
      item_id: tf!.item.id,
    });
    expect(hint.status).toBe(200);
    expect(hint.body.reply.text).toContain('Z. 5–6');
    const r3 = await answer(l, session.id, { item_id: tf!.item.id, choice: 1 });
    expect(r3.body.verdict).toBe('incorrect');

    // Another learner cannot answer, or see, these questions.
    const other = await onboard(env, { relation: 'child', name: 'Ben', birthDate: '2013-05-01' });
    const foreign = await answer(other, session.id, { item_id: short!.item.id, text: 'Fahrrad' });
    expect(foreign.status).toBe(404);
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('writes a reading run from a topic: the text and its questions, and nothing else', async () => {
    env.llm.byDefault('hints', { json: { items: [] } });
    env.llm.script('explain', (req) => {
      const schema = JSON.stringify(req.schema);
      expect(schema).toContain('"reading"');
      expect(schema).not.toContain('"structured"');
      expect(schema).not.toContain('"listen"');
      return {
        usable: true,
        title: 'Leseverständnis: Schulweg',
        subject: { name: 'Deutsch', kind: 'german' },
        reading: READING,
      };
    });
    const started = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'read',
      text: 'Ich will Leseverständnis üben',
    });
    expect(started.status).toBe(201);
    expect(started.body.mode).toBe('practice');
    expect(started.body.items).toHaveLength(5);
    expect(new Set(started.body.items.map((i) => i.item.passage?.ref))).toEqual(new Set(['t1']));
    expect(started.body.items.every((i) => i.item.origin === 'buddy')).toBe(true);

    // A text whose questions do not hold gives nothing to learn — never a group of one.
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Leer',
        subject: null,
        reading: { ...READING, questions: [QUESTIONS[3]] },
      },
    });
    const refused = await l.api.post('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'read',
      text: 'Noch ein Lesetext',
    });
    expect(refused.status).toBe(422);
    expect(refused.body).toMatchObject({ error: { details: { reason: 'not_usable' } } });
  });

  it('checks her marks as a set: counted, never named, and refused when they do not fit', async () => {
    env.llm.byDefault('hints', { json: { items: [] } });
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Nomen finden',
        subject: { name: 'Deutsch', kind: 'german' },
        items: [],
        structured: [
          {
            type: 'mark',
            prompt: 'Tippe alle Nomen an.',
            mode: 'words',
            text: 'am morgen läuft der hund mit seinem ball durch den garten.',
            targets: [
              { word: 'morgen', occurrence: null, category: null },
              { word: 'hund', occurrence: null, category: null },
              { word: 'ball', occurrence: null, category: null },
              { word: 'garten', occurrence: null, category: null },
            ],
            categories: null,
            corrected: null,
            topic: 'Nomen',
            difficulty: 2,
            prompt_lang: 'de',
          },
          // The same word twice without its occurrence: no task.
          {
            type: 'mark',
            prompt: 'Tippe das Nomen an.',
            mode: 'words',
            text: 'der hund sieht den hund',
            targets: [{ word: 'hund', occurrence: null, category: null }],
            categories: null,
            corrected: null,
            topic: 'Nomen',
            difficulty: 2,
            prompt_lang: 'de',
          },
        ],
      },
    });
    const started = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Nomen finden',
    });
    expect(started.status).toBe(201);
    expect(started.body.items).toHaveLength(1);
    const si = started.body.items[0]!;
    expect(si.item.kind).toBe('mark');
    const view = si.item.task_view;
    if (view?.type !== 'mark') throw new Error('no marking view');
    expect(view.words).toHaveLength(11);
    expect(JSON.stringify(view)).not.toContain('key');
    const id = (word: string) => view.words.find((w) => w.text === word)!.id;
    const mark = (marks: StructuredAnswer) =>
      answer(l, started.body.id, { item_id: si.item.id, parts: marks });

    // Two right, two missing, one too many.
    const wrong = await mark({
      type: 'mark',
      marks: [
        { at: id('hund'), category: null },
        { at: id('ball'), category: null },
        { at: id('läuft'), category: null },
      ],
    });
    expect(wrong.status).toBe(200);
    expect(wrong.body.verdict).toBe('incorrect');
    expect(wrong.body.reply.text).toBe('Noch nicht ganz: 2 richtig, 2 fehlen noch, 1 zu viel.');
    // The reply never names a word, and the question is still open with its words.
    expect(wrong.body.reply.text).not.toMatch(/morgen|garten/);
    expect(wrong.body.session.items[0]!.item.task_view?.type).toBe('mark');

    // Marks that do not fit the task are refused, not graded.
    const twice = await mark({
      type: 'mark',
      marks: [
        { at: id('hund'), category: null },
        { at: id('hund'), category: null },
      ],
    });
    expect(twice.status).toBe(422);
    const gap = await mark({ type: 'mark', marks: [{ at: 'g1', category: null }] });
    expect(gap.status).toBe(422);
    expect(gap.body).toMatchObject({ error: { details: { reason: 'parts_mismatch' } } });
    const typed = await answer(l, started.body.id, { item_id: si.item.id, text: 'hund, ball' });
    expect(typed.status).toBe(422);

    // Another learner's request on this question is not hers to make.
    const other = await onboard(env, { relation: 'child', name: 'Ben', birthDate: '2013-05-01' });
    const foreign = await answer(other, started.body.id, {
      item_id: si.item.id,
      parts: { type: 'mark', marks: [] },
    });
    expect(foreign.status).toBe(404);

    // The right set, in any order: right.
    const right = await mark({
      type: 'mark',
      marks: ['garten', 'hund', 'morgen', 'ball'].map((w) => ({ at: id(w), category: null })),
    });
    expect(right.body.verdict).toBe('correct');
    const done = right.body.session.items[0]!;
    expect(done.status).toBe('correct');
    expect(done.item.task_view).toBeNull();

    // Stored with its key as positions; the row agrees with the kind (migration 0090).
    const [row] = await env.db.query<{ kind: string; task: { type: string; key: unknown[] } }>(
      `select kind, task from items where id = $1`,
      [si.item.id],
    );
    expect(row).toMatchObject({ kind: 'mark', task: { type: 'mark' } });
    expect(row?.task.key).toHaveLength(4);
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('the database refuses a mark question without a task, and a question with two texts', async () => {
    const learnerId = l.learnerId;
    await expect(
      env.db.query(
        `insert into items (learner_id, kind, prompt, answer, difficulty, origin)
         values ($1, 'mark', 'Tippe an', 'x', 1, 'buddy')`,
        [learnerId],
      ),
    ).rejects.toThrow(/items_task_matches_kind/);
    await expect(
      env.db.query(
        `insert into items (learner_id, kind, prompt, answer, difficulty, origin, read_passage, listen_task)
         values ($1, 'short', 'Frage', 'x', 1, 'buddy', $2, $3)`,
        [
          learnerId,
          JSON.stringify({ title: null, lines: LINES, lang: 'de' }),
          JSON.stringify({ text: LINES.join(' '), lang: 'de' }),
        ],
      ),
    ).rejects.toThrow(/items_one_text/);
  });
});
