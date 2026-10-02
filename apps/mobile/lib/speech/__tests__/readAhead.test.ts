import { describe, expect, it } from 'vitest';

import { followingQuestion, verdictsToHaveReady } from '../readAhead.js';

const run = (statuses: string[], extra: Partial<{ status: string; mode: string }> = {}) => ({
  status: 'active',
  mode: 'practice',
  current_item_id: null,
  items: statuses.map((status, n) => ({ item: { id: `q${n + 1}` }, status })),
  ...extra,
});

describe('followingQuestion', () => {
  it('is the next open question after the one on screen', () => {
    expect(followingQuestion(run(['correct', 'open', 'correct', 'open']), 'q2')?.item.id).toBe(
      'q4',
    );
  });
  it('wraps to an open question before it when none follows', () => {
    expect(followingQuestion(run(['open', 'correct', 'open']), 'q3')?.item.id).toBe('q1');
  });
  it('is nothing when nothing else is open, or the run is over', () => {
    expect(followingQuestion(run(['correct', 'open']), 'q2')).toBeNull();
    expect(followingQuestion(run(['open', 'open'], { status: 'finished' }), 'q1')).toBeNull();
  });
  it('starts at the first open one when nothing is on screen yet', () => {
    expect(followingQuestion(run(['correct', 'open']), null)?.item.id).toBe('q2');
  });
});

describe('verdictsToHaveReady', () => {
  it('has the usual three ready in practice, none in a running test', () => {
    expect(verdictsToHaveReady(run([]))).toEqual(['correct', 'partially_correct', 'incorrect']);
    expect(verdictsToHaveReady(run([], { mode: 'test' }))).toEqual([]);
  });
});
