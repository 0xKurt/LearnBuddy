// Questions about trees, pedigrees and automata (issue #256): each one held to the key code
// computes, each broken one dropped for its own reason (Regel 0: rejected, never repaired).

import { describe, expect, it } from 'vitest';

import { evenOnes, recessivePedigree, TREE_ITEMS, urn } from '../../../testing/scenarios/trees.js';
import { ItemDraft, itemsOneByOne, usableItems } from '../items.js';
import { figureIsRejected } from '../wholeFigure.js';

const [path, edge, mode, genotype, automaton] = TREE_ITEMS as [
  (typeof TREE_ITEMS)[number],
  ...(typeof TREE_ITEMS)[number][],
];

/** What survives of one written item, through the same path a generated set takes. */
function kept(raw: Record<string, unknown>, locale = 'de') {
  return usableItems(itemsOneByOne(ItemDraft, 25).parse([raw]), { locale });
}

describe('tree questions are held to the key code computes', () => {
  it('keeps every question of the walkthrough', () => {
    expect(
      usableItems(itemsOneByOne(ItemDraft, 25).parse(TREE_ITEMS), { locale: 'de' }),
    ).toHaveLength(TREE_ITEMS.length);
  });

  it('a probability: the fraction, the decimal and a rounded key, nothing else', () => {
    expect(kept({ ...path, answer: '3/10' })[0]?.tolerance).toBeNull();
    expect(kept({ ...path, answer: '0.3' })).toHaveLength(1);
    expect(kept({ ...path, answer: '30', unit: '%' })).toHaveLength(1);
    // With putting back it would be 9/25: another tree, another key.
    expect(kept({ ...path, answer: '9/25' })).toHaveLength(0);
    expect(kept({ ...path, answer: '3', unit: 'cm' })).toHaveLength(0);
    // P(one red, one blue) = 3/5 rounded to two places.
    const sum = kept({ ...path, answer: '0.6', figure: urn('sum', [4, 5]) });
    expect(sum).toHaveLength(1);
    // A third rounded is right at its precision, with the tolerance that precision gives.
    const third = {
      type: 'tree',
      pr: true,
      ask: 'path',
      at: [1],
      n: [
        { p: -1, l: '', e: '' },
        { p: 0, l: 'A', e: '1/3' },
        { p: 0, l: 'B', e: '2/3' },
      ],
    };
    expect(kept({ ...path, answer: '0.33', figure: third })[0]?.tolerance).toBeCloseTo(0.005);
  });

  it('the "?" branch is the key of an edge question', () => {
    expect(kept(edge!)).toHaveLength(1);
    expect(kept({ ...edge, answer: '3/4' })).toHaveLength(0);
  });

  it('drops a broken tree with its question, not just the drawing', () => {
    const broken = {
      ...urn('path', [3]),
      n: urn().n.map((x, i) => (i === 1 ? { ...x, e: '4/5' } : x)),
    };
    expect(figureIsRejected(broken)).toBe(true);
    expect(kept({ ...path, figure: broken })).toHaveLength(0);
    // A figure that does not even parse is rejected the same way.
    expect(figureIsRejected({ type: 'pedigree', p: [] })).toBe(true);
    expect(figureIsRejected({ type: 'fraction' })).toBe(false);
  });

  it('drops a number asked about a tree that declares no key', () => {
    expect(kept({ ...path, answer: '6', figure: urn() })).toHaveLength(0);
    expect(kept({ ...path, answer: '2', figure: recessivePedigree('none') })).toHaveLength(0);
    expect(kept({ ...path, answer: '2', figure: evenOnes('') })).toHaveLength(0);
  });

  it('the mode: code writes the options, the model must point at the one left', () => {
    const [it] = kept(mode!);
    expect(it?.choices).toEqual([
      'autosomal-dominant',
      'autosomal-rezessiv',
      'X-chromosomal-dominant',
      'X-chromosomal-rezessiv',
    ]);
    expect(it?.answer).toBe('autosomal-rezessiv');
    expect(kept({ ...mode, correct_choice: 3 })).toHaveLength(0);
    expect(kept({ ...mode, kind: 'short', choices: null, correct_choice: null })).toHaveLength(0);
    expect(kept({ ...mode, prompt_lang: 'it' }, 'de')[0]?.choices?.[1]).toBe(
      'autosomico recessivo',
    );
  });

  it('a genotype: one option per genotype, only when the pedigree settles it', () => {
    const [it] = kept(genotype!);
    expect(it?.choices).toEqual(['$AA$', '$Aa$', '$aa$']);
    expect(it?.answer).toBe('$Aa$');
    expect(kept({ ...genotype, correct_choice: 0 })).toHaveLength(0);
    // The healthy brother (person 5) is AA or Aa.
    expect(kept({ ...genotype, figure: recessivePedigree('gt', 4) })).toHaveLength(0);
  });

  it('a word: accepted or not is computed', () => {
    expect(kept(automaton!)[0]?.choices).toEqual([
      'Ja, es wird akzeptiert',
      'Nein, es wird nicht akzeptiert',
    ]);
    expect(kept({ ...automaton, figure: evenOnes('100') })).toHaveLength(0);
    expect(kept({ ...automaton, figure: evenOnes('100'), correct_choice: 1 })).toHaveLength(1);
    expect(kept({ ...automaton, figure: evenOnes('102') })).toHaveLength(0);
  });
});
