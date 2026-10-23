// The API's streamed prefix must reach the app with the same notation as its final answer.
import { describe, expect, it } from 'vitest';

import { answerUpTo } from '../../../../api/src/llm/partial.js';
import { plainText, splitMath } from '../parse.js';

describe('streamed model maths (#863)', () => {
  it('shows 5 cm instead of the reported 5extcm', () => {
    const raw = String.raw`{"items":[{"prompt":"$5\text{ cm}$"}]}`;
    // Pin the exact reported symptom to JSON's tab escape and the existing math parser.
    const damaged = JSON.parse(raw) as { items: { prompt: string }[] };
    expect(plainText(splitMath(damaged.items[0]!.prompt))).toBe('5extcm');

    const prefix = answerUpTo(raw, 'items', 1) as { items: { prompt: string }[] };
    expect(plainText(splitMath(prefix.items[0]!.prompt))).toBe('5 cm');
  });

  it.each([String.raw`5\,\text{cm}`, String.raw`5\,\mathrm{cm}`, String.raw`5\text{ cm}`])(
    'preserves correctly escaped notation: %s',
    (math) => {
      const raw = JSON.stringify({ items: [{ prompt: `$${math}$` }] });
      const prefix = answerUpTo(raw, 'items', 1) as { items: { prompt: string }[] };
      expect(plainText(splitMath(prefix.items[0]!.prompt))).toBe('5 cm');
    },
  );
});
