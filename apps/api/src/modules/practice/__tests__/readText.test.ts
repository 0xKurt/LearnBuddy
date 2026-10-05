// Lesetexte von Buddy (#368): what code checks before a text Buddy wrote becomes questions — its
// length and sentences against her grade, its language and alphabet, and each question against
// the text (the photo rules, plus a right option backed by its evidence).

import { describe, expect, it } from 'vitest';

import {
  bandOf,
  buddyReadingItems,
  inAlphabet,
  levelHolds,
  printedLines,
  READ_LINE_CHARS,
  textLangFor,
  type BuddyReadingDraft,
} from '../readText.js';

const IGEL = [
  'Im Herbst frisst sich der Igel ein dickes Fettpolster an. Er sucht Käfer, Würmer und Schnecken unter dem Laub. Je schwerer er wird, desto besser übersteht er die kalte Zeit.',
  'Wenn die Tage kürzer werden, baut er sich ein Nest aus Blättern und Moos. Oft liegt es unter einer Hecke oder in einem Reisighaufen. Dort rollt er sich zu einer Kugel zusammen.',
  'Im Winterschlaf schlägt sein Herz nur noch wenige Male in der Minute. Seine Körpertemperatur sinkt auf etwa fünf Grad. So verbraucht er kaum Energie und lebt von seinem Fett.',
  'Im Frühling wacht der Igel wieder auf. Dann ist er sehr hungrig und hat fast ein Drittel seines Gewichts verloren. Gärten mit wilden Ecken helfen ihm, schnell wieder Futter zu finden.',
];

const QUESTIONS: BuddyReadingDraft['questions'] = [
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
    choices: ['unter einer Hecke', 'auf einem Baum', 'in einem Teich'],
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
  {
    kind: 'evidence',
    statement: 'Nach dem Winter braucht der Igel schnell Nahrung.',
    evidence: 'Dann ist er sehr hungrig und hat fast ein Drittel seines Gewichts verloren',
    difficulty: 2,
  },
];

const draft = (over: Partial<BuddyReadingDraft> = {}): BuddyReadingDraft => ({
  title: 'Der Igel im Winter',
  paragraphs: IGEL,
  lang: 'de',
  topic: 'Igel im Winter',
  questions: QUESTIONS,
  ...over,
});

/** A sixth grader, German, no wish. */
const SIXTH = {
  locale: 'de',
  level: 'school',
  grade: 6,
  wish: null,
  subjectKind: 'biology',
} as const;

describe('her stage: length and sentences by grade', () => {
  it('maps grades to stages, and a wish moves one stage', () => {
    expect(bandOf('school', 1, null)).toBe(0);
    expect(bandOf('school', 4, null)).toBe(1);
    expect(bandOf('school', 6, null)).toBe(2);
    expect(bandOf('school', 8, null)).toBe(3);
    expect(bandOf('school', 11, null)).toBe(4);
    expect(bandOf('adult', null, null)).toBe(4);
    expect(bandOf('school', 6, 'easier')).toBe(1);
    expect(bandOf('school', 6, 'harder')).toBe(3);
    expect(bandOf('school', 1, 'easier')).toBe(0);
  });

  it('holds the length and the average and longest sentence to the stage', () => {
    expect(levelHolds(IGEL, 2)).toBe(true);
    // Too long for a second grader (at most 500 characters).
    expect(levelHolds(IGEL, 0)).toBe(false);
    // Too short for an adult's text (at least 900 characters).
    expect(levelHolds(IGEL, 4)).toBe(false);
    // One sentence of 25 words is longer than grade 5–6 allows (22).
    const long = `${Array.from({ length: 25 }, (_, i) => `Wort${i}`).join(' ')}.`;
    expect(levelHolds([...IGEL, long], 2)).toBe(false);
  });
});

describe('her language', () => {
  it('is the subject’s language, else the app’s; another language has no text', () => {
    expect(textLangFor('english', 'de')).toBe('en');
    expect(textLangFor('latin', 'de')).toBe('la');
    expect(textLangFor('biology', 'de')).toBe('de');
    expect(textLangFor(null, 'fr')).toBe('fr');
    expect(textLangFor('other_language', 'de')).toBeNull();
  });

  it('checks every letter against the alphabet — a character set, not a word list', () => {
    expect(inAlphabet('Der Igel frisst Käfer.', 'de')).toBe(true);
    expect(inAlphabet('The hedgehog eats beetles.', 'en')).toBe(true);
    expect(inAlphabet('The hedgehog eats Käfer.', 'en')).toBe(false);
    expect(inAlphabet('Le hérisson mange des scarabées.', 'fr')).toBe(true);
    expect(inAlphabet('Ёж', 'de')).toBe(false);
    expect(inAlphabet('Hedgehog', 'xx')).toBe(false);
  });
});

describe('the lines are code’s', () => {
  it('sets paragraphs into printed lines between words, an empty line between paragraphs', () => {
    const lines = printedLines(IGEL);
    expect(lines.every((l) => [...l].length <= READ_LINE_CHARS)).toBe(true);
    expect(lines.filter((l) => l === '')).toHaveLength(IGEL.length - 1);
    expect(lines.filter((l) => l !== '').join(' ')).toBe(IGEL.join(' '));
  });
});

describe('the questions about Buddy’s text', () => {
  it('keeps the questions backed by the text, each carrying the text in its printed lines', () => {
    const items = buddyReadingItems(draft(), SIXTH);
    expect(items.map((i) => i.kind)).toEqual([
      'short',
      'multiple_choice',
      'multiple_choice',
      'mark',
    ]);
    for (const it of items) {
      expect(it.read_passage).toEqual({
        title: 'Der Igel im Winter',
        lines: printedLines(IGEL),
        lang: 'de',
      });
    }
  });

  it('drops a question naming a line and a right option its evidence does not back', () => {
    const items = buddyReadingItems(
      draft({
        questions: [
          ...QUESTIONS,
          // The lines are code's: the model cannot know line 3.
          {
            kind: 'short',
            prompt: 'Was frisst der Igel laut Z. 3?',
            answer: 'Käfer',
            accepted_answers: [],
            evidence: 'Er sucht Käfer, Würmer und Schnecken unter dem Laub',
            difficulty: 1,
          },
          // "about one kilo" stands nowhere in its evidence.
          {
            kind: 'multiple_choice',
            prompt: 'Wie schwer wird ein Igel?',
            choices: ['etwa ein Kilo', 'etwa zehn Kilo'],
            correct_choice: 0,
            evidence: 'Je schwerer er wird, desto besser übersteht er die kalte Zeit',
            difficulty: 2,
          },
        ],
      }),
      SIXTH,
    );
    expect(items.map((i) => i.prompt)).toEqual([
      'Wovon lebt der Igel im Winterschlaf?',
      'Wo liegt das Nest des Igels oft?',
      'Im Winterschlaf bleibt der Igel so warm wie im Sommer.',
      'Nach dem Winter braucht der Igel schnell Nahrung.',
    ]);
  });

  it('stores nothing of a text off her stage, in another language, or with too few questions', () => {
    // A second grader: 700 characters is too much.
    expect(buddyReadingItems(draft(), { ...SIXTH, grade: 2 })).toEqual([]);
    // An English class gets an English text, not a German one.
    expect(buddyReadingItems(draft(), { ...SIXTH, subjectKind: 'english' })).toEqual([]);
    // Declared English, written German: the alphabet tells.
    expect(buddyReadingItems(draft({ lang: 'en' }), { ...SIXTH, subjectKind: 'english' })).toEqual(
      [],
    );
    // A language without a known alphabet gets no text at all.
    expect(buddyReadingItems(draft(), { ...SIXTH, subjectKind: 'other_language' })).toEqual([]);
    // Two questions: Buddy writes the text himself, so it carries at least three.
    expect(buddyReadingItems(draft({ questions: QUESTIONS.slice(0, 2) }), SIXTH)).toEqual([]);
    expect(buddyReadingItems(null, SIXTH)).toEqual([]);
  });
});
