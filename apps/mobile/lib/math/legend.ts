// The words of a function plot's legend (FigureView): pure, so they are tested on their own.

/**
 * One line of the legend: "a = 2: y = 2·x²", or just "y = 2·x²" when the label only repeats the
 * curve (issue #298 — a model labels a curve with its own equation as often as with a name, and
 * "y = 2x²: y = 2·x²" reads like a typo).
 */
export function legendText(label: string | null, expr: string): string {
  const curve = `y = ${prettyExpr(expr)}`;
  if (!label) return curve;
  const squash = (x: string) =>
    prettyExpr(x)
      .replace(/[\s·*]/g, '')
      .toLowerCase();
  const same = squash(label) === squash(expr) || squash(label) === squash(curve);
  return same ? curve : `${label}: ${curve}`;
}

/** "x^2 - 2*x" → "x² − 2·x" for the legend. */
export function prettyExpr(expr: string): string {
  const sup: Record<string, string> = {
    '0': '⁰',
    '1': '¹',
    '2': '²',
    '3': '³',
    '4': '⁴',
    '5': '⁵',
    '6': '⁶',
    '7': '⁷',
    '8': '⁸',
    '9': '⁹',
  };
  return expr
    .replace(/^\s*(?:y|[a-z]\s*\(\s*x\s*\))\s*=\s*/i, '')
    .replace(/\^(\d+)/g, (_, d: string) =>
      d
        .split('')
        .map((c) => sup[c] ?? c)
        .join(''),
    )
    .replace(/\*/g, '·')
    .replace(/-/g, '−')
    .replace(/sqrt/g, '√')
    .replace(/\bpi\b/g, 'π')
    .replace(/\s*([+−=])\s*/g, ' $1 ')
    .replace(/^ − /, '−')
    .replace(/\(\s*−\s*/g, '(−')
    .trim();
}
