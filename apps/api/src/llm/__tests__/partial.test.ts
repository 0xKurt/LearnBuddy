import { describe, expect, it } from 'vitest';

import { partialString } from '../partial.js';

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
