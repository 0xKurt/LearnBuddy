import { describe, expect, it } from 'vitest';

import { partialArray, partialString } from '../partial.js';

describe('partialString', () => {
  const full =
    '{"reply": "Hallo \\"Lena\\"\\nwie geht\'s? \\u00e4", "options": null, "actions": [{"reply": "x"}]}';

  it('reads a finished field', () => {
    expect(partialString(full, 'reply')).toEqual({
      text: 'Hallo "Lena"\nwie geht\'s? ä',
      done: true,
    });
  });

  it('reads the field as it is written, never a broken escape', () => {
    const seen = [];
    for (let n = 0; n <= full.length; n++) seen.push(partialString(full.slice(0, n), 'reply'));
    expect(seen.slice(0, 10).every((p) => p === null)).toBe(true);
    for (const p of seen) if (p) expect(p.text).not.toMatch(/\\/);
    // Grows monotonically.
    let last = '';
    for (const p of seen)
      if (p) {
        expect(p.text.startsWith(last)).toBe(true);
        last = p.text;
      }
    expect(last).toBe('Hallo "Lena"\nwie geht\'s? ä');
  });

  it('only looks at the first level', () => {
    expect(partialString('{"actions": [{"reply": "nested"}], "reply": "top"}', 'reply')).toEqual({
      text: 'top',
      done: true,
    });
    expect(partialString('{"actions": [{"reply": "nes', 'reply')).toBeNull();
    expect(partialString('{"reply": null}', 'reply')).toBeNull();
  });
});

describe('partialArray', () => {
  const judgement = (words: string) =>
    `{"audible": true, "heard": "the cat", "overall": "almost", "words": [${words}`;

  it('returns only the elements that are completely written', () => {
    expect(partialArray(judgement('{"text": "the", "ok": true}, {"text": "ca'), 'words')).toEqual([
      { text: 'the', ok: true },
    ]);
    expect(
      partialArray(judgement('{"text": "the", "ok": true}, {"text": "cat", "ok": false'), 'words'),
    ).toEqual([{ text: 'the', ok: true }]);
  });

  it('never guesses a value that is still being written', () => {
    // "ok" is not written yet: the word must not appear as if it were fine.
    expect(partialArray(judgement('{"text": "the", "ok": fal'), 'words')).toEqual([]);
    // A tip containing a bracket does not close the element early.
    expect(
      partialArray(judgement('{"text": "the", "ok": false, "tip": "wie [ð]"}, {"text"'), 'words'),
    ).toEqual([{ text: 'the', ok: false, tip: 'wie [ð]' }]);
  });

  it('is empty before the array starts, and complete once it is closed', () => {
    expect(partialArray('{"audible": true, "heard": "the c', 'words')).toEqual([]);
    expect(
      partialArray('{"words": [{"text": "a", "ok": true}], "reply": "Gut!"}', 'words'),
    ).toEqual([{ text: 'a', ok: true }]);
  });

  it('only looks at the first level', () => {
    expect(partialArray('{"actions": [{"words": [{"text": "x", "ok": true}]}]}', 'words')).toEqual(
      [],
    );
  });
});
