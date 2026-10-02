// Where the library figures put their places (issues #250, #252, #261): every pin a 44 pt target
// that no other pin overlaps, every drawing with all its parts inside the box of a 360×740 phone,
// the main-group table directly tappable and the full one magnified, the wheel's twelve fields
// and a circuit's lamps found where they are drawn.

import {
  ELEMENTS,
  SCHEMATIC_IDS,
  SCHEMATICS,
  pinOrder,
  type Circuit,
} from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import {
  cellAt,
  circuitLayout,
  lampAt,
  periodicFrame,
  periodicNeedsZoom,
  periodicZoom,
  PT_TAP_MIN,
  wheelFieldAt,
  wheelLines,
  wheelWord,
} from '../library.js';
import { PIN, pinAt, pinLayout } from '../pins.js';

/** The figure's room on a 360×740 phone with the question above it, and on a 390×844 one. */
const BOXES = [
  { width: 328, height: 300 },
  { width: 358, height: 380 },
];

describe('schematic pins (#252)', () => {
  it.each(SCHEMATIC_IDS)('%s: all its parts fit, 44 pt apart, numbered in pin order', (id) => {
    const parts = Object.keys(SCHEMATICS[id].parts);
    for (const box of BOXES) {
      const l = pinLayout(id, parts, box);
      expect(l.pins.map((p) => p.id)).toEqual(pinOrder(id, parts));
      expect(l.pins.map((p) => p.n)).toEqual(parts.map((_, i) => i + 1));
      // Never more than the box gives, in either direction.
      expect(l.width).toBeLessThanOrEqual(box.width);
      expect(l.height).toBeLessThanOrEqual(box.height + 1);
      for (const p of l.pins) {
        expect(p.x - PIN / 2).toBeGreaterThanOrEqual(-0.01);
        expect(p.x + PIN / 2).toBeLessThanOrEqual(l.width + 0.01);
        expect(p.y - PIN / 2).toBeGreaterThanOrEqual(-0.01);
        expect(p.y + PIN / 2).toBeLessThanOrEqual(l.height + 0.01);
        // The part's point is on the drawing.
        expect(p.ax).toBeGreaterThanOrEqual(l.art.x - 0.01);
        expect(p.ax).toBeLessThanOrEqual(l.art.x + 100 * l.art.scale + 0.01);
        // A tap on the pin is that pin.
        expect(pinAt(l, p.x, p.y)?.id).toBe(p.id);
      }
      for (const a of l.pins)
        for (const b of l.pins)
          if (a !== b)
            expect(Math.hypot(a.x - b.x, a.y - b.y), `${a.id}–${b.id}`).toBeGreaterThanOrEqual(PIN);
    }
  });
});

describe('periodic table (#250)', () => {
  it('main groups: eight columns tapped directly on a 360 pt phone, every element found', () => {
    const f = periodicFrame('main', 328, 300);
    expect(periodicNeedsZoom(f)).toBe(false);
    expect(f.cellW).toBeGreaterThanOrEqual(39);
    // A cell's whole area is the target: at least that of a 44 pt square.
    expect(f.cellW * f.cellH).toBeGreaterThanOrEqual(PIN * PIN * 0.8);
    // H and He, then eight in each of periods 2–6.
    expect(f.cells).toHaveLength(42);
    for (const c of f.cells) expect(cellAt(f, c.x + c.w / 2, c.y + c.h / 2)?.id).toBe(c.id);
  });

  it('the full table is magnified on the first tap, then every column is a finger wide', () => {
    const f = periodicFrame('full', 328, 300);
    expect(periodicNeedsZoom(f)).toBe(true);
    expect(f.cells.length).toBe(ELEMENTS.length);
    const cu = f.cells.find((c) => c.id === 'cu')!;
    const z = periodicFrame('full', 328, 300, periodicZoom(f, cu.x + cu.w / 2));
    expect(periodicNeedsZoom(z)).toBe(false);
    expect(z.cellW).toBeGreaterThanOrEqual(PT_TAP_MIN);
    const zc = z.cells.find((c) => c.id === 'cu');
    expect(zc, 'the aimed-at element stays in the magnified window').toBeTruthy();
    expect(cellAt(z, zc!.x + zc!.w / 2, zc!.y + zc!.h / 2)?.id).toBe('cu');
    // The window never runs off either end of the table.
    const left = periodicZoom(f, 0);
    const right = periodicZoom(f, 327);
    expect(left.c0).toBe(0);
    expect(right.c1).toBe(18);
  });
});

describe('colour wheel (#261)', () => {
  it('twelve fields clockwise from yellow at the top; the middle is no field', () => {
    const size = 300;
    const c = size / 2;
    expect(wheelFieldAt(size, c, 10, 40)).toBe(0);
    expect(wheelFieldAt(size, size - 10, c, 40)).toBe(3);
    expect(wheelFieldAt(size, c, size - 10, 40)).toBe(6);
    expect(wheelFieldAt(size, 10, c, 40)).toBe(9);
    expect(wheelFieldAt(size, c, c, 40)).toBeNull();
    expect(wheelFieldAt(size, 0, 0, 40)).toBeNull();
  });

  it('a name breaks where it says, and reads as one word in a sentence', () => {
    expect(wheelLines('Blau|violett')).toEqual(['Blau', 'violett']);
    expect(wheelWord('Blau|violett')).toBe('Blauviolett');
    expect(wheelWord('azul |violáceo')).toBe('azul violáceo');
    expect(wheelWord('blue-|violet')).toBe('blue-violet');
  });
});

describe('circuit (#261)', () => {
  const lamp = (id: string) => ({ id, part: 'lamp' as const, ohm: null, open: false });
  const c: Circuit = {
    voltage: 6,
    blocks: [
      { branches: [[lamp('l1')]] },
      {
        branches: [[lamp('l2'), { id: 's1', part: 'switch', ohm: null, open: true }], [lamp('l3')]],
      },
    ],
    meter: null,
  };

  it('draws within the width and finds every lamp where it is drawn', () => {
    for (const w of [328, 358]) {
      const l = circuitLayout(c, w);
      expect(l.right).toBeLessThanOrEqual(w);
      for (const p of l.parts) {
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(w);
        if (p.part.part === 'lamp') expect(lampAt(l, p.x, p.y)).toBe(p.part.id);
      }
      // Parts are a finger apart.
      const xs = l.parts.filter((p) => p.y === l.top).map((p) => p.x);
      for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(PIN);
      // A tap far from every lamp is no lamp.
      expect(lampAt(l, 2, 2)).toBeNull();
    }
  });
});
