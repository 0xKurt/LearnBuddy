// The explain profiles (issue #281, D2) through the real API on a real Postgres: every kind of run
// is sent only the forms it can use, and loses none of them.
//
// The model is scripted to answer with EVERY form there is — every item kind, a rubric, a bar, a
// note line, every structured kind, a listening task, a Diktat's entries — whatever the run. Two things are asserted
// per kind:
//
//   1. The schema sent is the kind's profile (`explainSchemaFor`), smaller than the fallback, and
//      the decoder could not have written that everything-answer through it.
//   2. What she gets is EXACTLY what the same answer gave her before D2. The expectation below is
//      written from the pre-D2 rules in `preparedFrom` (KINDS, STRUCTURED, bars only in practice,
//      note lines in practice and tests, the listening task only in a listening run, a Diktat's
//      entries only in a Diktat run, a rubric only on a long answer) — not read from `SET_PROFILES` — so a profile that cut a form a run
//      could use fails here: 0 losses, proven on the store, not on the schema.
//
// Plus the sheet-bound run (topic enum inside the profile). docs/architecture.md §Practice
// ("Profiles").
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { SessionView, StartTopicRequest } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { explainSchemaFor, GENERATED_SCHEMA } from '../modules/practice/setProfiles.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';
import { schemaErrors } from '../testing/schemaCheck.js';

const dbReady = await testDatabaseAvailable();

const item = (kind: string, prompt: string, answer: string, extra: object = {}) => ({
  kind,
  prompt,
  answer,
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Brüche',
  difficulty: 2,
  source_excerpt: null,
  ...extra,
});

const ITEMS = [
  item('short', 'Wie heißt der Nenner von drei Vierteln?', 'vier', { spelling: 'gentle' }),
  item('long', 'Schreibe eine Inhaltsangabe der Geschichte vom Fuchs.', 'Eine Inhaltsangabe.', {
    rubric: {
      form: 'Inhaltsangabe',
      elements: [
        {
          name: 'Länge',
          missing: 'Schreib noch etwas mehr.',
          check: { by: 'word_count', min: 40, max: null },
        },
        {
          name: 'Präsens',
          missing: 'Bleib im Präsens.',
          check: { by: 'tense', tense: 'present' },
        },
      ],
    },
  }),
  item('numeric', 'Miss die Strecke AB in cm.', '4,5', { unit: 'cm', tolerance: 0.1 }),
  item('multiple_choice', 'Welcher Bruch ist größer, ein Halb oder drei Viertel?', '3/4', {
    choices: ['1/2', '3/4'],
    correct_choice: 1,
  }),
  item('formula', 'Gib die Formel für den Flächeninhalt eines Rechtecks an.', 'A = a \\cdot b'),
  item('vocab', 'le chat', 'die Katze', { prompt_lang: 'fr', lang: 'de' }),
  item('speak', 'Bonjour', 'Bonjour', { lang: 'fr' }),
];

const STRUCTURED = [
  {
    type: 'order',
    prompt: 'Bring die Keimung in die richtige Reihenfolge.',
    elements: ['Wasser aufnehmen', 'Wurzel wächst', 'Stängel streckt sich', 'Blätter entfalten'],
    numeric: null,
    topic: 'Brüche',
    difficulty: 2,
    prompt_lang: 'de',
  },
  {
    type: 'table_fill',
    prompt: 'Rechne die Zahlenmauer aus.',
    header: null,
    rows: [
      [{ text: '20', gap: true, also: [] }],
      [
        { text: '8', gap: false, also: [] },
        { text: '12', gap: true, also: [] },
      ],
      [
        { text: '3', gap: true, also: [] },
        { text: '5', gap: false, also: [] },
        { text: '7', gap: false, also: [] },
      ],
    ],
    family: 'wall',
    fn: null,
    x_in: null,
    topic: 'Brüche',
    difficulty: 1,
    prompt_lang: 'de',
  },
  {
    type: 'match',
    prompt: 'Welches Verfassungsorgan hat welche Aufgabe?',
    pairs: [
      { left: 'Bundestag', right: 'beschließt Gesetze' },
      { left: 'Bundesrat', right: 'vertritt die Länder' },
      { left: 'Bundespräsident', right: 'unterzeichnet Gesetze' },
    ],
    groups: null,
    topic: 'Brüche',
    difficulty: 2,
    prompt_lang: 'de',
  },
  {
    type: 'cloze',
    prompt: 'Setze die passenden Wörter ein.',
    text: 'Gestern ___ wir in den Zoo gegangen. Zuerst ___ wir die Affen angeschaut. Dann hat mein Bruder ein Eis ___. Am Abend ___ wir müde nach Hause gefahren. Es war ein ___ Tag.',
    gaps: ['sind', 'haben', 'gegessen', 'sind', 'schöner'].map((answer) => ({
      answer,
      accepted_answers: [],
    })),
    word_bank: null,
    spelling: null,
    topic: 'Brüche',
    difficulty: 2,
    prompt_lang: 'de',
  },
];

/** A Diktat's entries, copied from her list (#242) — the list is part of what she typed below. */
const DICTATION_WORDS = ['Schwimmen', 'Biene', 'Straße'];

const LISTEN_TEXT =
  'On Saturday Tom took the bus to the city centre. He bought a book about horses for his sister, because her birthday is on Sunday.';

/** Every form there is, whatever was asked. */
/** A reading text Buddy writes (#368): about 1000 characters, at the stage of grade 5 to adult. */
const READING = {
  title: 'Der Igel im Winter',
  paragraphs: [
    'Im Herbst frisst sich der Igel ein dickes Fettpolster an. Er sucht Käfer, Würmer und Schnecken unter dem Laub. Je schwerer er wird, desto besser übersteht er die kalte Zeit.',
    'Wenn die Tage kürzer werden, baut er sich ein Nest aus Blättern und Moos. Oft liegt es unter einer Hecke oder in einem Reisighaufen. Dort rollt er sich zu einer Kugel zusammen.',
    'Im Winterschlaf schlägt sein Herz nur noch wenige Male in der Minute. Seine Körpertemperatur sinkt auf etwa fünf Grad. So verbraucht er kaum Energie und lebt von seinem Fett.',
    'Im Frühling wacht der Igel wieder auf. Dann ist er sehr hungrig und hat fast ein Drittel seines Gewichts verloren. Gärten mit wilden Ecken helfen ihm, schnell wieder Futter zu finden.',
    'Igel sind vor allem in der Nacht unterwegs. Am Tag schlafen sie gut versteckt unter Büschen. Ihre Stacheln schützen sie vor Füchsen und anderen Feinden.',
    'Wer Igeln helfen will, lässt im Herbst einen Laubhaufen liegen. Ein flaches Schälchen mit Wasser hilft ihnen an heißen Tagen.',
  ],
  lang: 'de',
  topic: 'Igel im Winter',
  questions: [
    {
      kind: 'short',
      prompt: 'Wovon lebt der Igel im Winterschlaf?',
      answer: 'von seinem Fett',
      accepted_answers: [],
      evidence: 'So verbraucht er kaum Energie und lebt von seinem Fett',
      difficulty: 1,
    },
    {
      kind: 'multiple_choice',
      prompt: 'Wo liegt das Nest des Igels oft?',
      choices: ['unter einer Hecke', 'auf einem Baum'],
      correct_choice: 0,
      evidence: 'Oft liegt es unter einer Hecke oder in einem Reisighaufen',
      difficulty: 1,
    },
    {
      kind: 'true_false',
      statement: 'Im Winterschlaf bleibt der Igel so warm wie im Sommer.',
      is_true: false,
      evidence: 'Seine Körpertemperatur sinkt auf etwa fünf Grad',
      difficulty: 2,
    },
  ],
};

const EVERYTHING = {
  usable: true,
  title: 'Alles',
  subject: { name: 'Mathe', kind: 'math' },
  items: ITEMS,
  bars: [{ task: 'shade', parts: 6, units: 3 }],
  listen: {
    text: LISTEN_TEXT,
    lang: 'en',
    questions: [
      {
        kind: 'short',
        prompt: 'What did Tom buy for his sister?',
        answer: 'a book about horses',
        accepted_answers: [],
        choices: null,
        correct_choice: null,
        topic: 'Tom',
        difficulty: 2,
      },
    ],
  },
  staffs: [{ task: 'name_note', clef: 'treble', pitch: { name: 'E', octave: 4 } }],
  structured: STRUCTURED,
  dictation: { from: 'list', lang: 'de', topic: 'Lernwörter', entries: DICTATION_WORDS },
  // A reading run's own text and questions (#368).
  reading: READING,
  // „Erklär mal" (#236): an open question with its key points.
  teach_back: [
    {
      prompt: 'Erklär mir, was ein Bruch ist.',
      topic: 'Brüche',
      difficulty: 2,
      points: [
        {
          name: 'Ganzes',
          point: 'ein Ganzes wird in gleich große Teile geteilt',
          ask: 'Was passiert mit dem Ganzen?',
          exact: [],
        },
        {
          name: 'Nenner',
          point: 'der Nenner sagt, in wie viele Teile',
          ask: 'Was sagt die untere Zahl?',
          exact: [],
        },
        {
          name: 'Zähler',
          point: 'der Zähler sagt, wie viele Teile man nimmt',
          ask: 'Und die obere Zahl?',
          exact: [],
        },
      ],
    },
  ],
  // Lange Texte (#258): one writing task; its key points are code's.
  essay: [
    {
      prompt: 'Nimm Stellung: Sollten Hausaufgaben in Mathe abgeschafft werden?',
      type: 'argue_linear',
      topic: 'Brüche',
      difficulty: 3,
      passage: null,
    },
  ],
};

/** What a run of each kind kept of EVERYTHING before D2 — the pre-D2 rules, written out. */
const BEFORE_D2: Record<
  StartTopicRequest['kind'],
  { kinds: string[]; rubric: boolean; bar: boolean; staff: boolean; listen: boolean }
> = {
  practice: {
    kinds: [
      'short',
      'long',
      'numeric',
      'multiple_choice',
      'formula',
      'vocab',
      'order',
      'table_fill',
      'match',
      'cloze',
    ],
    rubric: true,
    bar: true,
    staff: true,
    listen: false,
  },
  test: {
    kinds: [
      'short',
      'numeric',
      'multiple_choice',
      'formula',
      'vocab',
      'order',
      'table_fill',
      'match',
      'cloze',
    ],
    rubric: false,
    bar: false,
    staff: true,
    listen: false,
  },
  vocab: { kinds: ['vocab'], rubric: false, bar: false, staff: false, listen: false },
  speak: { kinds: ['speak'], rubric: false, bar: false, staff: false, listen: false },
  help: {
    kinds: ['short', 'long', 'numeric', 'multiple_choice', 'formula'],
    rubric: true,
    bar: false,
    staff: false,
    listen: false,
  },
  listen: { kinds: [], rubric: false, bar: false, staff: false, listen: true },
  spelling_dictation: {
    kinds: ['spelling_dictation'],
    rubric: false,
    bar: false,
    staff: false,
    listen: false,
  },
  // A new kind (#236), not a pre-D2 rule: only its explanation questions, stored as `long` with
  // key points in the rubric column.
  teach_back: { kinds: ['long'], rubric: true, bar: false, staff: false, listen: false },
  // A new kind (#368), not a pre-D2 rule: only the questions about Buddy's reading text.
  read: {
    kinds: ['multiple_choice', 'short'],
    rubric: false,
    bar: false,
    staff: false,
    listen: false,
  },
  // A new kind (#258): only its writing task, with the key points of its text type.
  essay: { kinds: ['essay'], rubric: true, bar: false, staff: false, listen: false },
};

describe.skipIf(!dbReady)('explain profiles (#281 D2)', () => {
  let env: TestEnv;
  let l: Learner;

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterEach(() => env.closeChecked());

  /** The forms stored for a session: plain kinds, and which special parts are there. */
  async function formsOf(sessionId: string) {
    const rows = await env.db.query<{
      kind: string;
      rubric: boolean;
      bar: boolean;
      staff: boolean;
      listen: boolean;
    }>(
      `select i.kind, i.rubric is not null as rubric, i.bar_task is not null as bar,
              i.staff_task is not null as staff,
              -- A Diktat entry is read aloud too, but it is its own kind, not a listening task.
              (i.listen_task is not null and i.kind <> 'spelling_dictation') as listen
         from session_items si join items i on i.id = si.item_id
        where si.session_id = $1`,
      [sessionId],
    );
    const special = (r: (typeof rows)[number]) => r.bar || r.staff || r.listen;
    return {
      kinds: [...new Set(rows.filter((r) => !special(r)).map((r) => r.kind))].sort(),
      rubric: rows.some((r) => r.rubric),
      bar: rows.some((r) => r.bar),
      staff: rows.some((r) => r.staff),
      listen: rows.some((r) => r.listen),
    };
  }

  it.each(Object.keys(BEFORE_D2) as StartTopicRequest['kind'][])(
    'a %s run is sent its profile and keeps exactly what it kept before',
    async (kind) => {
      env.llm.script('explain', () => EVERYTHING);
      const res = await l.api.post<SessionView>('/practice/topic', {
        client_request_id: randomUUID(),
        kind,
        // Homework help keeps only tasks she typed: every prompt is in her text.
        // A Diktat keeps only words from her list: the list is in it too.
        text: [
          ...ITEMS.map((i) => i.prompt),
          ...STRUCTURED.map((s) => s.prompt),
          `Meine Lernwörter: ${DICTATION_WORDS.join(', ')}`,
        ].join('\n'),
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      // A practice run starts on its first questions; the rest is stored behind them (#220).
      await env.flushBackground();

      const [call] = env.llm.callsFor('explain');
      expect(call?.schema).toEqual(explainSchemaFor(kind, null));
      expect(JSON.stringify(call?.schema).length).toBeLessThan(
        JSON.stringify(GENERATED_SCHEMA).length,
      );
      // The decoder would not have let the everything-answer through this run's schema …
      expect(schemaErrors(call!.schema!, EVERYTHING)).not.toEqual([]);
      // … and through the fallback it would have (it was written for it).
      const {
        listen: _listen,
        dictation: _dictation,
        teach_back: _teachBack,
        reading: _reading,
        essay: _essay,
        ...withoutOwnRuns
      } = EVERYTHING;
      expect(schemaErrors(GENERATED_SCHEMA, withoutOwnRuns)).toEqual([]);

      const want = BEFORE_D2[kind];
      expect(await formsOf(res.body.id)).toEqual({ ...want, kinds: [...want.kinds].sort() });
    },
  );

  it('a run for a planned test is sent its profile with the sheets topics inside it', async () => {
    const goal = await env.db.one<{ id: string }>(
      `insert into buddy_goals (learner_id, kind, title, due_date, topics)
       values ($1, 'exam', 'Mathearbeit Brüche', '2026-10-20', '{Brüche}') returning id`,
      [l.learnerId],
    );
    const sheet = await env.db.one<{ id: string }>(
      `insert into materials (learner_id, client_request_id, status, photo_count, created_at, goal_id,
                              title, extracted_text)
       values ($1, gen_random_uuid(), 'ready', 1, $2, $3, 'Arbeitsblatt Brüche',
               '1. Kürze 6/8. 2. Erweitere 3/4 mit 5.') returning id`,
      [l.learnerId, env.clock.now(), goal.id],
    );
    await env.db.query(
      `insert into items (learner_id, material_id, kind, prompt, answer, topic, difficulty, origin)
       values ($1, $2, 'short', 'Kürze 6/8.', '3/4', 'Brüche', 2, 'material')`,
      [l.learnerId, sheet.id],
    );
    env.llm.script('explain', () => EVERYTHING);
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'test',
      text: 'Mathearbeit Brüche',
      goal_id: goal.id,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const [call] = env.llm.callsFor('explain');
    expect(call?.schema).toEqual(explainSchemaFor('test', ['Brüche']));
    expect(JSON.stringify(call?.schema)).toContain('"enum":["Brüche"]');
    expect(Object.keys(call?.schema?.properties ?? {})).not.toContain('bars');
    // The same forms as an unbound test: the sheets narrow the topics, not the forms.
    const want = BEFORE_D2.test;
    expect(await formsOf(res.body.id)).toEqual({ ...want, kinds: [...want.kinds].sort() });
  });
});
