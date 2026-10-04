// Is a multiple-choice question ONE question with ONE right option? (#227 Nr. 2, #231)
//
// The answer to a multiple-choice question is judged by its index, exactly and without a
// model (evaluate.ts). That judgement is only as good as the options it compares against —
// and until now code checked nothing but that `correct_choice` lies in range. Two options
// that are the same ("0,5" and "1/2"), a key that names another option than the index points
// at (off by one), or four graphs of which two look alike: the index would then say "falsch"
// to a right answer with full authority, and the child would have to argue with it.
//
// So, before anything is stored (#224 "Regel 0" — reject, never repair):
//   - no two options are the same, as written (after normalising how the same thing is
//     typed, and regardless of case: "Augustus" and "augustus" are one option for her) or by
//     value (0,5 = 1/2);
//   - the key IS the option `correct_choice` points at, as written or by value — a key in
//     other words, or a letter, cannot be told from an off-by-one and is not guessed at;
//   - options with figures (#231): every option has one, they fit the 2×2 grid, no two are
//     the same drawing;
//   - primary-school pictures (#254): an option whose picture declares what it shows (a clock
//     with `ask`) is exactly that reading — "8:15" under a clock at 7:45 would make the
//     index lie;
//   - function graphs (#231): every graph is visible in its window, no two LOOK alike there,
//     the key is a function, exactly one graph IS that function, it is the one
//     `correct_choice` points at — and when the question itself defines the function
//     ("Welcher Graph passt zu $f(x) = x^2 - 1$?"), the key is that function.
//
// What it does NOT decide, on purpose: whether a geometry figure is symmetric, whether a word
// option is factually right. Those need subject knowledge this module does not have; claiming
// to check them would be the mistake one level up (CLAUDE.md rule 5).

import type { Figure } from '@learnbuddy/shared-types/contracts';
import {
  canonicalMath,
  canonicalText,
  compareNumbers,
  compileExpression,
  isMathText,
  isPrimary,
  parseNumericInput,
  plainMath,
  type CompiledFunction,
} from '@learnbuddy/shared-math';

import { primaryHolds } from './figureCheck.js';

/** Why a multiple-choice draft does not hold together; null when it does. */
export type ChoiceProblem =
  | 'too_few'
  | 'out_of_range'
  | 'duplicate'
  | 'same_value'
  | 'key_not_option'
  | 'figure_count'
  | 'figure_duplicate'
  | 'figure_text'
  | 'graph_shape'
  | 'graph_invisible'
  | 'graph_alike'
  | 'key_not_function'
  | 'key_matches_none'
  | 'key_matches_several'
  | 'key_not_correct'
  | 'prompt_function_differs';

export type ChoiceDraft = {
  prompt: string;
  answer: string;
  choices: readonly string[] | null;
  correct_choice: number | null;
  choice_figures: readonly Figure[] | null;
};

/** The most options a figure grid holds: two by two (apps/mobile/components/practice/ChoiceList.tsx). */
export const MAX_FIGURE_CHOICES = 4;

/** Points a graph is evaluated at across its window — enough that a bend between them cannot hide. */
const SAMPLES = 61;
/** At least this many usable points before two functions count as equal, or a graph as visible. */
const ENOUGH = 3;
/**
 * Two graphs closer than this share of the window's height everywhere LOOK the same: about a
 * line width on a phone. Not a tolerance for a wrong key — it decides only "these two options
 * cannot be told apart".
 */
const ALIKE = 0.02;

/** The first reason this multiple-choice draft cannot be asked, or null. */
export function choiceProblem(it: ChoiceDraft): ChoiceProblem | null {
  const choices = it.choices;
  if (!choices || choices.length < 2 || it.correct_choice === null) return 'too_few';
  const correct = it.correct_choice;
  if (correct < 0 || correct >= choices.length) return 'out_of_range';

  for (let i = 0; i < choices.length; i++) {
    for (let j = i + 1; j < choices.length; j++) {
      if (sameWriting(choices[i]!, choices[j]!)) return 'duplicate';
      if (sameValue(choices[i]!, choices[j]!)) return 'same_value';
    }
  }

  const figures = it.choice_figures;
  if (figures !== null) {
    if (figures.length !== choices.length || figures.length > MAX_FIGURE_CHOICES) {
      return 'figure_count';
    }
    const drawn = figures.map(stableJson);
    if (new Set(drawn).size !== drawn.length) return 'figure_duplicate';
    if (figures.some((f, i) => isPrimary(f) && !primaryHolds(f, choices[i]!, false, null))) {
      return 'figure_text';
    }
    // Graphs: the key is a FUNCTION, and the graph check holds it against every drawing — the
    // option texts only describe the pictures (they are neither shown nor read aloud).
    if (figures.some((f) => f.type === 'function_plot')) return graphProblem(it, correct);
  }
  return isTheOption(it.answer, choices[correct]!) ? null : 'key_not_option';
}

// ─────────────── options as written ───────────────

/** The same option typed twice: math compared as math (x² = x^2), words as words. */
function sameWriting(a: string, b: string): boolean {
  if (isMathText(a) || isMathText(b)) {
    const ca = canonicalMath(a);
    return ca !== '' && ca === canonicalMath(b);
  }
  // Case-insensitive on purpose: two options that differ only in capitalisation are one
  // option for her — she taps the other right one and is told she is wrong. A question about
  // capitalisation itself is asked as a typed answer with strict spelling, not as a choice.
  const ta = canonicalText(a).toLocaleLowerCase();
  return ta !== '' && ta === canonicalText(b).toLocaleLowerCase();
}

/** Two options with the same number in them ("0,5" and "$\frac{1}{2}$"). */
function sameValue(a: string, b: string): boolean {
  const na = parseNumericInput(plainMath(a));
  const nb = parseNumericInput(plainMath(b));
  if (na.value === null || nb.value === null) return false;
  return compareNumbers(na, nb) === 'equal' && na.unit === nb.unit;
}

/**
 * Two options that are one for her: the same as written or by value. Also what keeps two ticks
 * of a select-all task apart (issue #240, `selectAll.ts`).
 */
export function sameOption(a: string, b: string): boolean {
  return sameWriting(a, b) || sameValue(a, b);
}

/**
 * The key and the option the index points at are the same answer — as written or by value
 * ("0,5" names "$\\frac{1}{2}$"). They are written separately by the model, so they can
 * disagree, and then the index would win with full authority while nobody could tell which
 * the question meant (#227 Nr. 2).
 */
function isTheOption(answer: string, chosen: string): boolean {
  return sameOption(answer, chosen);
}

/** One JSON text per drawing: the same data in another key order is the same drawing. */
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

// ─────────────── function graphs ───────────────

type Plot = Extract<Figure, { type: 'function_plot' }>;
type Graph = { plot: Plot; fn: CompiledFunction };

function graphProblem(it: ChoiceDraft, correct: number): ChoiceProblem | null {
  const graphs: Graph[] = [];
  for (const f of it.choice_figures ?? []) {
    // One graph per option: an option with two curves (or none) is no answer to "which graph".
    if (f.type !== 'function_plot' || f.functions.length !== 1) return 'graph_shape';
    const fn = compileExpression(f.functions[0]!.expr);
    if (!fn) return 'graph_shape';
    graphs.push({ plot: f, fn });
  }
  if (graphs.some((g) => !visible(g))) return 'graph_invisible';
  for (let i = 0; i < graphs.length; i++) {
    for (let j = i + 1; j < graphs.length; j++) {
      if (lookAlike(graphs[i]!, graphs[j]!)) return 'graph_alike';
    }
  }
  const key = definedFunction(it.answer);
  if (!key) return 'key_not_function';
  const matches = graphs.flatMap((g, i) => (sameFunction(key.fn, g.fn, g.plot) ? [i] : []));
  if (matches.length === 0) return 'key_matches_none';
  if (matches.length > 1) return 'key_matches_several';
  if (matches[0] !== correct) return 'key_not_correct';
  // The question's own function, when it names one: the key must be it. A named key ("f'(x) =
  // 2x" for "which graph is the derivative") is held only against a definition of that name;
  // an unnamed one ("x^2 - 1", "y = …") against the one function the question defines.
  const defined = promptFunctions(it.prompt);
  const stated = key.name === null ? defined : defined.filter((d) => d.name === key.name);
  if (stated.length === 1 && !sameFunction(stated[0]!.fn, key.fn, graphs[correct]!.plot)) {
    return 'prompt_function_differs';
  }
  return null;
}

/** x positions across the window, ends included. */
function xsOf(x0: number, x1: number): number[] {
  return Array.from({ length: SAMPLES }, (_, k) => x0 + ((x1 - x0) * k) / (SAMPLES - 1));
}

/** The graph shows at all: enough of it lies inside its own window. */
function visible({ plot, fn }: Graph): boolean {
  const inside = xsOf(plot.x_min, plot.x_max).filter((x) => {
    const y = fn(x);
    return Number.isFinite(y) && y >= plot.y_min && y <= plot.y_max;
  });
  return inside.length >= ENOUGH;
}

/**
 * Two graphs that cannot be told apart where both are drawn: within a line width of each
 * other at every point of the shared window (what leaves the window counts as its edge, as
 * the clipped drawing shows it).
 */
function lookAlike(a: Graph, b: Graph): boolean {
  const x0 = Math.max(a.plot.x_min, b.plot.x_min);
  const x1 = Math.min(a.plot.x_max, b.plot.x_max);
  const y0 = Math.max(a.plot.y_min, b.plot.y_min);
  const y1 = Math.min(a.plot.y_max, b.plot.y_max);
  if (!(x1 > x0) || !(y1 > y0)) return false;
  const tol = ALIKE * (y1 - y0);
  const clip = (y: number) => Math.min(y1, Math.max(y0, y));
  let compared = 0;
  for (const x of xsOf(x0, x1)) {
    const va = a.fn(x);
    const vb = b.fn(x);
    const fa = Number.isFinite(va);
    const fb = Number.isFinite(vb);
    if (!fa && !fb) continue;
    if (fa !== fb) return false;
    compared += 1;
    if (Math.abs(clip(va) - clip(vb)) > tol) return false;
  }
  return compared >= ENOUGH;
}

/** The same function (not merely alike): equal at every usable point of the window. */
function sameFunction(f: CompiledFunction, g: CompiledFunction, plot: Plot): boolean {
  let usable = 0;
  for (const x of xsOf(plot.x_min, plot.x_max)) {
    const a = f(x);
    const b = g(x);
    const fa = Number.isFinite(a);
    const fb = Number.isFinite(b);
    if (!fa && !fb) continue;
    if (fa !== fb) return false;
    usable += 1;
    if (Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))) return false;
  }
  return usable >= ENOUGH;
}

type Defined = { name: string | null; fn: CompiledFunction };

const DEFINITION = /^\s*(?:([A-Za-z][′']*)\s*\(\s*x\s*\)|(y))\s*=\s*(.+)$/;

/**
 * A function as written: "x^2 - 1", "y = x^2 - 1", "$f(x) = x^{2} - 1$", "f'(x) = 2x".
 * The name is kept ("y" and none mean the same: the graph itself).
 */
export function definedFunction(text: string): Defined | null {
  const plain = plainMath(text);
  const m = DEFINITION.exec(plain);
  const name = m ? (m[1] ?? null) : null;
  const fn = compileExpression(toGrammar(m ? m[3]! : plain));
  return fn ? { name: name === 'y' ? null : name, fn } : null;
}

/** The functions the question defines in its math ("… zu $f(x) = x^2 - 1$?"). */
function promptFunctions(prompt: string): Defined[] {
  const out: Defined[] = [];
  for (const run of prompt.matchAll(/\$([^$]+)\$/g)) {
    if (!DEFINITION.test(plainMath(run[1]!))) continue;
    const d = definedFunction(run[1]!);
    if (d) out.push(d);
  }
  return out;
}

/** plainMath's symbols in the figure grammar (packages/shared-math/src/expression.ts). */
function toGrammar(s: string): string {
  return s
    .replace(/[−–]/g, '-')
    .replace(/π/g, 'pi')
    .replace(/√\(/g, 'sqrt(')
    .replace(/√([\p{L}\p{N}.,]+)/gu, 'sqrt($1)');
}
