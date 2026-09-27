// How a written answer is compared with its key, apart from numbers (numeric-input.ts).
// docs/architecture.md §Practice (grading); audit C-6, C-7.
//
// Two canonical forms, each for one job:
// - canonicalMath: for math (digits, operators, LaTeX). Keeps every operator, sign, relation
//   and the decimal separator; only unifies how the same symbol is typed (− and -, · × and *,
//   <= and ≤, ² and ^2) and drops spaces around operators. x^2+2x and x^2-2x stay different,
//   and so do x=5 and x=-5, 3/4 and 3,4, 3 1/2 and 31/2.
// - canonicalText: for words. Only Unicode NFC, trimmed, runs of spaces collapsed — case, ß
//   and punctuation count. The folded form (normalize.ts normalizeShortAnswer: lower case,
//   ß → ss, no punctuation) only recognises a near miss; it never makes an answer right.

import { plainMath } from './latex.js';

/** Does the text hold math: a digit, LaTeX, or an operator between terms? */
export function isMathText(s: string): boolean {
  return (
    /\d/.test(s) ||
    /\$|\\[a-zA-Z]/.test(s) ||
    /[=<>≤≥≠≈±+·×÷*^√π²³∞]/.test(s) ||
    // A minus sign, not a hyphen in a word ("E-Mail"): at the start or after a space.
    /(^|\s)[-−]\s*[\p{L}\p{N}(]/u.test(s)
  );
}

/** Math as one string: the same answer typed differently compares equal, a changed sign never. */
export function canonicalMath(s: string): string {
  return (
    plainMath(s)
      .normalize('NFC')
      .replace(/[−–]/g, '-')
      .replace(/[×⋅*]/g, '·')
      .replace(/÷/g, ':')
      .replace(/<=/g, '≤')
      .replace(/>=/g, '≥')
      .replace(/!=/g, '≠')
      .replace(/²/g, '^2')
      .replace(/³/g, '^3')
      .replace(/sqrt\s*\(/g, '√(')
      .replace(/√\s*\(([\p{L}\p{N}.,]+)\)/gu, '√$1')
      .replace(/\bpi\b/g, 'π')
      // Spaces around operators mean nothing; between two numbers or words they do
      // (3 1/2 is not 31/2).
      .replace(/\s+/g, ' ')
      .replace(/ (?![\p{L}\p{N}])|(?<![\p{L}\p{N}]) /gu, '')
      .trim()
  );
}

/** Words as written: NFC, trimmed, single spaces. Case, ß and punctuation are kept. */
export function canonicalText(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim();
}
