// Die Rubrik einer Schreibaufgabe, Element für Element (issue #211).
//
// Was hier geprüft wird, ist die Trennlinie: was Code entscheidet, entscheidet Code — und zwar
// so, dass eine Angabe, die in ihrem Text STEHT, nie als fehlend gemeldet wird; was das Modell
// beurteilt, muss auf ihren Text zeigen, sonst zählt es nicht.

import { describe, expect, it } from 'vitest';

import type { Rubric, RubricElement } from '@learnbuddy/shared-types/contracts';

import {
  askedElements,
  checkRubric,
  opening,
  rubricOf,
  rubricReply,
  rubricVerdict,
  usableRubric,
  wordsIn,
  type RubricClaim,
} from '../rubric.js';

const element = (over: Partial<RubricElement> & { check: RubricElement['check'] }): RubricElement =>
  ({ name: 'Element', missing: 'Schau nochmal hin.', ...over }) as RubricElement;

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
  check: { by: 'judged' },
});

const rubric = (elements: RubricElement[]): Rubric => ({ form: 'Inhaltsangabe', elements });

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
      { ref: 'r3', name: 'Präsens', check: { by: 'tense', tense: 'present' } },
      { ref: 'r4', name: 'eigenes Urteil', check: { by: 'judged' } },
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
  it('names every element with its state and exactly ONE next step', () => {
    const o = checkRubric(rubric([opener, length, judged]), 'Zu kurz.', [
      claim({ element: 'r3', met: false }),
    ]);
    const reply = rubricReply('de', o, 'Buddys eigener Satz.');
    const [line, step, ...rest] = reply.split('\n');
    expect(rest).toEqual([]);
    expect(line).toBe(
      'Einleitungssatz: noch nicht · Länge: noch nicht · eigenes Urteil: noch nicht',
    );
    // Nothing holds yet, so no "Fast" — that would be untrue and would read as pressure.
    expect(step).toBe(
      'Lass uns bei Einleitungssatz anfangen: Nenne im ersten Satz Titel und Autor.',
    );
    // No count, no score, no grade anywhere in it (CLAUDE.md rule 6).
    expect(reply).not.toMatch(/\d\s*(von|\/)\s*\d/);
    expect(reply).not.toContain('Falsch');
  });

  it('says "fehlt nur noch" for a counted element once something holds', () => {
    const o = checkRubric(rubric([length, opener]), SUMMARY.replace('Kafka', 'ihm'), []);
    expect(rubricReply('de', o, 'x')).toContain(
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
    expect(rubricReply('de', o, 'Das liest sich rund.')).toBe(
      'Länge: steht · eigenes Urteil: steht\nDas liest sich rund.',
    );
  });

  it("writes the line in the learner's language", () => {
    const o = checkRubric(rubric([length, opener]), 'Zu kurz.', []);
    expect(rubricReply('fr', o, 'x')).toContain('Länge : pas encore');
    expect(rubricReply('it', o, 'x')).toContain('Länge: non ancora');
  });
});
