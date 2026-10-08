import { describe, expect, it } from 'vitest';

import { followsOn, formulaHolds, partTaskItems, type PartTaskDraft } from '../taskParts.js';

function part(answer: string, from: string | null = null, kind = 'numeric') {
  return {
    kind: kind as 'numeric',
    prompt: `Berechne den Wert (${answer}).`,
    answer,
    accepted_answers: [],
    unit: kind === 'numeric' ? 'm' : null,
    choices: null,
    correct_choice: null,
    tolerance: null,
    from,
  };
}

function task(...parts: ReturnType<typeof part>[]): PartTaskDraft {
  return {
    stem: 'Ein Rechteck ist 4 m lang und 2,5 m breit. Ein Zaun soll es umgeben.',
    topic: 'Umfang',
    difficulty: 2,
    prompt_lang: 'de',
    parts,
  };
}

describe('tasks in parts (#297): writing', () => {
  it('letters the parts in order and gives them one group', () => {
    const items = partTaskItems(task(part('10'), part('13', 'a + 3'), part('26', 'b * 2')));
    expect(items.map((i) => i.task_part?.part)).toEqual(['a', 'b', 'c']);
    expect(new Set(items.map((i) => i.task_part?.group)).size).toBe(1);
    expect(items.every((i) => i.task_part?.of === 3)).toBe(true);
  });

  it('recomputes with decimal commas and to the key’s precision', () => {
    expect(formulaHolds('a * 0,15 + 12', 1, [part('80'), part('24')])).toBe(true);
    // 10 / 3 written as 3.33: the key's two decimals decide.
    expect(formulaHolds('a / 3', 1, [part('10'), part('3.33')])).toBe(true);
    expect(formulaHolds('a / 3', 1, [part('10'), part('3.3')])).toBe(true);
    expect(formulaHolds('a / 3', 1, [part('10'), part('3.4')])).toBe(false);
  });

  it('drops the whole task for a formula that does not hold or points nowhere', () => {
    // Does not give its own key.
    expect(partTaskItems(task(part('10'), part('14', 'a + 3')))).toEqual([]);
    // Names a later part, itself, a part that does not exist, or nothing at all.
    expect(partTaskItems(task(part('13', 'b'), part('13')))).toEqual([]);
    expect(partTaskItems(task(part('10'), part('13', 'b + 3')))).toEqual([]);
    expect(partTaskItems(task(part('10'), part('13', 'd + 3')))).toEqual([]);
    expect(partTaskItems(task(part('10'), part('13', '10 + 3')))).toEqual([]);
    // Unreadable.
    expect(partTaskItems(task(part('10'), part('13', 'a +* 3')))).toEqual([]);
    // Builds on a part that is no number.
    expect(partTaskItems(task(part('Rechteck', null, 'short'), part('13', 'a + 3')))).toEqual([]);
    // A formula on a part that is no number.
    expect(partTaskItems(task(part('10'), { ...part('mehr', 'a + 3', 'short') }))).toEqual([]);
  });
});

describe('tasks in parts (#297): Folgefehler', () => {
  const [, b] = partTaskItems(task(part('10'), part('13', 'a + 3')));
  const p = b!.task_part!;

  it('follows her wrong a) to a right b)', () => {
    expect(followsOn(p, b!, '12 m', [{ part: 'a', answer: '10', text: '9 m' }])).toBe('a');
    // Her working, ending in the number: the last value counts.
    expect(followsOn(p, b!, '9 + 3 = 12', [{ part: 'a', answer: '10', text: '9' }])).toBe('a');
  });

  it('says nothing when her a) was right, missing, unreadable, or b) does not follow', () => {
    expect(followsOn(p, b!, '13 m', [{ part: 'a', answer: '10', text: '10 m' }])).toBeNull();
    expect(followsOn(p, b!, '12 m', [])).toBeNull();
    expect(
      followsOn(p, b!, '12 m', [{ part: 'a', answer: '10', text: 'keine Ahnung' }]),
    ).toBeNull();
    expect(followsOn(p, b!, '11 m', [{ part: 'a', answer: '10', text: '9 m' }])).toBeNull();
  });
});
