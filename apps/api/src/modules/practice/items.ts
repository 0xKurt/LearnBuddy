// Questions as the model writes them (from a photo, a topic, a typed list or
// homework), validated and stored. docs/architecture.md §Practice.
//
// One shape for every source, so practice, the tutor and FSRS treat them the
// same. The model writes data; the server checks every item on its own and
// drops broken ones instead of "repairing" them. A vocabulary pair becomes two
// questions (both directions), each with its own FSRS state — the session may
// ask just one of them when the learner asked for that direction (issue #113).

import {
  ChartRead,
  Figure as FigureSchema,
  MATH_NOTATION_RULE,
  ModelFigure,
  unsupportedMath,
  Rubric,
  type StoredRubric,
  type BarTask,
  type Figure,
  type ItemKind,
  type ListenTask,
  type ReadPassage,
  type StaffTask,
  type StructuredTask,
  type VocabDirection,
} from '@learnbuddy/shared-types/contracts';
import {
  chartProblem,
  compileExpression,
  isChart,
  isPeriodicTable,
  isPrimary,
  isSpaceFigure,
  isTreeFigure,
  parseCanonicalKey,
  periodicProblem,
  primaryProblem,
  spaceProblem,
  treeProblem,
} from '@learnbuddy/shared-math';
import { isDeepStrictEqual } from 'node:util';

import { z } from 'zod';

import type { Db } from '../../lib/db.js';
import { CurriculumPointId } from '../curriculum/state.js';
import { dollarMathField, dollarMathRuns } from './dollarMath.js';
import { figureHolds, figureIsRejectedPrimary } from './figureCheck.js';
import { CHOICE_FIGURE_KINDS, kindIn, SPELLING_KINDS, TOLERANCE_KINDS } from './itemFields.js';
import { usableRubric } from './rubric.js';
import { mentionsSolution } from './tutor.js';
import { choiceProblem, MAX_FIGURE_CHOICES, type ChoiceDraft } from './choiceCheck.js';
import { checkedRead, figureIsRejectedChart } from './chartRead.js';
import { keyAgreesWithPrompt } from './keyCheck.js';
import { checkedPeriodic, figureIsRejectedPeriodic } from './periodicCheck.js';
import { checkedTree, figureIsRejectedTree } from './treeCheck.js';
import { checkedSpace, figureIsRejectedSpace } from './solidCheck.js';

/** The notation rule, generated from the one list the app draws and reads out (issue #239). */
export const MATH_RULES = MATH_NOTATION_RULE;

/** How a number key is written (docs/architecture.md §Practice, grading; audit C-1). */
export const NUMERIC_KEY_RULES = `numeric: answer = the number with a decimal point and no thousands separators (0.125, 1250 — never 0,125 or 1.250); a fraction (3/4) or mixed number (3 1/2) only when the task asks for that form; the unit separately in "unit" ("%" for percent). tolerance only when the task says to round, estimate or measure — otherwise null (exact).`;

/**
 * A question asks for what the answer field holds (issue #208, seen in a video shoot: "Wie
 * viel Pizza ist das als Bruch? Gib den Zähler ein." — a fraction is asked for and only part
 * of it may be written). The restriction came from nowhere in the app: `numeric` accepts a
 * fraction (see NUMERIC_KEY_RULES) and the app's math keyboard writes one.
 *
 * Only for questions the model INVENTS. Extraction must not get this rule: it copies a
 * printed task as it stands, and a printed task may perfectly well ask for the numerator.
 */
export const ANSWER_FORM_RULES = `A question asks for exactly the whole answer, never for a part of it: if the answer is a fraction, ask for the fraction — the app's keyboard writes one and the key may be written that way. Never narrow the answer to one component of what you asked for, and never ask for a unit separately: it belongs in "unit".`;

/** When case, ß and punctuation decide (decision D-2). */
export const SPELLING_RULES = `spelling: "strict" when the task practises spelling, capitalisation or punctuation; "gentle" when they don't matter for the answer; null otherwise (the subject decides).`;

export const FIGURE_RULES = `Figures: add "figure" only when a question needs one (a fraction to see, a number line, a function graph, a bar chart, a geometric figure, a table, a structural formula, a chart, a tree, a clock, coins and notes, a Zwanziger- or Hunderterfeld, base-ten blocks) — as data, the app draws it. function_plot expressions use x, numbers, + - * / ^, sqrt, abs, sin, cos, tan, ln, log, exp, pi (e.g. "0.5*x^2-2"). A geometry figure is drawn to scale and checked: its coordinates must give every stated angle (deg) and every side length (value, one unit for all), a force arrow's length is proportional to its value, and a resultant arrow is the vector sum of the others; label the one measure the question asks for "?" — the key must be that measure. A molecule is atoms (aliases a1, a2 …, hydrogens counted in h, charge) and bonds; the app computes the lone pairs and checks every shell, so an atom whose octet does not hold costs the question; set "ask" when the key is its formula, its number of lone pairs or its molar mass. Primary school: clock c = one time {h, m} (two for a span from the first to the second), h24 only when the task asks for the 24-hour time, ask "time" (kind short, answer "7:45") or "span" (a number, unit min or h); money p = each euro coin or note once with its count n, at most 12 pieces, ask "sum" (the amount, unit € or ct); dot_field = field twenty or hundred, n = filled dots per colour (two colours for 8 + 6), ask "count"; base_ten = h hundred plates, t ten rods, o unit cubes (more than 9 to practise bundling), ask "count". Set ask whenever the key is read off such a figure, else "none": code computes the key, and one that differs costs the question. Otherwise figure is null. Pictures as the OPTIONS of a multiple_choice ("Welcher Graph passt zu $f(x) = x^{2} - 1$?"): 2–4 choices, "choice_figures" = one figure per choice in the same order, "choices" = what each option shows in words or math (the app shows the pictures, not these texts); for graphs every option is a function_plot with exactly one function, all with the same window, no two alike, and "answer" = the right graph's function, named as in the question ("f(x) = x^2 - 1"; for a derivative "f'(x) = 2*x"); for any other picture "answer" = the right option's text exactly. Otherwise choice_figures is null.
Charts are data only; the app draws axes, scale and colours. line_chart: x = up to 12 labels in order (numbers for a measured x such as time, else categories so short that count × (longest + 1) ≤ 30 characters, so "J"…"D" for 12 months, e.g. "Jan"…"Jun"); s = 1–3 series {n name, u unit, v one value per x label, bar true for columns (one series at most), r true for a right axis — only for a second unit}. climate_chart: place, alt in m, t = 12 monthly means in °C and p = 12 monthly sums in mm, January first. pie_chart: l labels and v shares in % that add up to exactly 100; half for a half circle. box_plot: b = 1–3 boxes {l, v = [min, Q1, median, Q3, max]}, raw = the data list when the task gives one (then one box), else []. histogram: x0 start of the first class, w class width, v heights. scatter_plot: x and y of each point; fit draws the least-squares line. pyramid: a0 first age, w years per group, m men and f women per group from young to old, u unit. A chart that breaks one of these rules is dropped together with its question.
"read" — for every question whose answer is read off or computed from its chart, so the app can check the key: q = value (s, i) · max, min, sum, mean, range (largest − smallest) of series s · argmax, argmin (answer = the label: month, category or slice) · diff (value at j minus value at i) · angle (centre angle of slice i in degrees) · iqr (box s) · humid, arid (number of humid or arid months) · humid_at (month i; multiple_choice, correct_choice 0 = humid, 1 = arid) · slope, intercept (the fitted line) · type (pyramid; multiple_choice, correct_choice 0 = pyramid, 1 = bell, 2 = urn). s = series (climate 0 = °C, 1 = mm; pyramid 0 = men, 1 = women; box plot: which box), i and j = positions from 0 (box plot value: i 0 = min … 4 = max); unused numbers 0. The app writes the options for humid_at and type. A numeric question about a chart always has "read"; any other question read null.
Trees are data only; the app lays them out, checks them and computes their keys. tree: n = nodes, root first (p = parent index, -1 for the root; l = label; e = label of the branch from the parent); pr true for a probability tree: every e a probability ("3/5", "0.4"), the branches of each node add up to exactly 1, at most one branch "?". ask = the key: path (probability of the path to node at[0]), sum (of the paths to the leaves in at), edge (the "?" branch), else none; a numeric question on a tree always has an ask. pedigree: p = persons, numbered 1, 2 … in this order, generation by generation (s "m"/"f", a = affected, fa/mo = the father's and mother's index, listed earlier, or -1); md = the mode it shows; ask mode ("Welcher Erbgang?", only when the pedigree rules out the other three; multiple_choice, correct_choice 0 = autosomal dominant, 1 = autosomal recessive, 2 = X-linked dominant, 3 = X-linked recessive) or gt (genotype of person at; multiple_choice, correct_choice 0 = AA, 1 = Aa, 2 = aa; X-linked: a woman XAXA, XAXa, XaXa, a man XAY, XaY; A = the dominant allele), else none. automaton: s = states (l "q0", f = final state), the first is the start; t = transitions from a to b on the symbols in c ("0,1"); w = the word a question asks about: multiple_choice, correct_choice 0 = accepted, 1 = not accepted. The app writes the options of mode, gt and w.
periodic_table: the app draws the table from its own element data — never state a fact the table holds yourself. v = main (main groups I–VIII, periods 1–6, years 7–10) or full (groups 1–18, upper school); hl = symbols of the marked elements ("Na"); ask = what the key is, computed by the app: protons, electrons, neutrons (from the rounded mass), valence, group (I–VIII as 1–8 in main, 1–18 in full), period, shells — each a numeric question about the marked element at, answer the whole number, unit null; class (multiple_choice, correct_choice 0 = metal, 1 = metalloid, 2 = nonmetal, about at); en_max or radius_max (multiple_choice: which of the 2–4 marked elements has the highest electronegativity or the largest atom; choices = hl in order, at ""; radius_max only within one group or one period); none (at ""). A key that differs from the computed one costs the question.
Solids are data only; the app draws them as a Schrägbild, writes the measures on it and computes their keys. solid: k = cube, cuboid, prism or pyramid (base a regular polygon with n = 3–8 corners and side a), cylinder, cone or sphere; a = length (a cube's edge), b = depth (cuboid only), h = height, r = radius — exactly the measures the kind uses, every other one 0 (n is 0 unless prism or pyramid); u = their unit (mm, cm, dm, m). ask = the key: vertices, edges, faces (cube, cuboid, prism, pyramid only; a number, unit null), volume (unit a volume: cm³, l …), surface (unit an area: cm² …), else none. cube_net: c = six squares {x, y} on a 5 × 5 grid (0–4) joined edge to edge; ask fold ("Ist das ein Würfelnetz?"; multiple_choice, correct_choice 0 = yes, 1 = no; the app folds it and writes the options) or opposite (the app numbers the squares 1–6 in the order of c; the key = the number of the square opposite square number at + 1, a number), else none. Cube nets as the OPTIONS of a multiple_choice (3–4): exactly one is the odd one out — the only one that folds, or the only one that does not — and correct_choice points at it. axes3d: p = points {l one capital letter, x, y, z whole numbers from -4 to 6} (the app draws each with its dashed path from the origin), v = arrows from point a to point b (indices); ask point (the coordinates of point i; kind short, answer "(2|3|1)"), vector (from point i to point j; kind short, answer "(-1|2|0)"), distance (from point i to point j; a number, unit null), else none; unused i and j 0. A numeric question on a solid, a net or an axes3d always has an ask.`;

/**
 * Correct language (live finding 5: "gekürt", "echtdarstellbar", "echtere/größer als 1",
 * "Gib den Zähler des Bruches a/8 an"). The prompt asks for a self-check; code drops what it
 * can recognise structurally (placeholderQuestion).
 */
export const LANGUAGE_RULES = `Language: everything you write yourself (questions, choices, hints, explanations) is correct, natural language — right spelling, grammar and punctuation, real words only, one clear wording (never "A/B" alternatives like "echtere/größer"). Before you answer, reread every question and fix each mistake. A question never names what it asks for with a placeholder letter or word (not "Gib den Zähler des Bruches $\\frac{a}{8}$ an" — ask "Welcher Bruch ist gefärbt?").`;

/** The most other accepted answers per item — the number the prompts name (audit H-14). */
export const MAX_ACCEPTED = 8;

export const ItemDraft = z.object({
  kind: z
    .enum(['short', 'long', 'numeric', 'multiple_choice', 'formula', 'vocab', 'speak'])
    .describe(
      'vocab: prompt = word/phrase in prompt_lang, answer = translation in lang · speak: prompt = what to say aloud in lang',
    ),
  prompt: z.string().trim().min(1).max(600),
  answer: z
    .string()
    .trim()
    .min(1)
    .max(600)
    .describe('The correct answer (speak: the same text as prompt)'),
  accepted_answers: z.array(z.string().trim().min(1).max(200)).max(MAX_ACCEPTED),
  unit: z.string().trim().max(20).nullable(),
  choices: z.array(z.string().trim().min(1).max(200)).max(6).nullable(),
  correct_choice: z.number().int().min(0).max(5).nullable(),
  topic: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .nullable()
    .describe('2–4 word topic shared by related questions'),
  difficulty: z.number().int().min(1).max(5),
  prompt_lang: z
    .string()
    .regex(/^[a-z]{2}$/)
    .nullable()
    .default(null)
    .describe(
      'ISO 639-1 language the prompt is written in (vocab: the foreign word; any other question: the language of the sheet or topic)',
    ),
  lang: z
    .string()
    .regex(/^[a-z]{2}$/)
    .nullable()
    .default(null)
    .describe('vocab: language of the answer; speak: language to say it in; else null'),
  // A figure over a bound (9 points, 8 columns) is dropped, never the question (audit H-15).
  // `ModelFigure` and not `Figure`: a note line is the one figure the model may not write,
  // because its key is READ OFF the drawing (issue #226, `contracts/figure.ts` says why).
  figure: ModelFigure.nullable().default(null).catch(null),
  // No `.catch` here: an option's picture that cannot be read costs the whole question — a
  // "which graph" question with one graph missing is not a question (#231, Regel 0).
  choice_figures: z
    .array(ModelFigure)
    .min(2)
    .max(MAX_FIGURE_CHOICES)
    // Optional, not defaulted: the drafts code builds itself (bars.ts, structured.ts) never
    // have option pictures and need not say so.
    .nullish()
    .describe(
      'multiple_choice only: one figure per choice, same order as choices, when the options ARE pictures ("Welcher Graph passt zu …?"); else null',
    ),
  /**
   * What the question reads off its chart (issues #245, #246). With it, code computes the key
   * from the chart's data and drops the question when the model's key disagrees
   * (`chartRead.ts`). Not caught: a reading that does not parse cannot be checked, and an
   * unchecked key on a chart question is what this field exists to end.
   */
  read: ChartRead.nullable().default(null),
  /**
   * The one calculation inside a sentence whose value the key is (issue #227, finding 4): "6 + 4"
   * for "Berechne $6 + 4$.". Code cannot find it there itself — "Erweitere $\frac{2}{5}$ mit 3"
   * holds a fraction that is not what is asked — so the model marks it, and code computes it and
   * drops the question when the key disagrees (`keyCheck.ts`). A marker that is not in the
   * question proves nothing and is ignored. Optional like `choice_figures`: the drafts code
   * builds itself compute their keys and need not say so.
   */
  computes: z
    .string()
    .trim()
    .max(120)
    .nullish()
    .catch(null)
    .describe(
      'numeric/short/formula/multiple_choice: when the answer IS the value of one calculation written in the question, that calculation copied exactly as it stands there ("6 + 4" for "Berechne $6 + 4$."); null for anything else — a word problem, an equation, a fraction to expand or reduce',
    ),
  tolerance: z
    .number()
    .positive()
    .max(1_000_000)
    .nullable()
    .default(null)
    .describe(
      'numeric only: the ± difference still counted right when the task asks to round, estimate or measure (e.g. 0.05 for "miss auf den Millimeter genau" in cm); null for an exact result',
    ),
  spelling: z
    .enum(['strict', 'gentle'])
    .nullable()
    .default(null)
    .describe(
      'short/long/vocab: "strict" when the task practises spelling, capitalisation or punctuation (Rechtschreibung, Kommasetzung, Groß-/Kleinschreibung); "gentle" when they do not matter for the answer; null to leave it to the subject',
    ),
  source_excerpt: z.string().trim().max(300).nullable(),
  curriculum_point: CurriculumPointId.nullable()
    .default(null)
    .catch(null)
    .describe(
      'The state-dependent curriculum place this question is at — one of the keys listed under CURRICULUM, or null when it is at none of them (almost every question). What the place then means for her Bundesland is decided by the server, never here.',
    ),
  hints: z
    .array(z.string().trim().min(1).max(300))
    .max(3)
    .default([])
    .describe(
      '2–3 hints, each more specific than the one before: what is asked → which rule or idea → the first step. Never the answer — not in another form either (no 31/20 when the answer is 1 11/20) and no step that already produces it. Empty for vocab and speak.',
    ),
  worked_solution: z
    .string()
    .trim()
    .min(1)
    .max(1500)
    .nullable()
    .default(null)
    .describe(
      'The solution explained step by step in 2–5 short sentences, shown after the third wrong try. null for vocab and speak.',
    ),
  // Die Pflichtelemente einer Schreibaufgabe (issue #211). Eine Rubrik, deren Form nicht hält,
  // wird verworfen, nicht die Frage (`usableItems`) — dann verhält sie sich wie seit #197.
  rubric: Rubric.nullable().default(null).catch(null),
});
export type ItemDraft = z.infer<typeof ItemDraft>;

/**
 * Clips what only exceeds a list bound, so a rich item is kept rather than lost: accepted
 * answers beyond MAX_ACCEPTED (and empty or overlong ones), hints beyond 3.
 */
function clipDraft(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw;
  const o = { ...(raw as Record<string, unknown>) };
  // A chart that does not hold costs its QUESTION, not just the drawing (issues #245, #246):
  // unlike a fraction picture, a chart is what the question is about — "Werte das
  // Klimadiagramm aus" without the diagram is no question. Any other broken figure is still
  // dropped alone (`figure` is caught to null, audit H-15). A clock, coins, a dot field or
  // base-ten blocks ARE the question too ("Wie spät ist es?", issue #254), and so is a tree (#256).
  if (
    figureIsRejectedChart(o.figure) ||
    figureIsRejectedPrimary(o.figure) ||
    figureIsRejectedTree(o.figure) ||
    // A solid, a cube net or a point in space is the question too (issue #255).
    figureIsRejectedSpace(o.figure)
  )
    return null;
  if (figureIsRejectedPeriodic(o.figure)) return null; // a periodic table too (#250)
  if (Array.isArray(o.accepted_answers)) {
    o.accepted_answers = o.accepted_answers
      .filter((a): a is string => typeof a === 'string' && a.trim().length > 0 && a.length <= 200)
      .slice(0, MAX_ACCEPTED);
  }
  if (Array.isArray(o.hints)) o.hints = o.hints.slice(0, 3);
  return o;
}

/**
 * A list of items the model wrote, read one by one: an item that does not fit its schema is
 * dropped, never the whole list (audit H-14, H-15; "the server checks every item on its own").
 * At most `max` are read. Use it in place of z.array(schema) where the result is parsed; the
 * JSON schema for the model keeps z.array(schema).max(max).
 */
export function itemsOneByOne<S extends z.ZodTypeAny>(schema: S, max: number) {
  return z
    .array(z.unknown())
    .catch([])
    .transform((list): Array<z.output<S>> => {
      const out: Array<z.output<S>> = [];
      for (const raw of list.slice(0, max)) {
        const r = schema.safeParse(clipDraft(raw));
        if (r.success) out.push(r.data as z.output<S>);
      }
      return out;
    });
}

/** The solution as a learner would see it (a choice's text for multiple choice). */
function solutionText(it: ItemDraft): string {
  return it.kind === 'multiple_choice' && it.choices && it.correct_choice !== null
    ? (it.choices[it.correct_choice] ?? it.answer)
    : it.answer;
}

/**
 * A figure as it is READ back from a stored question. Rows written before a figure grew a field
 * (the angles, sides, arrows, rays and lines of issue #257) get it filled in by the contract's
 * defaults, so the app never sees half a figure; a row that no longer reads at all shows the
 * question without its figure rather than failing the session.
 */
export function storedFigure(raw: unknown): Figure | null {
  if (raw === null || raw === undefined) return null;
  const parsed = FigureSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** A figure the app can really draw, or null (a broken figure never costs the question). */
function usableFigure(f: ItemDraft['figure']): ItemDraft['figure'] {
  if (!f) return null;
  switch (f.type) {
    case 'function_plot': {
      const functions = f.functions.filter((fn) => compileExpression(fn.expr) !== null);
      if (f.x_min >= f.x_max || f.y_min >= f.y_max) return null;
      if (functions.length === 0 && f.points.length === 0) return null;
      return { ...f, functions };
    }
    case 'number_line':
      if (f.min >= f.max || (f.max - f.min) / f.step > 40) return null;
      return f;
    case 'fraction':
      return f.fractions.every((x) => x.filled <= x.parts) ? f : null;
    case 'geometry': {
      const names = new Set(f.points.map((p) => p.name));
      const known = (n: string) => names.has(n);
      return {
        ...f,
        segments: f.segments.filter((sg) => known(sg.from) && known(sg.to)),
        polygons: f.polygons.filter((poly) => poly.every(known)),
        circles: f.circles.filter((c) => known(c.center)),
      };
    }
    case 'table':
      return f.rows.every((r) => r.length === f.header.length) ? f : null;
    default:
      // A chart (`chartProblem`), a primary-school figure (`primaryProblem`) and a tree are
      // checked whole; as a question's own figure a broken one never gets here (`clipDraft`),
      // except as an option's picture, which then costs its question (`optionFigures`).
      if (isPrimary(f)) return primaryProblem(f) === null ? f : null;
      if (isTreeFigure(f)) return treeProblem(f) === null ? f : null;
      if (isPeriodicTable(f)) return periodicProblem(f) === null ? f : null;
      if (isSpaceFigure(f)) return spaceProblem(f) === null ? f : null;
      return isChart(f) && chartProblem(f) !== null ? null : f;
  }
}

/**
 * The options' pictures as the app will draw them — all of them or the question goes (an
 * empty list stands for "one could not be drawn": `choiceProblem` then rejects the count).
 * Unlike the question's own figure nothing is dropped from a picture either: a graph whose
 * function the app cannot read would be an empty option.
 */
function optionFigures(raw: ItemDraft): ModelFigure[] | null {
  if (!kindIn(CHOICE_FIGURE_KINDS, raw.kind) || !raw.choice_figures) return null;
  const drawn: ModelFigure[] = [];
  for (const written of raw.choice_figures) {
    const f = usableFigure(written);
    if (f === null) return [];
    if (f.type === 'function_plot' && written.type === 'function_plot') {
      if (f.functions.length !== written.functions.length) return [];
    }
    drawn.push(f);
  }
  return drawn;
}

/**
 * The options' pictures as READ back from a stored question (issue #326) — Regel 0 the other
 * way round: a row is held to everything a draft was held to when it was written. Each picture
 * is the model's shape (`ModelFigure`: a note line is never an option), drawable exactly as it
 * stands (`usableFigure` would change nothing), one per option, and the whole question still
 * passes `choiceProblem` with them. A row written before a contract or a check changed that
 * fails any of it reaches the app as the plain multiple choice it also is — the option texts,
 * judged by the same index. Nothing is repaired: four pictures with one dropped or redrawn
 * would be another question than the one that was checked.
 */
export function storedChoiceFigures(
  row: Omit<ChoiceDraft, 'choice_figures'> & { kind: string; choice_figures: unknown },
): Figure[] | null {
  if (row.kind !== 'multiple_choice' || row.choice_figures == null) return null;
  const read = z.array(ModelFigure).min(2).max(MAX_FIGURE_CHOICES).safeParse(row.choice_figures);
  if (!read.success) return null;
  if (!read.data.every((f) => isDeepStrictEqual(usableFigure(f), f))) return null;
  return choiceProblem({ ...row, choice_figures: read.data }) === null ? read.data : null;
}

/**
 * An explicit tolerance only for a number key, and never wider than a tenth of the key
 * (decision D-1: a wider tolerance only where the item declares one, and within bounds —
 * a model-written tolerance must not turn 242 for 240 into a right answer).
 */
function usableTolerance(it: ItemDraft): number | null {
  if (!kindIn(TOLERANCE_KINDS, it.kind) || it.tolerance === null) return null;
  const key = parseCanonicalKey(it.answer);
  if (key.value === null || key.value === 0) return null;
  return it.tolerance <= Math.abs(key.value) / 10 ? it.tolerance : null;
}

const FRAC = /\\frac\{((?:[^{}]|\{[^{}]*\})*)\}\{((?:[^{}]|\{[^{}]*\})*)\}/g;
const PLAIN_FRAC =
  /(?<![\p{L}\p{N}])(\p{L}|\?)\/(\d+)(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])(\d+)\/(\p{L}|\?)(?![\p{L}\p{N}])/gu;
const RELATION = /[=<>≤≥≠≈]|\\(?:le|ge|ne|approx|lt|gt)(?![a-z])/;
/** A fraction part that stands for something unknown: one letter, a word in \text{}, "?" or a gap. */
const UNKNOWN_PART = /^\s*(?:\p{L}|\\text\{[^}]*\}|\?|_+|\\_+|\\square|\.\.\.|…)\s*$/u;
const NUMBER_PART = /^\s*\d+\s*$/;

/**
 * A number question that names what it asks for with a placeholder: a fraction with a number
 * on one side and an unknown on the other ($\frac{a}{8}$, $\frac{\text{Zähler}}{4}$, a/8,
 * $\frac{3}{?}$), with nothing that pins the unknown down — no relation (=, <, ≤ …) and the
 * letter nowhere else in the question (live finding 5: "Gib den Zähler des Bruches a/8 an").
 * Structure only, no words. Numeric items only: in algebra (formula) letters are the point.
 */
export function placeholderQuestion(it: Pick<ItemDraft, 'kind' | 'prompt'>): boolean {
  if (it.kind !== 'numeric') return false;
  if (RELATION.test(it.prompt)) return false;
  const found: { unknown: string; at: number; length: number }[] = [];
  for (const m of it.prompt.matchAll(FRAC)) {
    const [whole, top = '', bottom = ''] = m;
    const unknown =
      UNKNOWN_PART.test(top) && NUMBER_PART.test(bottom)
        ? top
        : UNKNOWN_PART.test(bottom) && NUMBER_PART.test(top)
          ? bottom
          : null;
    if (unknown !== null)
      found.push({ unknown: unknown.trim(), at: m.index, length: whole.length });
  }
  for (const m of it.prompt.matchAll(PLAIN_FRAC)) {
    found.push({ unknown: (m[1] ?? m[4] ?? '').trim(), at: m.index, length: m[0].length });
  }
  return found.some(({ unknown, at, length }) => {
    // A letter used elsewhere in the question ("für x = 12", "welches $a$") is bound there.
    if (!/^\p{L}$/u.test(unknown)) return true;
    const rest = it.prompt.slice(0, at) + ' ' + it.prompt.slice(at + length);
    return !new RegExp(`(?<![\\p{L}\\\\])${unknown}(?!\\p{L})`, 'u').test(rest);
  });
}

/**
 * Two prompts that mean the same question (issue #150). A second pass over the same thing must
 * not hand back "le vélo" as new when "Le vélo " is already there: the model retypes, and its
 * spacing and capitals are not what makes a question a different one.
 *
 * It lives here because both places that ask twice use it and must agree: a sheet read again for
 * the rest of its questions (`materials/service.ts`), and a practice run whose remaining
 * questions are written while she works on the first ones (issue #220, `generate.ts`).
 */
export function samePrompt(prompt: string): string {
  return prompt.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/** Keep only items whose shape is consistent; returns them normalised. */
export function usableItems(items: ItemDraft[], opts: { locale?: string } = {}): ItemDraft[] {
  const out: ItemDraft[] = [];
  for (const raw of items) {
    const normalised = {
      ...raw,
      // LaTeX without dollar signs: only the math runs of a sentence, a math field as a whole.
      prompt: dollarMathRuns(raw.prompt),
      answer: dollarMathField(raw.answer),
      accepted_answers: raw.accepted_answers.map(dollarMathField),
      choices: raw.choices ? raw.choices.map(dollarMathField) : null,
      figure: usableFigure(raw.figure),
      choice_figures: optionFigures(raw),
      tolerance: usableTolerance(raw),
      spelling: kindIn(SPELLING_KINDS, raw.kind) ? raw.spelling : null,
      // Only a free text has required elements, and only a rubric that can be checked is kept
      // (issue #211). A rubric that does not hold costs itself, never the question.
      rubric: usableRubric(raw.rubric, raw.kind),
    };
    // A question about a chart (issues #245, #246): its key is computed from the chart's data
    // and the model's must agree with it — before anything else looks at the key, because the
    // options of a type question and the tolerance of a reading are written here.
    const read = checkedRead(normalised, raw.figure, opts.locale ?? null);
    // The same for a tree, a pedigree or an automaton (issue #256, `treeCheck.ts`).
    // And for a periodic table (issue #250, `periodicCheck.ts`).
    const periodic = checkedPeriodic(
      read && checkedTree(read, opts.locale ?? null),
      opts.locale ?? null,
    );
    // And for a solid, a cube net or a point in space (issue #255, `solidCheck.ts`).
    const it = periodic && checkedSpace(periodic, opts.locale ?? null);
    if (!it) continue;
    // Notation the app cannot draw (issue #239): a learner would read "\\overbrace" in the middle
    // of her question. Dropped, not repaired — the list is `MATH_NOTATION_RULE`, which the model
    // was given, and guessing what an unknown command meant is the model's job, not ours.
    if (drawsUnsupported(it)) continue;
    it.hints = it.hints.filter((h) => unsupportedMath(h).length === 0);
    if (it.worked_solution !== null && unsupportedMath(it.worked_solution).length > 0)
      it.worked_solution = null;
    // A number asked for behind a placeholder is no clear question: dropped, not guessed at.
    if (placeholderQuestion(it)) continue;
    // The key contradicts the arithmetic its own question asks for (issue #157). A rule
    // check would then reject her right answer with full authority, and she would have to
    // argue with a tutor that is sure of itself. Dropped, like every other item whose
    // shape does not hold together.
    if (!keyAgreesWithPrompt(it)) continue;
    // A figure that states numbers must agree with them and with the key read off it (issues
    // #253, #257): a structural formula whose shells do not hold, an arc labelled 50° that is
    // 70° wide, a resultant that is not the sum of its forces. The question is built on the
    // drawing, so it goes with it — dropped, not repaired (`figureCheck.ts`).
    if (!figureHolds(it.figure, solutionText(it), it.kind === 'numeric', it.unit)) continue;
    if (it.kind === 'multiple_choice') {
      // One question with ONE right option, or none at all (issue #227, finding 2; #231). Only the
      // index was ever checked, and it decides the verdict with full authority — a multiple-choice
      // answer never reaches the tutor. So the options must hold together: no two the same (as
      // text, or worth the same), the key IS the option the index points at, and pictures as
      // options are distinct graphs of which exactly the indexed one is the key's function
      // (`choiceCheck.ts` has every case). Dropped, not repaired.
      if (choiceProblem(it) !== null) continue;
      it.hints = it.hints.filter((h) => !mentionsSolution(h, solutionText(it), it.prompt));
      out.push(it);
      continue;
    }
    // Help must never give the answer away: a prepared hint that contains it is dropped.
    const leaks = (h: string) =>
      [solutionText(it), ...it.accepted_answers].some((sol) => mentionsSolution(h, sol, it.prompt));
    it.hints = it.hints.filter((h) => !leaks(h));
    // A rubric's "what to look for" sentences are shown to her like a hint, so they are held to
    // the hint rule (issue #211). Here the whole rubric goes rather than the one sentence: an
    // element with nothing to say when it is missing would be a tick box without a next step.
    if (it.rubric && it.rubric.elements.some((e) => leaks(e.missing))) it.rubric = null;
    const plain = { ...it, choices: null, correct_choice: null, choice_figures: null };
    if (it.kind === 'vocab') {
      if (!it.lang || !it.prompt_lang || it.lang === it.prompt_lang) continue;
      out.push(plain);
      continue;
    }
    if (it.kind === 'speak') {
      if (!it.lang) continue;
      out.push({ ...plain, answer: it.prompt, prompt_lang: null });
      continue;
    }
    // The question's language stays: voice mode reads it and listens in that language, not
    // the app's (audit M-40). `lang` stays null: it marks translation and speaking items.
    out.push({ ...plain, lang: null });
  }
  return out;
}

/** Does a text the learner will see — question, options, key — use notation the app cannot draw? */
function drawsUnsupported(
  it: Pick<ItemDraft, 'prompt' | 'answer' | 'accepted_answers' | 'choices'>,
): boolean {
  return [it.prompt, it.answer, ...it.accepted_answers, ...(it.choices ?? [])].some(
    (text) => unsupportedMath(text).length > 0,
  );
}

export type ItemSource = {
  learnerId: string;
  materialId: string | null;
  subjectId: string | null;
  origin: 'material' | 'buddy' | 'typed' | 'homework';
};

/**
 * An item as it is STORED. Everything but `figure` is what the model may write; a note line
 * (`StaffFigure`) only ever comes from `practice/staff.ts`, which computed this item's prompt,
 * options, key and drawing together (issue #226).
 */
export type StoredItem = Omit<ItemDraft, 'figure' | 'kind' | 'rubric'> & {
  /** One of the model's kinds, or a structured kind built by `practice/structured.ts`. */
  kind: ItemKind;
  figure: Figure | null;
  /** A writing task's rubric as the model wrote it, or an explanation's key points (#236). */
  rubric: StoredRubric | null;
  /**
   * A structured question's task WITH its key (issues #228–#230): set only by
   * `practice/structured.ts`, after Regel 0. Migration 0079 makes it an either/or with the kind.
   */
  task?: StructuredTask | null;
  /**
   * Never the model's (it has no such field, issues #162/#226): set only by `practice/bars.ts`
   * or `practice/staff.ts`, and never both — migration 0078 makes that an either/or.
   */
  bar_task?: BarTask | null;
  staff_task?: StaffTask | null;
  /**
   * The spoken text this question is answered from (issue #210): set only by `practice/listen.ts`,
   * which checked that the answer stands in that very text.
   */
  listen_task?: ListenTask | null;
  /**
   * The text this question is about (Leseverständnis, issue #233): set only by
   * `practice/reading.ts`, which checked the question against exactly these lines.
   */
  read_passage?: ReadPassage | null;
};

/**
 * Stores the items (a vocabulary pair in both directions) and returns the ids the session
 * asks, in order.
 *
 * Both directions are always stored, each with its own FSRS state, so the other one can be
 * practised later without writing the pair again. `direction` only says which of the two this
 * session asks (issue #113): `recognise` the foreign word → its meaning, `produce` her own
 * language → the foreign word (what a class test asks for), null both, as before. Questions
 * that are not a vocabulary pair are never affected by it.
 */
export async function insertItems(
  db: Db,
  src: ItemSource,
  items: ReadonlyArray<StoredItem>,
  direction: VocabDirection | null = null,
): Promise<string[]> {
  const ids: string[] = [];
  const insert = async (it: StoredItem, asked = true) => {
    const row = await db.one<{ id: string }>(
      `insert into items (learner_id, material_id, subject_id, kind, prompt, answer, accepted_answers, unit,
                          choices, correct_choice, topic, difficulty, source_excerpt, origin, lang, prompt_lang, figure,
                          hints, worked_solution, tolerance, spelling, bar_task, task,
                          curriculum_point, rubric, listen_task, staff_task, choice_figures, read_passage)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29) returning id`,
      [
        src.learnerId,
        src.materialId,
        src.subjectId,
        it.kind,
        it.prompt,
        it.answer,
        it.accepted_answers,
        it.unit,
        it.choices,
        it.correct_choice,
        it.topic,
        it.difficulty,
        it.source_excerpt,
        src.origin,
        it.lang,
        it.prompt_lang,
        it.figure ? JSON.stringify(it.figure) : null,
        it.hints,
        it.worked_solution,
        it.tolerance,
        it.spelling,
        it.bar_task ? JSON.stringify(it.bar_task) : null,
        it.task ? JSON.stringify(it.task) : null,
        it.curriculum_point,
        it.rubric ? JSON.stringify(it.rubric) : null,
        it.listen_task ? JSON.stringify(it.listen_task) : null,
        it.staff_task ? JSON.stringify(it.staff_task) : null,
        it.choice_figures ? JSON.stringify(it.choice_figures) : null,
        it.read_passage ? JSON.stringify(it.read_passage) : null,
      ],
    );
    if (asked) ids.push(row.id);
  };
  const pair = (it: StoredItem) => it.kind === 'vocab' && !!it.lang && !!it.prompt_lang;
  for (const it of items) await insert(it, !(pair(it) && direction === 'produce'));
  // The other direction of each pair comes after all first directions — asked right after
  // its twin, the answer would still be on screen. Its alternatives are unknown; the tutor
  // judges variants.
  for (const it of items) {
    if (!pair(it)) continue;
    await insert(
      {
        ...it,
        prompt: it.answer,
        answer: it.prompt,
        accepted_answers: [],
        prompt_lang: it.lang,
        lang: it.prompt_lang,
        // Hints were written for the first direction.
        hints: [],
        worked_solution: null,
      },
      direction !== 'recognise',
    );
  }
  return ids;
}
