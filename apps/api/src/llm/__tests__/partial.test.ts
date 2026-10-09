import { describe, expect, it } from 'vitest';

import { answerUpTo, partialArray, partialString } from '../partial.js';

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

describe('answerUpTo — the answer as it stands after the first n questions (issue #220)', () => {
  const WHOLE = JSON.stringify({
    usable: true,
    title: 'Brüche addieren',
    subject: { name: 'Mathe', kind: 'math' },
    items: [
      { prompt: 'Was ist $\\frac{1}{2} + \\frac{1}{4}$?', answer: '3/4' },
      { prompt: 'Was ist 2/3 + 1/6?', answer: '5/6' },
      { prompt: 'Was ist 3/8 + 1/8?', answer: '1/2' },
    ],
    bars: [],
  });

  it('closes the brackets so the finished answer’s schema can read the prefix', () => {
    const cut = WHOLE.indexOf('5/6') + 6;
    expect(answerUpTo(WHOLE.slice(0, cut), 'items', 2)).toEqual({
      usable: true,
      title: 'Brüche addieren',
      subject: { name: 'Mathe', kind: 'math' },
      items: [
        { prompt: 'Was ist $\\frac{1}{2} + \\frac{1}{4}$?', answer: '3/4' },
        { prompt: 'Was ist 2/3 + 1/6?', answer: '5/6' },
      ],
    });
  });

  it('hands back exactly the first n, never the ones already written after them', () => {
    expect((answerUpTo(WHOLE, 'items', 2) as { items: unknown[] }).items).toHaveLength(2);
  });

  it('says "not yet" until n questions are finished, and never half of one', () => {
    for (let i = 0; i <= WHOLE.length; i++) {
      const soFar = answerUpTo(WHOLE.slice(0, i), 'items', 2) as {
        items: { answer: string }[];
      } | null;
      if (!soFar) continue;
      // Whatever it gives, both questions are whole — answers included.
      expect(soFar.items).toHaveLength(2);
      expect(soFar.items.map((it) => it.answer)).toEqual(['3/4', '5/6']);
    }
    expect(answerUpTo(WHOLE, 'items', 4)).toBeNull();
    expect(answerUpTo('', 'items', 1)).toBeNull();
    expect(answerUpTo('{"usable":true,"title":"Brü', 'items', 1)).toBeNull();
  });

  it('is not fooled by braces in the written text, and reads nested objects whole', () => {
    const tricky = JSON.stringify({
      title: 'Mengen',
      items: [
        { prompt: 'Schreibe $\\{1, 2\\}$ [so].', figure: { kind: 'fraction', parts: 4 } },
        { prompt: 'Und $\\{3\\}$?', figure: null },
      ],
    });
    expect(answerUpTo(tricky, 'items', 1)).toEqual({
      title: 'Mengen',
      items: [{ prompt: 'Schreibe $\\{1, 2\\}$ [so].', figure: { kind: 'fraction', parts: 4 } }],
    });
  });

  it('refuses an array that is not at the first level', () => {
    expect(answerUpTo('{"actions": [{"items": [{"prompt": "x"}]}]}', 'items', 1)).toBeNull();
  });
});

describe('one scanner for a first-level key (#311)', () => {
  // The string and the array readers share how they find `"key":`. One difference stays as it
  // was before they were merged: a bracket outside every object ends the search for an array,
  // and a string field is still read behind it.
  it('reads a string behind an outer bracket, never an array', () => {
    const raw = 'Text [x] {"key": "y", "items": [{"a":1}]}';
    expect(partialString(raw, 'key')).toEqual({ text: 'y', done: true });
    expect(partialArray(raw, 'items')).toEqual([]);
    expect(answerUpTo(raw, 'items', 1)).toBeNull();
  });
});
