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

describe('usableItems: a number asked for behind a placeholder (live finding 5)', () => {
  const numeric = (prompt: string) =>
    draft({ kind: 'numeric', prompt, answer: '3', topic: 'Brüche' });

  it.each([
    'Welcher Bruchteil der Kreisfläche ist farbig markiert? Gib den Zähler des Bruches $\\frac{a}{8}$ an.',
    'Welcher Bruchteil ist gefärbt? Gib den Zähler des Bruches $\\frac{\\text{Zähler}}{4}$ an.',
    'Gib den Zähler von a/8 an.',
    'Welcher Nenner fehlt: $\\frac{3}{?}$',
  ])('drops "%s"', (prompt) => {
    expect(usableItems([numeric(prompt)])).toEqual([]);
  });

  it.each([
    'Für welches $a$ gilt $\\frac{a}{8} = \\frac{3}{8}$?',
    'Berechne $\\frac{x}{4}$ für $x = 12$.',
    'Ein Auto fährt $60 \\frac{\\text{km}}{\\text{h}}$. Wie weit kommt es in 3 Stunden?',
    'Erweitere den Bruch $\\frac{2}{5}$ mit $3$. Welcher Zähler entsteht?',
  ])('keeps "%s"', (prompt) => {
    expect(usableItems([numeric(prompt)])).toHaveLength(1);
  });

  it('keeps an algebra formula item with letters', () => {
    const it = draft({
      kind: 'formula',
      prompt: 'Vereinfache $\\frac{a}{8} + \\frac{a}{8}$.',
      answer: '$\\frac{a}{4}$',
    });
    expect(usableItems([it])).toHaveLength(1);
  });
});
