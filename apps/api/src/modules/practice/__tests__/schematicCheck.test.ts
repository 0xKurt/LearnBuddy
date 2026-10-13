// The picture library as the model is told it (issues #252, #462, #599): the contract offers
// exactly the pictures the library has, a part a finger cannot hit is marked "*", and a part an
// image does not show is not offered at all. And the anchor data the server decides with, held to
// its shape with zod; and a stored question read back through the check it was written under.

import {
  FIGURE_NAMES,
  SCHEMATIC_ANCHORS,
  SCHEMATIC_IDS,
  SCHEMATIC_IMAGE_IDS,
  schematic,
  schematicFrame,
} from '@learnbuddy/shared-math';
import { SCHEMATIC_DRAWINGS, type Figure } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { FIGURE_RULES, storedFigure, storedQuestionFigure } from '../items.js';
import { checkedSchematic, SCHEMATIC_PARTS, stalePicture } from '../schematicCheck.js';

const partsOf = (d: string) =>
  SCHEMATIC_PARTS.split('; ')
    .find((line) => line.startsWith(`${d}: `))
    ?.slice(d.length + 2)
    .split(', ');

describe('the library in the model’s rules', () => {
  it('offers exactly the drawings the library has, in its order', () => {
    expect([...SCHEMATIC_DRAWINGS]).toEqual(SCHEMATIC_IDS);
  });

  it('marks a part a tap area does not cover, or too close to the next: named, never tapped', () => {
    expect(partsOf('eye')).toContain('Pupille*');
    expect(partsOf('eye')).toContain('Sehnerv');
    expect(partsOf('skeleton')).toContain('Wadenbein*');
    expect(partsOf('skeleton')).toContain('Schädel');
    // Drawn twice, going on elsewhere (#599 review): the lungs, the colon, the myelin.
    expect(partsOf('breathing')).toContain('Lunge*');
    expect(partsOf('breathing')).toContain('Luftröhre');
    // Lying against a neighbour, so that two finger-wide areas cannot both sit on their own.
    expect(partsOf('digestion')).toContain('Bauchspeicheldrüse*');
    expect(partsOf('digestion')).toContain('Magen');
    expect(partsOf('microscope')).toContain('Feintrieb*');
    expect(partsOf('digestion')).toContain('Dickdarm*');
    expect(partsOf('neuron')).toContain('Myelinscheide*');
    expect(partsOf('flower_section')).toContain('Staubblatt*');
    expect(partsOf('flower_section')).toContain('Narbe');
    // The circuit is still drawn: its parts are decided by their outlines, as before.
    expect(partsOf('circuit')?.map((p) => p.replace('*', ''))).toEqual([
      'Kabel',
      'Batterie',
      'Lampenfassung',
      'Glühlampe',
      'Schalter',
    ]);
  });

  it('offers no part an image does not show — the list follows the library (#599)', () => {
    expect(partsOf('plant')?.map((p) => p.replace('*', ''))).toEqual([
      'Sprossachse',
      'Blatt',
      'Blüte',
    ]);
    expect(partsOf('bicycle')?.map((p) => p.replace('*', ''))).toEqual([
      'Hinterrad',
      'Vorderrad',
      'Kette',
      'Rahmen',
      'Pedal',
      'Sattel',
      'Lenker',
      'Bremse',
    ]);
    for (const gone of ['Nieren', 'Punktaugen', 'Leitbündel', 'Klingel', 'Rücklicht', 'Wurzel']) {
      expect(SCHEMATIC_PARTS, gone).not.toContain(gone);
    }
    expect(partsOf('distillation')?.join()).not.toMatch(/Stativ|Bunsenbrenner/);
    // The rules the model reads are written from that list.
    expect(FIGURE_RULES).toContain(SCHEMATIC_PARTS);
  });
});

describe('the anchors the server decides with (#599)', () => {
  const xy = z.tuple([z.number(), z.number()]);
  const Anchor = z.strictObject({
    id: z.string().min(1),
    at: xy,
    badge: xy,
    // Null: named only — no tap area, no tap question.
    tap: z
      .tuple([z.number().min(0), z.number().min(0), z.number().min(42), z.number().min(42)])
      .nullable(),
  });

  it('every image has anchors of the right shape, one per part, inside its frame', () => {
    const data = z
      .strictObject(Object.fromEntries(SCHEMATIC_IMAGE_IDS.map((d) => [d, z.array(Anchor).min(3)])))
      .parse(SCHEMATIC_ANCHORS);
    for (const d of SCHEMATIC_IMAGE_IDS) {
      const { width, height } = schematicFrame(d);
      // Every part that can be asked has its anchor, and no anchor names a part the library lacks.
      expect(data[d]?.map((a) => a.id)).toEqual(schematic(FIGURE_NAMES, d).parts.map((p) => p.id));
      for (const a of data[d] ?? []) {
        if (!a.tap) continue;
        const [x, y, w, h] = a.tap;
        expect(x + w <= width && y + h <= height, `${d}.${a.id}`).toBe(true);
      }
    }
  });
});

describe('a stored question read back (#599)', () => {
  const bicycle = (n: string[], ask: number) => ({ type: 'schematic', d: 'bicycle', n, ask });
  const row = (answer: string, figure: unknown, tap = false) => ({
    kind: 'short',
    answer,
    figure,
    tap,
  });

  it('is stale when it names a part its picture no longer has — as a number, as its key, to tap', () => {
    // As stored while the bicycle was a drawing with a bell.
    expect(stalePicture(row('Klingel', bicycle(['bell', 'saddle'], 1)))).toBe(true);
    expect(stalePicture(row('Sattel', bicycle(['bell', 'saddle'], 2)))).toBe(true);
    expect(stalePicture(row('Klingel', bicycle([], 0), true))).toBe(true);
    // A part that was tapped in the drawing and has no tap area in the image: both lungs are
    // drawn, the pelvis is larger than an area.
    const tapOn = (d: string, answer: string) =>
      row(answer, { type: 'schematic', d, n: [], ask: 0 }, true);
    expect(stalePicture(tapOn('skeleton', 'Becken'))).toBe(true);
    expect(stalePicture(tapOn('breathing', 'Lunge'))).toBe(true);
    expect(stalePicture(tapOn('bicycle', 'Rahmen'))).toBe(true);
    // The same part asked by its number still holds.
    expect(
      stalePicture(row('Lunge', { type: 'schematic', d: 'breathing', n: ['lungs'], ask: 1 })),
    ).toBe(false);
  });

  it('holds when every part it names is one the image shows', () => {
    expect(stalePicture(row('Sattel', bicycle(['saddle', 'chain'], 1)))).toBe(false);
    expect(stalePicture(row('Sattel', bicycle([], 0), true))).toBe(false);
    // No picture, or a figure of another kind: never stale.
    expect(stalePicture(row('4', null))).toBe(false);
    expect(
      stalePicture(row('4', { type: 'number_line', min: 0, max: 5, step: 1, points: [] })),
    ).toBe(false);
  });

  it('is shown without its picture — never with the other parts renumbered', () => {
    const stale = bicycle(['bell', 'saddle'], 2);
    expect(storedFigure(stale)).toBeNull();
    expect(storedQuestionFigure(row('Sattel', stale))).toBeNull();
    // The picture alone is fine, the question about it is not: no picture beside "Tippe auf die Klingel".
    expect(storedFigure(bicycle([], 0))).not.toBeNull();
    expect(storedQuestionFigure(row('Klingel', bicycle([], 0), true))).toBeNull();
    // A question that holds keeps its picture as stored.
    const fine = bicycle(['saddle', 'chain'], 1);
    expect(storedQuestionFigure(row('Sattel', fine))).toEqual(fine);
  });

  it('a new question that names such a part is dropped, like one that never had it', () => {
    const draft = (answer: string, figure: unknown, tap = false) =>
      checkedSchematic({ kind: 'short', answer, figure: figure as Figure, tap });
    expect(draft('Klingel', bicycle(['Klingel', 'Sattel'], 1))).toBeNull();
    expect(draft('Sattel', bicycle(['Klingel', 'Sattel'], 2))).toBeNull();
    expect(draft('Klingel', bicycle([], 0), true)).toBeNull();
    expect(draft('Sattel', bicycle(['Sattel', 'Kette'], 1))?.figure).toEqual(
      bicycle(['saddle', 'chain'], 1),
    );
  });
});
