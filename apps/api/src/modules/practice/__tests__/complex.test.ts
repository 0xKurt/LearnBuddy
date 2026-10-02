// Tasks with several parts (issue #297): what code checks before a part exists, and how it
// recomputes a part with HER earlier result (Folgefehler).

import { describe, expect, it } from 'vitest';

import {
  carriedKey,
  complexItems,
  complexRefs,
  complexTaskOf,
  evaluateCalc,
  herValue,
  keySaysValue,
  labelsOf,
  numbersIn,
  readCalc,
  tutorMaterial,
  type ComplexDraft,
  type ComplexPartDraft,
} from '../complex.js';

const part = (p: Partial<ComplexPartDraft> & Pick<ComplexPartDraft, 'kind'>): ComplexPartDraft => ({
  prompt: 'Berechne.',
  answer: '1',
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  tolerance: null,
  uses: [],
  calc: null,
  hints: [],
  points: [],
  difficulty: 3,
  ...p,
});

/** A bike: v from s and t, then the kinetic energy with v, then a reason. */
export const BIKE: ComplexDraft = {
  title: 'Radfahrt',
  topic: 'Geschwindigkeit und Energie',
  lang: 'de',
  lines: [
    'Lena fährt mit dem Rad 100 m',
    'in 8 s. Lena und ihr Rad haben',
    'zusammen eine Masse von 80 kg.',
  ],
  figure: null,
  givens: [
    { name: 's', value: 100, unit: 'm' },
    { name: 't', value: 8, unit: 's' },
    { name: 'm', value: 80, unit: 'kg' },
  ],
  parts: [
    part({
      kind: 'numeric',
      prompt: 'Berechne ihre Geschwindigkeit.',
      answer: '12.5',
      unit: 'm/s',
      calc: 's / t',
    }),
    part({
      kind: 'numeric',
      prompt: 'Berechne mit deinem Ergebnis aus a) die Bewegungsenergie.',
      answer: '6250',
      unit: 'J',
      calc: '0.5 * m * [a]^2',
    }),
    part({
      kind: 'long',
      prompt: 'Begründe, warum sich die Energie vervierfacht, wenn sie doppelt so schnell fährt.',
      answer: 'Die Energie hängt vom Quadrat der Geschwindigkeit ab.',
      uses: ['b'],
    }),
  ],
};

const withPart = (i: number, p: Partial<ComplexPartDraft>): ComplexDraft => ({
  ...BIKE,
  parts: BIKE.parts.map((x, n) => (n === i ? { ...x, ...p } : x)),
});

describe('complexItems: what is stored', () => {
  it('stores every part, one group, with its place, what it builds on and its calculation', () => {
    const items = complexItems(BIKE, 'de', {
      newGroup: () => '00000000-0000-4000-8000-000000000297',
    });
    expect(items).toHaveLength(3);
    const tasks = items.map((i) => i.complex_task!);
    expect(new Set(tasks.map((t) => t.group)).size).toBe(1);
    expect(tasks.map((t) => [t.part, t.parts])).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
    ]);
    // b) builds on a) because its calculation reads [a]; c) because the model said so.
    expect(tasks.map((t) => t.uses)).toEqual([[], [0], [1]]);
    expect(tasks.map((t) => t.calc)).toEqual(['s / t', '0.5 * m * [a]^2', null]);
    expect(items.map((i) => i.kind)).toEqual(['numeric', 'numeric', 'long']);
    expect(tasks[0]!.material.lines).toEqual(BIKE.lines);
    expect(items.every((i) => i.topic === BIKE.topic && i.prompt_lang === 'de')).toBe(true);
  });

  it('accepts a decimal key that is the value rounded as written', () => {
    const draft: ComplexDraft = {
      ...BIKE,
      lines: [...BIKE.lines, 'Danach fährt sie 50 m in 7 s.'],
      givens: [
        ...BIKE.givens,
        { name: 's2', value: 50, unit: 'm' },
        { name: 't2', value: 7, unit: 's' },
      ],
      parts: [
        BIKE.parts[0]!,
        part({
          kind: 'numeric',
          prompt: 'Berechne die zweite Geschwindigkeit.',
          answer: '7.14',
          unit: 'm/s',
          calc: 's2/t2',
        }),
      ],
    };
    expect(complexItems(draft, 'de')).toHaveLength(2);
  });
});

describe('complexItems: a draft that does not work out is no task (Regel 0)', () => {
  it('rejects a key the calculation does not give', () => {
    expect(complexItems(withPart(1, { answer: '6000' }), 'de')).toEqual([]);
  });

  it('rejects a key computed from the wrong earlier result', () => {
    // 0.5 · 80 · 12² — the key of b) with a wrong a) baked in.
    expect(complexItems(withPart(1, { answer: '5760' }), 'de')).toEqual([]);
  });

  it('rejects a quantity that is not in the material', () => {
    expect(
      complexItems(
        {
          ...BIKE,
          givens: [...BIKE.givens.slice(0, 2), { name: 'm', value: 75, unit: 'kg' }],
        },
        'de',
      ),
    ).toEqual([]);
  });

  it('rejects a dependency that points nowhere: forward, to itself, or past the end', () => {
    expect(complexItems(withPart(0, { uses: ['b'] }), 'de')).toEqual([]);
    expect(complexItems(withPart(1, { uses: ['b'] }), 'de')).toEqual([]);
    expect(complexItems(withPart(2, { uses: ['e'] }), 'de')).toEqual([]);
    expect(complexItems(withPart(1, { calc: '0.5 * m * [c]^2' }), 'de')).toEqual([]);
  });

  it('rejects a calculation with a name nobody defined, or that does not parse', () => {
    expect(complexItems(withPart(0, { calc: 'strecke / t' }), 'de')).toEqual([]);
    expect(complexItems(withPart(0, { calc: 's / (t' }), 'de')).toEqual([]);
  });

  it('rejects a number part without a calculation', () => {
    expect(complexItems(withPart(0, { calc: null }), 'de')).toEqual([]);
  });

  it('rejects a calculation with the result of a part that is no number', () => {
    const draft: ComplexDraft = {
      ...BIKE,
      parts: [
        part({ kind: 'short', prompt: 'Welche Größe ist gesucht?', answer: 'die Geschwindigkeit' }),
        part({
          kind: 'numeric',
          prompt: 'Berechne sie.',
          answer: '12.5',
          unit: 'm/s',
          calc: '[a] * 2',
        }),
      ],
    };
    expect(complexItems(draft, 'de')).toEqual([]);
  });

  it('rejects a part that names a line the material does not have', () => {
    expect(complexItems(withPart(2, { prompt: 'Erkläre Z. 9.' }), 'de')).toEqual([]);
  });

  it('rejects a task with one part, and a material that is neither text nor figure', () => {
    expect(complexItems({ ...BIKE, parts: [BIKE.parts[0]!] }, 'de')).toEqual([]);
    expect(
      complexItems(
        {
          ...BIKE,
          lines: [],
          givens: [],
          parts: BIKE.parts.slice(2).concat(BIKE.parts.slice(2)),
        },
        'de',
      ),
    ).toEqual([]);
  });

  it('rejects the whole task when one part fails the check of its own kind', () => {
    // A multiple choice whose index points past its options.
    const draft = withPart(2, {
      kind: 'multiple_choice',
      choices: ['größer', 'kleiner'],
      correct_choice: 3,
      answer: 'größer',
    });
    expect(complexItems(draft, 'de')).toEqual([]);
  });
});

describe('the calculation', () => {
  it('reads givens and earlier parts, a given winning over a function name', () => {
    const calc = readCalc(
      'e * [a] + sqrt(x1)',
      [
        { name: 'e', value: 2, unit: null },
        { name: 'x1', value: 9, unit: null },
      ],
      1,
    )!;
    expect(
      evaluateCalc(
        calc,
        [
          { name: 'e', value: 2, unit: null },
          { name: 'x1', value: 9, unit: null },
        ],
        new Map([[0, 5]]),
      ),
    ).toBe(13);
  });

  it('refuses a part that does not come before', () => {
    expect(readCalc('[b] * 2', [], 1)).toBeNull();
    expect(readCalc('[a] * 2', [], 0)).toBeNull();
  });

  it('reads a key the way a learner answer is read (D-1)', () => {
    expect(keySaysValue('12.35', 12.3456, null)).toBe(true);
    expect(keySaysValue('12.3', 12.3456, null)).toBe(true);
    expect(keySaysValue('12.4', 12.3456, null)).toBe(false);
    expect(keySaysValue('8', 7.6, null)).toBe(false);
    expect(keySaysValue('8', 7.6, 0.5)).toBe(true);
  });

  it('finds numbers the way a sheet prints them', () => {
    expect(numbersIn('m = 2,5 kg, s = 1.000 m, t = 1 200 s, ΔT = −3')).toEqual(
      expect.arrayContaining([2.5, 1000, 1200, -3]),
    );
  });
});

describe('Folgefehler', () => {
  const [a, b, c] = complexItems(BIKE, 'de');
  const keys = new Map([[0, a!.answer]]);

  it('recomputes b) with her value from a)', () => {
    expect(carriedKey(b!.complex_task!, b!.answer, keys, new Map([[0, '12']]))).toEqual({
      key: '5760',
      from: [0],
    });
  });

  it('reads her value from the last line of a written way', () => {
    expect(herValue('v = 100 : 8\nv = 12,4')).toBe(12.4);
    expect(herValue('irgendwas')).toBeNull();
    // A non-whole value needs more places than a whole key: written to two decimals.
    expect(carriedKey(b!.complex_task!, b!.answer, keys, new Map([[0, '12,4']]))?.key).toBe(
      '6150.40',
    );
  });

  it('has nothing to carry when her a) is right, missing or no number', () => {
    const t = b!.complex_task!;
    expect(carriedKey(t, b!.answer, keys, new Map([[0, '12,5']]))).toBeNull();
    expect(carriedKey(t, b!.answer, keys, new Map())).toBeNull();
    expect(carriedKey(t, b!.answer, keys, new Map([[0, 'weiß nicht']]))).toBeNull();
    // An open part has no calculation: the tutor judges it with her results.
    expect(carriedKey(c!.complex_task!, c!.answer, keys, new Map([[1, '5000']]))).toBeNull();
  });

  it('tells the tutor her answers to the parts this one builds on', () => {
    const text = tutorMaterial(c!.complex_task!, [
      { part: 0, prompt: 'a', key: '12.5', hers: '12' },
      { part: 1, prompt: 'Berechne die Energie.', key: '6250', hers: '5760' },
    ]);
    expect(text).toContain('1  Lena fährt');
    expect(text).toContain('b) Berechne die Energie. — HER ANSWER: 5760');
    // Only what it builds on.
    expect(text).not.toContain('a) a');
  });

  it('names the parts in words', () => {
    expect(labelsOf([0], 'und')).toBe('a)');
    expect(labelsOf([0, 1, 2], 'und')).toBe('a), b) und c)');
  });
});

describe('views', () => {
  it('gives the parts of one task one alias, in order', () => {
    const one = complexItems(BIKE, 'de', {
      newGroup: () => '00000000-0000-4000-8000-000000000001',
    });
    const two = complexItems(BIKE, 'de', {
      newGroup: () => '00000000-0000-4000-8000-000000000002',
    });
    const rows = [...one, ...two].map((it, n) => ({ id: `i${n}`, complex_task: it.complex_task }));
    const refs = complexRefs([...rows, { id: 'plain', complex_task: null }]);
    expect([...refs.values()]).toEqual(['k1', 'k1', 'k1', 'k2', 'k2', 'k2']);
    expect(refs.has('plain')).toBe(false);
    expect(complexTaskOf({ group: 'nope' })).toBeNull();
  });
});

describe('the five subjects of issue #297', () => {
  it('each fixture is a task code lets through, every part of it', async () => {
    const { MATHE, PHYSIK, CHEMIE, GESCHICHTE, DEUTSCH } =
      await import('../../../testing/complex-tasks.js');
    const { ComplexDraft } = await import('../complex.js');
    for (const fixture of [MATHE, PHYSIK, CHEMIE, GESCHICHTE, DEUTSCH]) {
      const draft = ComplexDraft.parse(fixture);
      const items = complexItems(draft, 'de');
      expect(
        items.map((i) => i.prompt),
        fixture.title,
      ).toEqual(draft.parts.map((p) => p.prompt));
    }
  });

  it('the chain goes on: c) of the tariff uses HER b), which used the key of a)', async () => {
    const { MATHE } = await import('../../../testing/complex-tasks.js');
    const { ComplexDraft } = await import('../complex.js');
    const [, b, c] = complexItems(ComplexDraft.parse(MATHE), 'de');
    // Her b) was 22.59 (she took 0.105 €/min): c) is 9.99 / 22.59 · 100 = 44.2 %.
    expect(
      carriedKey(c!.complex_task!, c!.answer, new Map([[1, b!.answer]]), new Map([[1, '22,59']])),
    ).toEqual({ key: '44.2', from: [1] });
  });
});

describe('the key points of an open part', () => {
  it('become the rubric every free text has: one judged element each', async () => {
    const { GESCHICHTE } = await import('../../../testing/complex-tasks.js');
    const { ComplexDraft } = await import('../complex.js');
    const [, , c] = complexItems(ComplexDraft.parse(GESCHICHTE), 'de');
    expect(c!.rubric).toEqual({
      form: 'Antwort',
      elements: [
        {
          name: 'Eigenes Urteil',
          missing: 'Nimm das noch in deine Antwort auf.',
          check: { by: 'judged' },
        },
        {
          name: 'Textbeleg',
          missing: 'Nimm das noch in deine Antwort auf.',
          check: { by: 'judged' },
        },
      ],
    });
    // One point is no rubric: the part is then judged like any free text.
    const one = complexItems(
      ComplexDraft.parse({
        ...GESCHICHTE,
        parts: GESCHICHTE.parts.map((p, n) => (n === 2 ? { ...p, points: ['Urteil'] } : p)),
      }),
      'de',
    );
    expect(one[2]!.rubric).toBeNull();
  });
});
