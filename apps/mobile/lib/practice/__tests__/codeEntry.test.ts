import { describe, expect, it } from 'vitest';

import { autoIndent, indentAt, wroteSomething } from '../codeEntry.js';

describe('writing code on a phone keyboard (issue #262)', () => {
  it('keeps the indentation of the line before on a new line', () => {
    expect(autoIndent('    x = 1', '    x = 1\n')).toEqual({ text: '    x = 1\n    ', caret: 14 });
  });

  it('goes one step deeper after a colon', () => {
    expect(autoIndent('def f(a):', 'def f(a):\n')).toEqual({ text: 'def f(a):\n    ', caret: 14 });
    expect(autoIndent('    for x in l:  ', '    for x in l:  \n')?.text).toBe(
      '    for x in l:  \n        ',
    );
  });

  it('works in the middle of the text too', () => {
    const prev = 'def f(a):\n    return a';
    const next = 'def f(a):\n\n    return a';
    expect(autoIndent(prev, next)).toEqual({ text: 'def f(a):\n    \n    return a', caret: 14 });
  });

  it('leaves everything else exactly as typed', () => {
    expect(autoIndent('x = 1', 'x = 1\n')).toBeNull();
    expect(autoIndent('x = 1', 'x = 12')).toBeNull();
    expect(autoIndent('x', 'x\n\n')).toBeNull();
    expect(autoIndent('    a', '    ')).toBeNull();
  });

  it('indents at the cursor and replaces a selection', () => {
    expect(indentAt('ab', { start: 1, end: 1 })).toEqual({ text: 'a    b', caret: 5 });
    expect(indentAt('abc', { start: 2, end: 0 })).toEqual({ text: '    c', caret: 4 });
    expect(indentAt('ab', null)).toEqual({ text: 'ab    ', caret: 6 });
  });

  it('knows when there is something to check beyond the starter', () => {
    expect(wroteSomething('def f(a):\n    ', 'def f(a):\n    ')).toBe(false);
    expect(wroteSomething('def f(a):\n    return a', 'def f(a):\n    ')).toBe(true);
    expect(wroteSomething('  ', '')).toBe(false);
    expect(wroteSomething('10', '')).toBe(true);
  });
});
