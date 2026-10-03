// Kopfrechnen (issue #243): the generator, the order, the check and the line at the end —
// everything a round is, without a database. `__tests__/drill.int.test.ts` holds the HTTP side
// (20 tasks, zero model calls, another learner, a repeated answer) on a real Postgres.

import {
  DRILL_RANGES,
  DrillSpec,
  type DrillSpec as Spec,
} from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import {
  answerOf,
  carries,
  checkDrill,
  drillLine,
  factOf,
  factsOf,
  groupOf,
  keyOf,
  pickRound,
  promptOf,
  titleOf,
  valueOf,
  weightOf,
  type Fact,
  type FactState,
} from '../drill.js';

const spec = (s: Partial<Spec> & Pick<Spec, 'range'>): Spec => DrillSpec.parse(s);
const NOW = new Date('2026-10-02T12:00:00Z');

/** Every number a fact holds, for range assertions. */
function numbers(f: Fact): { a: number; b: number; r: number } {
  const v = valueOf(f);
  if (f.op === 'frac') return { a: f.x.n / f.x.d, b: f.y.n / f.y.d, r: v.n / v.d };
  if (f.op === 'pct') return { a: f.p, b: f.of, r: v.n };
  return { a: f.a, b: f.b, r: v.n / v.d };
}

describe('the ranges (factsOf)', () => {
  it('plus up to 10: both at least 1, the sum at most 10', () => {
    const facts = factsOf(spec({ range: 'plus_10' }));
    expect(facts.length).toBe(45);
    for (const f of facts) {
      const { a, b, r } = numbers(f);
      expect(a).toBeGreaterThanOrEqual(1);
      expect(b).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(10);
    }
  });

  it('plus up to 20 with carry: every task crosses the ten, without: none does', () => {
    const withCarry = factsOf(spec({ range: 'plus_20', carry: 'with' }));
    const without = factsOf(spec({ range: 'plus_20', carry: 'without' }));
    const mixed = factsOf(spec({ range: 'plus_20' }));
    expect(withCarry.length).toBeGreaterThan(20);
    expect(without.length).toBeGreaterThan(20);
    expect(withCarry.length + without.length).toBe(mixed.length);
    for (const f of withCarry) {
      expect(carries(f)).toBe(true);
      const { a, b, r } = numbers(f);
      expect((a % 10) + (b % 10)).toBeGreaterThanOrEqual(10);
      expect(r).toBeGreaterThan(10);
      expect(r).toBeLessThanOrEqual(20);
    }
    for (const f of without) expect(carries(f)).toBe(false);
    expect(withCarry.map(keyOf)).toContain('plus:7+5');
    expect(without.map(keyOf)).toContain('plus:12+5');
    expect(without.map(keyOf)).not.toContain('plus:7+5');
  });

  it('minus within 20 and 100: never below zero; carry is borrowing', () => {
    for (const range of ['minus_20', 'minus_100'] as const) {
      const borrow = factsOf(spec({ range, carry: 'with' }));
      const none = factsOf(spec({ range, carry: 'without' }));
      for (const f of borrow) {
        expect(f.op === 'minus' && f.a % 10 < f.b % 10).toBe(true);
        expect(numbers(f).r).toBeGreaterThan(0);
      }
      for (const f of none) expect(f.op === 'minus' && f.a % 10 >= f.b % 10).toBe(true);
    }
    expect(factsOf(spec({ range: 'minus_20', carry: 'with' })).map(keyOf)).toContain('minus:13-5');
  });

  it('plus up to 100: past 20, one two-digit number at least, the sum at most 100', () => {
    for (const f of factsOf(spec({ range: 'plus_100', carry: 'with' }))) {
      const { a, b, r } = numbers(f);
      expect(r).toBeGreaterThan(20);
      expect(r).toBeLessThanOrEqual(100);
      expect(Math.max(a, b)).toBeGreaterThanOrEqual(10);
      expect(carries(f)).toBe(true);
    }
  });

  it('times: the rows she named, both ways round, each task once', () => {
    const facts = factsOf(spec({ range: 'times', rows: [6, 7] }));
    const keys = facts.map(keyOf);
    expect(new Set(keys).size).toBe(keys.length);
    // 6·1…6·10 and 1·6…10·6 (6·6 once) = 19, the same for 7, minus 6·7 and 7·6 counted twice.
    expect(facts.length).toBe(36);
    for (const f of facts)
      expect(f.op === 'times' && (f.a === 6 || f.a === 7 || f.b === 6 || f.b === 7)).toBe(true);
    expect(keys).toEqual(expect.arrayContaining(['times:7x8', 'times:8x7', 'times:6x6']));
    expect(factsOf(spec({ range: 'times' })).length).toBe(100);
  });

  it('divide: always without a remainder, inside the small times table', () => {
    const facts = factsOf(spec({ range: 'divide', rows: [7] }));
    expect(facts.length).toBe(19);
    for (const f of facts) {
      expect(f.op).toBe('divide');
      const { r } = numbers(f);
      expect(Number.isInteger(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(10);
    }
    expect(facts.map(keyOf)).toEqual(expect.arrayContaining(['divide:56/7', 'divide:56/8']));
  });

  it('fractions: one family, proper and in lowest terms, the sum at most 1', () => {
    const facts = factsOf(spec({ range: 'fractions' }));
    expect(facts.length).toBeGreaterThan(20);
    expect(facts.map(keyOf)).toContain('frac:1/2+1/4');
    for (const f of facts) expect(numbers(f).r).toBeLessThanOrEqual(1);
    expect(facts.map(keyOf)).not.toContain('frac:1/2+1/3');
    expect(facts.map(keyOf)).not.toContain('frac:2/4+1/4');
  });

  it('percent: a whole number every time', () => {
    const facts = factsOf(spec({ range: 'percent' }));
    expect(facts.length).toBe(50);
    for (const f of facts) expect(Number.isInteger(numbers(f).r)).toBe(true);
  });

  it('the contract refuses combinations that mean nothing', () => {
    expect(DrillSpec.safeParse({ range: 'plus_10', carry: 'with' }).success).toBe(false);
    expect(DrillSpec.safeParse({ range: 'plus_20', rows: [7] }).success).toBe(false);
    expect(DrillSpec.safeParse({ range: 'times', rows: [7, 7] }).success).toBe(false);
    expect(DrillSpec.safeParse({ range: 'times', rows: [11] }).success).toBe(false);
    expect(DrillSpec.safeParse({ range: 'times', rows: [6, 7] }).success).toBe(true);
  });
});

describe('a key is the one source of its task (factOf)', () => {
  it('every key of every range reads back as the same task', () => {
    for (const range of DRILL_RANGES) {
      for (const f of factsOf(spec({ range }))) expect(factOf(keyOf(f))).toEqual(f);
    }
  });

  it('a key no range can produce is not a task — never checked against a value nobody computed', () => {
    for (const bad of [
      'times:11x3',
      'divide:57/7',
      'minus:5-9',
      'frac:2/4+1/4',
      'frac:1/2+1/3',
      'frac:3/4+1/2',
      'pct:30%80',
      'plus:80+30',
      'times:7*8',
      'nonsense',
    ]) {
      expect(factOf(bad), bad).toBeNull();
    }
  });
});

describe('texts and keys are computed', () => {
  it('reads like a task and solves to the value', () => {
    const f = factOf('times:7x8')!;
    expect(promptOf(f, 'de')).toBe('7 · 8');
    expect(answerOf(f)).toBe('56');
    expect(promptOf(factOf('minus:52-17')!, 'de')).toBe('52 − 17');
    expect(answerOf(factOf('minus:52-17')!)).toBe('35');
    expect(promptOf(factOf('frac:1/2+1/4')!, 'de')).toBe('$\\frac{1}{2} + \\frac{1}{4}$');
    expect(answerOf(factOf('frac:1/2+1/4')!)).toBe('$\\frac{3}{4}$');
    expect(answerOf(factOf('frac:1/2+1/2')!)).toBe('1');
    expect(promptOf(factOf('pct:25%80')!, 'de')).toBe('25 % von 80');
    expect(promptOf(factOf('pct:25%80')!, 'en')).toBe('25% of 80');
    expect(answerOf(factOf('pct:25%80')!)).toBe('20');
  });

  it('names the round in her language', () => {
    expect(titleOf(spec({ range: 'times', rows: [7, 6] }), 'de')).toBe('Einmaleins mit 6 und 7');
    expect(titleOf(spec({ range: 'times', rows: [3, 6, 9] }), 'en')).toBe(
      'Times tables: 3, 6 and 9',
    );
    expect(titleOf(spec({ range: 'plus_20', carry: 'with' }), 'de')).toBe(
      'Plus bis 20 mit Übergang',
    );
    expect(titleOf(spec({ range: 'percent' }), 'it')).toBe('Percentuali');
  });
});

describe('the check (checkDrill) — exact, no model', () => {
  it('right is the value, in any form of it; wrong is wrong', () => {
    const seven8 = factOf('times:7x8')!;
    expect(checkDrill(seven8, '56')).toBe(true);
    expect(checkDrill(seven8, ' 056 ')).toBe(true);
    expect(checkDrill(seven8, '54')).toBe(false);
    expect(checkDrill(seven8, '5 6')).toBe(false);
    expect(checkDrill(seven8, '')).toBe(false);
    const half = factOf('frac:1/2+1/4')!;
    expect(checkDrill(half, '3/4')).toBe(true);
    // Code wrote the task, so it asks for an AMOUNT: every form of three quarters is right.
    expect(checkDrill(half, '6/8')).toBe(true);
    expect(checkDrill(half, '0,75')).toBe(true);
    expect(checkDrill(half, '2/6')).toBe(false);
    expect(checkDrill(half, '3/0')).toBe(false);
    expect(checkDrill(factOf('frac:1/2+1/2')!, '1')).toBe(true);
  });

  it('every task of every range accepts its own key and refuses the neighbour', () => {
    for (const range of ['plus_20', 'minus_100', 'times', 'divide', 'percent'] as const) {
      for (const f of factsOf(spec({ range }))) {
        const v = valueOf(f);
        expect(checkDrill(f, String(v.n / v.d))).toBe(true);
        expect(checkDrill(f, String(v.n / v.d + 1))).toBe(false);
      }
    }
  });
});

describe('the round (pickRound)', () => {
  const times67 = factsOf(spec({ range: 'times', rows: [6, 7] }));

  it('twenty tasks, none twice, none right after its mirror', () => {
    for (let s = 0; s < 200; s++) {
      const round = pickRound(times67, new Map(), NOW, `seed-${s}`);
      expect(round).toHaveLength(20);
      const keys = round.map(keyOf);
      expect(new Set(keys).size).toBe(20);
      for (let i = 1; i < round.length; i++) {
        const [x, y] = [round[i - 1]!, round[i]!];
        const mirror = x.op === 'times' && y.op === 'times' && x.a === y.b && x.b === y.a;
        expect(mirror, `${keys[i - 1]} then ${keys[i]}`).toBe(false);
      }
    }
  });

  it('a smaller range is a shorter round, never a repeated task', () => {
    const divide7 = factsOf(spec({ range: 'divide', rows: [7] }));
    const round = pickRound(divide7, new Map(), NOW, 'small');
    expect(round).toHaveLength(19);
    expect(new Set(round.map(keyOf)).size).toBe(19);
  });

  it('the same seed gives the same round; another seed another one', () => {
    const a = pickRound(times67, new Map(), NOW, 'x').map(keyOf);
    expect(pickRound(times67, new Map(), NOW, 'x').map(keyOf)).toEqual(a);
    expect(pickRound(times67, new Map(), NOW, 'y').map(keyOf)).not.toEqual(a);
  });

  it('does not open with the task the last round ended with', () => {
    for (let s = 0; s < 100; s++) {
      const first = keyOf(pickRound(times67, new Map(), NOW, `r-${s}`)[0]!);
      const again = pickRound(times67, new Map(), NOW, `r-${s}`, { avoidFirst: first });
      expect(keyOf(again[0]!)).not.toBe(first);
    }
  });

  it('FSRS weighting: a missed fact comes far more often than one that sits', () => {
    const all = factsOf(spec({ range: 'times' }));
    const sits: FactState = {
      due: new Date('2026-11-01T00:00:00Z'),
      last_outcome: 'first_try',
      lapses: 0,
    };
    const missed: FactState = {
      due: new Date('2026-10-03T00:00:00Z'),
      last_outcome: 'revealed',
      lapses: 1,
    };
    const states = new Map<string, FactState>(all.map((f) => [keyOf(f), sits]));
    states.set('times:7x8', missed);
    let weak = 0;
    let solid = 0;
    for (let s = 0; s < 300; s++) {
      const keys = pickRound(all, states, NOW, `w-${s}`).map(keyOf);
      if (keys.includes('times:7x8')) weak += 1;
      if (keys.includes('times:3x4')) solid += 1;
    }
    // 20 of 100 facts per round: a fact with no pull would be in about a fifth of them.
    expect(weak).toBeGreaterThan(250);
    expect(solid).toBeLessThan(100);
  });

  it('the order of the weights: missed > due > new > sitting', () => {
    const at = (due: string, last: string | null): FactState => ({
      due: new Date(due),
      last_outcome: last,
      lapses: 0,
    });
    const missed = weightOf(at('2026-10-05T00:00:00Z', 'revealed'), NOW);
    const due = weightOf(at('2026-10-01T00:00:00Z', 'first_try'), NOW);
    const fresh = weightOf(null, NOW);
    const sits = weightOf(at('2026-10-20T00:00:00Z', 'first_try'), NOW);
    expect(missed).toBeGreaterThan(due);
    expect(due).toBeGreaterThan(fresh);
    expect(fresh).toBeGreaterThan(sits);
  });
});

describe('the line at the end (drillLine) — never a count', () => {
  const s67 = spec({ range: 'times', rows: [6, 7] });
  const t = (key: string, correct: boolean, before: string | null = null) => ({
    fact: factOf(key)!,
    correct,
    before,
  });

  it('the row whose missed tasks are right now "sits better"', () => {
    expect(
      drillLine(
        [t('times:7x8', true, 'revealed'), t('times:6x3', false), t('times:6x4', true)],
        s67,
      ),
    ).toEqual({ line: 'better', group: { kind: 'times', n: 7 } });
  });

  it('nothing missed before: a row that was all right sits; otherwise where to go on', () => {
    expect(
      drillLine(
        [t('times:7x8', true), t('times:7x3', true), t('times:9x7', true), t('times:6x4', false)],
        s67,
      ),
    ).toEqual({ line: 'solid', group: { kind: 'times', n: 7 } });
    expect(drillLine([t('times:7x8', false), t('times:6x3', true)], s67)).toEqual({
      line: 'again',
      group: { kind: 'times', n: 7 },
    });
  });

  it('everything right in a round of many rows: the round itself sits', () => {
    expect(drillLine([t('times:7x8', true), t('times:6x3', true)], s67)).toEqual({
      line: 'solid',
      group: { kind: 'range' },
    });
  });

  it('a range without rows is named as a whole', () => {
    const plus = spec({ range: 'plus_20', carry: 'with' });
    expect(drillLine([t('plus:7+5', true, 'revealed')], plus)).toEqual({
      line: 'better',
      group: { kind: 'range' },
    });
    expect(drillLine([], plus)).toBeNull();
  });

  it('a times task belongs to the row she chose; 56 : 8 is a task of the 7s', () => {
    expect(groupOf(factOf('times:3x7')!, s67)).toEqual({ kind: 'times', n: 7 });
    expect(groupOf(factOf('times:6x7')!, s67)).toEqual({ kind: 'times', n: 7 });
    expect(groupOf(factOf('divide:56/8')!, spec({ range: 'divide', rows: [7] }))).toEqual({
      kind: 'divide',
      n: 7,
    });
  });
});
