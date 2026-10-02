// The answer field's lines: what the return key does and which line the preview draws (#221).

import { describe, expect, it } from 'vitest';

import { isPath, lineCount, previewLine, returnSubmits } from '../answerLines.js';

describe('the return key in the answer field', () => {
  it('sends a one-line answer at once, for every kind but a long text', () => {
    expect(returnSubmits('numeric', '2')).toBe(true);
    expect(returnSubmits('formula', 'x^2 - 1')).toBe(true);
    expect(returnSubmits('short', 'Paris')).toBe(true);
    expect(returnSubmits('vocab', 'the dog')).toBe(true);
    expect(returnSubmits('long', 'Ein Satz')).toBe(false);
  });

  it('starts the next line once the answer is a path', () => {
    expect(returnSubmits('numeric', '2x + 3 = 7\n')).toBe(false);
    expect(returnSubmits('formula', '2(x+3)\n2x + 6')).toBe(false);
    expect(returnSubmits('short', '7 · 4\n28')).toBe(false);
  });

  it('sends again once the line break is deleted', () => {
    const path = '2x = 4\n';
    expect(returnSubmits('numeric', path)).toBe(false);
    expect(returnSubmits('numeric', path.slice(0, -1))).toBe(true);
  });
});

describe('a path', () => {
  it('is any answer with a line break, the separator steps.ts splits at', () => {
    expect(isPath('x = 2')).toBe(false);
    expect(isPath('2x = 4\nx = 2')).toBe(true);
    expect(lineCount('')).toBe(1);
    expect(lineCount('2x + 3 = 7\n2x = 4\nx = 2')).toBe(3);
    expect(lineCount('2x + 3 = 7\n')).toBe(2);
  });
});

describe('the line the preview draws', () => {
  const path = '2x + 3 = 7\n2x = 4\nx = 2';

  it('is the one with the cursor in it', () => {
    expect(previewLine(path, 0)).toBe('2x + 3 = 7');
    expect(previewLine(path, 12)).toBe('2x = 4');
    expect(previewLine(path, path.length)).toBe('x = 2');
  });

  it('is the last line without a known cursor', () => {
    expect(previewLine(path, null)).toBe('x = 2');
    expect(previewLine('3/4', null)).toBe('3/4');
  });

  it('keeps the line above on a fresh, empty line, so it does not flicker away', () => {
    expect(previewLine('2x + 3 = 7\n', 11)).toBe('2x + 3 = 7');
    expect(previewLine('2x + 3 = 7\n\n', null)).toBe('2x + 3 = 7');
  });

  it('copes with a cursor the field reported for an older, longer text', () => {
    expect(previewLine('x = 2', 40)).toBe('x = 2');
    expect(previewLine('', 3)).toBe('');
  });
});
