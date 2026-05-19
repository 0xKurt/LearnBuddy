// Practice-run variant generator. Doc 06 §practice-templates +
// docs/05-mobile.md §practice-screen.
//
// Inputs: a ProblemTemplateRow (params[], template_text, solution_expression).
// Outputs: an array of `PracticeVariant` — each a concrete question text +
// numeric/string solution + the substituted param bag (for debug / hint text).
//
// The mobile owns variant generation (Doc 02 §architecture: keep round-trips
// small, no server credit cost for practice runs). mathjs evaluates the
// solution expression once the params are sampled.

import { evaluate } from 'mathjs';

import type { ParamSpec, ProblemTemplateRow } from '@learnbuddy/shared-types';

export type PracticeVariant = {
  index: number;
  /** Final question text with `{name}` markers replaced. */
  questionText: string;
  /** The numeric or string answer produced by evaluating the
   *  solution_expression against the sampled params. */
  expectedAnswer: string;
  /** The numeric value (when the result is a number) — used by the local
   *  evaluator to compare within tolerance. */
  expectedNumeric: number | null;
  /** Params used, kept around so the screen can show a hint or replay. */
  params: Record<string, number>;
};

export type GenerateOptions = {
  /** How many variants to produce. Caps at 50. */
  count: number;
  /** Seed for reproducible runs; default = `Date.now()`. */
  seed?: number;
};

/**
 * Sample `opts.count` variants. Best-effort: if a particular sample fails
 * (mathjs throws on a divide-by-zero etc.) we resample up to 5 times before
 * giving up on that slot.
 */
export function generateVariants(
  template: ProblemTemplateRow,
  opts: GenerateOptions,
): PracticeVariant[] {
  const seed = opts.seed ?? Date.now();
  const rng = mulberry32(seed >>> 0);
  const count = Math.min(50, Math.max(1, Math.floor(opts.count)));
  const out: PracticeVariant[] = [];

  for (let i = 0; i < count; i++) {
    let variant: PracticeVariant | null = null;
    for (let attempt = 0; attempt < 5 && !variant; attempt++) {
      variant = sampleOnce(template, rng, i);
    }
    if (variant) out.push(variant);
  }
  return out;
}

function sampleOnce(
  template: ProblemTemplateRow,
  rng: () => number,
  index: number,
): PracticeVariant | null {
  const params: Record<string, number> = {};
  for (const spec of template.params) {
    params[spec.name] = sampleParam(spec, rng);
  }

  let questionText = template.template_text;
  for (const [name, value] of Object.entries(params)) {
    questionText = questionText.replace(
      new RegExp(`\\{${escapeRegex(name)}\\}`, 'g'),
      formatValue(value),
    );
  }

  let expectedAnswer: string;
  let expectedNumeric: number | null = null;
  try {
    const raw = evaluate(template.solution_expression, params) as unknown;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      expectedNumeric = raw;
      expectedAnswer = formatValue(raw);
    } else {
      expectedAnswer = String(raw);
    }
  } catch {
    return null;
  }

  return {
    index,
    questionText,
    expectedAnswer,
    expectedNumeric,
    params,
  };
}

function sampleParam(spec: ParamSpec, rng: () => number): number {
  const step = spec.step ?? (spec.type === 'int' ? 1 : 0.1);
  const range = spec.max - spec.min;
  if (range <= 0) return spec.min;
  const slots = Math.max(1, Math.floor(range / step) + 1);
  for (let i = 0; i < 16; i++) {
    const slot = Math.floor(rng() * slots);
    const value = spec.type === 'int' ? spec.min + slot * step : round(spec.min + slot * step, 4);
    if (spec.exclude?.includes(value)) continue;
    return value;
  }
  return spec.min;
}

function formatValue(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return String(Math.round(v * 1e4) / 1e4);
}

function round(v: number, digits: number): number {
  const k = Math.pow(10, digits);
  return Math.round(v * k) / k;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Mulberry32 — small deterministic PRNG. Public-domain pattern; lets the
// practice screen replay the same run for QA without dragging in seedrandom.
function mulberry32(a: number): () => number {
  return function rng(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Local pass/fail scoring for a numeric variant. Mirrors the tolerance rule
 * in `lib/eval/local.ts` (1% relative, abs floor at 0.01) but operates on
 * the variant's already-computed expectedNumeric so the practice screen
 * doesn't need to re-parse the solution expression on every keystroke.
 */
export function scorePracticeAnswer(
  variant: PracticeVariant,
  learnerAnswer: number,
): 'correct' | 'incorrect' {
  if (variant.expectedNumeric == null) {
    return learnerAnswer.toString() === variant.expectedAnswer ? 'correct' : 'incorrect';
  }
  const tol = Math.max(0.01, Math.abs(variant.expectedNumeric) * 0.01);
  return Math.abs(learnerAnswer - variant.expectedNumeric) <= tol ? 'correct' : 'incorrect';
}
