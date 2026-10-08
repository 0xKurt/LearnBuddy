// Her working, photographed (issue #444): the copy goes into her field, a line that could not be
// read stays empty and is named, and "Prüfen" waits for it — the field never checks a path with a
// hole in it she did not choose.

import { describe, expect, it } from 'vitest';

import { copyNote, emptyLines, fieldFrom, unreadText } from '../practice/workPhoto.js';

describe('the copy in her field', () => {
  it('puts each line on its own line, an unread one left empty', () => {
    expect(fieldFrom(['2x + 3 = 7 | −3', null, 'x = 2'])).toBe('2x + 3 = 7 | −3\n\nx = 2');
    expect(fieldFrom(['x = 2'])).toBe('x = 2');
    // An unread last line still has its place: the field ends with it.
    expect(fieldFrom(['3x = 12', null])).toBe('3x = 12\n');
  });

  it('knows which lines of a path are still empty', () => {
    expect(emptyLines('2x + 3 = 7\n\nx = 2')).toEqual([2]);
    expect(emptyLines('\n2x = 4\n  \n')).toEqual([1, 3, 4]);
    expect(emptyLines('2x = 4\nx = 2')).toEqual([]);
    // One line is not a path: an empty field is not a missing line.
    expect(emptyLines('')).toEqual([]);
  });
});

describe('what stands above it', () => {
  const read = { step: 'read', unread: true } as const;

  it('names the lines she still has to write, until she has', () => {
    expect(copyNote(read, '2x + 3 = 7\n\nx = 2')).toEqual({ key: 'work.unread', lines: [2] });
    expect(copyNote(read, '2x + 3 = 7\n2x = 4\nx = 2')).toEqual({ key: 'work.read' });
    // Taking the line out is her decision too.
    expect(copyNote(read, '2x + 3 = 7\nx = 2')).toEqual({ key: 'work.read' });
  });

  it('asks only to compare when every line was read, and says nothing once the field is empty', () => {
    const whole = { step: 'read', unread: false } as const;
    // A blank line she typed into a copy that was read whole is no line the reading missed.
    expect(copyNote(whole, '2x = 4\n\nx = 2')).toEqual({ key: 'work.read' });
    expect(copyNote(read, '  ')).toBeNull();
    expect(copyNote({ step: 'reading' }, '2x = 4')).toBeNull();
    expect(copyNote({ step: 'idle' }, '2x = 4')).toBeNull();
  });

  it('words one line and several lines with their numbers', () => {
    const t = (key: string, o: { count: number; lines: string }) => `${key} ${o.count}:${o.lines}`;
    expect(unreadText(t, [2])).toBe('work.unread 1:2');
    expect(unreadText(t, [2, 4])).toBe('work.unread 2:2, 4');
  });
});
