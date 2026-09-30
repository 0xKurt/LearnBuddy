// The keyboard overlap: the number that decides whether a screen pads itself (#141).

import { describe, expect, it } from 'vitest';

import { keyboardOverlap } from '../keyboard.js';

describe('how much the keyboard really covers', () => {
  it('is nothing while the keyboard is closed', () => {
    expect(keyboardOverlap(0, 800, 800)).toBe(0);
  });

  it('is the full height when the window keeps its size (edge-to-edge, #141)', () => {
    expect(keyboardOverlap(320, 800, 800)).toBe(320);
  });

  it('is nothing when the window shrank by itself (adjustResize, #46)', () => {
    expect(keyboardOverlap(320, 800, 480)).toBe(0);
  });

  it('is only the rest when the window shrank part of the way', () => {
    expect(keyboardOverlap(320, 800, 600)).toBe(120);
  });

  it('never turns a taller view into negative padding', () => {
    // A rotation or split screen between the two measurements.
    expect(keyboardOverlap(320, 400, 800)).toBe(320);
  });

  it('stays at nothing before the first measurement', () => {
    expect(keyboardOverlap(320, 0, 0)).toBe(0);
  });
});
