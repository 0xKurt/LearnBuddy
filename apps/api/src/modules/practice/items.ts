// Questions as the model writes them (from a photo, a topic, a typed list or
// homework), validated and stored. docs/architecture.md §Practice.
//
// One shape for every source, so practice, the tutor and FSRS treat them the
// same. The model writes data; the server checks every item on its own and
// drops broken ones instead of "repairing" them. A vocabulary pair becomes two
// questions (both directions), each with its own FSRS state — the session may
// ask just one of them when the learner asked for that direction (issue #113).

import { Figure, type BarTask, type VocabDirection } from '@learnbuddy/shared-types/contracts';
import { compileExpression, parseCanonicalKey } from '@learnbuddy/shared-math';
import { z } from 'zod';

import type { Db } from '../../lib/db.js';
import { dollarMathField, dollarMathRuns } from './dollarMath.js';
import { mentionsSolution } from './tutor.js';
import { keyAgreesWithPrompt } from './keyCheck.js';

export const MATH_RULES = `Math (also in choices, answers and accepted_answers): write it between dollar signs in this LaTeX subset only: \\frac{a}{b}, x^{2}, x_{1}, \\sqrt{x}, \\cdot, \\times, \\div, \\pi, \\le, \\ge, \\ne, \\approx, \\degree, \\pm; for geometry and sets also \\overline{3} (repeating decimal, segment), \\angle, \\parallel, \\perp, \\in, \\mathbb{N}, \\vec{v}. Example: "Kürze $\\frac{6}{8}$." Plain numbers and words stay outside the dollar signs. A dollar sign meaning money is written \\$ ("kostet \\$5").`;

/** How a number key is written (docs/architecture.md §Practice, grading; audit C-1). */
export const NUMERIC_KEY_RULES = `numeric: answer = the number with a decimal point and no thousands separators (0.125, 1250 — never 0,125 or 1.250); a fraction (3/4) or mixed number (3 1/2) only when the task asks for that form; the unit separately in "unit" ("%" for percent). tolerance only when the task says to round, estimate or measure — otherwise null (exact).`;

/** When case, ß and punctuation decide (decision D-2). */
export const SPELLING_RULES = `spelling: "strict" when the task practises spelling, capitalisation or punctuation; "gentle" when they don't matter for the answer; null otherwise (the subject decides).`;

export const FIGURE_RULES = `Figures: add "figure" only when a question needs one (a fraction to see, a number line, a function graph, a bar chart, a geometric figure, a table) — as data, the app draws it. function_plot expressions use x, numbers, + - * / ^, sqrt, abs, sin, cos, tan, ln, log, exp, pi (e.g. "0.5*x^2-2"). Otherwise figure is null.`;

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
  figure: Figure.nullable().default(null).catch(null),
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
});
export type ItemDraft = z.infer<typeof ItemDraft>;

/**
 * Clips what only exceeds a list bound, so a rich item is kept rather than lost: accepted
 * answers beyond MAX_ACCEPTED (and empty or overlong ones), hints beyond 3.
 */
function clipDraft(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw;
  const o = { ...(raw as Record<string, unknown>) };
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
      return f;
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

/** Keep only items whose shape is consistent; returns them normalised. */
export function usableItems(items: ItemDraft[]): ItemDraft[] {
  const out: ItemDraft[] = [];
  for (const raw of items) {
    const it = {
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
    };
    // A number asked for behind a placeholder is no clear question: dropped, not guessed at.
    if (placeholderQuestion(it)) continue;
    // The key contradicts the arithmetic its own question asks for (issue #157). A rule
    // check would then reject her right answer with full authority, and she would have to
    // argue with a tutor that is sure of itself. Dropped, like every other item whose
    // shape does not hold together.
    if (!keyAgreesWithPrompt(it)) continue;
    if (it.kind === 'multiple_choice') {
      if (!it.choices || it.choices.length < 2 || it.correct_choice === null) continue;
      if (it.correct_choice >= it.choices.length) continue;
      it.hints = it.hints.filter((h) => !mentionsSolution(h, solutionText(it), it.prompt));
      out.push(it);
      continue;
    }
    // Help must never give the answer away: a prepared hint that contains it is dropped.
    const leaks = (h: string) =>
      [solutionText(it), ...it.accepted_answers].some((sol) => mentionsSolution(h, sol, it.prompt));
    it.hints = it.hints.filter((h) => !leaks(h));
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
  /**
   * `bar_task` is never the model's (it has no such field, issue #162): it is set only by
   * `practice/bars.ts`, which computed this item's prompt, key and figure from it.
   */
  items: ReadonlyArray<ItemDraft & { bar_task?: BarTask | null }>,
  direction: VocabDirection | null = null,
): Promise<string[]> {
  const ids: string[] = [];
  const insert = async (it: ItemDraft & { bar_task?: BarTask | null }, asked = true) => {
    const row = await db.one<{ id: string }>(
      `insert into items (learner_id, material_id, subject_id, kind, prompt, answer, accepted_answers, unit,
                          choices, correct_choice, topic, difficulty, source_excerpt, origin, lang, prompt_lang, figure,
                          hints, worked_solution, tolerance, spelling, bar_task)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) returning id`,
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
      ],
    );
    if (asked) ids.push(row.id);
  };
  const pair = (it: ItemDraft) => it.kind === 'vocab' && !!it.lang && !!it.prompt_lang;
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
