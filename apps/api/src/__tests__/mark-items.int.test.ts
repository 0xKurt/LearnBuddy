// Markieren end to end (issue #234). The model writes the text and NAMES the words to mark (or
// writes the sentence with its commas, the words with their hyphens); code splits the text into
// words, finds the named ones, refuses an ambiguous or impossible task (Regel 0 of #224, reject —
// never repair) and keeps the key as places in `items.task` (migration 0087). What she marked is
// compared with that key as a set — never a model for the verdict — and a wrong set gets counts
// ("2 richtig, 1 fehlt noch, 1 zu viel"), never the places.
// docs/architecture.md §Practice ("Structured items" → "Mark").
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  AnswerResponse,
  MarkPick,
  MaterialView,
  SessionItemView,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

/** Twelve words, all in lower case: which are nouns? */
const TEXT = 'am samstag spielt der hund mit dem ball im garten hinter dem haus.';
const NOUNS = ['samstag', 'hund', 'ball', 'garten', 'haus'];

const draft = (over: Record<string, unknown> = {}) => ({
  type: 'mark',
  prompt: 'Tippe alle Nomen an.',
  mode: 'words',
  text: TEXT,
  targets: NOUNS.map((word) => ({ word, occurrence: null, category: null })),
  categories: null,
  corrected: null,
  topic: 'Nomen erkennen',
  difficulty: 1,
  prompt_lang: 'de',
  ...over,
});

/** The view of a marking item (`task_view` is the union of every structured kind). */
function viewOf(si: SessionItemView | undefined) {
  const view = si?.item.task_view;
  expect(view?.type).toBe('mark');
  return view?.type === 'mark' ? view : { mode: 'words', words: [], categories: [] };
}

/** The marks on the words with these texts ('w99' for one that is not there). */
function on(si: SessionItemView, texts: string[], category: string | null = null): MarkPick[] {
  const id = new Map(viewOf(si).words.map((w) => [w.text, w.id]));
  return texts.map((t) => ({ at: id.get(t) ?? 'w99', category }));
}

describe.skipIf(!dbReady)('marking items', () => {
  let env: TestEnv;
  let l: Learner;

  /** A topic's practice (or test) whose scripted model wrote these structured tasks. */
  async function prepare(
    structured: unknown[],
    kind: 'practice' | 'test' = 'practice',
  ): Promise<SessionView> {
    env.llm.script('explain', () => ({
      usable: true,
      title: 'Nomen erkennen',
      subject: { name: 'Deutsch', kind: 'german' },
      items: [],
      structured,
    }));
    if (kind === 'practice') {
      env.llm.script('hints', () => ({
        items: structured.map((_, i) => ({
          n: i + 1,
          // The second names a place to mark: code drops it.
          hints: ['Nomen kann man anfassen oder sehen.', 'Schau dir den Hund an.'],
          worked_solution: 'Nomen sind Namen für Dinge, Lebewesen und Zeiten …',
        })),
      }));
    }
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind,
      text: 'Nomen finden',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    return res.body;
  }

  async function answer(
    session: SessionView,
    itemId: string,
    marks: MarkPick[],
    turn: string = randomUUID(),
    as: Learner = l,
  ) {
    return as.api.post<AnswerResponse>(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: turn,
      item_id: itemId,
      parts: { type: 'mark', marks },
    });
  }

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-04T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2016-02-10' });
  });
  // A tutor call here would mean code could not decide a set it must decide: the script's
  // verdict fails on any unexpected or unused model call.
  afterEach(async () => {
    await env.closeChecked();
  });

  it('splits the text in code, keeps the key as places, and judges the set right', async () => {
    const session = await prepare([draft()]);
    expect(session.items).toHaveLength(1);
    const si = session.items[0]!;
    expect(si.item).toMatchObject({ kind: 'mark', choices: null });
    const view = viewOf(si);
    expect(view.mode).toBe('words');
    expect(view.words.map((w) => w.text)).toEqual(TEXT.replace('.', '').split(' '));
    expect(view.words.at(-1)).toMatchObject({ text: 'haus', tail: '.' });

    const row = await env.db.one<{
      task: { key: MarkPick[] };
      answer: string;
      hints: string[];
    }>(`select task, answer, hints from items where id = $1`, [si.item.id]);
    expect(row.task.key.map((k) => k.at)).toEqual(on(si, NOUNS).map((m) => m.at));
    expect(row.answer).toBe('samstag, hund, ball, garten, haus');
    // The prepared hint that names a word to mark never reaches her.
    expect(row.hints).toEqual(['Nomen kann man anfassen oder sehen.']);

    // Any order of tapping: a set is a set.
    const res = await answer(session, si.item.id, on(si, [...NOUNS].reverse()));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.verdict).toBe('correct');
    const closed = res.body.session.items[0];
    expect(closed?.status).toBe('correct');
    expect(closed?.item.task_view).toBeNull();
    const how = await env.db.one<{ answered_by: string }>(
      `select answered_by from session_items where session_id = $1`,
      [session.id],
    );
    expect(how.answered_by).toBe('tapped');
  });

  it('counts a wrong set — right, missing, too many — and reveals on the third miss', async () => {
    const session = await prepare([draft()]);
    const si = session.items[0]!;
    const marks = on(si, ['hund', 'ball', 'spielt']);

    const first = await answer(session, si.item.id, marks);
    expect(first.status).toBe(200);
    expect(first.body.verdict).toBe('incorrect');
    expect(first.body.reply.text).toBe('Noch nicht ganz: 2 richtig, 3 fehlen noch, 1 zu viel.');
    expect(first.body.session.items[0]?.status).toBe('open');
    // What she marked stands in the thread as words, never as ids.
    const mine = first.body.session.turns.filter((t) => t.role === 'learner').at(-1);
    expect(mine?.text).toBe('spielt, hund, ball');

    await answer(session, si.item.id, marks);
    const third = await answer(session, si.item.id, marks);
    const closed = third.body.session.items[0];
    expect(closed?.status).toBe('revealed');
    expect(closed?.answer).toBe('samstag, hund, ball, garten, haus');
  });

  it('sorts into categories: a right word in the wrong category is counted as such', async () => {
    const session = await prepare([
      draft({
        prompt: 'Markiere Subjekt und Prädikat.',
        text: 'Der kleine Hund bellt laut.',
        categories: ['Subjekt', 'Prädikat'],
        targets: [
          { word: 'Der kleine Hund', occurrence: null, category: 'Subjekt' },
          { word: 'bellt', occurrence: null, category: 'Prädikat' },
        ],
      }),
    ]);
    const si = session.items[0]!;
    const view = viewOf(si);
    expect(view.categories.map((c) => c.name)).toEqual(['Subjekt', 'Prädikat']);
    const [subj, pred] = view.categories.map((c) => c.id);
    const wrong = await answer(session, si.item.id, [
      ...on(si, ['Der', 'kleine', 'Hund'], subj!),
      ...on(si, ['laut'], pred!),
    ]);
    expect(wrong.body.reply.text).toBe('Noch nicht ganz: 3 richtig, 1 fehlt noch, 1 zu viel.');
    const misfiled = await answer(session, si.item.id, [
      ...on(si, ['Der', 'kleine', 'Hund'], subj!),
      ...on(si, ['bellt'], subj!),
    ]);
    expect(misfiled.body.reply.text).toBe(
      'Noch nicht ganz: 3 richtig, 1 mit der falschen Kategorie.',
    );
    const right = await answer(session, si.item.id, [
      ...on(si, ['Hund', 'kleine', 'Der'], subj!),
      ...on(si, ['bellt'], pred!),
    ]);
    expect(right.body.verdict).toBe('correct');
  });

  it('sorts a long Satzglieder sentence of grades 5–7; one that wraps to a third row is not stored (#368)', async () => {
    const long = (text: string, prompt: string) =>
      draft({
        prompt,
        text,
        categories: ['Dativobjekt', 'Akkusativobjekt', 'Subjekt'],
        targets: [
          { word: 'der Vater', occurrence: null, category: 'Subjekt' },
          { word: 'seiner Tochter', occurrence: null, category: 'Dativobjekt' },
          { word: 'ein neues Fahrrad', occurrence: null, category: 'Akkusativobjekt' },
        ],
      });
    const session = await prepare([
      // Ten words, 65 characters: two rows of tiles on 360 pt. Before #368 at most seven words.
      long(
        'Am Wochenende schenkt der Vater seiner Tochter ein neues Fahrrad.',
        'Markiere Dativobjekt, Akkusativobjekt und Subjekt.',
      ),
      // Ten words and 66 characters, within both counts — but its words wrap to a third row of
      // tiles (`markRows`): refused.
      long(
        'Nun schenkt der Vater seiner Tochter unerwartet ein neues Fahrrad.',
        'Markiere die Satzglieder.',
      ),
    ]);
    expect(session.items.map((i) => i.item.prompt)).toEqual([
      'Markiere Dativobjekt, Akkusativobjekt und Subjekt.',
    ]);
    const si = session.items[0]!;
    expect(viewOf(si).words).toHaveLength(10);
    const [dat, akk, subj] = viewOf(si).categories.map((c) => c.id);
    const wrong = await answer(session, si.item.id, [
      ...on(si, ['seiner', 'Tochter'], dat!),
      ...on(si, ['ein', 'neues', 'Fahrrad', 'Am'], akk!),
    ]);
    expect(wrong.body.reply.text).toBe('Noch nicht ganz: 5 richtig, 2 fehlen noch, 1 zu viel.');
    const right = await answer(session, si.item.id, [
      ...on(si, ['seiner', 'Tochter'], dat!),
      ...on(si, ['ein', 'neues', 'Fahrrad'], akk!),
      ...on(si, ['der', 'Vater'], subj!),
    ]);
    expect(right.body.verdict).toBe('correct');
  });

  it('commas and syllables: the places come from the sentence and the hyphens the model wrote', async () => {
    const session = await prepare([
      draft({
        prompt: 'Setze die fehlenden Kommas.',
        mode: 'gaps',
        text: 'Als es dunkel wurde, gingen wir nach Hause.',
        targets: null,
      }),
      draft({
        prompt: 'Trenne die Wörter nach Silben.',
        mode: 'syllables',
        text: 'Ba-na-ne Scho-ko-la-de',
        targets: null,
      }),
    ]);
    const [commas, syllables] = session.items;
    const gaps = viewOf(commas);
    // She sees the sentence without the comma she has to set.
    expect(gaps.words.map((w) => w.tail).join('')).not.toContain(',');
    const wrongGap = await answer(session, commas!.item.id, [{ at: 'g3', category: null }]);
    expect(wrongGap.body.reply.text).toBe('Noch nicht ganz: 1 fehlt noch, 1 zu viel.');
    const rightGap = await answer(session, commas!.item.id, [{ at: 'g4', category: null }]);
    expect(rightGap.body.verdict).toBe('correct');

    expect(viewOf(syllables).words.map((w) => w.text)).toEqual(['Banane', 'Schokolade']);
    const cuts = ['w1_2', 'w1_4', 'w2_4', 'w2_6', 'w2_8'].map((at) => ({ at, category: null }));
    const res = await answer(session, syllables!.item.id, cuts);
    expect(res.body.verdict).toBe('correct');
    const mine = res.body.session.turns.filter((t) => t.role === 'learner').at(-1);
    expect(mine?.text).toBe('Ba-na-ne Scho-ko-la-de');
  });

  it('records one answer per client_turn_id', async () => {
    const session = await prepare([draft()]);
    const si = session.items[0]!;
    const turn = randomUUID();
    const some = on(si, ['hund']);
    const a = await answer(session, si.item.id, some, turn);
    const b = await answer(session, si.item.id, some, turn);
    expect(b.status).toBe(200);
    expect(b.body.reply.id).toBe(a.body.reply.id);
    expect(b.body.session.items[0]?.attempts).toBe(1);
    expect((await answer(session, si.item.id, on(si, NOUNS))).body.verdict).toBe('correct');
    expect((await answer(session, si.item.id, on(si, NOUNS))).status).toBe(409);
  });

  it('refuses text, marks that do not fit and another shape, without counting them', async () => {
    const session = await prepare([draft()]);
    const si = session.items[0]!;
    const res = await l.api.post(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: si.item.id,
      text: 'hund',
    });
    expect(res.status).toBe(422);
    const [hund] = on(si, ['hund']);
    for (const marks of [
      [hund!, hund!],
      [{ at: 'w99', category: null }],
      [{ at: 'g2', category: null }],
      [{ ...hund!, category: 'k1' }],
      [],
    ]) {
      const bad = await answer(session, si.item.id, marks);
      expect(bad.status, JSON.stringify(marks)).toBe(422);
    }
    const shape = await l.api.post(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: si.item.id,
      parts: { type: 'select_all', chosen: ['a'] },
    });
    expect(shape.status).toBe(422);
    const fresh = await l.api.get<SessionView>(`/practice/sessions/${session.id}`);
    expect(fresh.body.items[0]?.attempts).toBe(0);
  });

  it("never lets another learner answer the question; another's id is 404", async () => {
    const session = await prepare([draft()]);
    const si = session.items[0]!;
    const other = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2016-05-01' });
    const theirs = await answer(session, si.item.id, on(si, NOUNS), undefined, other);
    expect(theirs.status).toBe(404);
  });

  it('never sends the key or the correction while the question is open', async () => {
    const session = await prepare([
      draft({
        prompt: 'Finde die zwei Fehler.',
        text: 'Der Hunt spielt mit dem Bal im Garten.',
        targets: [
          { word: 'Hunt', occurrence: null, category: null },
          { word: 'Bal', occurrence: null, category: null },
        ],
        corrected: 'Der Hund spielt mit dem Ball im Garten.',
      }),
    ]);
    const si = session.items[0]!;
    const row = await env.db.one<{ answer: string }>(`select answer from items where id = $1`, [
      si.item.id,
    ]);
    expect(row.answer).toBe('Hunt → Hund, Bal → Ball');
    const wrong = await answer(session, si.item.id, on(si, ['Hunt']));
    const bodies = [
      JSON.stringify(session),
      JSON.stringify((await l.api.get(`/practice/sessions/${session.id}`)).body),
      JSON.stringify(wrong.body),
    ];
    for (const body of bodies) {
      expect(body).not.toContain('"key"');
      expect(body).not.toContain('"corrections"');
      expect(body).not.toContain('Ball');
      expect(body).not.toContain(row.answer);
    }
  });

  it('stores nothing of a task Regel 0 rejects, and keeps the rest of the set', async () => {
    const session = await prepare([
      // "dem" stands twice: without its occurrence the task is ambiguous.
      draft({ targets: [{ word: 'dem', occurrence: null, category: null }] }),
      // A word that is not in the text.
      draft({ targets: [{ word: 'katze', occurrence: null, category: null }] }),
      // An error text whose correction differs at an unmarked word too.
      draft({
        text: 'Der Hunt spielt mit dem Bal.',
        targets: [{ word: 'Hunt', occurrence: null, category: null }],
        corrected: 'Der Hund spielt mit dem Ball.',
      }),
      // With its occurrence the same word is one place.
      draft({
        prompt: 'Tippe das zweite „dem“ an.',
        targets: [{ word: 'dem', occurrence: 2, category: null }],
      }),
    ]);
    expect(session.items.map((i) => i.item.prompt)).toEqual(['Tippe das zweite „dem“ an.']);
    const si = session.items[0]!;
    const dems = viewOf(si).words.filter((w) => w.text === 'dem');
    expect(dems).toHaveLength(2);
    const res = await answer(session, si.item.id, [{ at: dems[1]!.id, category: null }]);
    expect(res.body.verdict).toBe('correct');
    const stored = await env.db.one<{ n: number }>(
      `select count(*)::int as n from items where learner_id = $1`,
      [l.learnerId],
    );
    expect(stored.n).toBe(1);
  });

  it('keeps the database honest: a mark row without its task cannot exist (0087)', async () => {
    const session = await prepare([draft()]);
    const id = session.items[0]!.item.id;
    await expect(env.db.query(`update items set task = null where id = $1`, [id])).rejects.toThrow(
      /items_task_matches_kind/,
    );
    const kinds = await env.db.one<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'items_kind_check'`,
    );
    for (const k of ['multiple_choice', 'order', 'match', 'table_fill', 'cloze', 'select_all']) {
      expect(kinds.def).toContain(`'${k}'`);
    }
    expect(kinds.def).toContain(`'mark'`);
  });

  it('works in a practice test: one try, no count until the end, then the solution', async () => {
    const session = await prepare(
      [draft(), draft({ prompt: 'Welche Wörter sind Nomen?' })],
      'test',
    );
    const [first, second] = session.items;
    const wrong = await answer(session, first!.item.id, on(first!, ['hund']));
    expect(wrong.body.reply.text).toBe("Notiert – weiter geht's.");
    expect(wrong.body.session.items[0]?.status).toBe('missed');
    const right = await answer(session, second!.item.id, on(second!, NOUNS));
    expect(right.body.session.status).toBe('finished');
    expect(right.body.session.items[0]?.answer).toBe('samstag, hund, ball, garten, haus');
  });

  it('reads a marking task from a photo, and a marking inside a reading text (#233)', async () => {
    const LINES = [
      'Mia wohnt mit ihrer Familie in einem kleinen Dorf.',
      'Jeden Morgen fährt sie mit dem Fahrrad zur Schule,',
      'die drei Kilometer entfernt im Nachbarort liegt.',
    ];
    env.llm.script('extraction', (req) => {
      expect(req.system).toContain('Marking tasks ("structured", type "mark")');
      return {
        is_learning_material: true,
        readable: true,
        title: 'Deutsch: Nomen und Kommas',
        subject: { name: 'Deutsch', kind: 'german' },
        extracted_text: `Unterstreiche die Nomen.\n\n${LINES.join('\n')}`,
        items: [],
        structured: [{ ...draft(), hints: ['Nomen kann man anfassen.'], worked_solution: null }],
        reading: [
          {
            title: null,
            lines: LINES,
            lang: 'de',
            topic: 'Mias Schulweg',
            questions: [
              {
                kind: 'short',
                prompt: 'Wo wohnt Mia?',
                answer: 'in einem Dorf',
                accepted_answers: [],
                evidence: 'in einem kleinen Dorf',
                difficulty: 1,
              },
              {
                kind: 'mark',
                prompt: 'Setze das Komma im zweiten Satz.',
                mode: 'gaps',
                text: 'Jeden Morgen fährt sie mit dem Fahrrad zur Schule, die drei Kilometer entfernt im Nachbarort liegt.',
                targets: null,
                categories: null,
                corrected: null,
                difficulty: 2,
              },
            ],
          },
        ],
      };
    });
    env.llm.script('buddy_check', {
      json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null },
    });
    const created = await l.api.post<{ material: MaterialView; uploads: Array<{ path: string }> }>(
      '/materials',
      { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'], purpose: 'study' },
    );
    expect(created.status).toBe(201);
    for (const u of created.body.uploads) env.storage.put(u.path);
    expect((await l.api.post(`/materials/${created.body.material.id}/submit`)).status).toBe(202);
    await env.flushBackground();
    const items = await env.db.query<{ kind: string; read: boolean; hints: string[] }>(
      `select kind, read_passage is not null as read, hints from items
        where material_id = $1 order by seq`,
      [created.body.material.id],
    );
    expect(items.map((i) => [i.kind, i.read])).toEqual([
      ['mark', false],
      ['short', true],
      ['mark', true],
    ]);
    // The marking in the text gets the one reading hint: where the sentence stands.
    expect(items[2]?.hints).toEqual(['Lies nochmal die Zeilen 2 bis 3.']);
    const started = await l.api.post<SessionView>('/practice/sessions', {
      material_id: created.body.material.id,
    });
    expect(started.status).toBe(201);
    const inText = started.body.items.find((i) => i.item.passage && i.item.kind === 'mark')!;
    expect(inText.item.passage?.lines).toEqual(LINES);
    const res = await answer(started.body, inText.item.id, [{ at: 'g9', category: null }]);
    expect(res.body.verdict).toBe('correct');
    // Closed, it shows where the sentence stands in the text.
    const closed = res.body.session.items.find((i) => i.item.id === inText.item.id);
    expect(closed?.item.passage?.evidence).toEqual({ from: 2, to: 3 });
  });
});
