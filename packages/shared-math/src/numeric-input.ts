// parseNumericInput — handles German decimal comma, thousands separators,
// and unit aliases. Doc 07 §4.3.

import { evaluate } from 'mathjs';
import { canonicalizeUnit, UNIT_ALIASES } from './units.js';

export type NumericLocale = 'de' | 'en';

export type NumericParseResult = {
  value: number | null;
  unit: string | null;
  raw: string;
  matched_unit_alias: string | null;
  /** True when residual text after stripping value+unit is non-empty. */
  has_residue: boolean;
};

// Build a regex that matches the longest unit alias at the end of the string.
const SORTED_UNIT_KEYS = Object.keys(UNIT_ALIASES).sort((a, b) => b.length - a.length);

function stripTrailingUnit(input: string): { rest: string; unit: string | null; alias: string | null } {
  const lower = input.toLowerCase();
  for (const alias of SORTED_UNIT_KEYS) {
    // Match alias as a suffix, optionally preceded by whitespace.
    if (lower.endsWith(alias)) {
      const before = input.slice(0, input.length - alias.length).replace(/\s+$/, '');
      // Boundary check: previous char must be space or digit or empty (so "km" doesn't strip from "okm").
      const boundary = before.length === 0 || /[\s\d.,]/.test(before[before.length - 1]!);
      if (boundary) {
        return { rest: before, unit: canonicalizeUnit(alias), alias };
      }
    }
  }
  return { rest: input, unit: null, alias: null };
}

export function parseNumericInput(input: string, locale: NumericLocale = 'de'): NumericParseResult {
  const raw = input;
  const trimmed = input.trim();
  if (trimmed === '') {
    return { value: null, unit: null, raw, matched_unit_alias: null, has_residue: false };
  }

  const { rest, unit, alias } = stripTrailingUnit(trimmed);
  let numericText = rest.trim();

  // Normalize decimal/thousands separators.
  if (locale === 'de') {
    // German: comma = decimal, dot or thin space = thousands.
    // Strip thousands dots only when followed by exactly 3 digits.
    numericText = numericText.replace(/\.(?=\d{3}(\D|$))/g, '');
    numericText = numericText.replace(/\s/g, '');
    numericText = numericText.replace(',', '.');
  } else {
    // English: dot = decimal, comma = thousands.
    numericText = numericText.replace(/,(?=\d{3}(\D|$))/g, '');
    numericText = numericText.replace(/\s/g, '');
  }

  let value: number | null = null;
  try {
    const v = evaluate(numericText);
    if (typeof v === 'number' && Number.isFinite(v)) value = v;
  } catch {
    value = null;
  }

  return {
    value,
    unit,
    raw,
    matched_unit_alias: alias,
    has_residue: false,
  };
}
