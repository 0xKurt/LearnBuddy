// Lange Texte (issue #258): the key points per text type are code's, each is a valid stored
// rubric; a place counts only with a quote from her text; only an essay takes a long answer.
import { EssayType, StoredRubric } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { isAppError } from '../../../lib/errors.js';
import { admitText, essayItem, ESSAY_POINTS, verifiedPlaces } from '../essay.js';
import { askedElements, checkRubric } from '../rubric.js';

const task = (type: EssayType) => ({
  prompt: 'Erörtere, ob Handys an Schulen verboten werden sollten.',
  type,
  topic: 'Handyverbot',
  difficulty: 3,
  passage: null,
});

const codeOf = (fn: () => void): string | null => {
  try {
    fn();
    return null;
  } catch (err) {
    return isAppError(err) ? `${err.status}` : 'other';
  }
};

describe('essay items (#258)', () => {
  it('builds a stored rubric from the text type, in every language', () => {
    for (const type of EssayType.options) {
      for (const locale of ['de', 'en', 'fr', 'es', 'it']) {
        const item = essayItem(task(type), locale);
        expect(item.kind).toBe('essay');
        const rubric = StoredRubric.parse(item.rubric);
        expect(rubric.elements).toHaveLength(ESSAY_POINTS[type].length);
        // No model answer, and the prepared hints are the points' own next steps.
        expect(item.worked_solution).toBeNull();
        expect(item.hints).toEqual(rubric.elements.slice(0, 3).map((e) => e.missing));
      }
    }
  });

  it('asks the model about every key point and decides none of them alone', () => {
    const rubric = StoredRubric.parse(essayItem(task('argue_dialectic'), 'de').rubric);
    expect(askedElements(rubric).map((e) => e.ref)).toEqual(['r1', 'r2', 'r3', 'r4']);
    const nothing = checkRubric(rubric, 'Ein Text.', []);
    expect(nothing.elements.every((e) => e.state === 'unknown')).toBe(true);
  });

  it('holds the introduction to her first paragraph and the conclusion to her last', () => {
    const rubric = StoredRubric.parse(essayItem(task('argue_linear'), 'de').rubric);
    const intro = 'Ich finde, Handys gehören nicht in den Unterricht.';
    const end = 'Darum bin ich für klare Regeln statt eines Verbots.';
    const text = [intro, 'Erstens lenken sie ab. '.repeat(20), end].join('\n');
    const claim = (element: string, quote: string) => ({ element, met: true, quote, verbs: [] });
    const right = checkRubric(rubric, text, [
      claim('r1', intro),
      claim('r2', 'Erstens lenken sie ab'),
      claim('r3', end),
    ]);
    expect(right.elements.map((e) => e.state)).toEqual(['met', 'met', 'met']);
    const swapped = checkRubric(rubric, text, [
      claim('r1', end),
      claim('r2', 'Erstens lenken sie ab'),
      claim('r3', intro),
    ]);
    expect(swapped.elements.map((e) => e.state)).toEqual(['open', 'met', 'open']);
  });
});

describe('verifiedPlaces (#258)', () => {
  const text = 'Handys „lenken“ ab.\nIm  Unterricht   stören sie.';
  it('keeps a quote found in her text, folded, once; drops the rest', () => {
    const places = verifiedPlaces(text, [
      { quote: 'Handys "lenken" ab', better: 'a' },
      { quote: 'im Unterricht stören sie', better: 'b' },
      { quote: 'Handys lenken ab', better: 'c' },
      { quote: 'Handys sind toll', better: 'd' },
    ]);
    expect(places.map((p) => p.better)).toEqual(['a', 'b']);
  });
});

describe('admitText (#258)', () => {
  it('takes a long answer only for an essay, and never an essay in a test', () => {
    expect(codeOf(() => admitText('essay', 'practice', 'x'.repeat(12_000)))).toBeNull();
    expect(codeOf(() => admitText('long', 'practice', 'x'.repeat(2001)))).toBe('422');
    expect(codeOf(() => admitText('short', 'practice', 'x'.repeat(2000)))).toBeNull();
    expect(codeOf(() => admitText('essay', 'test', 'x'))).toBe('409');
  });
});
