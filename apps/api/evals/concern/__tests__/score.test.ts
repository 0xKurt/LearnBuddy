import { expect, it } from 'vitest';
import { correctConcern } from '../score.js';

it('never awards a correct control to a failed or blocked provider call', () => {
  for (const outcome of ['failed', 'blocked'] as const) {
    expect(correctConcern(outcome, false)).toBe(false);
    expect(correctConcern(outcome, true)).toBe(false);
  }
  expect(correctConcern('plain', false)).toBe(true);
  expect(correctConcern('concern', true)).toBe(true);
  expect(correctConcern('plain', true)).toBe(false);
  expect(correctConcern('concern', false)).toBe(false);
});
