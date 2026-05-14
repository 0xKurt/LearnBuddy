// Canonicalization helpers for local answer evaluation.
// Doc 07 §3.1 (short/long) and §3.5 (formula).

/**
 * Normalize a short-answer string for token-overlap comparison.
 * NFKC normalize → lowercase → strip punctuation → collapse whitespace → ß↔ss.
 */
export function normalizeShortAnswer(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Token-overlap ratio (Jaccard-ish): intersection / max(|A|, |B|). */
export function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter(Boolean));
  const tb = new Set(b.split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

/** Length ratio used together with token overlap. */
export function lengthRatio(a: string, b: string): number {
  if (b.length === 0) return 0;
  return Math.min(a.length / b.length, 1);
}

import type { AstNode } from './mathlite.js';

/**
 * Canonicalize an AST for local formula equality. Sorts commutative operands,
 * normalizes signs, lowercases identifier names. Two equivalent formulas will
 * produce identical canonical forms; non-equivalent ones generally won't.
 */
export function canonicalizeFormula(node: AstNode): string {
  return canon(node);
}

function canon(node: AstNode): string {
  switch (node.kind) {
    case 'num':
      return `n:${node.value}`;
    case 'ident':
      return `i:${node.name.toLowerCase()}`;
    case 'unary':
      return node.op === '+' ? canon(node.arg) : `u-:${canon(node.arg)}`;
    case 'binop': {
      const l = canon(node.left);
      const r = canon(node.right);
      if (node.op === '+' || node.op === '*') {
        const sorted = [l, r].sort();
        return `${node.op}:[${sorted.join(',')}]`;
      }
      return `${node.op}:[${l},${r}]`;
    }
    case 'call':
      return `c:${node.callee}(${node.args.map(canon).join(',')})`;
    case 'root':
      return `root:${node.degree ? canon(node.degree) : 'sqrt'}(${canon(node.arg)})`;
    case 'abs':
      return `abs:(${canon(node.arg)})`;
    case 'compare':
      return `${node.op}:[${canon(node.left)},${canon(node.right)}]`;
    case 'pair':
      return `pair:[${canon(node.left)},${canon(node.right)}]`;
  }
}
