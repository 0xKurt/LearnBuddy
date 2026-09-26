import { beforeEach, describe, expect, it } from 'vitest';

import { afterFeedback, useHandsFree } from '../handsFree.js';

const items = (a: string, b: string) => [
  { item: { id: 'q1' }, status: a },
  { item: { id: 'q2' }, status: b },
];

describe('hands-free practice', () => {
  beforeEach(() => useHandsFree.setState({ armed: false, ask: 0 }));

  it('listens again while the question is open, moves on once it is closed', () => {
    expect(afterFeedback(items('open', 'open'), 'q1', true)).toBe('listen');
    expect(afterFeedback(items('correct', 'open'), 'q1', true)).toBe('next');
    expect(afterFeedback(items('revealed', 'correct'), 'q1', true)).toBe('stay');
  });

  it('does nothing on its own before her first tap', () => {
    expect(afterFeedback(items('open', 'open'), 'q1', false)).toBe('stay');
    useHandsFree.getState().listenNow();
    expect(useHandsFree.getState().ask).toBe(0);
    useHandsFree.getState().arm();
    useHandsFree.getState().listenNow();
    expect(useHandsFree.getState().ask).toBe(1);
    useHandsFree.getState().disarm();
    useHandsFree.getState().listenNow();
    expect(useHandsFree.getState().ask).toBe(1);
  });
});
