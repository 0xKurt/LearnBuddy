// The fraction bar, where the model chooses and code computes (issue #162).
//
// The claim this file holds to account is not "the derivation works" but something
// stronger: **the contract can express no item at all, and never a false one.** So the
// parameter space is small enough to enumerate, and it is enumerated — every task the
// contract admits is checked against a value computed here, independently of the code that
// wrote the key.

import { BAR_FRACTIONS, BarTask, MAX_BAR_PARTS } from '@learnbuddy/shared-types/contracts';
import { parseCanonicalKey } from '@learnbuddy/shared-math';
import { describe, expect, it } from 'vitest';

import { barItem, barItems, MAX_BAR_ITEMS, surfaceOf, taskOf } from '../bars.js';
import { keyAgreesWithPrompt } from '../keyCheck.js';

const PARTS = [2, 3, 4, 5, 6] as const;
const UNITS = [1, 2, 3, 4, 5] as const;

function value(key: string): number {
  const parsed = parseCanonicalKey(key);
  expect(parsed.value, `key "${key}" must read as a number`).not.toBeNull();
  return parsed.value ?? Number.NaN;
}

function asFraction(literal: string): { num: number; den: number } {
  const [num, den] = literal.split('/').map(Number);
  return { num: num ?? 0, den: den ?? 1 };
}

describe('the vocabulary the model may use', () => {
  it('is exactly the proper fractions in lowest terms a bar can draw', () => {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const expected: string[] = [];
    for (let den = 2; den <= MAX_BAR_PARTS; den++) {
      for (let num = 1; num < den; num++) {
        if (gcd(num, den) === 1) expected.push(`${num}/${den}`);
      }
    }
    expect([...BAR_FRACTIONS].sort()).toEqual(expected.sort());
  });

  it('refuses what a bar cannot be: an improper fraction, nothing shaded, a finer bar', () => {
    expect(BarTask.safeParse({ task: 'compare', left: '4/3', right: '1/2' }).success).toBe(false);
    expect(BarTask.safeParse({ task: 'compare', left: '0/5', right: '1/2' }).success).toBe(false);
    // Not in lowest terms: the same amount already has a name in the vocabulary.
    expect(BarTask.safeParse({ task: 'compare', left: '2/4', right: '1/3' }).success).toBe(false);
    expect(BarTask.safeParse({ task: 'shade', parts: 7, units: 3 }).success).toBe(false);
    expect(BarTask.safeParse({ task: 'shade', parts: 4, units: 0 }).success).toBe(false);
    expect(BarTask.safeParse({ task: 'shade', parts: 4, units: 2.5 }).success).toBe(false);
    expect(BarTask.safeParse({ task: 'add', parts: 4, first: 1, second: 6 }).success).toBe(false);
    expect(BarTask.safeParse({ task: 'place', parts: 4, units: 2 }).success).toBe(false);
  });

  // The heart of #162: a model that tries to state a question, a key, a picture or a hint
  // has no field to put it in, so none of it survives the contract. Nothing is "validated
  // away" afterwards — it is simply not part of what a bar task can say.
  it('has no field for a question, an answer, a figure or a hint', () => {
    const parsed = BarTask.parse({
      task: 'shade',
      parts: 4,
      units: 2,
      prompt: 'Wie viel ist ein Achtel?',
      answer: '9/4',
      figure: { type: 'fraction', shape: 'bar', fractions: [{ parts: 1, filled: 1 }] },
      hints: ['die Antwort ist 9/4'],
      worked_solution: 'nimm einfach 9',
    });
    expect(Object.keys(parsed).sort()).toEqual(['parts', 'task', 'units']);
  });
});

describe('shade: a named amount on a bar of this many parts', () => {
  it('names the amount in lowest terms and keys it in the bar’s own parts', () => {
    // One half on a bar of quarters — "eine Hälfte in Viertel teilen" (issue #162).
    const item = barItem({ task: 'shade', parts: 4, units: 2 }, 'de');
    expect(item).not.toBeNull();
    expect(item?.prompt).toBe('Färbe $\\frac{1}{2}$ ein.');
    expect(item?.answer).toBe('2/4');
    expect(item?.kind).toBe('numeric');
    expect(item?.figure).toBeNull();
    expect(item?.bar_task).toEqual({ task: 'shade', parts: 4, units: 2 });
  });

  it('is written in the learner’s own language', () => {
    const de = barItem({ task: 'shade', parts: 6, units: 3 }, 'de');
    const fr = barItem({ task: 'shade', parts: 6, units: 3 }, 'fr');
    expect(de?.prompt).not.toBe(fr?.prompt);
    for (const item of [de, fr]) {
      expect(item?.prompt).toContain('\\frac{1}{2}');
      expect(item?.answer).toBe('3/6');
    }
  });

  it('is no task when nothing or the whole bar would be shaded', () => {
    expect(barItem({ task: 'shade', parts: 4, units: 4 }, 'de')).toBeNull();
    expect(barItem({ task: 'shade', parts: 2, units: 5 }, 'de')).toBeNull();
  });

  it('keys the right amount for every task the contract admits', () => {
    for (const parts of PARTS) {
      for (const units of UNITS) {
        const task = BarTask.parse({ task: 'shade', parts, units });
        const item = barItem(task, 'de');
        if (units >= parts) {
          expect(item, `shade ${units}/${parts} is not a fraction of the bar`).toBeNull();
          continue;
        }
        expect(item, `shade ${units}/${parts}`).not.toBeNull();
        expect(value(item?.answer ?? ''), `shade ${units}/${parts}`).toBeCloseTo(units / parts, 12);
      }
    }
  });
});

describe('compare: two bars of the same length', () => {
  it('asks which is more and keys the one that is', () => {
    const item = barItem({ task: 'compare', left: '1/2', right: '3/5' }, 'de');
    expect(item?.prompt).toBe('Welcher Bruch ist größer: $\\frac{1}{2}$ oder $\\frac{3}{5}$?');
    expect(item?.answer).toBe('3/5');
    // The two bars are what she touches, so they are the surface and not a figure.
    expect(item?.figure).toBeNull();
    expect(surfaceOf({ task: 'compare', left: '1/2', right: '3/5' })).toEqual({
      mode: 'pick',
      bars: [
        { parts: 2, filled: 1 },
        { parts: 5, filled: 3 },
      ],
    });
  });

  it('is no task when both sides are the same amount', () => {
    expect(barItem({ task: 'compare', left: '2/3', right: '2/3' }, 'de')).toBeNull();
  });

  it('keys the larger amount for every pair the contract admits', () => {
    for (const left of BAR_FRACTIONS) {
      for (const right of BAR_FRACTIONS) {
        const item = barItem(BarTask.parse({ task: 'compare', left, right }), 'de');
        if (left === right) {
          expect(item, `${left} vs ${right}`).toBeNull();
          continue;
        }
        const l = asFraction(left);
        const r = asFraction(right);
        const bigger = l.num / l.den > r.num / r.den ? l : r;
        expect(item, `${left} vs ${right}`).not.toBeNull();
        expect(value(item?.answer ?? ''), `${left} vs ${right}`).toBeCloseTo(
          bigger.num / bigger.den,
          12,
        );
      }
    }
  });
});

describe('add: two amounts on one bar', () => {
  it('names them in lowest terms, draws both and keys the sum', () => {
    // The sentence the issue opens with: "1/2 + 1/4".
    const item = barItem({ task: 'add', parts: 4, first: 2, second: 1 }, 'de');
    expect(item?.prompt).toBe('Rechne $\\frac{1}{2}$ + $\\frac{1}{4}$ und färbe das Ergebnis ein.');
    expect(item?.answer).toBe('3/4');
    expect(item?.figure).toEqual({
      type: 'fraction',
      shape: 'bar',
      fractions: [
        { parts: 4, filled: 2 },
        { parts: 4, filled: 1 },
      ],
    });
  });

  it('is no task when the two amounts no longer fit on one bar', () => {
    expect(barItem({ task: 'add', parts: 4, first: 3, second: 2 }, 'de')).toBeNull();
  });

  it('keys the right sum for every task the contract admits', () => {
    for (const parts of PARTS) {
      for (const first of UNITS) {
        for (const second of UNITS) {
          const task = BarTask.parse({ task: 'add', parts, first, second });
          const item = barItem(task, 'de');
          if (first + second > parts) {
            expect(item, `${first}/${parts} + ${second}/${parts} is past the bar`).toBeNull();
            continue;
          }
          expect(item, `${first}/${parts} + ${second}/${parts}`).not.toBeNull();
          expect(value(item?.answer ?? '')).toBeCloseTo((first + second) / parts, 12);
        }
      }
    }
  });
});

describe('what every computed question carries', () => {
  const every: BarTask[] = [
    ...PARTS.flatMap((parts) => UNITS.map((units) => ({ task: 'shade' as const, parts, units }))),
    ...BAR_FRACTIONS.flatMap((left) =>
      BAR_FRACTIONS.map((right) => ({ task: 'compare' as const, left, right })),
    ),
    ...PARTS.flatMap((parts) =>
      UNITS.flatMap((first) =>
        UNITS.map((second) => ({ task: 'add' as const, parts, second, first })),
      ),
    ),
  ];

  it('a question, a key, a topic, hints and a worked solution — never a stub (rule 12)', () => {
    for (const task of every) {
      const item = barItem(task, 'de');
      if (!item) continue;
      expect(item.prompt.length, JSON.stringify(task)).toBeGreaterThan(5);
      expect(item.answer.length).toBeGreaterThan(0);
      expect(item.topic?.length ?? 0).toBeGreaterThan(0);
      expect(item.hints.length).toBe(2);
      expect(item.hints.every((h) => h.trim().length > 0)).toBe(true);
      expect((item.worked_solution ?? '').trim().length).toBeGreaterThan(0);
      expect(item.unit).toBeNull();
      expect(item.choices).toBeNull();
      expect(item.tolerance).toBeNull();
    }
  });

  // The check #157 put in front of every model-written key, applied to the computed one:
  // where the prompt IS arithmetic, the key must agree with it. A key computed from the
  // same parameters as the prompt cannot fail this — and that is the point of measuring it.
  it('a key that never contradicts its own question (issue #157)', () => {
    for (const task of every) {
      const item = barItem(task, 'de');
      if (!item) continue;
      expect(
        keyAgreesWithPrompt({
          kind: item.kind,
          prompt: item.prompt,
          answer: item.answer,
          unit: item.unit,
        }),
        JSON.stringify(task),
      ).toBe(true);
    }
  });

  it('a surface that says how to answer and never what the answer is', () => {
    for (const task of every) {
      const item = barItem(task, 'de');
      if (!item) continue;
      const surface = surfaceOf(task);
      if (surface.mode === 'shade') {
        // Only how fine the bar is: there is no field a solution could hide in.
        expect(Object.keys(surface).sort()).toEqual(['mode', 'parts']);
        expect(surface.parts).toBe('parts' in task ? task.parts : 0);
      } else {
        // The two bars the question already names in words; which is more is not said.
        expect(surface.bars).toHaveLength(2);
        const keyValue = value(item.answer);
        const shown = surface.bars.map((b) => b.filled / b.parts);
        expect(shown.filter((v) => Math.abs(v - keyValue) < 1e-12)).toHaveLength(1);
      }
    }
  });
});

describe('a prepared set', () => {
  it('takes at most MAX_BAR_ITEMS tasks and drops only the ones that are no task', () => {
    const asked: BarTask[] = [
      { task: 'shade', parts: 4, units: 2 },
      { task: 'shade', parts: 2, units: 5 }, // no task: past the bar
      { task: 'compare', left: '1/2', right: '1/3' },
      { task: 'add', parts: 6, first: 1, second: 2 },
      { task: 'add', parts: 6, first: 5, second: 5 },
    ];
    // Only the first MAX_BAR_ITEMS are looked at at all (rule 16: a tool, not a catalogue).
    expect(barItems(asked, 'de').map((i) => i.bar_task)).toEqual([
      { task: 'shade', parts: 4, units: 2 },
      { task: 'compare', left: '1/2', right: '1/3' },
    ]);
    expect(MAX_BAR_ITEMS).toBe(3);
  });
});

describe('a task read back from the database', () => {
  it('is the task it was, and anything else is no task rather than a guess', () => {
    expect(taskOf({ task: 'shade', parts: 4, units: 2 })).toEqual({
      task: 'shade',
      parts: 4,
      units: 2,
    });
    expect(taskOf(null)).toBeNull();
    expect(taskOf(undefined)).toBeNull();
    expect(taskOf({ task: 'shade', parts: 99, units: 2 })).toBeNull();
    expect(taskOf('shade 2/4')).toBeNull();
  });
});
