import { describe, expect, it } from 'vitest';

import { insertAtCursor } from '../insert.js';

describe('insertAtCursor', () => {
  it('appends when there is no selection yet', () => {
    expect(insertAtCursor('3', null, { text: '²' })).toEqual({
      value: '3²',
      selection: { start: 2, end: 2 },
    });
  });
  it('inserts at the cursor', () => {
    expect(insertAtCursor('x+1', { start: 1, end: 1 }, { text: '²' })).toEqual({
      value: 'x²+1',
      selection: { start: 2, end: 2 },
    });
  });
  it('replaces a selection', () => {
    expect(insertAtCursor('a*b', { start: 1, end: 2 }, { text: '·' }).value).toBe('a·b');
    expect(insertAtCursor('a*b', { start: 2, end: 1 }, { text: '·' }).value).toBe('a·b');
  });
  it('puts the cursor inside brackets when asked', () => {
    expect(insertAtCursor('2', { start: 1, end: 1 }, { text: '√()', caret: 2 })).toEqual({
      value: '2√()',
      selection: { start: 3, end: 3 },
    });
  });
  it('clamps a stale selection', () => {
    expect(insertAtCursor('ab', { start: 9, end: 12 }, { text: 'π' })).toEqual({
      value: 'abπ',
      selection: { start: 3, end: 3 },
    });
  });
});
