// Multiple choice: one question, one right option (#227 Nr. 2) — and pictures as options,
// "Welcher Graph passt zu f(x) = …?" (#231). Every case a model can get wrong that code can
// decide is rejected here, before anything is stored (#224 "Regel 0"); nothing is repaired.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { choiceProblem, definedFunction, type ChoiceDraft } from '../choiceCheck.js';
import { ItemDraft, usableItems } from '../items.js';
import { keyAgreesWithPrompt } from '../keyCheck.js';

const mc = (over: Partial<ChoiceDraft>): ChoiceDraft => ({
  prompt: 'Wer war der erste römische Kaiser?',
  answer: 'Augustus',
  choices: ['Caesar', 'Augustus', 'Nero'],
  correct_choice: 1,
  choice_figures: null,
  ...over,
});

const graph = (
  expr: string,
  window: Partial<Record<'x_min' | 'x_max' | 'y_min' | 'y_max', number>> = {},
): Figure => ({
  type: 'function_plot',
  functions: [{ expr, label: null }],
  x_min: -3,
  x_max: 3,
  y_min: -3,
  y_max: 5,
  points: [],
  ...window,
});

/** "Welcher Graph passt zu f(x) = x² − 1?" with four graphs, the right one third. */
const graphs = (over: Partial<ChoiceDraft> = {}): ChoiceDraft =>
  mc({
    prompt: 'Welcher Graph passt zu $f(x) = x^{2} - 1$?',
    answer: 'f(x) = x^2 - 1',
    choices: ['$y = x^{2} + 1$', '$y = -x^{2} + 1$', '$y = x^{2} - 1$', '$y = (x - 1)^{2}$'],
    correct_choice: 2,
    choice_figures: [graph('x^2+1'), graph('-x^2+1'), graph('x^2-1'), graph('(x-1)^2')],
    ...over,
  });

describe('every multiple choice (#227 Nr. 2)', () => {
  it('keeps a question that holds together', () => {
    expect(choiceProblem(mc({}))).toBeNull();
  });

  it('rejects fewer than two options and an index out of range', () => {
    expect(choiceProblem(mc({ choices: ['Augustus'], correct_choice: 0 }))).toBe('too_few');
    expect(choiceProblem(mc({ correct_choice: null }))).toBe('too_few');
    expect(choiceProblem(mc({ correct_choice: 3 }))).toBe('out_of_range');
  });

  it('rejects the same option twice, however it is typed', () => {
    expect(choiceProblem(mc({ choices: ['Caesar', 'Augustus', 'Augustus '] }))).toBe('duplicate');
    expect(
      choiceProblem(
        mc({
          prompt: 'Was ist $x \\cdot x$?',
          answer: '$x^{2}$',
          choices: ['$x^{2}$', 'x²', '2x'],
          correct_choice: 0,
        }),
      ),
    ).toBe('duplicate');
  });

  it('keeps options that differ only in case: a spelling question is about exactly that', () => {
    expect(
      choiceProblem(
        mc({
          prompt: 'Welche Schreibweise ist richtig?',
          answer: 'das Fahrrad',
          choices: ['das Fahrrad', 'das fahrrad'],
          correct_choice: 0,
        }),
      ),
    ).toBeNull();
  });

  it('rejects two options with the same value: "0,5" and "1/2"', () => {
    expect(
      choiceProblem(
        mc({
          prompt: 'Wie viel ist die Hälfte von 1?',
          answer: '0,5',
          choices: ['0,5', '$\\frac{1}{2}$', '2'],
          correct_choice: 0,
        }),
      ),
    ).toBe('same_value');
  });

  it('keeps the same number in different units: that is not the same value', () => {
    expect(
      choiceProblem(
        mc({
          prompt: 'Was ist länger?',
          answer: '5 m',
          choices: ['5 m', '5 cm'],
          correct_choice: 0,
        }),
      ),
    ).toBeNull();
  });

  it('rejects a key that names another option than the index (off by one)', () => {
    expect(choiceProblem(mc({ correct_choice: 0 }))).toBe('key_names_other');
    // By value: the key 0.75 is the option "3/4", the index points at "2/3".
    expect(
      choiceProblem(
        mc({
          prompt: 'Welcher Bruch ist am größten?',
          answer: '0.75',
          choices: ['$\\frac{2}{3}$', '$\\frac{3}{4}$', '$\\frac{1}{2}$'],
          correct_choice: 0,
        }),
      ),
    ).toBe('key_names_other');
    // By letter: "C" is the third option.
    expect(choiceProblem(mc({ answer: 'C' }))).toBe('key_names_other');
    expect(choiceProblem(mc({ answer: 'b)' }))).toBeNull();
  });

  it('cannot decide a key in other words, and does not pretend to', () => {
    expect(choiceProblem(mc({ answer: 'Der erste Kaiser war Augustus.' }))).toBeNull();
  });
});

describe('the key of a multiple choice against its own arithmetic (#227 Nr. 2, #157)', () => {
  const sum = (correct: number) => ({
    kind: 'multiple_choice',
    prompt: '$6 + 4$',
    answer: '10',
    unit: null,
    choices: ['8', '10', '12'],
    correct_choice: correct,
  });

  it('rejects an index on an option the arithmetic contradicts', () => {
    expect(keyAgreesWithPrompt(sum(0))).toBe(false);
  });

  it('keeps the index on the option the arithmetic gives', () => {
    expect(keyAgreesWithPrompt(sum(1))).toBe(true);
  });

  it('says nothing about a question in words', () => {
    expect(keyAgreesWithPrompt({ ...sum(0), prompt: 'Wie viel ist sechs plus vier?' })).toBe(true);
  });
});

describe('pictures as options (#231)', () => {
  it('keeps four different graphs whose key is the third one', () => {
    expect(choiceProblem(graphs())).toBeNull();
  });

  it('rejects a picture count that does not match the options, or more than four', () => {
    expect(choiceProblem(graphs({ choice_figures: [graph('x^2+1'), graph('x^2-1')] }))).toBe(
      'figure_count',
    );
    expect(
      choiceProblem(
        graphs({
          choices: ['a', 'b', 'c', 'd', 'e'],
          answer: 'f(x) = x^2 - 1',
          choice_figures: [graph('x'), graph('2*x'), graph('x^2-1'), graph('-x'), graph('x+2')],
        }),
      ),
    ).toBe('figure_count');
  });

  it('rejects the same drawing twice (any figure type, key order does not matter)', () => {
    const fraction: Figure = {
      type: 'fraction',
      shape: 'circle',
      fractions: [{ parts: 4, filled: 1 }],
    };
    const reordered = {
      fractions: [{ filled: 1, parts: 4 }],
      shape: 'circle',
      type: 'fraction',
    } as Figure;
    expect(
      choiceProblem(
        mc({
          prompt: 'Welches Bild zeigt ein Viertel?',
          answer: 'Viertel',
          choices: ['Viertel', 'ein Viertel'],
          correct_choice: 0,
          choice_figures: [fraction, reordered],
        }),
      ),
    ).toBe('figure_duplicate');
  });

  it('rejects two graphs that look the same: the same function written differently', () => {
    expect(
      choiceProblem(
        graphs({
          choice_figures: [graph('x^2+1'), graph('1+x*x'), graph('x^2-1'), graph('(x-1)^2')],
        }),
      ),
    ).toBe('graph_alike');
  });

  it('rejects two graphs that differ by less than a line width in the window', () => {
    expect(
      choiceProblem(
        graphs({
          choice_figures: [graph('x^2+1'), graph('x^2+1.05'), graph('x^2-1'), graph('(x-1)^2')],
        }),
      ),
    ).toBe('graph_alike');
  });

  it('rejects a graph that does not fit the equation: the key matches no option', () => {
    // "f(x) = x² − 1" — but no option draws it (the third is x² − 2).
    expect(
      choiceProblem(
        graphs({
          choice_figures: [graph('x^2+1'), graph('-x^2+1'), graph('x^2-2'), graph('(x-1)^2')],
        }),
      ),
    ).toBe('key_matches_none');
  });

  it('rejects an index on another graph than the one the key draws (off by one)', () => {
    expect(choiceProblem(graphs({ correct_choice: 3, answer: 'f(x) = x^2 - 1' }))).toBe(
      'key_not_correct',
    );
  });

  it('rejects a key that contradicts the function the question names', () => {
    // Key and index agree with each other (x² + 1, the first graph) — but the question asks
    // for x² − 1.
    expect(choiceProblem(graphs({ answer: 'f(x) = x^2 + 1', correct_choice: 0 }))).toBe(
      'prompt_function_differs',
    );
    // An unnamed key is held against the one function the question defines, too.
    expect(choiceProblem(graphs({ answer: 'x^2 + 1', correct_choice: 0 }))).toBe(
      'prompt_function_differs',
    );
  });

  it("keeps a derivative question: a key named f' is not held against f", () => {
    expect(
      choiceProblem(
        mc({
          prompt: 'Gegeben ist $f(x) = x^{2}$. Welcher Graph zeigt die Ableitung?',
          answer: "f'(x) = 2x",
          choices: ['$y = 2x$', '$y = x^{2}$', '$y = x$', '$y = -2x$'],
          correct_choice: 0,
          choice_figures: [graph('2*x'), graph('x^2'), graph('x'), graph('-2*x')],
        }),
      ),
    ).toBeNull();
  });

  it('rejects a key that is no function', () => {
    expect(choiceProblem(graphs({ answer: 'die nach oben offene Parabel' }))).toBe(
      'key_not_function',
    );
  });

  it('rejects an option with two curves, or a picture of another kind among the graphs', () => {
    const two: Figure = {
      ...(graph('x^2-1') as Extract<Figure, { type: 'function_plot' }>),
      functions: [
        { expr: 'x^2-1', label: null },
        { expr: 'x', label: null },
      ],
    };
    expect(
      choiceProblem(
        graphs({ choice_figures: [graph('x^2+1'), graph('-x^2+1'), two, graph('(x-1)^2')] }),
      ),
    ).toBe('graph_shape');
    const bars: Figure = { type: 'bar_chart', bars: [{ label: 'a', value: 1 }], unit: null };
    expect(
      choiceProblem(
        graphs({ choice_figures: [graph('x^2+1'), graph('-x^2+1'), graph('x^2-1'), bars] }),
      ),
    ).toBe('graph_shape');
  });

  it('rejects a graph that lies outside its own window', () => {
    expect(
      choiceProblem(
        graphs({
          choice_figures: [graph('x^2+10'), graph('-x^2+1'), graph('x^2-1'), graph('(x-1)^2')],
        }),
      ),
    ).toBe('graph_invisible');
  });

  it('reads a key as it is written in school', () => {
    for (const k of ['x^2 - 1', 'y = x^2 - 1', '$f(x) = x^{2} - 1$', 'f(x) = x² − 1']) {
      const d = definedFunction(k);
      expect(d?.fn(3), k).toBe(8);
    }
    expect(definedFunction("f'(x) = 2x")?.name).toBe("f'");
    expect(definedFunction('$y = \\sqrt{x}$')?.fn(9)).toBe(3);
  });
});

describe('usableItems with pictures as options', () => {
  const base = {
    kind: 'multiple_choice',
    accepted_answers: [],
    unit: null,
    topic: 'Parabeln',
    difficulty: 2,
    source_excerpt: null,
    hints: [],
    worked_solution: null,
  };
  const draft = (over: Partial<ChoiceDraft> = {}) => ItemDraft.parse({ ...base, ...graphs(over) });

  it('keeps the pictures with the question', () => {
    const [item] = usableItems([draft()]);
    expect(item?.choice_figures).toHaveLength(4);
    expect(item?.correct_choice).toBe(2);
  });

  it('drops the question, and only it, when its graphs do not hold together', () => {
    const kept = usableItems([
      draft({ choice_figures: [graph('x^2+1'), graph('x^2+1'), graph('x^2-1'), graph('x')] }),
      draft(),
    ]);
    expect(kept).toHaveLength(1);
  });

  it('drops a question one of whose graphs the app cannot draw — never the graph alone', () => {
    expect(
      usableItems([
        draft({ choice_figures: [graph('x^2+1'), graph('-x^2+1'), graph('x^2-1'), graph('x^^2')] }),
      ]),
    ).toEqual([]);
  });

  it('never keeps option pictures on a question that is not multiple choice', () => {
    const [item] = usableItems([
      ItemDraft.parse({
        ...base,
        ...graphs(),
        kind: 'short',
        answer: 'die dritte',
      }),
    ]);
    expect(item?.choice_figures).toBeNull();
    expect(item?.choices).toBeNull();
  });

  it('cannot read a draft whose option pictures break the figure contract', () => {
    const r = ItemDraft.safeParse({ ...base, ...graphs(), choice_figures: [{ type: 'hologram' }] });
    expect(r.success).toBe(false);
  });
});
