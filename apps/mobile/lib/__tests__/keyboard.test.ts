// The keyboard overlap: the number that decides whether a screen pads itself (#141).

import { describe, expect, it } from 'vitest';

import {
  answerFolds,
  COMPACT_BELOW,
  TIGHT_BELOW,
  formDensity,
  keyboardOverlap,
  visibleHeight,
} from '../keyboard.js';

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

// Issue #289: the welcome form stayed roomy with the keyboard up, because its layout read the
// window's height — which edge-to-edge Android keeps while she types (POCO X3: 873 dp window,
// ~306 dp keyboard, ~567 dp left). The decision belongs to what is visible.
describe('how dense a form screen lays itself out', () => {
  it('is roomy on a tall phone with the keyboard closed', () => {
    expect(formDensity(873, 0)).toBe('roomy');
  });

  it('is dense on the same phone once the keyboard covers part of it (#289)', () => {
    // The window kept its 873: what decides is the 567 she can still see — only the form
    // itself fits there.
    const overlap = keyboardOverlap(306, 873, 873);
    expect(visibleHeight(873, overlap)).toBe(567);
    expect(formDensity(873, overlap)).toBe('tight');
  });

  it('counts the keyboard once where the window shrank by itself (adjustResize, #46)', () => {
    // Window 873 → 567 with the keyboard up: the overlap is 0, the 567 alone decides.
    const overlap = keyboardOverlap(306, 873, 567);
    expect(overlap).toBe(0);
    expect(visibleHeight(567, overlap)).toBe(567);
    expect(formDensity(567, overlap)).toBe('tight');
  });

  it('is compact on a small phone, tight on it with the keyboard up (360×740, #55)', () => {
    expect(formDensity(740, 0)).toBe('compact');
    expect(formDensity(740, 300)).toBe('tight');
  });

  it('is tight on every phone the walkthrough measures, with the keyboard up', () => {
    // tests/web/visible.spec.ts: the same three sizes, the window less the keyboard.
    expect(formDensity(844, 336)).toBe('tight');
    expect(formDensity(740, 300)).toBe('tight');
  });

  it('keeps each boundary in one place', () => {
    expect(formDensity(COMPACT_BELOW, 0)).toBe('roomy');
    expect(formDensity(COMPACT_BELOW - 1, 0)).toBe('compact');
    expect(formDensity(COMPACT_BELOW + 100, 101)).toBe('compact');
    expect(formDensity(TIGHT_BELOW, 0)).toBe('compact');
    expect(formDensity(TIGHT_BELOW - 1, 0)).toBe('tight');
  });

  it('never makes a negative height of a keyboard taller than the window', () => {
    expect(visibleHeight(400, 900)).toBe(0);
    expect(visibleHeight(400, -20)).toBe(400);
  });
});

describe('the answer while she asks (issue #402)', () => {
  it('folds only while her question has the focus and the keyboard leaves a tight screen', () => {
    expect(answerFolds(true, 740, 300)).toBe(true);
    expect(answerFolds(false, 740, 300)).toBe(false);
    expect(answerFolds(true, 740, 0)).toBe(false);
  });
});
