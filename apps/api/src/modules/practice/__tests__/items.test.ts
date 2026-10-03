import { describe, expect, it } from 'vitest';

import { ANSWER_FORM_RULES, ItemDraft, usableItems } from '../items.js';
import { MATCH_RULES, ORDER_RULES } from '../structured.js';
import { TABLE_RULES } from '../table.js';

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

describe('a multiple-choice question whose shape contradicts itself (#227)', () => {
  const mc = (over: Record<string, unknown>) =>
    draft({ kind: 'multiple_choice', prompt: 'Wer war der erste römische Kaiser?', ...over });

  it('keeps one that holds together', () => {
    const ok = mc({
      answer: 'Augustus',
      choices: ['Augustus', 'Nero', 'Cicero'],
      correct_choice: 0,
    });
    expect(usableItems([ok])).toHaveLength(1);
  });

  it('drops two options that are the same word — she could pick the other right one', () => {
    const twice = mc({
      answer: 'Augustus',
      choices: ['Augustus', 'augustus ', 'Nero'],
      correct_choice: 0,
    });
    expect(usableItems([twice])).toEqual([]);
  });

  it('drops two options worth the same number, written two ways', () => {
    // "0,5" and "1/2" are one option written twice; whichever she taps, one of them is wrong.
    const twice = mc({
      prompt: 'Welcher Wert ist die Hälfte?',
      answer: '0,5',
      choices: ['0,5', '$\\frac{1}{2}$', '0,25'],
      correct_choice: 0,
    });
    expect(usableItems([twice])).toEqual([]);
  });

  it('drops one whose key names something other than the option it points at', () => {
    // `answer` says Augustus, the index points at Nero. The index decides the verdict with full
    // authority, so nobody could ever argue — and nobody can tell which the question meant.
    const off = mc({ answer: 'Augustus', choices: ['Nero', 'Augustus'], correct_choice: 0 });
    expect(usableItems([off])).toEqual([]);
  });

  it('accepts a key that says the same number in another notation', () => {
    const same = mc({
      prompt: 'Wie viel ist die Hälfte von 1?',
      answer: '0,5',
      choices: ['$\\frac{1}{2}$', '2', '5'],
      correct_choice: 0,
    });
    expect(usableItems([same])).toHaveLength(1);
  });
});

describe('how a structured task is asked for (issues #228–#230)', () => {
  const RULES = [ORDER_RULES, TABLE_RULES, MATCH_RULES];

  it('goes to every prompt that writes questions, homework included', async () => {
    const { EXTRACT_SYSTEM, HOMEWORK_SYSTEM } = await import('../../materials/extract.js');
    const { GENERATE_SYSTEM } = await import('../generate.js');
    for (const rules of RULES) {
      expect(EXTRACT_SYSTEM).toContain(rules);
      // A sheet she brought for help keeps its form: an ordering task stays one (with hints).
      expect(HOMEWORK_SYSTEM).toContain(rules);
      expect(GENERATE_SYSTEM).toContain(rules);
    }
  });

  it('says it in categories, with no sample instruction in any language', () => {
    for (const rules of RULES) expect(rules).not.toMatch(/[äöüßÄÖÜ]|„|“|»|«/);
  });

  it('is never an ordinary item: the model cannot write an order as text', () => {
    expect(ItemDraft.safeParse({ ...draft({}), kind: 'order' }).success).toBe(false);
  });
});

describe('the rubric of a writing task (#211)', () => {
  const RUBRIC = {
    form: 'Inhaltsangabe',
    elements: [
      {
        name: 'Einleitungssatz',
        missing: 'Nenne im ersten Satz Titel und Autor.',
        check: { by: 'mentions', terms: ['Die Verwandlung'], where: 'opening' },
      },
      {
        name: 'Länge',
        missing: 'Etwas mehr darf es schon sein.',
        check: { by: 'word_count', min: 20, max: null },
      },
    ],
  };
  const essay = (over: Record<string, unknown> = {}) =>
    draft({ kind: 'long', prompt: 'Schreibe eine Inhaltsangabe.', rubric: RUBRIC, ...over });

  it('keeps a rubric on a free text', () => {
    expect(usableItems([essay()])[0]?.rubric).toEqual(RUBRIC);
  });

  it('drops a rubric that is not about a written text, never the question', () => {
    const [item] = usableItems([draft({ rubric: RUBRIC })]);
    expect(item).toMatchObject({ kind: 'short', rubric: null });
  });

  it('drops a rubric over a bound without dropping the question (audit H-15)', () => {
    // Seven elements is over RUBRIC_MAX. `figure` has behaved this way since H-15, and a
    // rubric follows it: the question is the valuable part.
    const many = essay({
      rubric: {
        form: 'Bericht',
        elements: Array.from({ length: 7 }, (_, n) => ({
          name: `Teil ${n + 1}`,
          missing: 'Schau nochmal hin.',
          check: { by: 'word_count', min: 20, max: null },
        })),
      },
    });
    const [item] = usableItems([many]);
    expect(item).toMatchObject({ kind: 'long', rubric: null });
  });

  it('drops a rubric whose sentence would give the answer away', () => {
    // Shown to her like a hint, so held to the hint rule: a homework task must not have its
    // answer handed over by a tick box.
    const leaky = essay({
      answer: 'Gregor Samsa',
      rubric: {
        form: 'Inhaltsangabe',
        elements: [
          {
            name: 'Hauptfigur',
            missing: 'Die Hauptfigur ist Gregor Samsa – nenne sie.',
            check: { by: 'judged' },
          },
          RUBRIC.elements[1],
        ],
      },
    });
    const [item] = usableItems([leaky]);
    expect(item).toMatchObject({ kind: 'long', rubric: null });
  });
});

describe('usableItems: notation the app cannot draw (issue #239)', () => {
  it('drops a question whose text, options or key use a command outside the list', () => {
    const items = usableItems([
      draft({ prompt: 'Gleiche aus: $\\ce{H2 + O2 -> H2O}$' }),
      draft({ kind: 'formula', prompt: 'Wie lautet die Formel?', answer: '$\\overbrace{x}$' }),
      draft({
        kind: 'multiple_choice',
        prompt: 'Welche Matrix?',
        answer: 'a',
        choices: ['$\\begin{bmatrix} 1 \\end{bmatrix}$', 'b'],
        correct_choice: 0,
      }),
      draft({ prompt: 'Was ergibt $\\sum_{i=1}^{3} i$?', answer: '6', kind: 'numeric' }),
    ]);
    expect(items.map((i) => i.prompt)).toEqual(['Was ergibt $\\sum_{i=1}^{3} i$?']);
  });

  it('drops only the hint or the worked solution that uses one, never the question for it', () => {
    const [item] = usableItems([
      draft({
        hints: ['Denk an $\\iint$.', 'Was steht im Zellkern?'],
        worked_solution: 'Mit $\\mathcal{Z}$ …',
      }),
    ]);
    expect(item?.hints).toEqual(['Was steht im Zellkern?']);
    expect(item?.worked_solution).toBeNull();
  });
});
