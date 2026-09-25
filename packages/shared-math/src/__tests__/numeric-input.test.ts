import { describe, expect, it } from 'vitest';
import { parseNumericInput } from '../numeric-input.js';

describe('parseNumericInput (de)', () => {
  it('parses German decimal comma', () => {
    const r = parseNumericInput('12,5', 'de');
    expect(r.value).toBe(12.5);
  });

  it('strips German thousands separator', () => {
    const r = parseNumericInput('1.000', 'de');
    expect(r.value).toBe(1000);
  });

  it('recognizes Kilometer pro Stunde', () => {
    const r = parseNumericInput('100 Kilometer pro Stunde', 'de');
    expect(r.value).toBe(100);
    expect(r.unit).toBe('km/h');
  });

  it('recognizes km suffix', () => {
    const r = parseNumericInput('5,5 km', 'de');
    expect(r.value).toBe(5.5);
    expect(r.unit).toBe('km');
  });

  it('returns null for empty input', () => {
    const r = parseNumericInput('', 'de');
    expect(r.value).toBeNull();
  });

  it('returns null for non-numeric residue', () => {
    const r = parseNumericInput('foo bar', 'de');
    expect(r.value).toBeNull();
  });
});

describe('parseNumericInput (en)', () => {
  it('parses English thousands separator', () => {
    const r = parseNumericInput('1,000', 'en');
    expect(r.value).toBe(1000);
  });

  it('parses English decimal', () => {
    const r = parseNumericInput('12.5', 'en');
    expect(r.value).toBe(12.5);
  });
});

describe('parseNumericInput — characters from the math keys', () => {
  it('reads a typographic minus, dot, powers, pi and roots', () => {
    expect(parseNumericInput('−3,5', 'de').value).toBe(-3.5);
    expect(parseNumericInput('2·3', 'de').value).toBe(6);
    expect(parseNumericInput('4²', 'de').value).toBe(16);
    expect(parseNumericInput('2³', 'en').value).toBe(8);
    expect(parseNumericInput('√16', 'de').value).toBe(4);
    expect(parseNumericInput('√(9)', 'de').value).toBe(3);
    expect(parseNumericInput('2π', 'en').value).toBeCloseTo(2 * Math.PI);
    expect(parseNumericInput('3/4', 'de').value).toBe(0.75);
  });
});
