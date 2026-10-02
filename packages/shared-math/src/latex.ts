// The LaTeX subset stored in questions and answer keys (apps/api/src/modules/practice/items.ts
// MATH_RULES) as plain text: $\frac{3}{4}$ → 3/4, $3\frac{1}{2}$ → 3 1/2, x^{2} → x^2.
// docs/architecture.md §Practice (grading).
//
// Nothing is lost that changes the value: a whole number before \frac stays apart from it
// (3 1/2, never 31/2 — audit C-5), and a numerator, denominator, exponent or root of more than
// one term keeps its brackets ((a+b)/c, never a+b/c).

/** One term needs no brackets: a (signed) number, a name, or something already bracketed. */
function group(body: string): string {
  const b = body.trim();
  if (/^-?[\p{L}\p{N}.,]+$/u.test(b) || /^\([^()]*\)$/.test(b) || /^√[\p{L}\p{N}.,]+$/u.test(b))
    return b;
  return `(${b})`;
}

const SYMBOLS: ReadonlyArray<[RegExp, string]> = [
  [/\\(?:left|right)(?![a-zA-Z])/g, ''],
  [/\\cdot(?![a-zA-Z])/g, '·'],
  // A reaction arrow (issue #217). The app's own renderer has always known it
  // (apps/mobile/lib/math/parse.ts SYMBOLS); server-side it stayed as raw \rightarrow, so
  // anything built from plain text — a spoken sentence, a near-miss reply — read it out as a
  // backslash word. Both directions of an equilibrium too, which is the other arrow chemistry
  // uses.
  [/\\longrightarrow(?![a-zA-Z])/g, '→'],
  [/\\rightarrow(?![a-zA-Z])/g, '→'],
  [/\\to(?![a-zA-Z])/g, '→'],
  [/\\(?:rightleftharpoons|leftrightarrow)(?![a-zA-Z])/g, '⇌'],
  [/\\times(?![a-zA-Z])/g, '×'],
  [/\\div(?![a-zA-Z])/g, ':'],
  [/\\pi(?![a-zA-Z])/g, 'π'],
  [/\\leq?(?![a-zA-Z])/g, '≤'],
  [/\\geq?(?![a-zA-Z])/g, '≥'],
  [/\\neq?(?![a-zA-Z])/g, '≠'],
  [/\\approx(?![a-zA-Z])/g, '≈'],
  [/\\pm(?![a-zA-Z])/g, '±'],
  [/\\(?:degree|circ)(?![a-zA-Z])/g, '°'],
  [/\\%/g, '%'],
  // Spacing commands (3\,\frac{1}{2}, 1\;000) are a gap.
  [/\\[,;:! ]/g, ' '],
];

/** $\frac{a}{b}$ → a/b, $3\frac{1}{2}$ → 3 1/2, x^{2} → x^2, \sqrt{x} → √x, \cdot → ·; without the dollar signs. */
export function plainMath(s: string): string {
  let out = s.replace(/\$/g, '');
  // A mixed number: the whole number and the fraction stay apart (3 1/2 = 3.5).
  out = out.replace(/(\d)\s*\\[dt]?frac(?![a-zA-Z])/g, '$1 \\frac');
  for (const [re, to] of SYMBOLS) out = out.replace(re, to);
  // Innermost braces first, so nested fractions and roots come out bracketed right.
  for (let i = 0; i < 6; i++) {
    const before = out;
    out = out
      .replace(
        /\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g,
        (_, a: string, b: string) => `${group(a)}/${group(b)}`,
      )
      .replace(/\\sqrt\{([^{}]*)\}/g, (_, a: string) => `√${group(a)}`)
      .replace(/\^\{([^{}]*)\}/g, (_, a: string) => `^${group(a)}`)
      .replace(/_\{([^{}]*)\}/g, (_, a: string) => `_${group(a)}`);
    if (out === before) break;
  }
  return out.replace(/\s+/g, ' ').trim();
}
