import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  compareNumbers,
  compareValue,
  MAX_NUMERIC_INPUT,
  parseCanonicalKey,
  parseNumericInput,
  sameWrittenForm,
} from '../numeric-input.js';

describe('parseNumericInput — separators are read from the text, not the app language', () => {
  it('reads unambiguous decimals and thousands the same way in every locale', () => {
    expect(parseNumericInput('12,5').value).toBe(12.5);
    expect(parseNumericInput('12.5').value).toBe(12.5);
    expect(parseNumericInput('0,125').value).toBe(0.125); // a leading 0 is never a thousand (H-2)
    expect(parseNumericInput('-0,125').value).toBe(-0.125);
    expect(parseNumericInput('1.234,5').value).toBe(1234.5);
    expect(parseNumericInput('1,234.5').value).toBe(1234.5);
    expect(parseNumericInput('1.000.000').value).toBe(1_000_000);
    expect(parseNumericInput('1 000').value).toBe(1000);
  });

  it('leaves one separator before exactly three digits undecided (C-1, H-2)', () => {
    for (const s of ['1.000', '1,000', '2,375', '2.375', '125.125']) {
      expect(parseNumericInput(s).value).toBeNull();
    }
  });

  it('reads a unit after the number', () => {
    expect(parseNumericInput('100 Kilometer pro Stunde')).toMatchObject({
      value: 100,
      unit: 'km/h',
    });
    expect(parseNumericInput('5,5 km')).toMatchObject({ value: 5.5, unit: 'km' });
    expect(parseNumericInput('24 cm²')).toMatchObject({ value: 24, unit: 'cm²' });
  });

  it('reads percent as a unit, never as ÷ 100 (C-4)', () => {
    for (const s of [
      '25%',
      '25 %',
      '25 Prozent',
      '25 percent',
      '25 pour cent',
      '25 por ciento',
      '25 per cento',
    ]) {
      expect(parseNumericInput(s)).toMatchObject({ value: 25, unit: '%' });
    }
  });

  it('reads a mixed number as whole plus fraction, never 31/2 (C-3)', () => {
    expect(parseNumericInput('3 1/2')).toMatchObject({
      value: 3.5,
      form: 'mixed',
      written: '3 1/2',
    });
    expect(parseNumericInput('1 11/20').value).toBe(1.55);
    expect(parseNumericInput('1 1/2 h')).toMatchObject({ value: 1.5, unit: 'h' });
    expect(parseNumericInput('-1 1/2').value).toBe(-1.5);
    expect(parseNumericInput('−1 1/2').value).toBe(-1.5);
  });

  it('keeps a fraction as written', () => {
    expect(parseNumericInput('6/8')).toMatchObject({
      value: 0.75,
      form: 'fraction',
      written: '6/8',
    });
  });

  it('returns null for empty input, words, and two numbers side by side', () => {
    expect(parseNumericInput('').value).toBeNull();
    expect(parseNumericInput('foo bar').value).toBeNull();
    expect(parseNumericInput('3 4').value).toBeNull();
    expect(parseNumericInput('x=5').value).toBeNull();
  });
});

describe('parseNumericInput — calculations from the math keys', () => {
  it('evaluates a small calculation but marks it as one (H-1)', () => {
    expect(parseNumericInput('−3,5')).toMatchObject({ value: -3.5, has_residue: false });
    expect(parseNumericInput('2·3')).toMatchObject({
      value: 6,
      form: 'expression',
      has_residue: true,
    });
    expect(parseNumericInput('17·23').value).toBe(391);
    expect(parseNumericInput('4²').value).toBe(16);
    expect(parseNumericInput('2³').value).toBe(8);
    expect(parseNumericInput('√16').value).toBe(4);
    expect(parseNumericInput('√(9)').value).toBe(3);
    expect(parseNumericInput('2π').value).toBeCloseTo(2 * Math.PI);
    expect(parseNumericInput('12:4').value).toBe(3);
    expect(parseNumericInput('1/2+1/4').value).toBe(0.75);
  });

  it('never runs a general evaluator: bounded input, no names, no exponents (H-6)', () => {
    const started = Date.now();
    for (const s of [
      '1:1e8',
      '1:6e7',
      'range(1,1e8)',
      'ones(9000,9000)',
      'zeros(20000,20000)',
      '9^9^9^9',
      '(((((((((((((((((((((((((((((1)))))))))))))))))))))))))))))',
      '1'.repeat(MAX_NUMERIC_INPUT + 1),
      `${'1+'.repeat(40)}1`,
    ]) {
      const r = parseNumericInput(s);
      expect(r.value === null || Number.isFinite(r.value)).toBe(true);
    }
    expect(parseNumericInput('1:1e8').value).toBeNull();
    expect(parseNumericInput('ones(9000,9000)').value).toBeNull();
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe('parseCanonicalKey — a stored key is point-decimal, whatever the learner locale (C-1)', () => {
  it('reads three decimals as decimals', () => {
    expect(parseCanonicalKey('0.125')).toMatchObject({
      value: 0.125,
      form: 'decimal',
      decimals: 3,
    });
    expect(parseCanonicalKey('1.250').value).toBe(1.25);
    expect(parseCanonicalKey('2.375').value).toBe(2.375);
  });

  it('reads LaTeX fractions and mixed numbers (C-5)', () => {
    expect(parseCanonicalKey('$3\\frac{1}{2}$')).toMatchObject({ value: 3.5, form: 'mixed' });
    expect(parseCanonicalKey('$1\\frac{11}{20}$').value).toBe(1.55);
    expect(parseCanonicalKey('$\\frac{3}{4}$')).toMatchObject({ value: 0.75, written: '3/4' });
    expect(parseCanonicalKey('$-\\frac{3}{4}$').value).toBe(-0.75);
    expect(parseCanonicalKey('25 %')).toMatchObject({ value: 25, unit: '%' });
    expect(parseCanonicalKey('$25\\,\\%$')).toMatchObject({ value: 25, unit: '%' });
  });

  it('reads a decimal comma only where it cannot be a thousands separator', () => {
    expect(parseCanonicalKey('2,5').value).toBe(2.5);
    expect(parseCanonicalKey('1,250').value).toBeNull();
    expect(parseCanonicalKey('1.000.000').value).toBeNull();
  });

  it('never evaluates a key', () => {
    expect(parseCanonicalKey('17·23').value).toBeNull();
    expect(parseCanonicalKey('x = 5').value).toBeNull();
  });
});

describe('compareNumbers — exact, or within the key’s own rounding (D-1, C-2)', () => {
  const cmp = (
    key: string,
    given: string,
    tolerance: number | null = null,
    unit: string | null = null,
  ) => compareNumbers(parseNumericInput(given), parseCanonicalKey(key), { tolerance, unit });

  it('compares whole numbers exactly', () => {
    expect(cmp('240', '242')).toBe('different');
    expect(cmp('1000', '1009')).toBe('different');
    expect(cmp('1000', '999')).toBe('different');
    expect(cmp('12', '12,1')).toBe('different');
    expect(cmp('240', '240')).toBe('equal');
    expect(cmp('240', '240,0')).toBe('equal');
  });

  it('accepts a decimal that rounds to the key, not one that does not', () => {
    expect(cmp('3.14', '3,1416')).toBe('equal');
    expect(cmp('3.14', '3,1')).toBe('different');
    expect(cmp('3.14', '3,15')).toBe('different');
    expect(cmp('0.01', '0,02')).toBe('different');
    expect(cmp('0.125', '0,125')).toBe('equal');
    expect(cmp('0.125', '125')).toBe('different');
    expect(cmp('0.001', '1')).toBe('different');
  });

  it('uses a tolerance only when the item declares one', () => {
    expect(cmp('4.5', '4,7', 0.2)).toBe('equal');
    expect(cmp('4.5', '4,8', 0.2)).toBe('different');
  });

  it('compares units: another unit is for the tutor', () => {
    expect(cmp('25', '25 %', null, '%')).toBe('equal');
    expect(cmp('25 %', '25')).toBe('equal');
    expect(cmp('240', '242 cm', null, 'cm')).toBe('different');
    expect(cmp('240', '4 h', null, 'min')).toBe('unknown');
  });

  it('leaves calculations and ambiguous numbers to the tutor', () => {
    expect(cmp('391', '17·23')).toBe('unknown');
    expect(cmp('1000', '1.000')).toBe('unknown');
  });

  it('tells the written form apart from the value (D-3)', () => {
    const same = (key: string, given: string) =>
      sameWrittenForm(parseNumericInput(given), parseCanonicalKey(key));
    expect(same('0.125', '0,125')).toBe(true);
    expect(same('4', '4,0')).toBe(true);
    expect(same('0.125', '1/8')).toBe(false);
    expect(same('$\\frac{3}{4}$', '6/8')).toBe(false);
    expect(same('$\\frac{3}{4}$', '3/4')).toBe(true);
    expect(same('3.5', '3 1/2')).toBe(false);
    expect(same('$3\\frac{1}{2}$', '3 1/2')).toBe(true);
  });

  it('is the shared value comparison, form-independent', () => {
    expect(compareValue('$\\frac{3}{4}$', '0,75')).toBe('equal');
    expect(compareValue('$\\frac{11}{12}$', '12')).toBe('different');
    expect(compareValue('Nenner', '12')).toBe('unknown');
  });
});

// ── Property tests (audit S-1): a value written the way a learner in any locale writes it is
// never "different"; a changed value is never "equal".

type Locale = 'de' | 'fr' | 'es' | 'it' | 'en';
const LOCALES: Locale[] = ['de', 'fr', 'es', 'it', 'en'];
const COMMA = new Set<Locale>(['de', 'fr', 'es', 'it']);

/** A key as the prompts ask for it, and how a learner may write the same value. */
type Case = { key: string; learner: string[] };

const groupThousands = (digits: string, sep: string) =>
  digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);

const decimalCase = fc
  .record({
    whole: fc.integer({ min: 0, max: 99_999 }),
    decimals: fc.integer({ min: 0, max: 4 }),
    frac: fc.integer({ min: 0, max: 9999 }),
    negative: fc.boolean(),
    locale: fc.constantFrom(...LOCALES),
    unit: fc.constantFrom('', ' %', ' cm', ' h'),
  })
  .map(({ whole, decimals, frac, negative, locale, unit }): Case => {
    const fracDigits = decimals === 0 ? '' : String(frac % 10 ** decimals).padStart(decimals, '0');
    const sign = negative && (whole > 0 || /[1-9]/.test(fracDigits)) ? '-' : '';
    const key = `${sign}${whole}${fracDigits ? `.${fracDigits}` : ''}${unit}`;
    const sep = COMMA.has(locale) ? ',' : '.';
    const group = locale === 'en' ? ',' : locale === 'fr' ? ' ' : '.';
    const tail = fracDigits ? `${sep}${fracDigits}` : '';
    const plain = `${sign}${whole}${tail}`;
    const grouped = `${sign}${groupThousands(String(whole), group)}${tail}`;
    const padded = fracDigits ? `${plain}0` : plain;
    return { key, learner: [plain + unit, grouped + unit, plain, padded] };
  });

const fractionCase = fc
  .record({
    whole: fc.integer({ min: 0, max: 20 }),
    num: fc.integer({ min: 1, max: 98 }),
    den: fc.integer({ min: 2, max: 99 }),
    negative: fc.boolean(),
    latex: fc.boolean(),
  })
  .filter(({ num, den }) => num < den)
  .map(({ whole, num, den, negative, latex }): Case => {
    const sign = negative ? '-' : '';
    const written = whole > 0 ? `${sign}${whole} ${num}/${den}` : `${sign}${num}/${den}`;
    const key = latex ? `$${sign}${whole > 0 ? whole : ''}\\frac{${num}}{${den}}$` : written;
    return { key, learner: [written, written.replace(' ', '  ').replace('/', ' / ')] };
  });

describe('property: a right value in any locale is never "different"', () => {
  it('holds for decimals, integers, units and thousands groups', () => {
    fc.assert(
      fc.property(decimalCase, ({ key, learner }) => {
        for (const text of learner) {
          const r = compareNumbers(parseNumericInput(text), parseCanonicalKey(key));
          if (r === 'different') throw new Error(`${text} for key ${key} is ${r}`);
        }
      }),
      { numRuns: 500 },
    );
  });

  it('holds for fractions and mixed numbers, and the written form is recognised', () => {
    fc.assert(
      fc.property(fractionCase, ({ key, learner }) => {
        for (const text of learner) {
          const given = parseNumericInput(text);
          const k = parseCanonicalKey(key);
          expect(compareNumbers(given, k)).toBe('equal');
          expect(sameWrittenForm(given, k)).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe('property: a changed value is never "equal"', () => {
  it('holds for the last written place ± 1 and a flipped sign', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 99_999 }),
        fc.integer({ min: 0, max: 4 }),
        fc.integer({ min: 0, max: 9999 }),
        fc.constantFrom(-1, 1),
        fc.constantFrom(...LOCALES),
        (whole, decimals, frac, delta, locale) => {
          const scale = 10 ** decimals;
          const units = whole * scale + (frac % scale);
          const write = (n: number, sep: string) => {
            const neg = n < 0 ? '-' : '';
            const a = Math.abs(n);
            const w = Math.floor(a / scale);
            const f = decimals ? `${sep}${String(a % scale).padStart(decimals, '0')}` : '';
            return `${neg}${w}${f}`;
          };
          const key = write(units, '.');
          const sep = COMMA.has(locale) ? ',' : '.';
          const wrong = [write(units + delta, sep)];
          if (units !== 0) wrong.push(write(-units, sep));
          for (const text of wrong) {
            const r = compareNumbers(parseNumericInput(text), parseCanonicalKey(key));
            if (r === 'equal') throw new Error(`${text} for key ${key} is equal`);
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});
