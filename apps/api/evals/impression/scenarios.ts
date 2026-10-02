// Ordinary afternoons with Buddy, for the overall-impression comparison (issue #127).
//
// Each scenario is a few sentences a child really writes — short, lower case, sometimes
// unclear — walked as whole turns. Nothing here checks a single answer: the buddy eval does
// that (evals/buddy/cases.ts). What these produce is a CONVERSATION, and a conversation is what
// the owner meant with "gefühlt funktioniert alles schlechter als vorher": not one wrong
// sentence, but a chat that asks back, repeats itself or never gets anywhere.
//
// Self-contained on purpose: scripts/eval-impression.sh copies this folder into a checkout
// of an OLDER revision to run the other side, so it may depend only on what every revision
// since the fresh start has (the test harness and the baseline tables) — never on today's
// eval cases or helpers.
// requires live verification in Claude Code session (live-model eval scenarios)

import type { Learner, TestEnv } from '../../src/testing/harness.js';

export type Scenario = {
  id: string;
  /** What the scenario is about, for the report (never shown to the judge). */
  about: string;
  learner: {
    locale: 'de' | 'en' | 'fr' | 'es' | 'it';
    relation: 'self' | 'child';
    birthDate?: string;
  };
  setup?: (env: TestEnv, l: Learner) => Promise<void>;
  /** Her messages, each one whole turn, in order. */
  says: readonly string[];
};

/** A photographed vocabulary sheet with three pairs, as if she had sent it this morning. */
async function vocabSheet(env: TestEnv, l: Learner): Promise<void> {
  const m = await env.db.one<{ id: string }>(
    `insert into materials (learner_id, client_request_id, status, photo_count, title,
                            extracted_text, ready_at)
     values ($1, gen_random_uuid(), 'ready', 1, 'Vokabeln Unité 3', $2, $3) returning id`,
    [
      l.learnerId,
      'le vélo – das Fahrrad, la gare – der Bahnhof, l’école – die Schule',
      env.clock.now(),
    ],
  );
  for (const [fr, de] of [
    ['le vélo', 'das Fahrrad'],
    ['la gare', 'der Bahnhof'],
    ["l'école", 'die Schule'],
  ]) {
    await env.db.query(
      `insert into items (learner_id, material_id, kind, prompt, answer, topic, prompt_lang, lang)
       values ($1, $2, 'vocab', $3, $4, 'Unité 3', 'fr', 'de')`,
      [l.learnerId, m.id, fr, de],
    );
  }
}

/** A grammar sheet she photographed earlier, with two practice questions from it. */
async function grammarSheet(env: TestEnv, l: Learner): Promise<void> {
  const m = await env.db.one<{ id: string }>(
    `insert into materials (learner_id, client_request_id, status, photo_count, title,
                            extracted_text, ready_at)
     values ($1, gen_random_uuid(), 'ready', 1, 'Englisch – Present Perfect', $2, $3)
     returning id`,
    [
      l.learnerId,
      'Present Perfect: have/has + past participle. Signal words: since, for, already, yet. ' +
        'She has lived in Berlin since 2015.',
      env.clock.now(),
    ],
  );
  for (const [prompt, answer] of [
    ['Vervollständige: They ___ (live) in Berlin since 2015.', 'have lived'],
    ['Vervollständige: She ___ (finish) her homework already.', 'has finished'],
  ]) {
    await env.db.query(
      `insert into items (learner_id, material_id, kind, prompt, answer, topic)
       values ($1, $2, 'short', $3, $4, 'Present Perfect')`,
      [l.learnerId, m.id, prompt, answer],
    );
  }
}

const CHILD = { locale: 'de', relation: 'child', birthDate: '2014-02-10' } as const;

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'vocab_afternoon',
    about: 'French vocabulary from her sheet — does he get to the practice, and only once?',
    learner: CHILD,
    setup: vocabSheet,
    says: [
      'hi',
      'ich muss für französisch vokabeln lernen',
      'frag mich die von dem zettel ab',
      'ok weiter',
    ],
  },
  {
    id: 'exam_on_thursday',
    about: 'An exam, a weak topic, a reminder — planning without an interrogation',
    learner: CHILD,
    says: [
      'hey',
      'ich schreib am donnerstag eine mathearbeit',
      'bruchrechnen, das kann ich nicht so gut',
      'kannst du mich morgen nachmittag dran erinnern?',
    ],
  },
  {
    id: 'homework_fractions',
    about: 'Homework help: guide her, do not hand over the solution',
    learner: CHILD,
    says: [
      'kannst du mir bei den hausaufgaben helfen',
      'was ist 3/4 + 1/8',
      'ich hab 4/12 raus',
      'ah ok',
    ],
  },
  {
    id: 'bad_day',
    about: 'A bad grade and no energy — calm, kind, no pushing',
    learner: CHILD,
    says: [
      'hi',
      'heute war voll blöd in der schule',
      'hab ne 5 in englisch',
      'kein bock mehr heute',
    ],
  },
  {
    id: 'explain_simpler',
    about: 'Explaining a concept, then simpler when she does not get it',
    learner: CHILD,
    says: [
      'was ist eigentlich photosynthese',
      'versteh ich nicht ganz',
      'kannst du das einfacher sagen',
      'und wofür braucht die pflanze das',
    ],
  },
  {
    id: 'fewer_messages',
    about: 'She wants fewer messages — he reduces, confirms once, done',
    learner: CHILD,
    says: ['du schreibst mir zu oft', 'nur noch am wochenende bitte', 'danke'],
  },
  {
    id: 'grammar_sheet_back',
    about: 'An earlier sheet: find it, recall the rule, offer practice',
    learner: CHILD,
    setup: grammarSheet,
    says: [
      'hatte ich nicht mal ein blatt zu present perfect?',
      'was war da nochmal die regel',
      'kannst du mich dazu abfragen',
    ],
  },
  {
    id: 'bored_to_learning',
    about: 'Vague and bored — does the chat find a direction without nagging?',
    learner: CHILD,
    says: ['langweilig', 'weiß nicht', 'vielleicht mathe', 'ok'],
  },
  {
    id: 'delete_a_sheet',
    about: 'Deleting a sheet: ask exactly once, then do it',
    learner: CHILD,
    setup: vocabSheet,
    says: ['lösch bitte das blatt mit den französisch vokabeln', 'ja'],
  },
  {
    id: 'en_spanish_test',
    about: 'An adult learner in English: a test on Friday, mostly verbs',
    learner: { locale: 'en', relation: 'self' },
    says: [
      'hey',
      'I have a Spanish test on Friday',
      'mostly verbs, present tense',
      'can you help me practise',
    ],
  },
];
