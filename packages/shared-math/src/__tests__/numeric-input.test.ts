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
