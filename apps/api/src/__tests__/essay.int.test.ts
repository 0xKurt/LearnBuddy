// Lange Texte (issue #258) through the real API on a real Postgres: she sends her essay, the
// server checks each key point of its text type and three places to improve against HER text.
//
// What is asserted, each against the database and the model calls:
//   - one model call per version; per-point feedback and three places, each quote found by the
//     server in her text — whitespace and quotation marks folded, as for #236;
//   - a quote that is not in her text buys nothing: the point stays open, the place is dropped;
//     an introduction quoted from her last paragraph is no introduction; a line that is not in
//     the text is no line reference;
//   - no grade, no count, no right/wrong — and no spaced-repetition review;
//   - up to 12 000 characters for an essay, 2000 for any other question (422 beyond);
//   - failure paths: the same answer twice, a closed question, a model outage, another learner's
//     ids; a practice test never holds an essay.
// docs/architecture.md §Practice („Lange Texte").
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LlmError } from '../llm/gateway.js';
import { essayItem } from '../modules/practice/essay.js';
import { insertItems } from '../modules/practice/items.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const PASSAGE = {
  title: 'Der Schulweg',
  lang: 'de',
  lines: [
    'Er geht los, wie immer.',
    'Jeden Morgen derselbe Weg.',
    'Niemand wartet an der Ecke.',
    '',
    'Die Straße ist grau und still.',
    'Er zählt die Schritte.',
    'Dann ist er da.',
  ],
};

const FILLER = ' Auch das Wetter passt zur Stimmung des Jungen.'.repeat(45);

/** Her analysis: three paragraphs, longer than any other answer may be. */
const ESSAY = [
  'In der Kurzgeschichte „Der Schulweg“ geht es um einen Jungen, der jeden Morgen allein zur Schule geht. Meine These ist, dass der Weg für seine Einsamkeit steht.',
  `Der Erzähler beschreibt den Weg sehr genau. Die Wiederholung „Jeden Morgen“ (Z. 2) zeigt, dass sich nichts ändert. Die kurzen Sätze wirken kalt und leer. Auch „Dann ist er da“ (Z. 9) zeigt das Ende. Er ging dann weiter.${FILLER}`,
  'Insgesamt finde ich, dass die Geschichte die Einsamkeit eindrucksvoll zeigt.',
].join('\n');

type Claim = { element: string; met: boolean; quote?: string; verbs?: string[] };
type Place = { quote: string; better: string };

const judged = (elements: Claim[], places: Place[]) => ({
  json: {
    elements: elements.map((e) => ({ quote: '', verbs: [], ...e })),
    places,
  },
});

const ALL_MET: Claim[] = [
  { element: 'r1', met: true, quote: 'Meine These ist, dass der Weg für seine Einsamkeit steht' },
  { element: 'r2', met: true, quote: 'Die kurzen Sätze wirken kalt und leer' },
  // The model's quotation marks and spacing differ from hers: folded, it is the same quote.
  { element: 'r3', met: true, quote: 'Die Wiederholung "Jeden  Morgen" (Z. 2)' },
  { element: 'r4', met: true, verbs: [] },
  {
    element: 'r5',
    met: true,
    quote: 'Insgesamt finde ich, dass die Geschichte die Einsamkeit eindrucksvoll zeigt',
  },
];

const PLACES: Place[] = [
  { quote: 'Der Erzähler beschreibt den Weg sehr genau', better: 'Nenn ein Beispiel dafür.' },
  { quote: 'Die kurzen  Sätze wirken kalt und leer.', better: 'Erklär, warum sie so wirken.' },
  { quote: 'die Einsamkeit eindrucksvoll zeigt', better: 'Greif deine These wieder auf.' },
];

describe.skipIf(!dbReady)('long texts: feedback per key point, no grade (#258)', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-04T09:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2011-03-10' });
  });
  afterEach(() => env.closeChecked());

  /** Her sheet with one essay task (an analysis of the text on it) and one short question. */
  async function sheet(): Promise<{ materialId: string; essayId: string; shortId: string }> {
    const m = await env.db.one<{ id: string }>(
      `insert into materials (learner_id, client_request_id, status, photo_count, title, extracted_text, created_at)
       values ($1, gen_random_uuid(), 'ready', 1, 'Deutsch-Blatt', $2, $3) returning id`,
      [l.learnerId, PASSAGE.lines.join('\n'), env.clock.now()],
    );
    const essay = essayItem(
      {
        prompt: 'Interpretiere die Kurzgeschichte „Der Schulweg“.',
        type: 'analyse',
        topic: 'Kurzgeschichte',
        difficulty: 3,
        passage: PASSAGE,
      },
      'de',
    );
    const short = {
      ...essay,
      kind: 'short' as const,
      prompt: 'Wie heißt die Geschichte?',
      answer: 'Der Schulweg',
      rubric: null,
      read_passage: null,
      hints: [],
    };
    const [essayId, shortId] = await insertItems(
      env.db,
      { learnerId: l.learnerId, materialId: m.id, subjectId: null, origin: 'material' },
      [essay, short],
    );
    return { materialId: m.id, essayId: essayId!, shortId: shortId! };
  }

  async function practise(mode: 'practice' | 'test' = 'practice') {
    const ids = await sheet();
    const res = await l.api.post<SessionView>('/practice/sessions', {
      material_id: ids.materialId,
      mode,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return { s: res.body, ...ids };
  }

  const answer = (
    s: SessionView,
    itemId: string,
    text: string,
    turn = randomUUID(),
    who: Learner = l,
  ) =>
    who.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: turn,
      item_id: itemId,
      text,
    });

  const row = (s: SessionView, itemId: string) =>
    env.db.one<{ status: string; attempts: number }>(
      `select status, attempts from session_items where session_id = $1 and item_id = $2`,
      [s.id, itemId],
    );

  const reviews = (itemId: string) =>
    env.db
      .one<{ n: number }>(`select count(*)::int as n from item_states where item_id = $1`, [itemId])
      .then((r) => r.n);

  it('gives feedback per key point and three verified places, from one model call', async () => {
    const { s, essayId } = await practise();
    expect(ESSAY.length).toBeGreaterThan(2000);
    // The text she writes about is shown with its lines; nothing of the key points is.
    const view = s.items.find((i) => i.item.id === essayId)!;
    expect(view.item.kind).toBe('essay');
    expect(view.item.passage?.lines).toEqual(PASSAGE.lines);
    expect(view.answer).toBeNull();

    env.llm.script('tutor', judged(ALL_MET, PLACES));
    const res = await answer(s, essayId, ESSAY);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(env.llm.callsFor('tutor')).toHaveLength(1);
    const sent = JSON.stringify(env.llm.callsFor('tutor')[0]);
    expect(sent).toContain('REQUIRED ELEMENTS');
    expect(sent).toContain('2\\tJeden Morgen derselbe Weg.');

    // Nothing graded: no verdict mark, no count, no score anywhere.
    expect(res.body.verdict).toBe('not_an_attempt');
    const f = res.body.reply.essay!;
    expect(f.form).toBe('Textanalyse');
    expect(f.points.map((p) => [p.name, p.state])).toEqual([
      ['Einleitung', 'met'],
      ['Deutung am Text', 'met'],
      ['Zitate mit Zeile', 'met'],
      ['Präsens', 'met'],
      ['Schluss mit Position', 'met'],
    ]);
    expect(f.points[0]!.quote).toBe('Meine These ist, dass der Weg für seine Einsamkeit steht');
    expect(f.places).toHaveLength(3);
    expect(f.last).toBe(false);
    expect(JSON.stringify(f)).not.toMatch(/score|grade/i);
    const reply = res.body.reply.text.replaceAll(' ', ' ');
    expect(reply).toContain('✓ Einleitung');
    expect(reply).toContain('Nenn ein Beispiel dafür.');
    expect(reply).not.toMatch(/\d\s*(von|\/)\s*\d/);
    expect(reply).not.toMatch(/richtig|falsch/i);

    // One version is one try; the question stays open for the next version, and FSRS learns
    // nothing from a text nobody graded.
    expect(await row(s, essayId)).toEqual({ status: 'open', attempts: 1 });
    expect(await reviews(essayId)).toBe(0);
    const stored = await env.db.one<{ essay_feedback: unknown }>(
      `select essay_feedback from practice_turns where session_id = $1 and role = 'tutor'`,
      [s.id],
    );
    expect(stored.essay_feedback).toEqual(f);
    // The view reads it back the same.
    const again = (await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    expect(again.turns.at(-1)!.essay).toEqual(f);
  });

  it('drops a quote that is not in her text, or not where the point belongs', async () => {
    const { s, essayId } = await practise();
    env.llm.script(
      'tutor',
      judged(
        [
          // Her conclusion is no introduction: the quote stands in her LAST paragraph.
          {
            element: 'r1',
            met: true,
            quote: 'Insgesamt finde ich, dass die Geschichte die Einsamkeit eindrucksvoll zeigt',
          },
          // An invented quote confirms nothing.
          { element: 'r2', met: true, quote: 'Die Metaphern sind dunkel und schwer' },
          // Her quotation stands in her text — but line 9 does not exist in a text of six lines.
          { element: 'r3', met: true, quote: 'Auch „Dann ist er da“ (Z. 9)' },
          // A verb that really stands in her text breaks the present tense.
          { element: 'r4', met: false, verbs: ['ging'] },
          // The conclusion holds: her own words, in her last paragraph.
          {
            element: 'r5',
            met: true,
            quote: 'Insgesamt finde ich, dass die Geschichte die Einsamkeit eindrucksvoll zeigt',
          },
        ],
        [
          PLACES[0]!,
          { quote: 'Die Sonne lacht über der Stadt', better: 'Beschreib genauer.' },
          PLACES[2]!,
        ],
      ),
    );
    const res = await answer(s, essayId, ESSAY);
    const f = res.body.reply.essay!;
    expect(f.points.map((p) => p.state)).toEqual(['open', 'open', 'open', 'open', 'met']);
    // An open point says what to do, never a quote.
    expect(f.points[0]).toMatchObject({ quote: null, missing: expect.stringContaining('These') });
    expect(f.places.map((p) => p.quote)).toEqual([PLACES[0]!.quote, PLACES[2]!.quote]);
    expect(JSON.stringify(res.body)).not.toContain('Die Sonne lacht');
    expect(JSON.stringify(res.body)).not.toContain('Metaphern');
  });

  it('takes 12 000 characters for an essay and 2000 for anything else (422 beyond)', async () => {
    const { s, essayId, shortId } = await practise();
    const tooLong = await answer(s, essayId, 'Wort '.repeat(2401));
    expect(tooLong.status).toBe(422);
    const longShort = await answer(s, shortId, 'x'.repeat(2001));
    expect(longShort.status).toBe(422);
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
    expect(await row(s, essayId)).toEqual({ status: 'open', attempts: 0 });
  });

  it('the same answer twice is one answer; the third version closes it; then a conflict', async () => {
    const { s, essayId } = await practise();
    env.llm.script('tutor', judged(ALL_MET, PLACES));
    const turn = randomUUID();
    const one = await answer(s, essayId, ESSAY, turn);
    const two = await answer(s, essayId, ESSAY, turn);
    expect(two.body.reply).toEqual(one.body.reply);
    expect(env.llm.callsFor('tutor')).toHaveLength(1);
    expect(await row(s, essayId)).toEqual({ status: 'open', attempts: 1 });

    env.llm.script('tutor', judged(ALL_MET, PLACES), judged(ALL_MET, PLACES));
    expect((await answer(s, essayId, `${ESSAY} Zweite Fassung.`)).body.reply.essay!.last).toBe(
      false,
    );
    const third = await answer(s, essayId, `${ESSAY} Dritte Fassung.`);
    expect(third.body.reply.essay!.last).toBe(true);
    expect(third.body.reply.text).toContain('letzte Fassung');
    const after = (await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    const closed = after.items.find((i) => i.item.id === essayId)!;
    expect(closed.status).toBe('revealed');
    // A long text has no solution to show, now or later.
    expect(closed.answer).toBeNull();
    expect(await reviews(essayId)).toBe(0);

    const late = await answer(s, essayId, `${ESSAY} Vierte Fassung.`);
    expect(late.status).toBe(409);
    expect(env.llm.callsFor('tutor')).toHaveLength(3);
    // Nothing was judged, so there is nothing to dispute, and no solution to explain again.
    const dispute = await l.api.post(`/practice/sessions/${s.id}/items/${essayId}/dispute`);
    expect(dispute.status).toBe(409);
    const re = await l.api.post(`/practice/sessions/${s.id}/reexplain`, {
      client_turn_id: randomUUID(),
      item_id: essayId,
      way: 'simpler',
    });
    expect(re.status).toBe(409);
  });

  it('a model outage gives an honest line and counts no try', async () => {
    const { s, essayId } = await practise();
    env.llm.script('tutor', { error: new LlmError('unavailable', 'down') });
    const res = await answer(s, essayId, ESSAY);
    expect(res.status).toBe(200);
    expect(res.body.verdict).toBeNull();
    expect(res.body.reply.essay ?? null).toBeNull();
    expect(res.body.reply.text).toContain('nicht verloren');
    expect(res.body.reply.text).not.toContain('✓');
    expect(await row(s, essayId)).toEqual({ status: 'open', attempts: 0 });

    // An answer that does not fit the schema (two places, not three) is no feedback either.
    env.llm.script('tutor', judged(ALL_MET, PLACES.slice(0, 2)));
    const broken = await answer(s, essayId, ESSAY);
    expect(broken.body.verdict).toBeNull();
    expect(await row(s, essayId)).toEqual({ status: 'open', attempts: 0 });
  });

  it('another learner’s session or question is a 404', async () => {
    const { s, essayId } = await practise();
    const sam = await onboard(env, { name: 'Sam' });
    expect((await answer(s, essayId, ESSAY, randomUUID(), sam)).status).toBe(404);
    expect((await sam.api.get(`/practice/sessions/${s.id}`)).status).toBe(404);
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('a practice test never holds an essay', async () => {
    const { s, essayId, shortId } = await practise('test');
    const ids = s.items.map((i) => i.item.id);
    expect(ids).toContain(shortId);
    expect(ids).not.toContain(essayId);
  });
});
