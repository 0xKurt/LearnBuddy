// Antippen in einer Figur (issue #248), Regel 0 in both directions: a key that is not on a place
// she can tap is never stored, and her tap is compared with the key exactly — with the reply
// naming what is already right. Every rejection is reached through `structuredItem`, the
// function generation and the photo reading use.

import { StructuredTask, type FigureTapTask } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { figureTapTaskFrom, type FigureTapDraft } from '../figureTap.js';
import {
  answerTextOf,
  checkStructured,
  solutionOf,
  structuredItem,
  structuredNamesPart,
  structuredReply,
  structuredTaskOf,
  viewOf,
} from '../structured.js';

const META = { topic: 'Koordinaten', difficulty: 2, prompt_lang: null } as const;
const NONE = { plane: null, number_line: null, bars: null, clock: null, map: null };

function plane(
  key: { x: number; y: number },
  extra: Partial<NonNullable<FigureTapDraft['plane']>> = {},
): FigureTapDraft {
  return {
    type: 'figure_tap',
    prompt: 'Tippe den Punkt P(2 | −1) an.',
    ...NONE,
    plane: { x_min: -4, x_max: 4, y_min: -3, y_max: 3, step: 1, marks: [], key, ...extra },
  };
}

function built(draft: FigureTapDraft): FigureTapTask {
  const task = figureTapTaskFrom(draft);
  if (typeof task === 'string') throw new Error(`rejected: ${task}`);
  return task;
}

describe('figure_tap: what the model wrote (Regel 0)', () => {
  it('stores a point that lies on the grid, and keeps the key out of the view', () => {
    const item = structuredItem({ ...plane({ x: 2, y: -1 }), ...META });
    expect(item?.kind).toBe('figure_tap');
    expect(item?.answer).toBe('(2 | −1)');
    const view = viewOf(item!.task);
    expect(JSON.stringify(view)).not.toContain('key');
    expect(view).toEqual({ type: 'figure_tap', figure: (item!.task as FigureTapTask).figure });
  });

  it('rejects a key between grid points or outside the plane — nobody could tap it', () => {
    expect(figureTapTaskFrom(plane({ x: 2.5, y: -1 }))).toBe('off_grid');
    expect(figureTapTaskFrom(plane({ x: 5, y: 0 }))).toBe('off_grid');
    expect(structuredItem({ ...plane({ x: 2.5, y: -1 }), ...META })).toBeNull();
  });

  it('rejects a grid that is no grid or does not fit a phone', () => {
    expect(figureTapTaskFrom(plane({ x: 0, y: 0 }, { x_max: 4.3 }))).toBe('grid');
    expect(figureTapTaskFrom(plane({ x: 0, y: 0 }, { x_min: -30, x_max: 30 }))).toBe('grid');
    expect(figureTapTaskFrom(plane({ x: 0, y: 0 }, { x_min: 0, x_max: 1 }))).toBe('grid');
    // Lines at the multiples of the step, so the numbers on the axes are round.
    expect(figureTapTaskFrom(plane({ x: 1.5, y: 0 }, { x_min: -3.5, x_max: 4.5 }))).toBe('grid');
  });

  it('rejects a picture that shows its own answer', () => {
    const shown = plane({ x: 2, y: -1 }, { marks: [{ x: 2, y: -1, label: 'P' }] });
    expect(figureTapTaskFrom(shown)).toBe('given_away');
    // One of several drawn points is a fair question ("Welcher Punkt liegt auf der Geraden?").
    const among = plane(
      { x: 2, y: -1 },
      {
        marks: [
          { x: 2, y: -1, label: 'A' },
          { x: 1, y: 1, label: 'B' },
        ],
      },
    );
    expect(typeof figureTapTaskFrom(among)).toBe('object');
  });

  it('wants exactly one figure', () => {
    expect(
      figureTapTaskFrom({ ...plane({ x: 1, y: 1 }), clock: { snap: 5, key: { h: 3, m: 0 } } }),
    ).toBe('figure_form');
    expect(figureTapTaskFrom(NONE)).toBe('figure_form');
  });

  it('number line: the key on a snap mark; the snap an even part of the step', () => {
    const line = (key: number, snap = 0.5, step = 1): FigureTapDraft => ({
      type: 'figure_tap',
      prompt: 'Wo liegt −1,5?',
      ...NONE,
      number_line: { min: -3, max: 3, step, snap, marks: [], key },
    });
    expect(typeof figureTapTaskFrom(line(-1.5))).toBe('object');
    expect(figureTapTaskFrom(line(-1.25))).toBe('off_grid');
    expect(figureTapTaskFrom(line(-1.5, 0.3))).toBe('grid');
    // 6 ticks × 100 parts: more places than one line on a phone.
    expect(figureTapTaskFrom(line(-1.5, 0.01))).toBe('grid');
  });

  it('bars: the key names one bar, and "the highest" is checked, not believed', () => {
    const chart = (key: string, extreme: 'max' | 'min' | null): FigureTapDraft => ({
      type: 'figure_tap',
      prompt: 'Tippe den Monat mit dem meisten Regen an.',
      ...NONE,
      bars: {
        bars: [
          { label: 'Jan', value: 40 },
          { label: 'Feb', value: 55 },
          { label: 'Mär', value: 30 },
        ],
        unit: 'mm',
        key,
        extreme,
      },
    });
    const ok = built(chart('Feb', 'max'));
    expect(ok.key).toEqual({ kind: 'bars', id: 'b' });
    expect(figureTapTaskFrom(chart('Jan', 'max'))).toBe('not_extreme');
    expect(figureTapTaskFrom(chart('Mär', 'min'))).not.toBe('not_extreme');
    expect(figureTapTaskFrom(chart('Apr', null))).toBe('bar_key');
  });

  it('clock: a time the hands can stand on', () => {
    const clock = (h: number, m: number, snap = 5): FigureTapDraft => ({
      type: 'figure_tap',
      prompt: 'Stell die Uhr auf Viertel nach drei.',
      ...NONE,
      clock: { snap, key: { h, m } },
    });
    expect(built(clock(3, 15)).key).toEqual({ kind: 'clock', h: 3, m: 15 });
    // 15:15 on a face is 3:15.
    expect(built(clock(15, 15)).key).toEqual({ kind: 'clock', h: 3, m: 15 });
    expect(figureTapTaskFrom(clock(3, 17))).toBe('off_grid');
    expect(figureTapTaskFrom(clock(3, 15, 1))).toBe('grid');
  });

  it('a stored task that no longer passes is no task', () => {
    const task = built(plane({ x: 2, y: -1 }));
    const broken = { ...task, key: { kind: 'plane', x: 2.5, y: -1 } };
    expect(StructuredTask.safeParse(broken).success).toBe(true);
    expect(structuredTaskOf(broken, 'figure_tap')).toBeNull();
    expect(structuredTaskOf(task, 'figure_tap')).toEqual(task);
  });
});

describe('figure_tap: her tap (Regel 0)', () => {
  const task = built(plane({ x: 2, y: -1 }));
  const tap = (x: number, y: number) =>
    checkStructured(task, { type: 'figure_tap', value: { kind: 'plane', x, y } });

  it('the right point is right', () => {
    expect(tap(2, -1)?.correct).toBe(true);
    // Floating point is not a different point.
    expect(tap(2 + 1e-9, -1)?.correct).toBe(true);
  });

  it('a wrong point says what is right already, and catches x and y swapped', () => {
    expect(structuredReply('de', tap(2, 1)!)).toContain('x-Koordinate stimmt');
    expect(structuredReply('de', tap(1, -1)!)).toContain('y-Koordinate stimmt');
    expect(structuredReply('de', tap(-1, 2)!)).toContain('vertauscht');
    expect(structuredReply('de', tap(0, 0)!)).toContain('Noch nicht der richtige Punkt');
  });

  it('a tap that is not on the figure is refused, never graded', () => {
    expect(tap(2.5, -1)).toBeNull();
    expect(tap(9, 0)).toBeNull();
    expect(
      checkStructured(task, { type: 'figure_tap', value: { kind: 'clock', h: 3, m: 0 } }),
    ).toBeNull();
    expect(checkStructured(task, { type: 'order', order: ['a', 'b', 'c'] })).toBeNull();
  });

  it('a number line says the direction only from the second miss on — as help', () => {
    const line = built({
      type: 'figure_tap',
      prompt: 'Wo liegt 1,5?',
      ...NONE,
      number_line: { min: -3, max: 3, step: 1, snap: 0.5, marks: [], key: 1.5 },
    });
    const miss = checkStructured(line, {
      type: 'figure_tap',
      value: { kind: 'number_line', value: 0.5 },
    })!;
    expect(miss.correct).toBe(false);
    expect(structuredReply('de', miss, 0)).toContain('zähl die Schritte');
    expect(structuredNamesPart(miss, 0)).toBe(false);
    expect(structuredReply('de', miss, 1)).toBe('Die gesuchte Stelle liegt weiter rechts.');
    expect(structuredNamesPart(miss, 1)).toBe(true);
  });

  it('a clock says which hand is right already', () => {
    const clock = built({
      type: 'figure_tap',
      prompt: 'Stell 3:15 ein.',
      ...NONE,
      clock: { snap: 5, key: { h: 3, m: 15 } },
    });
    const at = (h: number, m: number) =>
      checkStructured(clock, { type: 'figure_tap', value: { kind: 'clock', h, m } });
    expect(at(3, 15)?.correct).toBe(true);
    expect(structuredReply('de', at(3, 45)!)).toContain('Die Stunde stimmt');
    expect(structuredReply('de', at(4, 15)!)).toContain('Die Minuten stimmen');
    expect(at(3, 16)).toBeNull();
  });

  it('her answer and the solution read as words, in her language', () => {
    expect(answerTextOf(task, { type: 'figure_tap', value: { kind: 'plane', x: 1, y: -1 } })).toBe(
      '(1 | −1)',
    );
    expect(solutionOf(task, 'en')).toBe('(2, −1)');
    const half = built(plane({ x: 1.5, y: 0.5 }, { step: 0.5 }));
    expect(solutionOf(half, 'de')).toBe('(1,5 | 0,5)');
  });
});
