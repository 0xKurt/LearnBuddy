// Die Rubrik einer Schreibaufgabe, Element für Element (issue #211), und dieselbe Rubrik für die
// Erklärfrage (#236) und den Aufsatz (#258).
//
// Was hier geprüft wird, ist die Trennlinie: was Code entscheidet, entscheidet Code — und zwar
// so, dass eine Angabe, die in ihrem Text STEHT, nie als fehlend gemeldet wird; was das Modell
// beurteilt, muss auf ihren Text zeigen, sonst zählt es nicht.

import { describe, expect, it } from 'vitest';

import type { Rubric, RubricElement } from '@learnbuddy/shared-types/contracts';

import {
  askedElements,
  checkRubric,
  lineRefsIn,
  materialLines,
  opening,
  paragraphsIn,
  rubricFeedback,
  rubricOf,
  rubricReply,
  rubricVerdict,
  spotsIn,
  usableRubric,
  wordsIn,
  type RubricClaim,
} from '../rubric.js';

const element = (over: Partial<RubricElement> & { check: RubricElement['check'] }): RubricElement =>
  ({
    name: 'Element',
    missing: 'Schau nochmal hin.',
    ask: null,
    point: null,
    ...over,
  }) as RubricElement;

const opener = element({
  name: 'Einleitungssatz',
  missing: 'Nenne im ersten Satz Titel und Autor.',
  check: { by: 'mentions', terms: ['Die Verwandlung', 'Kafka'], where: 'opening' },
});
const tense = element({
  name: 'Präsens',
  missing: 'Eine Inhaltsangabe steht im Präsens.',
  check: { by: 'tense', tense: 'present' },
});
const length = element({
  name: 'Länge',
  missing: 'Etwas mehr als das darf es schon sein.',
  check: { by: 'word_count', min: 20, max: null },
});
const judged = element({
  name: 'eigenes Urteil',
  missing: 'Sag am Ende, was du selbst davon hältst.',
  check: { by: 'judged', exact: [] },
});

const rubric = (elements: RubricElement[]): Rubric => ({
  kind: 'text',
  form: 'Inhaltsangabe',
  elements,
});

const claim = (over: Partial<RubricClaim> & { element: string }): RubricClaim => ({
  met: false,
  quote: '',
  verbs: [],
  ...over,
});

const SUMMARY =
  'Die Verwandlung von Kafka erzählt von Gregor Samsa. ' +
  'Er wacht auf und ist ein Käfer. Seine Familie wendet sich ab, und am Ende stirbt er allein ' +
  'in seinem Zimmer, was ich sehr bedrückend finde.';

describe('usableRubric', () => {
  it('keeps a rubric only on a free text', () => {
    const r = rubric([opener, length]);
    expect(usableRubric(r, 'long')).toBe(r);
    // A number and a vocabulary pair have no elements to tick off: a model that writes one
    // anyway misread the task, and the question keeps working without it.
    expect(usableRubric(r, 'numeric')).toBeNull();
    expect(usableRubric(r, 'vocab')).toBeNull();
    expect(usableRubric(null, 'long')).toBeNull();
  });

  it('drops a rubric nothing could check', () => {
    // Two elements with one name would stand twice in the same line.
    expect(
      usableRubric(rubric([opener, { ...opener, missing: 'Anders gesagt.' }]), 'long'),
    ).toBeNull();
    // A length with no bound at all, and one with its bounds the wrong way round.
    expect(
      usableRubric(
        rubric([opener, element({ check: { by: 'word_count', min: null, max: null } })]),
        'long',
      ),
    ).toBeNull();
    expect(
      usableRubric(
        rubric([opener, element({ check: { by: 'word_count', min: 300, max: 100 } })]),
        'long',
      ),
    ).toBeNull();
    // A required mention that folds away to nothing would be "found" in every text.
    expect(
      usableRubric(
        rubric([length, element({ check: { by: 'mentions', terms: ['—'], where: 'anywhere' } })]),
        'long',
      ),
    ).toBeNull();
  });

  it('reads a stored column only when it still holds', () => {
    const r = rubric([opener, length]);
    expect(rubricOf(JSON.parse(JSON.stringify(r)))).toEqual(r);
    expect(rubricOf(null)).toBeNull();
    expect(rubricOf({ form: 'Bericht', elements: [] })).toBeNull();
    expect(rubricOf('Inhaltsangabe')).toBeNull();
  });
});

describe('what the model is asked about', () => {
  it('asks only about what code cannot decide', () => {
    // A length and a required mention are counted and compared — the model does not even learn
    // that they are part of the rubric, so it cannot contradict them (CLAUDE.md rule 1).
    expect(askedElements(rubric([opener, length, tense, judged]))).toEqual([
      { ref: 'r3', name: 'Präsens', point: null, check: { by: 'tense', tense: 'present' } },
      { ref: 'r4', name: 'eigenes Urteil', point: null, check: { by: 'judged', exact: [] } },
    ]);
    expect(askedElements(rubric([opener, length]))).toEqual([]);
  });
});

describe('counting and comparing, without a model', () => {
  it('counts the words she wrote', () => {
    expect(wordsIn('')).toBe(0);
    expect(wordsIn('   ')).toBe(0);
    expect(wordsIn('Drei kurze Wörter')).toBe(3);
  });

  it('reads the opening generously, never narrowly', () => {
    // A full stop also stands in an abbreviation and behind a year, and an opening cut too
    // short would report an entry she DID write as missing. So the window is at least 200
    // characters — it can only be too wide, never too narrow.
    expect(opening('Kurz. Danach mehr.')).toBe('Kurz. Danach mehr.');
    const longText = `${'a'.repeat(400)}. Zweiter Satz.`;
    expect(opening(longText)).toBe(`${'a'.repeat(400)}.`);
  });

  it('names exactly the element that is missing, and the others as present', () => {
    // The acceptance criterion of #211: a summary without an opening sentence.
    const without =
      'Gregor wacht auf und ist ein Käfer. Seine Familie wendet sich ab und am Ende stirbt er ' +
      'allein in seinem Zimmer, was ich bedrückend finde.';
    const o = checkRubric(rubric([opener, length, judged]), without, [
      claim({ element: 'r3', met: true, quote: 'was ich bedrückend finde' }),
    ]);
    expect(o.elements).toEqual([
      { ref: 'r1', name: 'Einleitungssatz', state: 'open', counted: true },
      { ref: 'r2', name: 'Länge', state: 'met', counted: true },
      { ref: 'r3', name: 'eigenes Urteil', state: 'met', counted: false },
    ]);
    // Something holds, so the question stays open — never "wrong", which would throw away
    // what was already right.
    expect(rubricVerdict(o)).toBe('partially_correct');
    expect(o.step).toMatchObject({ name: 'Einleitungssatz', counted: true });
  });

  it('finds a required mention folded, and not inside a longer word', () => {
    const o = checkRubric(
      rubric([
        element({
          check: { by: 'mentions', terms: ['kafka', 'die verwandlung'], where: 'opening' },
        }),
        length,
      ]),
      SUMMARY,
      [],
    );
    expect(o.all).toBe(true);
    // "Jahr" must not be found in "Jahrhundert": a word is a word, not a substring.
    const near = checkRubric(
      rubric([element({ check: { by: 'mentions', terms: ['Jahr'], where: 'anywhere' } }), length]),
      'Im Jahrhundert davor geschah vieles, und noch viel mehr danach in dieser langen Zeit hier.',
      [],
    );
    expect(near.elements[0]?.state).toBe('open');
  });
});

describe('what the model claims has to point at her text (Regel 0 aus #224)', () => {
  it('does not accept an element whose quote is not in her text', () => {
    const o = checkRubric(rubric([length, judged]), SUMMARY, [
      claim({ element: 'r2', met: true, quote: 'Das Werk entfaltet eine existenzielle Wucht' }),
    ]);
    expect(o.elements[1]).toEqual({
      ref: 'r2',
      name: 'eigenes Urteil',
      state: 'open',
      counted: false,
    });
  });

  it('accepts it when the quote really stands there', () => {
    const o = checkRubric(rubric([length, judged]), SUMMARY, [
      claim({ element: 'r2', met: true, quote: 'was ich sehr bedrückend finde' }),
    ]);
    expect(o.all).toBe(true);
    expect(rubricVerdict(o)).toBe('correct');
  });

  it('only lets a verb the text really contains break the tense', () => {
    // A verb form the model invented changes nothing.
    const invented = checkRubric(rubric([length, tense]), SUMMARY, [
      claim({ element: 'r2', verbs: ['erzählte', 'wachte'] }),
    ]);
    expect(invented.elements[1]?.state).toBe('met');
    // One that stands in her text does, and the next step names that very word.
    const real = checkRubric(rubric([length, tense]), SUMMARY, [
      claim({ element: 'r2', verbs: ['stirbt'] }),
    ]);
    expect(real.elements[1]?.state).toBe('open');
    expect(real.step).toMatchObject({ name: 'Präsens', verb: 'stirbt', counted: true });
  });

  it('says "unknown" where a judgement simply did not come, never "missing"', () => {
    // Nobody measured it, so claiming it is missing would be the claim #197 removed.
    const o = checkRubric(rubric([length, judged, tense]), SUMMARY, []);
    expect(o.elements.map((e) => e.state)).toEqual(['met', 'unknown', 'unknown']);
    // An unknown element never becomes the next step …
    expect(o.step).toBeNull();
    // … and it does not close the question either: something is unchecked.
    expect(o.all).toBe(false);
    expect(rubricVerdict(o)).toBe('partially_correct');
  });

  it('is incorrect only when nothing at all holds', () => {
    const o = checkRubric(rubric([opener, length]), 'Weiß nicht.', []);
    expect(o.some).toBe(false);
    expect(rubricVerdict(o)).toBe('incorrect');
  });
});

describe('what Buddy says', () => {
  it('says exactly ONE next step; the elements stand next to it as a list', () => {
    const o = checkRubric(rubric([opener, length, judged]), 'Zu kurz.', [
      claim({ element: 'r3', met: false }),
    ]);
    const reply = rubricReply('de', o, 'Buddys eigener Satz.');
    // Nothing holds yet, so no "Fast" — that would be untrue and would read as pressure.
    expect(reply).toBe(
      'Lass uns bei Einleitungssatz anfangen: Nenne im ersten Satz Titel und Autor.',
    );
    // The list is a structure next to the sentence, not a line in it (issues #236, #258).
    expect(rubricFeedback(o)).toEqual({
      kind: 'text',
      points: [
        { name: 'Einleitungssatz', met: false },
        { name: 'Länge', met: false },
        { name: 'eigenes Urteil', met: false },
      ],
      spots: [],
    });
    // No count, no score, no grade anywhere in it (CLAUDE.md rule 6).
    expect(reply).not.toMatch(/\d\s*(von|\/)\s*\d/);
    expect(JSON.stringify(rubricFeedback(o))).not.toMatch(/\d/);
    expect(reply).not.toContain('Falsch');
  });

  it('says "fehlt nur noch" for a counted element once something holds', () => {
    const o = checkRubric(rubric([length, opener]), SUMMARY.replace('Kafka', 'ihm'), []);
    expect(rubricReply('de', o, 'x')).toBe(
      'Fast – fehlt nur noch Einleitungssatz: Nenne im ersten Satz Titel und Autor.',
    );
  });

  it('asks instead of asserting where the element is a judgement', () => {
    // Code cannot see this one, so Buddy does not claim it is missing — he asks her to look.
    const o = checkRubric(rubric([length, judged]), SUMMARY, [
      claim({ element: 'r2', met: false }),
    ]);
    expect(rubricReply('de', o, 'x')).toContain('Schau nochmal, ob eigenes Urteil schon drinsteht');
  });

  it('leaves Buddy his own words when there is nothing to point at', () => {
    const o = checkRubric(rubric([length, judged]), SUMMARY, [
      claim({ element: 'r2', met: true, quote: 'was ich sehr bedrückend finde' }),
    ]);
    expect(rubricReply('de', o, 'Das liest sich rund.')).toBe('Das liest sich rund.');
    // …but never a grade in them (#258): a sentence with a digit is dropped for the app's own.
    expect(rubricReply('de', o, 'Das ist eine glatte 2+!')).toBe('Das trägt – alles drin.');
    expect(rubricReply('de', o, '2 von 2 – super!')).toBe('Das trägt – alles drin.');
    expect(rubricFeedback(o).points).toEqual([
      { name: 'Länge', met: true },
      { name: 'eigenes Urteil', met: true },
    ]);
  });

  it('leaves an element nobody measured out of the list', () => {
    const o = checkRubric(rubric([length, judged]), SUMMARY, []);
    expect(rubricFeedback(o).points).toEqual([{ name: 'Länge', met: true }]);
  });

  it("writes the sentence in the learner's language", () => {
    const o = checkRubric(rubric([length, opener]), 'Zu kurz.', []);
    expect(rubricReply('fr', o, 'x')).toContain('Commençons par Länge');
    expect(rubricReply('it', o, 'x')).toContain('Iniziamo da Länge');
  });
});

// ─────────────── die Erklärfrage (#236) ───────────────

/** A key point: the aspect she sees (`name`) and what it says, for the judge only (`says`). */
const point = (name: string, ask: string, says: string, exact: string[][] = []): RubricElement =>
  element({
    name,
    point: says,
    missing: `${name} fehlt noch.`,
    ask,
    check: { by: 'judged', exact },
  });

const PHOTO: Rubric = {
  kind: 'explain',
  form: 'Erklärung',
  elements: [
    point(
      'Energiequelle',
      'Woher bekommt die Pflanze die Energie dafür?',
      'Licht liefert die Energie',
    ),
    point(
      'Ausgangsstoffe',
      'Woraus baut die Pflanze den Zucker?',
      'Aus CO₂ und Wasser wird Glucose',
      [['CO2', 'Kohlenstoffdioxid', 'Kohlendioxid']],
    ),
    point('Ort in der Zelle', 'Und wo in der Zelle passiert das?', 'Findet im Chloroplasten statt'),
  ],
};
const PHOTO_Q = 'Erkläre, wie die Fotosynthese funktioniert.';

describe('an explanation question (issue #236)', () => {
  it('keeps a key-point rubric only when every point can be asked and checked', () => {
    expect(usableRubric(PHOTO, 'long', PHOTO_Q)).toBe(PHOTO);
    // Fewer than three points is a two-part question, not an explanation.
    expect(usableRubric({ ...PHOTO, elements: PHOTO.elements.slice(0, 2) }, 'long')).toBeNull();
    // Every point is judged — a counted check belongs to a text form, not an explanation.
    expect(usableRubric({ ...PHOTO, elements: [...PHOTO.elements, length] }, 'long')).toBeNull();
    // Every point has its follow-up, and the follow-up is a question.
    const noAsk = { ...PHOTO.elements[0]!, ask: null };
    expect(
      usableRubric({ ...PHOTO, elements: [noAsk, ...PHOTO.elements.slice(1)] }, 'long'),
    ).toBeNull();
    const statement = { ...PHOTO.elements[0]!, ask: 'Die Energie kommt vom Licht.' };
    expect(
      usableRubric({ ...PHOTO, elements: [statement, ...PHOTO.elements.slice(1)] }, 'long'),
    ).toBeNull();
  });

  it('drops a rubric whose follow-up gives the value away', () => {
    const giveaway = point('Ausgangsstoff', 'Nimmt die Pflanze CO2 auf?', 'Sie nimmt CO₂ auf', [
      ['CO2'],
    ]);
    expect(
      usableRubric({ ...PHOTO, elements: [giveaway, ...PHOTO.elements.slice(1)] }, 'long'),
    ).toBeNull();
  });

  it('drops a key point whose name gives its content away (#236)', () => {
    // The list stands right under "Und wo in der Zelle passiert das?": "Chloroplast" there would
    // be the answer — also when the point says it inflected.
    const told = point(
      'Ort: Chloroplast',
      'Und wo in der Zelle passiert das?',
      'Findet im Chloroplasten statt',
    );
    const rest = PHOTO.elements.slice(0, 2);
    expect(usableRubric({ ...PHOTO, elements: [...rest, told] }, 'long', PHOTO_Q)).toBeNull();
    // A word the question or the follow-up already uses gives nothing away.
    const aspect = point(
      'Ort in der Zelle',
      'Und wo in der Zelle passiert das?',
      'In der Zelle: im Chloroplasten',
    );
    expect(usableRubric({ ...PHOTO, elements: [...rest, aspect] }, 'long', PHOTO_Q)).not.toBeNull();
    // And what a key point says is required: without it the judge would judge the aspect.
    const bare = { ...PHOTO.elements[2]!, point: null };
    expect(usableRubric({ ...PHOTO, elements: [...rest, bare] }, 'long', PHOTO_Q)).toBeNull();
  });

  it('drops a key point that just repeats the question', () => {
    const echo = point(PHOTO_Q, 'Wie geht das?', 'Licht wird zu Zucker');
    expect(
      usableRubric({ ...PHOTO, elements: [echo, ...PHOTO.elements.slice(1)] }, 'long', PHOTO_Q),
    ).toBeNull();
  });

  it('leaves no number in a key point to a judgement', () => {
    // "1914" in the point and no exact value for it: a number code can check would be judged.
    const year = point('Kriegsbeginn', 'Wann begann der Krieg?', 'Der Krieg beginnt 1914');
    const rest = PHOTO.elements.slice(1);
    expect(usableRubric({ ...PHOTO, elements: [year, ...rest] }, 'long')).toBeNull();
    const checked = point('Kriegsbeginn', 'Wann begann der Krieg?', 'Der Krieg beginnt 1914', [
      ['1914'],
    ]);
    expect(usableRubric({ ...PHOTO, elements: [checked, ...rest] }, 'long')).not.toBeNull();
    // A number in what she SEES would give it away, checked or not.
    const shown = point('Beginn 1914', 'Wann begann der Krieg?', 'Der Krieg beginnt 1914', [
      ['1914'],
    ]);
    expect(usableRubric({ ...PHOTO, elements: [shown, ...rest] }, 'long')).toBeNull();
    // An "exact" value without any digit is a word that could be paraphrased — not its field.
    const word = point('Quelle', 'Woher?', 'Die Sonne', [['Sonne']]);
    expect(usableRubric({ ...PHOTO, elements: [word, ...rest] }, 'long')).toBeNull();
  });

  it('carries no follow-up on a writing task', () => {
    const r = rubric([length, { ...judged, ask: 'Was hältst du davon?' }]);
    expect(usableRubric(r, 'long')).toBeNull();
  });

  it('two of three points: exactly one follow-up, the one for the third', () => {
    const said = 'Die Pflanze braucht Licht als Energie und macht aus CO2 und Wasser Zucker.';
    const o = checkRubric(PHOTO, said, [
      claim({ element: 'r1', met: true, quote: 'braucht Licht als Energie' }),
      claim({ element: 'r2', met: true, quote: 'aus CO2 und Wasser Zucker' }),
      claim({ element: 'r3', met: false }),
    ]);
    expect(o.elements.map((e) => e.state)).toEqual(['met', 'met', 'open']);
    expect(rubricVerdict(o)).toBe('partially_correct');
    const reply = rubricReply('de', o, 'x');
    expect(reply).toBe('Das trägt schon. Und wo in der Zelle passiert das?');
    expect(reply.match(/\?/g)).toHaveLength(1);
  });

  it('checks a number or a formula in a key point exactly, whatever the model says', () => {
    // The model is happy with "Gase" — the value the point names is not in her words.
    const said = 'Die Pflanze nimmt Gase und Wasser auf und macht Zucker daraus.';
    const o = checkRubric(PHOTO, said, [
      claim({ element: 'r2', met: true, quote: 'nimmt Gase und Wasser auf' }),
    ]);
    expect(o.elements[1]?.state).toBe('open');
    // Spoken as a word, it counts: one of the accepted ways to say it.
    const spoken = checkRubric(PHOTO, 'Aus Kohlendioxid und Wasser wird Zucker.', [
      claim({ element: 'r2', met: true, quote: 'Aus Kohlendioxid und Wasser wird Zucker' }),
    ]);
    expect(spoken.elements[1]?.state).toBe('met');
  });

  it('does not ask the same follow-up twice while another point had none', () => {
    const o = checkRubric(
      PHOTO,
      'Mit Licht.',
      [
        claim({ element: 'r1', met: true, quote: 'Licht' }),
        claim({ element: 'r2' }),
        claim({ element: 'r3' }),
      ],
      {
        said: ['Das trägt schon. Woraus baut die Pflanze den Zucker?'],
      },
    );
    expect(o.step?.ask).toBe('Und wo in der Zelle passiert das?');
    // Once every open point has been asked, it is the first one again — never nothing.
    const all = checkRubric(
      PHOTO,
      'Mit Licht.',
      [
        claim({ element: 'r1', met: true, quote: 'Licht' }),
        claim({ element: 'r2' }),
        claim({ element: 'r3' }),
      ],
      {
        said: ['Woraus baut die Pflanze den Zucker?', 'Und wo in der Zelle passiert das?'],
      },
    );
    expect(all.step?.ask).toBe('Woraus baut die Pflanze den Zucker?');
  });

  it('starts with a follow-up when nothing holds yet, without "Das trägt schon"', () => {
    const o = checkRubric(PHOTO, 'Keine Ahnung.', [claim({ element: 'r1' })]);
    expect(rubricReply('de', o, 'x')).toBe(
      'Lass uns da anfangen: Woher bekommt die Pflanze die Energie dafür?',
    );
  });

  it('shows no places to improve for an explanation', () => {
    const o = checkRubric(PHOTO, 'Licht.', []);
    expect(rubricFeedback(o, [{ quote: 'Licht', tip: 'Mehr.' }]).spots).toEqual([]);
  });
});

// ─────────────── der Aufsatz (#258) ───────────────

describe('an essay (issue #258)', () => {
  it('counts paragraphs by line breaks, not by empty lines', () => {
    expect(paragraphsIn('Einleitung.\nHauptteil.\n\n\nSchluss.')).toBe(3);
    expect(paragraphsIn('Ein einziger Block.')).toBe(1);
    const r = rubric([length, element({ name: 'Absätze', check: { by: 'paragraphs', min: 3 } })]);
    expect(checkRubric(r, 'Eins.\nZwei.', []).elements[1]?.state).toBe('open');
    expect(checkRubric(r, 'Eins.\nZwei.\nDrei.', []).elements[1]?.state).toBe('met');
  });

  it('reads line references as a format, and checks every cited line exists', () => {
    expect(lineRefsIn('wie es heißt (Z. 12) und später (Zeilen 3–5), dann l. 7')).toEqual([
      { cite: 'Z. 12', lines: [12] },
      { cite: 'Zeilen 3–5', lines: [3, 5] },
      { cite: 'l. 7', lines: [7] },
    ]);
    // A word that merely starts with the letter is no reference.
    expect(lineRefsIn('Zebra 12 und Leben 4')).toEqual([]);
    const material = Array.from({ length: 20 }, (_, n) => `Zeile ${n + 1} des Gedichts`).join('\n');
    expect(materialLines(material)).toBe(20);
    const cites = element({ name: 'Zitate mit Zeile', check: { by: 'line_refs', min: 2 } });
    // Something already holds, so the sentence may say "Das trägt schon" before the line.
    const r = rubric([
      cites,
      element({ name: 'Bild', check: { by: 'mentions', terms: ['Bild'], where: 'anywhere' } }),
    ]);
    const ok = checkRubric(r, 'Das Bild (Z. 3) und der Schluss (Z. 18).', [], { material });
    expect(ok.elements[0]?.state).toBe('met');
    const wrong = checkRubric(r, 'Das Bild (Z. 3) und der Schluss (Z. 87).', [], { material });
    expect(wrong.elements[0]?.state).toBe('open');
    expect(wrong.step).toMatchObject({ cite: 'Z. 87' });
    expect(rubricReply('de', wrong, 'x')).toContain('Die Zeile bei „Z. 87“ gibt es im Text nicht');
    // Too few references: counted, no material needed.
    expect(checkRubric(r, 'Das Bild (Z. 3).', [], {}).elements[0]?.state).toBe('open');
    // Enough references but nothing to check them against: nobody measured — unknown.
    expect(checkRubric(r, '(Z. 3) und (Z. 4)', [], {}).elements[0]?.state).toBe('unknown');
  });

  it('keeps only places whose quote stands in her text, three at most, none with a digit', () => {
    const text =
      'Ich finde, Schuluniformen sind gut. Sie machen alle gleich. Außerdem spart man Zeit am Morgen. Das ist so.';
    const kept = spotsIn(text, [
      {
        quote: 'Sie machen alle gleich',
        tip: 'Begründe das mit einem Beispiel aus deinem Alltag.',
      },
      { quote: 'Uniformen fördern Disziplin', tip: 'Ein Zitat, das es nicht gibt.' },
      { quote: 'Das ist so.', tip: 'Gib hier eine Note von 2.' },
      { quote: 'sie machen alle gleich', tip: 'Doppelt.' },
      { quote: 'spart man Zeit am Morgen', tip: 'Verknüpfe das mit deiner These.' },
      { quote: 'Ich finde', tip: 'Formuliere die These deutlicher.' },
      { quote: 'Das ist so', tip: 'Noch einer, über drei.' },
    ]);
    expect(kept.map((k) => k.quote)).toEqual([
      'Sie machen alle gleich',
      'spart man Zeit am Morgen',
      'Ich finde',
    ]);
  });
});
