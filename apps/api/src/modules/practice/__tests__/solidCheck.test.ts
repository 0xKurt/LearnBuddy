// Questions about solids, cube nets and points in space (issue #255): each one held to the key
// code computes, each broken one dropped for its own reason (Regel 0: rejected, never repaired).

import { describe, expect, it } from 'vitest';

import { net, NET_OPTIONS, solid, SOLID_ITEMS, space } from '../../../testing/scenarios/solids.js';
import { ItemDraft, itemsOneByOne, usableItems } from '../items.js';
import { figureIsRejected } from '../wholeFigure.js';

type Item = (typeof SOLID_ITEMS)[number];
const byPrompt = (start: string) => SOLID_ITEMS.find((i) => i.prompt.startsWith(start)) as Item;
const cuboid = byPrompt('Wie groß ist das Volumen dieses Quaders');
const edges = byPrompt('Wie viele Kanten');
const cylinder = byPrompt('Wie groß ist die Oberfläche des Zylinders');
const fold = byPrompt('Lässt sich dieses Netz');
const opposite = byPrompt('Welches Quadrat liegt');
const choice = byPrompt('Welches dieser Netze');
const point = byPrompt('Welche Koordinaten');
const vector = byPrompt('Gib den Vektor');

/** What survives of one written item, through the same path a generated set takes. */
function kept(raw: Record<string, unknown>, locale = 'de') {
  return usableItems(itemsOneByOne(ItemDraft, 25).parse([raw]), { locale });
}

describe('questions on solids are held to the key code computes', () => {
  it('keeps every question of the walkthrough', () => {
    expect(
      usableItems(itemsOneByOne(ItemDraft, 25).parse(SOLID_ITEMS), { locale: 'de' }),
    ).toHaveLength(SOLID_ITEMS.length);
  });

  it('a volume: the computed number in the unit the question uses', () => {
    expect(kept({ ...cuboid })[0]?.tolerance).toBeNull();
    expect(kept({ ...cuboid, answer: '30 cm³', unit: null })).toHaveLength(1);
    expect(kept({ ...cuboid, answer: '30', unit: 'cm^3' })).toHaveLength(1);
    // 30 cm³ = 30 ml = 0,03 l.
    expect(kept({ ...cuboid, answer: '0,03', unit: 'l' })).toHaveLength(1);
    expect(kept({ ...cuboid, answer: '30', unit: 'ml' })).toHaveLength(1);
    expect(kept({ ...cuboid, answer: '31' })).toHaveLength(0);
    expect(kept({ ...cuboid, unit: 'dm³' })).toHaveLength(0);
    expect(kept({ ...cuboid, unit: 'cm²' })).toHaveLength(0);
    expect(kept({ ...cuboid, unit: null })).toHaveLength(0);
    expect(kept({ ...cuboid, kind: 'short' })).toHaveLength(0);
  });

  it('a rounded measure: right at the precision it is written in, with that tolerance', () => {
    expect(kept({ ...cylinder })[0]?.tolerance).toBeCloseTo(0.05, 9);
    expect(kept({ ...cylinder, answer: '151' })[0]?.tolerance).toBeCloseTo(0.5, 9);
    expect(kept({ ...cylinder, answer: '150,7' })).toHaveLength(0);
    // 48π written as 150 is no rounding of 150,796…
    expect(kept({ ...cylinder, answer: '150' })).toHaveLength(0);
  });

  it('a count: exactly the number Euler’s formula gives for the kind, without a unit', () => {
    expect(kept({ ...edges })).toHaveLength(1);
    expect(kept({ ...edges, answer: '12' })).toHaveLength(0);
    expect(kept({ ...edges, unit: 'cm' })).toHaveLength(0);
    expect(
      kept({ ...edges, answer: '7', figure: solid('prism', { n: 5, a: 2, h: 4 }, 'faces') }),
    ).toHaveLength(1);
    expect(
      kept({ ...edges, answer: '5', figure: solid('pyramid', { n: 4, a: 2, h: 4 }, 'vertices') }),
    ).toHaveLength(1);
    // A question on a solid that declares no key: a number would be unchecked.
    expect(kept({ ...edges, figure: solid('prism', { n: 6, a: 2, h: 4 }, 'none') })).toHaveLength(
      0,
    );
    // A text question about it (naming it) stays — no key is computed from the figure.
    expect(
      kept({
        ...edges,
        kind: 'short',
        answer: 'Prisma',
        figure: solid('prism', { n: 6, a: 2, h: 4 }, 'none'),
      }),
    ).toHaveLength(1);
  });

  it('a solid that breaks a rule costs its question, not just the drawing', () => {
    const bad = { ...solid('cuboid', { a: 5, b: 3, h: 2 }, 'volume'), r: 1 };
    expect(figureIsRejected(bad)).toBe(true);
    expect(kept({ ...cuboid, figure: bad })).toHaveLength(0);
    expect(figureIsRejected(solid('cylinder', { r: 3, h: 5 }, 'edges'))).toBe(true);
    expect(figureIsRejected({ ...solid('cube', { a: 2 }, 'none'), u: 'km' })).toBe(true);
    expect(figureIsRejected(solid('cube', { a: 2 }, 'none'))).toBe(false);
    expect(figureIsRejected({ type: 'fraction' })).toBe(false);
  });
});

describe('cube nets', () => {
  it('"Is this a cube net?": options code writes, the index folding gives', () => {
    const [it] = kept({ ...fold });
    expect(it?.choices).toEqual(['Ja, das ist ein Würfelnetz', 'Nein, das ist kein Würfelnetz']);
    expect(it?.answer).toBe('Ja, das ist ein Würfelnetz');
    expect(kept({ ...fold, correct_choice: 1 })).toHaveLength(0);
    // A 2 × 2 block never folds: "no" is right.
    const block = net(['##..', '####'], 'fold');
    expect(kept({ ...fold, correct_choice: 1, figure: block })).toHaveLength(1);
    expect(kept({ ...fold, kind: 'short', answer: 'Ja' })).toHaveLength(0);
    expect(kept({ ...fold, figure: net(['##.##', '.#..#'], 'fold') })).toHaveLength(0);
  });

  it('the opposite square: the number folding gives', () => {
    expect(kept({ ...opposite })).toHaveLength(1);
    expect(kept({ ...opposite, answer: '4' })).toHaveLength(0);
    expect(kept({ ...opposite, figure: net(['##..', '####'], 'opposite', 1) })).toHaveLength(0);
  });

  it('nets as options: the right one is the odd one out', () => {
    expect(kept({ ...choice })).toHaveLength(1);
    expect(kept({ ...choice, correct_choice: 2, answer: 'Netz C' })).toHaveLength(0);
    // Three of four fold and D does not: "Welches ist KEIN Würfelnetz?" has D as its answer.
    const three = [
      net(['.#..', '####', '.#..']),
      NET_OPTIONS[1],
      net(['###..', '..###']),
      NET_OPTIONS[3],
    ];
    expect(
      kept({ ...choice, choice_figures: three, correct_choice: 3, answer: 'Netz D' }),
    ).toHaveLength(1);
    // Two fold, two do not: no one answer.
    const two = [NET_OPTIONS[0], NET_OPTIONS[1], net(['.#..', '####', '.#..']), NET_OPTIONS[3]];
    expect(kept({ ...choice, choice_figures: two })).toHaveLength(0);
  });
});

describe('points in space', () => {
  it('coordinates and vectors are the computed ones, as a point', () => {
    expect(kept({ ...point })).toHaveLength(1);
    expect(kept({ ...point, answer: 'A(2|3|2)' })).toHaveLength(1);
    expect(kept({ ...point, answer: '(2|1|3)' })).toHaveLength(0);
    expect(kept({ ...point, answer: '(2|3)' })).toHaveLength(0);
    expect(kept({ ...point, kind: 'numeric', answer: '2' })).toHaveLength(0);
    expect(kept({ ...vector })).toHaveLength(1);
    expect(kept({ ...vector, answer: '(1|-1|-1)' })).toHaveLength(0);
  });

  it('a distance is a number, exact or rounded', () => {
    const distance = { ...point, kind: 'numeric', figure: space('distance', 0, 1) };
    // |AB| = √3 = 1,732…
    expect(kept({ ...distance, answer: '1,73' })).toHaveLength(1);
    expect(kept({ ...distance, answer: '1,7' })).toHaveLength(1);
    expect(kept({ ...distance, answer: '1,8' })).toHaveLength(0);
    expect(kept({ ...distance, answer: '1,73', unit: 'cm' })).toHaveLength(0);
  });

  it('two points on one spot cost the question', () => {
    const overlap = {
      ...space('point', 0),
      p: [
        { l: 'O', x: 0, y: 0, z: 0 },
        { l: 'P', x: 2, y: 1, z: 1 },
      ],
    };
    expect(figureIsRejected(overlap)).toBe(true);
    expect(kept({ ...point, answer: '(0|0|0)', figure: overlap })).toHaveLength(0);
  });
});
