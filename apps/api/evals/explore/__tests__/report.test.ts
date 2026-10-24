import { expect, it } from 'vitest';
import { canPromote, dedupe, economics, gate } from '../report.js';
import { finding } from '../checks.js';
import { calibration } from '../judge.js';
import { Action, PERSONAS } from '../actor.js';

it('deduplicates by invariant, kind and route rather than wording', () => {
  expect(
    dedupe([finding('x', 'first'), finding('x', 'second'), finding('x', 'third', 'vocab')]),
  ).toHaveLength(2);
});
it('cannot green an empty, interrupted or incompletely replayed mandatory run', () => {
  expect(gate(0, 0, [], null, true)).toBe(false);
  expect(gate(24, 23, [], null, true)).toBe(false);
  expect(gate(24, 24, [], 'time limit', true)).toBe(false);
  expect(gate(24, 24, [], null, false)).toBe(false);
  expect(gate(24, 24, [finding('x', 'proof')], null, true)).toBe(false);
  expect(gate(24, 24, [], null, true)).toBe(true);
});
it('does not promote unreviewed or single-reviewer candidates', () => {
  expect(canPromote({ expectationVerified: false, human: 'owner', reviewers: [] })).toBe(false);
  expect(canPromote({ expectationVerified: true, human: null, reviewers: ['a', 'a'] })).toBe(false);
  expect(canPromote({ expectationVerified: true, human: null, reviewers: ['a', 'b'] })).toBe(true);
  expect(canPromote({ expectationVerified: true, human: 'owner', reviewers: [] })).toBe(true);
});
it('never invents human calibration and measures held-out false alarms and misses', () => {
  expect(calibration([])).toMatchObject({ ready: false, falseAlarmRate: null, missRate: null });
  const labels = Array.from({ length: 30 }, (_, i) => ({
    id: `train-${i}`,
    split: 'calibration',
    reviewer: 'test-fixture',
    labelledAt: '2026-10-24T10:00:00Z',
    acceptable: true,
    judgeAcceptable: true,
  }));
  const held = [
    { id: 'good', acceptable: true, judgeAcceptable: false },
    { id: 'bad', acceptable: false, judgeAcceptable: true },
  ].map((l) => ({
    ...l,
    split: 'holdout',
    reviewer: 'test-fixture',
    labelledAt: '2026-10-24T10:00:00Z',
  }));
  expect(calibration([...labels, ...held])).toMatchObject({
    ready: true,
    falseAlarmRate: 1,
    missRate: 1,
  });
  expect(() => calibration([...labels, labels[0]])).toThrow('Overlapping');
});
it('validates structured actions and bounds', () => {
  expect(Action.safeParse({ type: 'tap', offer: -1, double: false }).success).toBe(false);
  expect(Action.safeParse({ type: 'sql', query: 'read hidden state' }).success).toBe(false);
  expect(PERSONAS).toHaveLength(8);
});
it('computes findings per euro from a dated conversion input, excludes simulator failures', () => {
  const app = finding('x', 'proof');
  expect(
    economics([app, app, { ...finding('y', 'bad actor'), category: 'simulator' }], 1, 1.2, 1.2),
  ).toMatchObject({ confirmed: 1, costEuro: 1, confirmedPerEuro: 1 });
  expect(economics([], 0, 0, 1.2).confirmedPerEuro).toBeNull();
  expect(() => economics([], 0, 0, 0)).toThrow('positive');
});
