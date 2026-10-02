import { describe, expect, it } from 'vitest';

import {
  ANSWER_FORM_RULES,
  ItemDraft,
  itemsOneByOne,
  PARTS_FROM_SHEET,
  PARTS_RULES,
  usableItems,
} from '../items.js';

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

describe('the answer form a question may ask for (#208)', () => {
  it('reaches the prompt that INVENTS questions', async () => {
    const { GENERATE_SYSTEM } = await import('../generate.js');
    expect(GENERATE_SYSTEM).toContain(ANSWER_FORM_RULES);
  });

  it('does NOT reach extraction, which copies a printed task as it stands', async () => {
    const { EXTRACT_SYSTEM, HOMEWORK_SYSTEM } = await import('../../materials/extract.js');
    // A printed task may legitimately ask for the numerator; the rule would make the model
    // rewrite her own homework.
    expect(EXTRACT_SYSTEM).not.toContain(ANSWER_FORM_RULES);
    expect(HOMEWORK_SYSTEM).not.toContain(ANSWER_FORM_RULES);
  });

  it('says what it means without a sample sentence in any language', () => {
    // Sample utterances in a prompt get copied verbatim (issue #200/#201).
    expect(ANSWER_FORM_RULES).not.toMatch(/[äöüßÄÖÜ]|„|“/);
    expect(ANSWER_FORM_RULES).toMatch(/fraction/);
  });
});

describe('usableItems: an answer with several parts (issues #228–#230)', () => {
  const task = { form: 'order', elements: ['Samen quillt auf', 'Wurzel wächst', 'Blatt wächst'] };
  const order = (over: Record<string, unknown> = {}) =>
    draft({
      kind: 'order',
      prompt: 'Bring die Schritte der Keimung in die richtige Reihenfolge.',
      // A key the model wrote: it is never used — the solution is computed from the task.
      answer: 'irgendwas',
      topic: 'Pflanzen',
      parts_task: task,
      ...over,
    });

  it('computes the solution from the task and throws the written key away', () => {
    const [item] = usableItems([order()]);
    expect(item).toMatchObject({
      kind: 'order',
      answer: 'Samen quillt auf → Wurzel wächst → Blatt wächst',
      accepted_answers: [],
      choices: null,
      unit: null,
      spelling: null,
    });
  });

  it('drops the question when there is no task to ask', () => {
    expect(usableItems([order({ parts_task: null })])).toEqual([]);
  });

  it('drops the question when the task has more than one right answer', () => {
    const twice = { form: 'order', elements: ['Wurzel wächst', 'Blatt', 'wurzel wächst'] };
    expect(usableItems([order({ parts_task: twice })])).toEqual([]);
  });

  // Deriving the kind from the task would turn a question whose own text asks for an order into
  // a pairing exercise; repairing the task from the kind is not possible at all. So a
  // disagreement drops the question, like every other shape that does not hold together.
  it('drops the question when the kind and the task disagree', () => {
    const pairs = {
      form: 'match_pairs',
      pairs: [
        { left: 'Lunge', right: 'Gasaustausch' },
        { left: 'Herz', right: 'Blut pumpen' },
        { left: 'Niere', right: 'Blut filtern' },
      ],
    };
    expect(usableItems([order({ parts_task: pairs })])).toEqual([]);
  });

  it('keeps a task off every other kind, the way choices stay off every non-choice', () => {
    const [item] = usableItems([draft({ parts_task: task })]);
    expect(item).toMatchObject({ kind: 'short', parts_task: null });
  });

  it('leaves homework alone: there the task is the one she brought', () => {
    expect(usableItems([order()], { severalParts: false })).toEqual([]);
    expect(usableItems([draft({})], { severalParts: false })).toHaveLength(1);
  });

  it('does not lose the question over the unused key the schema still asks for', () => {
    // The schema wants a non-empty `answer` for every kind. A reading that correctly left it
    // out for one of these three must not lose its question over a field nothing reads, so
    // `clipDraft` fills it in and `usableItems` overwrites it.
    const [read] = itemsOneByOne(ItemDraft, 5).parse([
      {
        kind: 'order',
        prompt: 'Bring die Schritte der Keimung in die richtige Reihenfolge.',
        accepted_answers: [],
        unit: null,
        choices: null,
        correct_choice: null,
        topic: 'Pflanzen',
        difficulty: 2,
        source_excerpt: null,
        parts_task: task,
      },
    ]);
    expect(read).toBeDefined();
    const [item] = usableItems(read ? [read] : []);
    expect(item?.answer).toBe('Samen quillt auf → Wurzel wächst → Blatt wächst');
  });
});

describe('how a printed task keeps its form (issues #228–#230)', () => {
  it('tells extraction, and only extraction, that the instruction decides', async () => {
    const { EXTRACT_SYSTEM, HOMEWORK_SYSTEM } = await import('../../materials/extract.js');
    const { GENERATE_SYSTEM } = await import('../generate.js');
    expect(EXTRACT_SYSTEM).toContain(PARTS_FROM_SHEET);
    expect(EXTRACT_SYSTEM).toContain(PARTS_RULES);
    expect(GENERATE_SYSTEM).toContain(PARTS_RULES);
    // Homework help has no boards: the task is the one she brought.
    expect(HOMEWORK_SYSTEM).not.toContain(PARTS_RULES);
    expect(HOMEWORK_SYSTEM).not.toContain(PARTS_FROM_SHEET);
  });

  it('says it in categories, with no sample instruction in any language', () => {
    for (const rules of [PARTS_RULES, PARTS_FROM_SHEET]) {
      expect(rules).not.toMatch(/[äöüßÄÖÜ]|„|“|»|«/);
    }
  });
});
