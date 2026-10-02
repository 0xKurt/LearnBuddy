// Structured items, Regel 0 in both directions (issues #224, #228): what the model wrote is
// checked before it is stored, and what she answers is compared with the key exactly.
// Every rejection the issue names is a test here, and every one is reached through the same
// function the server uses — `orderTaskFrom` for a draft, `orderProblem` for a task built by
// hand (a stored row could hold one; a draft can never produce a key that is not a
// permutation, because code writes the key).

import { StructuredTask, type OrderTask } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import {
  answerTextOf,
  checkStructured,
  orderProblem,
  orderTaskFrom,
  ORDER_JOIN,
  solutionOf,
  structuredItem,
  structuredItems,
  structuredReply,
  structuredTaskOf,
  viewOf,
} from '../structured.js';

const STEPS = [
  'Samen quillt auf',
  'Keimwurzel wächst',
  'Keimblätter öffnen sich',
  'Erste Laubblätter',
];

/** A task built by hand: elements in display order, the key as given. */
function handmade(
  elements: string[],
  key: string[],
  numeric: OrderTask['numeric'] = null,
): OrderTask {
  return {
    type: 'order',
    elements: elements.map((text, i) => ({ id: String.fromCharCode(97 + i), text })),
    key,
    numeric,
  };
}

function built(correct: string[], numeric: OrderTask['numeric'] = null): OrderTask {
  const task = orderTaskFrom(correct, numeric);
  expect(task, `"${correct.join(' | ')}" should be a task`).not.toBeNull();
  return task!;
}

/** Her answer that puts the elements in the order of these texts. */
function answerFor(task: OrderTask, texts: string[]) {
  const byText = new Map(task.elements.map((e) => [e.text, e.id]));
  return { type: 'order' as const, order: texts.map((x) => byText.get(x) ?? 'zz') };
}

describe('order: what the model wrote (Regel 0)', () => {
  it('builds a task whose key reads back as the order the model wrote', () => {
    const task = built(STEPS);
    expect(task.elements).toHaveLength(4);
    expect(solutionOf(task)).toBe(STEPS.join(ORDER_JOIN));
    expect(orderProblem(task)).toBeNull();
    expect(StructuredTask.safeParse(task).success).toBe(true);
  });

  it('never shows the elements in the right order, nor reversed', () => {
    for (let n = 3; n <= 8; n++) {
      for (let variant = 0; variant < 25; variant++) {
        const correct = Array.from({ length: n }, (_, i) => `Schritt ${variant}-${i}`);
        const task = built(correct);
        const shown = task.elements.map((e) => e.text);
        expect(shown).not.toEqual(correct);
        expect(shown).not.toEqual([...correct].reverse());
      }
    }
  });

  it('gives ids that say where an element stands, not where it belongs', () => {
    const task = built(STEPS);
    expect(task.elements.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(task.key).not.toEqual(['a', 'b', 'c', 'd']);
  });

  it('shuffles the same elements the same way every time (replay, second reading)', () => {
    expect(built(STEPS)).toEqual(built(STEPS));
  });

  it('rejects fewer than 3 and more than 8 elements', () => {
    expect(orderTaskFrom(['eins', 'zwei'], null)).toBeNull();
    expect(
      orderTaskFrom(
        Array.from({ length: 9 }, (_, i) => `E${i}`),
        null,
      ),
    ).toBeNull();
    expect(orderProblem(handmade(['a', 'b'], ['a', 'b']))).toBe('count');
    expect(built(['x', 'y', 'z']).elements).toHaveLength(3);
    expect(built(Array.from({ length: 8 }, (_, i) => `E${i}`)).elements).toHaveLength(8);
  });

  it('rejects elements that are the same after normalising', () => {
    expect(orderTaskFrom(['Keimung', 'keimung', 'Blüte'], null)).toBeNull();
    expect(orderTaskFrom(['Keimung.', ' Keimung ', 'Blüte'], null)).toBeNull();
    expect(orderTaskFrom(['$\\frac{1}{2}$', '\\frac{1}{2}', '1'], 'ascending')).toBeNull();
    expect(orderProblem(handmade(['Straße', 'STRASSE', 'Weg'], ['a', 'b', 'c']))).toBe('duplicate');
    // Not the same: a sign or an operator is part of what an element says.
    expect(orderTaskFrom(['-3', '3', '5'], 'ascending')).not.toBeNull();
  });

  it('rejects a key that is not a permutation of the elements', () => {
    const els = ['erstens', 'zweitens', 'drittens'];
    expect(orderProblem(handmade(els, ['a', 'b', 'b']))).toBe('not_permutation');
    expect(orderProblem(handmade(els, ['a', 'b']))).toBe('not_permutation');
    expect(orderProblem(handmade(els, ['a', 'b', 'c', 'c']))).toBe('not_permutation');
    expect(orderProblem(handmade(els, ['a', 'b', 'x']))).toBe('not_permutation');
    expect(orderProblem(handmade(els, ['c', 'a', 'b']))).toBeNull();
  });

  it('rejects a numeric sequence whose key is not sorted the way it says', () => {
    expect(orderTaskFrom(['3', '1', '2'], 'ascending')).toBeNull();
    expect(orderTaskFrom(['1', '2', '3'], 'descending')).toBeNull();
    expect(orderProblem(handmade(['2', '1', '3'], ['a', 'b', 'c'], 'ascending'))).toBe(
      'numeric_unsorted',
    );
    // Two equal values have no order between them: the key would be a guess.
    expect(orderTaskFrom(['0,5', '$\\frac{1}{2}$', '2'], 'ascending')).toBeNull();
    // Sorted by VALUE, not by how the numbers are written.
    expect(built(['-2', '0,5', '$\\frac{3}{4}$', '10'], 'ascending').numeric).toBe('ascending');
    expect(built(['1789', '1492', '800'], 'descending').numeric).toBe('descending');
  });

  it('rejects numbers without a stated direction, and a direction without numbers', () => {
    expect(orderTaskFrom(['1', '2', '3'], null)).toBeNull();
    expect(orderProblem(handmade(['1', '2', '3'], ['a', 'b', 'c']))).toBe(
      'numbers_without_direction',
    );
    expect(orderTaskFrom(['eins', 'zwei', 'drei'], 'ascending')).toBeNull();
    expect(orderProblem(handmade(['3 cm', '4 m', '5 cm'], ['a', 'b', 'c'], 'ascending'))).toBe(
      'not_numbers',
    );
  });

  it('turns a draft into a question: prompt and topic the model wrote, key and answer computed', () => {
    const item = structuredItem({
      type: 'order',
      prompt: 'Bring die Keimung in die richtige Reihenfolge.',
      elements: STEPS,
      numeric: null,
      topic: 'Keimung',
      difficulty: 2,
      prompt_lang: 'de',
      hints: [
        'Was passiert, bevor die Pflanze Licht braucht?',
        `Die Lösung: ${STEPS.join(ORDER_JOIN)}`,
      ],
      worked_solution: 'Zuerst nimmt der Samen Wasser auf …',
    });
    expect(item).not.toBeNull();
    expect(item?.kind).toBe('order');
    expect(item?.answer).toBe(STEPS.join(ORDER_JOIN));
    expect(item?.accepted_answers).toEqual([]);
    // A hint that gives the whole order away is dropped like every leaking hint.
    expect(item?.hints).toEqual(['Was passiert, bevor die Pflanze Licht braucht?']);
  });

  it('drops a failing draft and keeps the others; only allowed kinds; at most max', () => {
    const ok = {
      type: 'order' as const,
      prompt: 'Ordne.',
      numeric: null,
      topic: null,
      difficulty: 2,
      prompt_lang: null,
    };
    const items = structuredItems(
      [
        { ...ok, elements: STEPS },
        { ...ok, elements: ['A', 'a', 'B'] },
        { ...ok, elements: ['x', 'y', 'z'] },
      ],
      new Set(['order']),
    );
    expect(items.map((i) => i.task.elements.length)).toEqual([4, 3]);
    expect(structuredItems([{ ...ok, elements: STEPS }], new Set())).toEqual([]);
    expect(
      structuredItems(
        Array.from({ length: 6 }, (_, i) => ({ ...ok, elements: [`a${i}`, `b${i}`, `c${i}`] })),
        new Set(['order']),
        2,
      ),
    ).toHaveLength(2);
  });
});

describe('order: the stored task, read back', () => {
  it('reads a sound task and refuses anything else', () => {
    const task = built(STEPS);
    expect(structuredTaskOf(task, 'order')).toEqual(task);
    expect(structuredTaskOf(task, 'match')).toBeNull();
    expect(structuredTaskOf(null, 'order')).toBeNull();
    expect(structuredTaskOf({ type: 'order' }, 'order')).toBeNull();
    expect(
      structuredTaskOf(
        { ...task, key: [task.key[0], task.key[0], task.key[1], task.key[2]] },
        'order',
      ),
    ).toBeNull();
  });

  it('shows the elements and never the key or the direction', () => {
    const task = built(['1', '2', '3'], 'ascending');
    const view = viewOf(task);
    expect(view).toEqual({ type: 'order', elements: task.elements });
    expect(JSON.stringify(view)).not.toContain('key');
    expect(JSON.stringify(view)).not.toContain('ascending');
  });
});

describe('order: her answer (Regel 0)', () => {
  const task = built(STEPS);

  it('is right in the right order', () => {
    const check = checkStructured(task, answerFor(task, STEPS));
    expect(check).toEqual({
      type: 'order',
      correct: true,
      parts: answerFor(task, STEPS).order.map((id) => ({ id, ok: true })),
      first_wrong: null,
    });
  });

  it('names the first place that is wrong', () => {
    const swapped = [STEPS[0]!, STEPS[1]!, STEPS[3]!, STEPS[2]!];
    const check = checkStructured(task, answerFor(task, swapped));
    expect(check?.correct).toBe(false);
    expect(check?.first_wrong).toBe(3);
    expect(check?.parts.map((p) => p.ok)).toEqual([true, true, false, false]);
    expect(structuredReply('de', check!)).toBe(
      "Bis Schritt 2 stimmt's! Ab Schritt 3 passt die Reihenfolge noch nicht ganz.",
    );
    const wrongStart = checkStructured(task, answerFor(task, [...STEPS].reverse()));
    expect(wrongStart?.first_wrong).toBe(1);
    expect(structuredReply('de', wrongStart!)).toBe(
      'Noch nicht ganz – schau nochmal, was ganz am Anfang steht.',
    );
    // Kind in every language, and never just "wrong".
    for (const locale of ['en', 'fr', 'es', 'it']) {
      expect(structuredReply(locale, check!)).toContain('2');
      expect(structuredReply(locale, check!)).toContain('3');
    }
  });

  it('refuses an answer that is not every element exactly once', () => {
    const ids = task.elements.map((e) => e.id);
    expect(checkStructured(task, { type: 'order', order: ids.slice(0, 3) })).toBeNull();
    expect(
      checkStructured(task, { type: 'order', order: [ids[0]!, ...ids.slice(0, 3)] }),
    ).toBeNull();
    expect(checkStructured(task, { type: 'order', order: [...ids.slice(0, 3), 'zz'] })).toBeNull();
  });

  it('writes her answer into the conversation in her order', () => {
    const mine = [STEPS[1]!, STEPS[0]!, STEPS[2]!, STEPS[3]!];
    expect(answerTextOf(task, answerFor(task, mine))).toBe(mine.join(ORDER_JOIN));
  });
});
