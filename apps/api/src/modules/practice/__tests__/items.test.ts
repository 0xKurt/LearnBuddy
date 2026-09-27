import { describe, expect, it } from 'vitest';

import { ItemDraft, usableItems } from '../items.js';

const draft = (over: Record<string, unknown>) =>
  ItemDraft.parse({
    kind: 'short',
    prompt: 'Welche Aufgabe hat der Zellkern?',
    answer: 'Er steuert die Zelle.',
    accepted_answers: [],
    unit: null,
    choices: null,
    correct_choice: null,
    topic: 'Zelle',
    difficulty: 2,
    source_excerpt: null,
    hints: [],
    worked_solution: null,
    ...over,
  });

describe('usableItems: the language of a question', () => {
  it('keeps the language an ordinary question is written in (M-40)', () => {
    const [item] = usableItems([draft({ prompt_lang: 'de' })]);
    expect(item).toMatchObject({ prompt_lang: 'de', lang: null });
  });

  it('never marks an ordinary question as a translation', () => {
    const [item] = usableItems([draft({ prompt_lang: 'de', lang: 'en' })]);
    expect(item?.lang).toBeNull();
  });
});
