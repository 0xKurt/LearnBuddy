// A figure must agree with its own numbers and with the key read off it (issues #253, #257).

import { describe, expect, it } from 'vitest';

import { angleAt, commonScale, figureHolds, leadingNumber } from '../figureCheck.js';
import { ItemDraft, usableItems } from '../items.js';

type Fig = Parameters<typeof figureHolds>[0];

const rad = (d: number) => (d * Math.PI) / 180;
const round = (n: number) => Math.round(n * 1000) / 1000;

/** A triangle with the angles α at A and β at B, side AB = c, as coordinates. */
function triangle(alpha: number, beta: number, c = 6) {
  const gamma = 180 - alpha - beta;
  const b = (c * Math.sin(rad(beta))) / Math.sin(rad(gamma)); // AC
  return [
    { name: 'A', x: 0, y: 0 },
    { name: 'B', x: c, y: 0 },
    { name: 'C', x: round(b * Math.cos(rad(alpha))), y: round(b * Math.sin(rad(alpha))) },
  ];
}

const geometry = (over: Record<string, unknown>): Fig =>
  ItemDraft.shape.figure.parse({
    type: 'geometry',
    points: [],
    segments: [],
    polygons: [],
    circles: [],
    ...over,
  });

const angle = (at: string, deg: number | null, label: string | null = null) => ({
  at: at.split(''),
  deg,
  label,
});

describe('measuring the drawing', () => {
  it('reads an angle from the coordinates', () => {
    expect(angleAt({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90, 9);
    const [A, B, C] = triangle(50, 60);
    if (!A || !B || !C) throw new Error('triangle');
    expect(angleAt(B, A, C)).toBeCloseTo(50, 1);
    expect(angleAt(A, B, C)).toBeCloseTo(60, 1);
    expect(angleAt(A, C, B)).toBeCloseTo(70, 1);
  });

  it('finds a common scale, or none when one value strays', () => {
    expect(
      commonScale([
        { value: 3, drawn: 1.5 },
        { value: 4, drawn: 2 },
      ]),
    ).toBeCloseTo(2, 9);
    expect(
      commonScale([
        { value: 3, drawn: 1.5 },
        { value: 5, drawn: 2 },
      ]),
    ).toBeNull();
    expect(Number.isNaN(commonScale([]))).toBe(true);
  });

  it('reads the number a key or a label starts with', () => {
    expect(leadingNumber('50°')).toBe(50);
    expect(leadingNumber('$30$ N')).toBe(30);
    expect(leadingNumber('3,5 cm')).toBe(3.5);
    expect(leadingNumber('α')).toBeNull();
  });
});

describe('a geometry figure drawn to scale', () => {
  const tri = (angles: unknown[]) =>
    geometry({ points: triangle(50, 60), polygons: [['A', 'B', 'C']], angles });

  it('keeps an angle whose arc is as wide as its value', () => {
    expect(figureHolds(tri([angle('BAC', 50)]), 'x', false)).toBe(true);
  });

  it('rejects an angle labelled 50° that is drawn 70° wide', () => {
    expect(figureHolds(tri([angle('ACB', 50)]), 'x', false)).toBe(false);
  });

  it('allows ±2° of drawing, not more', () => {
    expect(figureHolds(tri([angle('BAC', 51.9)]), 'x', false)).toBe(true);
    expect(figureHolds(tri([angle('BAC', 52.5)]), 'x', false)).toBe(false);
  });

  it('adds up the angles of a triangle exactly: 51° + 61° + 70° is no triangle', () => {
    expect(
      figureHolds(tri([angle('BAC', 50), angle('ABC', 60), angle('ACB', 70)]), 'x', false),
    ).toBe(true);
    // Each within ±2° of the drawing — and still 182° together.
    expect(
      figureHolds(tri([angle('BAC', 51), angle('ABC', 61), angle('ACB', 70)]), 'x', false),
    ).toBe(false);
  });

  it('checks the asked angle against the key', () => {
    const asked = tri([angle('BAC', 50), angle('ABC', 60), angle('ACB', null, '?')]);
    expect(figureHolds(asked, '70', true)).toBe(true);
    expect(figureHolds(asked, '80', true)).toBe(false);
    expect(figureHolds(asked, 'siebzig', true)).toBe(false);
  });

  it('a label that states a number must state the value', () => {
    expect(figureHolds(tri([angle('BAC', 50, '50°')]), 'x', false)).toBe(true);
    expect(figureHolds(tri([angle('BAC', 50, '40°')]), 'x', false)).toBe(false);
    expect(figureHolds(tri([angle('BAC', null, '50°')]), 'x', false)).toBe(false);
    expect(figureHolds(tri([angle('BAC', null, 'α')]), 'x', false)).toBe(true);
  });

  const right = (C: { x: number; y: number }, lengths: unknown[]) =>
    geometry({
      points: [
        { name: 'A', x: 0, y: 0 },
        { name: 'B', x: 4, y: 0 },
        { name: 'C', ...C },
      ],
      polygons: [['A', 'B', 'C']],
      lengths,
    });
  const side = (from: string, to: string, value: number | null, label: string | null = null) => ({
    from,
    to,
    value,
    label,
  });

  it('a triangle labelled 3–4–5 is right-angled in the drawing (Pythagoras from the coordinates)', () => {
    const sides = [side('A', 'B', 4), side('A', 'C', 3), side('B', 'C', 5)];
    expect(figureHolds(right({ x: 0, y: 3 }, sides), 'x', false)).toBe(true);
    // The same labels on a triangle that is not right-angled.
    expect(figureHolds(right({ x: 0.8, y: 3 }, sides), 'x', false)).toBe(false);
  });

  it('a side length that does not fit the others is refused; any common unit is fine', () => {
    expect(
      figureHolds(right({ x: 0, y: 3 }, [side('A', 'B', 8), side('A', 'C', 6)]), 'x', false),
    ).toBe(true);
    expect(
      figureHolds(right({ x: 0, y: 3 }, [side('A', 'B', 8), side('A', 'C', 7)]), 'x', false),
    ).toBe(false);
  });

  it('checks the asked side against the key, through the scale of the others', () => {
    const fig = right({ x: 0, y: 3 }, [
      side('A', 'B', 4),
      side('A', 'C', 3),
      side('B', 'C', null, '?'),
    ]);
    expect(figureHolds(fig, '5', true)).toBe(true);
    expect(figureHolds(fig, '5 cm', true)).toBe(true);
    expect(figureHolds(fig, '6', true)).toBe(false);
  });

  it('two "?" leave open which one the key answers: no number question', () => {
    const fig = right({ x: 0, y: 3 }, [
      side('A', 'B', 4),
      side('A', 'C', null, '?'),
      side('B', 'C', null, '?'),
    ]);
    expect(figureHolds(fig, '3', true)).toBe(false);
  });

  it('an algebraic label ("2x") states no number and needs no value', () => {
    expect(figureHolds(right({ x: 0, y: 3 }, [side('A', 'B', null, '2x')]), 'x', false)).toBe(true);
    expect(figureHolds(right({ x: 0, y: 3 }, [side('A', 'B', 4, '5 cm')]), 'x', false)).toBe(false);
  });

  it('refuses a measure at a point that does not exist', () => {
    expect(figureHolds(tri([angle('BAD', 50)]), 'x', false)).toBe(false);
    expect(figureHolds(right({ x: 0, y: 3 }, [side('A', 'Z', 4)]), 'x', false)).toBe(false);
  });
});

describe('forces: the resultant is the vector sum', () => {
  const P = { name: 'P', x: 0, y: 0 };
  const force = (
    from: string,
    to: string,
    value: number | null,
    resultant = false,
    label: string | null = null,
  ) => ({
    from,
    to,
    value,
    label,
    resultant,
  });
  const forces = (R: { x: number; y: number }, arrows: unknown[]) =>
    geometry({
      points: [P, { name: 'Q', x: 3, y: 0 }, { name: 'S', x: 0, y: 4 }, { name: 'R', ...R }],
      arrows,
    });

  it('adds two forces from one point (parallelogram)', () => {
    const arrows = [force('P', 'Q', 30), force('P', 'S', 40), force('P', 'R', 50, true)];
    expect(figureHolds(forces({ x: 3, y: 4 }, arrows), 'x', false)).toBe(true);
    expect(figureHolds(forces({ x: 3, y: 3 }, arrows), 'x', false)).toBe(false);
  });

  it('adds forces laid head to tail', () => {
    const fig = geometry({
      points: [P, { name: 'Q', x: 3, y: 0 }, { name: 'R', x: 3, y: 4 }],
      arrows: [force('P', 'Q', 30), force('Q', 'R', 40), force('P', 'R', 50, true)],
    });
    expect(figureHolds(fig, 'x', false)).toBe(true);
  });

  it('a resultant with a wrong size breaks the common scale', () => {
    const arrows = [force('P', 'Q', 30), force('P', 'S', 40), force('P', 'R', 70, true)];
    expect(figureHolds(forces({ x: 3, y: 4 }, arrows), 'x', false)).toBe(false);
  });

  it('a resultant of nothing is refused', () => {
    expect(figureHolds(forces({ x: 3, y: 4 }, [force('P', 'R', 50, true)]), 'x', false)).toBe(
      false,
    );
  });

  it('the asked resultant is computed from the forces', () => {
    const arrows = [force('P', 'Q', 30), force('P', 'S', 40), force('P', 'R', null, true, '?')];
    expect(figureHolds(forces({ x: 3, y: 4 }, arrows), '50', true)).toBe(true);
    expect(figureHolds(forces({ x: 3, y: 4 }, arrows), '70', true)).toBe(false);
  });
});

describe('a structural formula', () => {
  const ethanol = (over: Record<string, unknown> = {}): Fig =>
    ItemDraft.shape.figure.parse({
      type: 'molecule',
      style: 'structural',
      atoms: [
        { id: 'a1', el: 'C', h: 3, charge: 0 },
        { id: 'a2', el: 'C', h: 2, charge: 0 },
        { id: 'a3', el: 'O', h: 1, charge: 0 },
      ],
      bonds: [
        { a: 'a1', b: 'a2', order: 1 },
        { a: 'a2', b: 'a3', order: 1 },
      ],
      ...over,
    });

  it('a valid molecule with no declared key holds', () => {
    expect(figureHolds(ethanol(), 'Ethanol', false)).toBe(true);
  });

  it('a molecule whose shells do not hold costs the question', () => {
    const broken = ethanol({
      atoms: [
        { id: 'a1', el: 'C', h: 3, charge: 0 },
        { id: 'a2', el: 'C', h: 2, charge: 0 },
        { id: 'a3', el: 'O', h: 2, charge: 0 },
      ],
    });
    expect(figureHolds(broken, 'Ethanol', false)).toBe(false);
  });

  it('ask: formula — the key is counted, in any order the atoms are written', () => {
    const f = ethanol({ ask: 'formula' });
    expect(figureHolds(f, 'C2H6O', false)).toBe(true);
    expect(figureHolds(f, 'C2H5OH', false)).toBe(true);
    expect(figureHolds(f, '$C_{2}H_{6}O$', false)).toBe(true);
    expect(figureHolds(f, 'C2H4O', false)).toBe(false);
  });

  it('ask: lone_pairs and molar_mass — the key is the computed number', () => {
    expect(figureHolds(ethanol({ ask: 'lone_pairs' }), '2', true)).toBe(true);
    expect(figureHolds(ethanol({ ask: 'lone_pairs' }), '3', true)).toBe(false);
    expect(figureHolds(ethanol({ ask: 'molar_mass' }), '46', true)).toBe(true);
    expect(figureHolds(ethanol({ ask: 'molar_mass' }), '46,07', true)).toBe(true);
    expect(figureHolds(ethanol({ ask: 'molar_mass' }), '44', true)).toBe(false);
  });

  it('a marked group must be a functional group', () => {
    expect(figureHolds(ethanol({ mark: ['a3'] }), 'Hydroxygruppe', false)).toBe(true);
    expect(figureHolds(ethanol({ mark: ['a2'] }), 'Hydroxygruppe', false)).toBe(false);
  });
});

describe('usableItems drops a question whose figure contradicts it', () => {
  const item = (over: Record<string, unknown>) =>
    ItemDraft.parse({
      kind: 'numeric',
      prompt: 'Wie groß ist der Winkel γ?',
      answer: '70',
      accepted_answers: [],
      unit: '°',
      choices: null,
      correct_choice: null,
      topic: 'Winkelsumme',
      difficulty: 2,
      source_excerpt: null,
      ...over,
    });
  const fig = (gamma: string) => ({
    type: 'geometry',
    points: triangle(50, 60),
    segments: [],
    polygons: [['A', 'B', 'C']],
    circles: [],
    angles: [angle('BAC', 50), angle('ABC', 60), angle('ACB', null, gamma)],
  });

  it('keeps the right one and drops the wrong key', () => {
    expect(usableItems([item({ figure: fig('?') })])).toHaveLength(1);
    expect(usableItems([item({ figure: fig('?'), answer: '80' })])).toHaveLength(0);
  });

  it('checks a multiple-choice key through its right option', () => {
    const mc = (correct: number) =>
      item({
        kind: 'multiple_choice',
        answer: correct === 1 ? '70°' : '60°',
        unit: null,
        choices: ['60°', '70°', '80°'],
        correct_choice: correct,
        figure: fig('?'),
      });
    expect(usableItems([mc(1)])).toHaveLength(1);
    expect(usableItems([mc(0)])).toHaveLength(0);
  });

  it('a figure stored before #257 (no angles, no arrows) still parses', () => {
    const old = item({
      kind: 'short',
      answer: 'gleichschenklig',
      unit: null,
      figure: {
        type: 'geometry',
        points: triangle(50, 60),
        segments: [],
        polygons: [['A', 'B', 'C']],
        circles: [],
      },
    });
    const [kept] = usableItems([old]);
    expect(kept?.figure).toMatchObject({ type: 'geometry', angles: [], arrows: [], lines: [] });
  });
});
