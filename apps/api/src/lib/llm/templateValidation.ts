// Problem-template feasibility validation. Doc 06 §post-processing step 4.
//
// For each template:
//   1. Parse template_text, constraints, and solution_expression with mathjs.
//   2. Sample 5 random parameter combinations within the declared ranges.
//   3. Evaluate constraints. If passes/5 < 0.6 → drop the template.
//   4. For one passing sample, evaluate solution_expression and confirm a
//      finite, well-typed value.
//
// Slice D3 wires this into the materials route (post-vision). Templates that
// survive are persisted to problem_templates; the corresponding "seed" items
// get their problem_template_id linked after insert.

import { create, all } from 'mathjs';

import type { VisionProblemTemplate } from './gateway.js';

// `all` is FactoryFunctionMap | undefined; mathjs ships a non-undefined
// `all` at runtime in v14, but the type narrows poorly.
const math = create(all as Parameters<typeof create>[0], {});

const SAMPLES = 5;
const FEASIBILITY_THRESHOLD = 0.6;

export type ValidatedTemplate = VisionProblemTemplate & {
  /** Sample values that pass all constraints, used as the seed for variants. */
  seed_params: Record<string, number>;
};

function sampleParam(p: VisionProblemTemplate['params'][number], rand: () => number): number {
  for (let attempt = 0; attempt < 50; attempt++) {
    let raw = p.min + rand() * (p.max - p.min);
    if (p.type === 'int') raw = Math.round(raw);
    if (p.exclude && p.exclude.includes(raw)) continue;
    return raw;
  }
  // Exclusions impossible to satisfy — give up and return min.
  return p.type === 'int' ? Math.round(p.min) : p.min;
}

function evaluateBoolean(expr: string, scope: Record<string, number>): boolean {
  try {
    const v = math.evaluate(expr, scope);
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    return false;
  } catch {
    return false;
  }
}

function evaluateExpression(expr: string, scope: Record<string, number>): number | null {
  try {
    const v = math.evaluate(expr, scope);
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'object' && v !== null && 'toNumber' in v) {
      const n = (v as { toNumber: () => number }).toNumber();
      return Number.isFinite(n) ? n : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Make a deterministic RNG so test runs are reproducible. */
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function validateTemplate(
  template: VisionProblemTemplate,
  seed = 0xc0ffee,
): ValidatedTemplate | null {
  const rand = mulberry32(seed);
  let passes = 0;
  let seedParams: Record<string, number> | null = null;
  for (let i = 0; i < SAMPLES; i++) {
    const scope: Record<string, number> = {};
    for (const p of template.params) scope[p.name] = sampleParam(p, rand);
    const ok = template.constraints.every((c) => evaluateBoolean(c, scope));
    if (ok) {
      passes++;
      if (!seedParams) seedParams = scope;
    }
  }
  if (passes / SAMPLES < FEASIBILITY_THRESHOLD) return null;
  if (!seedParams) return null;

  const solution = evaluateExpression(template.solution_expression, seedParams);
  if (solution === null) return null;

  return { ...template, seed_params: seedParams };
}
