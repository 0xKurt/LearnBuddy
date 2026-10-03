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
  hasSeveralParts,
  ModelFigure,
  PartsTask,
  Rubric,
  type BarTask,
  type Figure,
  type ListenTask,
  type StaffTask,
  type VocabDirection,
} from '@learnbuddy/shared-types/contracts';
import {
  canonicalText,
  chartProblem,
  compileExpression,
  isChart,
  parseCanonicalKey,
} from '@learnbuddy/shared-math';
import { z } from 'zod';

import type { Db } from '../../lib/db.js';
import { CurriculumPointId } from '../curriculum/state.js';
import { dollarMathField, dollarMathRuns } from './dollarMath.js';
import { figureHolds } from './figureCheck.js';
import { kindOfForm, solutionOfParts, usablePartsTask } from './parts.js';
import { usableRubric } from './rubric.js';
import { mentionsSolution } from './tutor.js';
import { checkedRead, figureIsRejectedChart } from './chartRead.js';
import { keyAgreesWithPrompt } from './keyCheck.js';

export const MATH_RULES = `Math (also in choices, answers and accepted_answers): write it between dollar signs in this LaTeX subset only: \\frac{a}{b}, x^{2}, x_{1}, \\sqrt{x}, \\cdot, \\times, \\div, \\pi, \\le, \\ge, \\ne, \\approx, \\degree, \\pm, \\rightarrow (a reaction arrow; \\rightleftharpoons for an equilibrium); for geometry and sets also \\overline{3} (repeating decimal, segment), \\angle, \\parallel, \\perp, \\in, \\mathbb{N}, \\vec{v}. Example: "Kürze $\\frac{6}{8}$." Plain numbers and words stay outside the dollar signs. A dollar sign meaning money is written \\$ ("kostet \\$5").`;

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

export const FIGURE_RULES = `Figures: add "figure" only when a question needs one (a fraction to see, a number line, a function graph, a bar chart, a geometric figure, a table, a structural formula, a chart) — as data, the app draws it. function_plot expressions use x, numbers, + - * / ^, sqrt, abs, sin, cos, tan, ln, log, exp, pi (e.g. "0.5*x^2-2"). A geometry figure is drawn to scale and checked: its coordinates must give every stated angle (deg) and every side length (value, one unit for all), a force arrow's length is proportional to its value, and a resultant arrow is the vector sum of the others; label the one measure the question asks for "?" — the key must be that measure. A molecule is atoms (aliases a1, a2 …, hydrogens counted in h, charge) and bonds; the app computes the lone pairs and checks every shell, so an atom whose octet does not hold costs the question; set "ask" when the key is its formula, its number of lone pairs or its molar mass. Otherwise figure is null.
Charts are data only; the app draws axes, scale and colours. line_chart: x = up to 12 labels in order (numbers for a measured x such as time, else categories so short that count × (longest + 1) ≤ 30 characters, so "J"…"D" for 12 months, e.g. "Jan"…"Jun"); s = 1–3 series {n name, u unit, v one value per x label, bar true for columns (one series at most), r true for a right axis — only for a second unit}. climate_chart: place, alt in m, t = 12 monthly means in °C and p = 12 monthly sums in mm, January first. pie_chart: l labels and v shares in % that add up to exactly 100; half for a half circle. box_plot: b = 1–3 boxes {l, v = [min, Q1, median, Q3, max]}, raw = the data list when the task gives one (then one box), else []. histogram: x0 start of the first class, w class width, v heights. scatter_plot: x and y of each point; fit draws the least-squares line. pyramid: a0 first age, w years per group, m men and f women per group from young to old, u unit. A chart that breaks one of these rules is dropped together with its question.
"read" — for every question whose answer is read off or computed from its chart, so the app can check the key: q = value (s, i) · max, min, sum, mean, range (largest − smallest) of series s · argmax, argmin (answer = the label: month, category or slice) · diff (value at j minus value at i) · angle (centre angle of slice i in degrees) · iqr (box s) · humid, arid (number of humid or arid months) · humid_at (month i; multiple_choice, correct_choice 0 = humid, 1 = arid) · slope, intercept (the fitted line) · type (pyramid; multiple_choice, correct_choice 0 = pyramid, 1 = bell, 2 = urn). s = series (climate 0 = °C, 1 = mm; pyramid 0 = men, 1 = women; box plot: which box), i and j = positions from 0 (box plot value: i 0 = min … 4 = max); unused numbers 0. The app writes the options for humid_at and type. A numeric question about a chart always has "read"; any other question read null.`;

/**
 * Correct language (live finding 5: "gekürt", "echtdarstellbar", "echtere/größer als 1",
 * "Gib den Zähler des Bruches a/8 an"). The prompt asks for a self-check; code drops what it
 * can recognise structurally (placeholderQuestion).
 */
export const LANGUAGE_RULES = `Language: everything you write yourself (questions, choices, hints, explanations) is correct, natural language — right spelling, grammar and punctuation, real words only, one clear wording (never "A/B" alternatives like "echtere/größer"). Before you answer, reread every question and fix each mistake. A question never names what it asks for with a placeholder letter or word (not "Gib den Zähler des Bruches $\\frac{a}{8}$ an" — ask "Welcher Bruch ist gefärbt?").`;

/** The most other accepted answers per item — the number the prompts name (audit H-14). */
export const MAX_ACCEPTED = 8;

/**
 * How a question whose answer has several parts is written (issues #228–#230). It goes to the
 * model in the item schema itself, so the shapes in `parts_task` carry their own instructions.
 *
 * Categories and bans only — never a filled-in example sentence: a sample in a prompt comes back
 * as a reading of the learner's own sheet (the standing rule, see `UNCLEAR_RULES`).
 */
export const PARTS_RULES = `Three kinds have an answer with SEVERAL PARTS. For these — and only for these — write the task in "parts_task"; its "form" must match the kind: order → form "order" · match → form "match_pairs" or "match_groups" · table_fill → form "table_fill". For every other kind parts_task is null, and these three kinds are never written without it.
- order: the task is to put things in the right order (steps of a process, events in time, numbers by size). Write the elements IN THE CORRECT ORDER; the app shuffles them. Only when exactly one order is right, and when every element is clearly different from the others. If every element is a number, the order must be by size.
- match: the task is to connect what belongs together (form "match_pairs") or to sort things into groups (form "match_groups"). Only when each left side fits exactly one right side, and each element belongs in exactly one group.
- table_fill: the task is to fill the gaps of a table. Every gap holds ONE number or ONE short word — never a sentence, never a free formulation, and never something the table itself does not decide. Other forms a teacher would accept go in that gap's "accepted". Set "computed" only for a table of values whose one column really is a function of another, and then give the expression and the two columns: the server recomputes every value and writes no question when one of them does not match, so this is a way to have your own arithmetic checked, not a decoration.
- prompt: what the printed task asks, as a question in words. It must not give the solution away, and it must not repeat the elements: they stand on the board.
- For these three the task IS the question: the app writes the solution from it. So leave accepted_answers empty and choices, correct_choice, unit, tolerance, spelling, lang, prompt_lang and figure null, and nothing you put in "answer" is used.
- Do not force a task into one of these forms. A question with one answer stays short, numeric, formula or multiple_choice.`;

/**
 * Extraction only (the other half of `PARTS_RULES`): what decides whether a PRINTED task has one
 * of these forms is the task's own instruction — what the learner is told to DO — not what its
 * content is about.
 *
 * It is the mirror of the lesson in issue #198: a task whose form the app could not practise used
 * to come back as knowledge questions about its own text, which looks like a whole sheet and is
 * not one. Now three of those forms exist, so a printed ordering task must BECOME an ordering
 * question rather than a question about the things being ordered.
 *
 * Categories and bans only — never a sample instruction in any language (the standing rule, see
 * `UNCLEAR_RULES`): a phrasing written into a prompt comes back as a reading of her own sheet.
 */
export const PARTS_FROM_SHEET = `Whether a printed task has one of the three forms with an answer in several parts is decided by what the task tells the learner to DO, not by what its content is about: a task that has things to be put in an order, to be connected, to be assigned, or to be sorted into given categories, and a task that has a table, a scheme or a grid to be completed, keeps that form. Take the elements, the pairs, the categories or the table from the sheet as printed: never add one of your own and never leave one out. Such a task must not become knowledge questions about its own content instead — that would look like the sheet and would not be it. Every other task keeps the kind it would otherwise have.`;

export const ItemDraft = z.object({
  kind: z
    .enum([
      'short',
      'long',
      'numeric',
      'multiple_choice',
      'formula',
      'vocab',
      'speak',
      'order',
      'match',
      'table_fill',
    ])
    .describe(
      'vocab: prompt = word/phrase in prompt_lang, answer = translation in lang · speak: prompt = what to say aloud in lang · order / match / table_fill: an answer with several parts, written in parts_task',
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
  /**
   * What the question reads off its chart (issues #245, #246). With it, code computes the key
   * from the chart's data and drops the question when the model's key disagrees
   * (`chartRead.ts`). Not caught: a reading that does not parse cannot be checked, and an
   * unchecked key on a chart question is what this field exists to end.
   */
  read: ChartRead.nullable().default(null),
  /**
   * The reviewed task of an answer with several parts (issues #228–#230). Unlike a figure, a
   * broken one costs the QUESTION: for these three kinds it is the whole question, and there is
   * nothing left to ask without it (`usableItems`).
   */
  parts_task: PartsTask.nullable()
    .default(null)
    .catch(null)
    .describe(
      'order / match / table_fill: the task itself (see the kinds that have an answer with several parts). null for every other kind.',
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
  // dropped alone (`figure` is caught to null, audit H-15).
  if (figureIsRejectedChart(o.figure)) return null;
  if (Array.isArray(o.accepted_answers)) {
    o.accepted_answers = o.accepted_answers
      .filter((a): a is string => typeof a === 'string' && a.trim().length > 0 && a.length <= 200)
      .slice(0, MAX_ACCEPTED);
  }
  if (Array.isArray(o.hints)) o.hints = o.hints.slice(0, 3);
  // An answer with several parts has no single key to write, and the prompts say so: the solution
  // is COMPUTED from the task (`solutionOfParts`). The schema still asks for a non-empty `answer`
  // for every kind, so a reading that correctly left it out would lose its question over a field
  // nothing reads. It is filled in here and overwritten in `usableItems`.
  if (typeof o.kind === 'string' && hasSeveralParts(o.kind)) {
    if (typeof o.answer !== 'string' || o.answer.trim() === '') o.answer = '…';
  }
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
/** Two options that are the same thing — as text, or as a number written two ways. */
function sameTwice(choices: readonly string[]): boolean {
  const seen = new Set<string>();
  for (const c of choices) {
    // Case-insensitive on purpose: two options that differ only in capitalisation are one
    // option for her — she taps the other right one and is told she is wrong. `canonicalText`
    // only folds whitespace, which is the right strictness for GRADING and too weak here.
    const text = canonicalText(c).toLocaleLowerCase();
    const num = parseCanonicalKey(c);
    // A number is compared by VALUE: "0,5" and "$\\frac{1}{2}$" are one option, written twice.
    const key = num.value !== null && !num.unit ? `n:${num.value}` : `t:${text}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

/**
 * The key and the option the index points at must be the same answer. They are written
 * separately by the model, so they can disagree — and then the index wins and the verdict is
 * final. An empty key says nothing and is left alone; the option is the answer there.
 */
function keyMatchesChoice(it: ItemDraft): boolean {
  if (!it.choices || it.correct_choice === null) return true;
  const chosen = it.choices[it.correct_choice];
  if (chosen === undefined) return false;
  // The schema already refuses an empty key (`answer` is min(1)), so there is no "no key"
  // case to let through — this only compares the two things that exist.
  const key = it.answer.trim();
  if (canonicalText(key) === canonicalText(chosen)) return true;
  const a = parseCanonicalKey(key);
  const b = parseCanonicalKey(chosen);
  if (a.value !== null && b.value !== null && a.unit === b.unit) {
    return Math.abs(a.value - b.value) <= 1e-9 * Math.max(1, Math.abs(a.value));
  }
  return false;
}

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
      // A chart is checked whole (`chartProblem`); a broken one never gets here (`clipDraft`).
      return isChart(f) && chartProblem(f) !== null ? null : f;
  }
}

/**
 * An explicit tolerance only for a number key, and never wider than a tenth of the key
 * (decision D-1: a wider tolerance only where the item declares one, and within bounds —
 * a model-written tolerance must not turn 242 for 240 into a right answer).
 */
function usableTolerance(it: ItemDraft): number | null {
  if (it.kind !== 'numeric' || it.tolerance === null) return null;
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

/**
 * Keep only items whose shape is consistent; returns them normalised.
 *
 * `severalParts: false` drops the three kinds whose answer has several parts (issues
 * #228–#230). Homework help passes it: there the task is the one SHE photographed or typed and
 * the help is given task by task, so a board would be a form the sheet does not have — and
 * nothing in `help` mode (no hint ladder, no "Lösung zeigen") fits one.
 */
export function usableItems(
  items: ItemDraft[],
  opts: { severalParts?: boolean; locale?: string } = {},
): ItemDraft[] {
  const severalParts = opts.severalParts !== false;
  const out: ItemDraft[] = [];
  for (const raw of items) {
    if (!severalParts && (hasSeveralParts(raw.kind) || raw.parts_task !== null)) continue;
    const normalised = {
      ...raw,
      // LaTeX without dollar signs: only the math runs of a sentence, a math field as a whole.
      prompt: dollarMathRuns(raw.prompt),
      answer: dollarMathField(raw.answer),
      accepted_answers: raw.accepted_answers.map(dollarMathField),
      choices: raw.choices ? raw.choices.map(dollarMathField) : null,
      figure: usableFigure(raw.figure),
      tolerance: usableTolerance(raw),
      spelling:
        raw.kind === 'short' || raw.kind === 'long' || raw.kind === 'vocab' ? raw.spelling : null,
      // Only the three multi-part kinds carry a task — exactly as only multiple choice carries
      // choices. A task on any other kind is a field that nothing would ever read.
      parts_task: hasSeveralParts(raw.kind) ? raw.parts_task : null,
      // Only a free text has required elements, and only a rubric that can be checked is kept
      // (issue #211). A rubric that does not hold costs itself, never the question.
      rubric: usableRubric(raw.rubric, raw.kind),
    };
    // A question about a chart (issues #245, #246): its key is computed from the chart's data
    // and the model's must agree with it — before anything else looks at the key, because the
    // options of a type question and the tolerance of a reading are written here.
    const it = checkedRead(normalised, raw.figure, opts.locale ?? null);
    if (it === null) continue;
    // ── an answer with several parts (issues #228–#230) ──
    //
    // The task is the whole question here, so it is settled before anything else: without a
    // usable one there is nothing to ask, and a question of one of these kinds that slipped
    // through without its task would be graded as a string against a rendered solution.
    //
    // The kind and the task must agree, and disagreement DROPS the question instead of being
    // repaired: deriving the kind from the task would turn a question whose text says "ordne"
    // into a pairing exercise, and repairing the task from the kind is not possible at all.
    if (hasSeveralParts(it.kind) || it.parts_task !== null) {
      const task = it.parts_task === null ? null : usablePartsTask(it.parts_task);
      if (task === null || kindOfForm(task.form) !== it.kind) continue;
      // Everything a single-value answer needs is empty here, and the solution is COMPUTED from
      // the task — one source for the question, as for a fraction bar (issue #162).
      const whole = {
        ...it,
        parts_task: task,
        answer: solutionOfParts(task),
        accepted_answers: [],
        choices: null,
        correct_choice: null,
        unit: null,
        tolerance: null,
        spelling: null,
        lang: null,
        prompt_lang: null,
      };
      whole.hints = whole.hints.filter((h) => !mentionsSolution(h, whole.answer, whole.prompt));
      out.push(whole);
      continue;
    }
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
    if (!figureHolds(it.figure, solutionText(it), it.kind === 'numeric')) continue;
    if (it.kind === 'multiple_choice') {
      if (!it.choices || it.choices.length < 2 || it.correct_choice === null) continue;
      if (it.correct_choice >= it.choices.length) continue;
      // Only the index was ever checked, and it decides the verdict with full authority — a
      // multiple-choice answer never reaches the tutor (issue #227, finding 2). Three ways the
      // shape can be broken while the index is in range, and all three grade silently wrong:
      //
      //   - two options that are the SAME: she picks the other right one and is told she is
      //     wrong, with no way to argue;
      //   - two options worth the same ("0,5" and "$\\frac{1}{2}$") — the same thing, and the
      //     model usually does not notice it wrote the answer twice;
      //   - a key that does not match the option it points at: then `answer` says one thing and
      //     the index another, and nobody can tell which the question meant.
      //
      // Dropped, not repaired — like every other item whose shape does not hold together.
      if (sameTwice(it.choices)) continue;
      if (!keyMatchesChoice(it)) continue;
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
    const plain = { ...it, choices: null, correct_choice: null };
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
export type StoredItem = Omit<ItemDraft, 'figure'> & {
  figure: Figure | null;
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
                          hints, worked_solution, tolerance, spelling, bar_task, parts_task,
                          curriculum_point, rubric, listen_task, staff_task)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) returning id`,
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
        it.parts_task ? JSON.stringify(it.parts_task) : null,
        it.curriculum_point,
        it.rubric ? JSON.stringify(it.rubric) : null,
        it.listen_task ? JSON.stringify(it.listen_task) : null,
        it.staff_task ? JSON.stringify(it.staff_task) : null,
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
