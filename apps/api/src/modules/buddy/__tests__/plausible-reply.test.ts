// Answer chips only under a question (issue #783): code decides it from the reply's question
// mark, so a statement never carries options. How long ago an earlier conversation was is held
// by the STATE pin (prompt-pin.test.ts).

import { describe, expect, it } from 'vitest';

import { optionsFor } from '../registry.js';

describe('answer chips belong to a question', () => {
  it('drops options under a reply that asks nothing', () => {
    expect(
      optionsFor('Wir können Argumente im Chat üben.', ['Redemittel üben', 'Diskutieren']),
    ).toBe(null);
  });

  it('keeps them under a question, in every app language', () => {
    for (const reply of ['Was magst du üben?', '¿Qué quieres practicar?', 'Lieber das oder das?'])
      expect(optionsFor(reply, ['a', 'b'])).toEqual(['a', 'b']);
    expect(optionsFor('Was magst du üben?', null)).toBe(null);
  });
});
