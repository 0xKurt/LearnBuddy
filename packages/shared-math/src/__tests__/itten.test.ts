// Itten's colour wheel (issue #261): complements are the field opposite, mixtures the field
// between two primaries or a primary and its neighbouring secondary, classes by place — never a
// colour-space calculation (Itten's complement of red is green, not cyan).

import { describe, expect, it } from 'vitest';

import {
  colorWheelKey,
  colorWheelProblem,
  complementOf,
  hueClass,
  ITTEN_HUES,
  mixOf,
  type ColorWheel,
  type Hue,
} from '../itten.js';

const wheel = (ask: ColorWheel['ask'], at: Hue[], hl: Hue[] = []): ColorWheel => ({
  type: 'color_wheel',
  hl,
  ask,
  at,
});

describe("Itten's wheel", () => {
  it('complementary pairs are opposite each other', () => {
    expect(complementOf('red')).toBe('green');
    expect(complementOf('yellow')).toBe('violet');
    expect(complementOf('blue')).toBe('orange');
    expect(complementOf('yellow_orange')).toBe('blue_violet');
    expect(complementOf('red_orange')).toBe('blue_green');
    expect(complementOf('red_violet')).toBe('yellow_green');
    for (const h of ITTEN_HUES) expect(complementOf(complementOf(h))).toBe(h);
  });

  it('mixtures: two primaries, or a primary and its neighbouring secondary', () => {
    expect(mixOf('yellow', 'red')).toBe('orange');
    expect(mixOf('red', 'blue')).toBe('violet');
    expect(mixOf('blue', 'yellow')).toBe('green');
    expect(mixOf('yellow', 'blue')).toBe('green');
    expect(mixOf('yellow', 'orange')).toBe('yellow_orange');
    expect(mixOf('orange', 'red')).toBe('red_orange');
    expect(mixOf('green', 'blue')).toBe('blue_green');
    expect(mixOf('yellow', 'green')).toBe('yellow_green');
    // Not a mixture the wheel shows.
    expect(mixOf('orange', 'violet')).toBeNull();
    expect(mixOf('red', 'green')).toBeNull();
    expect(mixOf('red', 'red')).toBeNull();
    expect(mixOf('yellow', 'red_orange')).toBeNull();
  });

  it('primaries, secondaries, tertiaries by place', () => {
    expect(ITTEN_HUES.filter((h) => hueClass(h) === 'primary')).toEqual(['yellow', 'red', 'blue']);
    expect(ITTEN_HUES.filter((h) => hueClass(h) === 'secondary')).toEqual([
      'orange',
      'violet',
      'green',
    ]);
    expect(ITTEN_HUES.filter((h) => hueClass(h) === 'tertiary')).toHaveLength(6);
  });

  it('keys and rules', () => {
    expect(colorWheelKey(wheel('complement', ['red']))).toEqual({ kind: 'hue', hue: 'green' });
    expect(colorWheelKey(wheel('mix', ['blue', 'yellow']))).toEqual({ kind: 'hue', hue: 'green' });
    expect(colorWheelKey(wheel('class', ['orange']))).toEqual({ kind: 'class', index: 1 });
    expect(colorWheelProblem(wheel('mix', ['orange', 'violet']))).toBe('ask');
    expect(colorWheelProblem(wheel('complement', ['red', 'blue']))).toBe('ask');
    expect(colorWheelProblem(wheel('none', ['red']))).toBe('ask');
    expect(colorWheelProblem(wheel('none', [], ['red', 'red']))).toBe('marks');
    expect(colorWheelProblem(wheel('none', [], ['red', 'green']))).toBeNull();
  });
});
