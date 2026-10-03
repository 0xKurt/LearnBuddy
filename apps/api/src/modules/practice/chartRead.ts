// A question about a chart (issues #245, #246): its key is COMPUTED from the chart's data, and
// the model's key must agree with it — or the question is not asked (Rule 0, "reject, never
// repair"; docs/architecture.md §Practice, Charts).
//
// The model writes the chart as data and says, in `read`, what its question reads off it ("the
// largest value of series 0", "the type of this pyramid"). Code then computes that reading
// (`readChart`, @learnbuddy/shared-math) and holds the question to it:
//
//   · a number must be the computed value at the precision the key is written in, and the
//     learner gets the tolerance the drawing allows (a fifth of a labelled grid step — the same
//     axis the app draws), never one the model chose;
//   · a label (a month, a category, a slice) must be the label at the computed position; the
//     other ways to write it (Juli / Jul) are accepted, and nothing else;
//   · a fixed choice (humid/arid, pyramid/bell/urn) gets its options written HERE, in the
//     question's language, and the model's `correct_choice` must point at the computed one.
//
// Why the model writes `read` at all, instead of code guessing from the question's words: what a
// sentence asks for is language understanding, and a word list standing in for it is exactly
// what CLAUDE.md rule 3 forbids. The structured claim can be checked; a guess cannot. And a
// number asked about a chart WITHOUT that claim is dropped — a key nobody can check is the
// thing #157 ended for plain arithmetic.

import {
  CHART_TYPE_NAMES,
  canonicalText,
  chartProblem,
  isChart,
  labelsOf,
  parseCanonicalKey,
  readChart,
  type Chart,
} from '@learnbuddy/shared-math';
import { ModelFigure } from '@learnbuddy/shared-types/contracts';

import { t, type Locale } from '../../i18n/index.js';
import type { ItemDraft } from './items.js';

const LOCALES: readonly Locale[] = ['de', 'en', 'fr', 'es', 'it'];

function asLocale(lang: string | null | undefined): Locale | null {
  return LOCALES.find((l) => l === lang) ?? null;
}

/** The option texts code writes for a fixed choice (`ChartAnswer.choice`). */
const OPTION_KEYS = {
  pyramid: 'practice.chart.pyramid',
  bell: 'practice.chart.bell',
  urn: 'practice.chart.urn',
  humid: 'practice.chart.humid',
  arid: 'practice.chart.arid',
} as const;

function isOption(o: string): o is keyof typeof OPTION_KEYS {
  return o in OPTION_KEYS;
}

/**
 * Whether a raw figure is a chart that may not be shown: a chart type whose shape does not
 * parse, or one that breaks a rule `chartProblem` knows. Read before the item is parsed, because
 * the item's own parse catches a broken figure to null and would hide it (`clipDraft`).
 */
export function figureIsRejectedChart(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false;
  const type = (raw as { type?: unknown }).type;
  if (typeof type !== 'string' || !(CHART_TYPE_NAMES as readonly string[]).includes(type)) {
    return false;
  }
  const parsed = ModelFigure.safeParse(raw);
  if (!parsed.success) return true;
  return isChart(parsed.data) && chartProblem(parsed.data) !== null;
}

function chartOf(f: ItemDraft['figure']): Chart | null {
  return f !== null && isChart(f) && chartProblem(f) === null ? f : null;
}

/** The month as the question's language writes it: long and short ("Juli", "Jul"). */
export function monthNames(lang: Locale | null, month: number): string[] {
  if (lang === null) return [];
  const at = new Date(Date.UTC(2001, month, 15));
  const forms = (['long', 'short'] as const).map((m) =>
    new Intl.DateTimeFormat(lang, { month: m, timeZone: 'UTC' }).format(at).replace(/\.$/, ''),
  );
  return [...new Set(forms)];
}

function sameLabel(a: string, b: string): boolean {
  const norm = (s: string) => canonicalText(s).toLocaleLowerCase().replace(/\.$/, '');
  if (norm(a) === norm(b)) return true;
  const x = parseCanonicalKey(a);
  const y = parseCanonicalKey(b);
  return x.value !== null && y.value !== null && !x.unit && !y.unit && x.value === y.value;
}

const NUMBER_LITERAL = /\d+(?:[.,](\d+))?/;

/**
 * The tolerance a number key gets when it agrees with the computed `value`, or undefined when it
 * does not. A key may be rounded — the value at the precision it is written in — but not so
 * coarsely that it says nothing ("0" for a slope of 0.48 rounds right and is still wrong).
 */
export function numberKeyTolerance(
  answer: string,
  value: number,
  tol: number,
): number | null | undefined {
  const key = parseCanonicalKey(answer);
  if (key.value === null) return undefined;
  const exact = Math.abs(key.value - value) <= 1e-9 * Math.max(1, Math.abs(value));
  if (exact) return tol > 0 ? tol : null;
  const decimals = NUMBER_LITERAL.exec(answer)?.[1]?.length ?? 0;
  const unit = Math.pow(10, -decimals);
  // At least one significant digit, or as fine as the drawing itself can be read.
  if (unit > Math.max(2 * tol, Math.abs(value)) + 1e-12) return undefined;
  if (Math.abs(key.value - value) > unit / 2 + 1e-9 * Math.max(1, Math.abs(value))) {
    return undefined;
  }
  // Her answer may be the exact value or the rounded key: both are right.
  return Math.max(tol, unit / 2);
}

/**
 * The item with its chart question checked (key, tolerance, the options of a fixed choice), the
 * item unchanged when it asks nothing of a chart, or null when it is not asked at all.
 *
 * `rawFigure` is the figure as the model wrote it: a chart that was rejected on the way in
 * (`usableFigure`) costs the question, not just the drawing.
 */
export function checkedRead<T extends ItemDraft>(
  it: T,
  rawFigure: ItemDraft['figure'],
  locale: string | null,
): T | null {
  const chart = chartOf(it.figure);
  if (rawFigure !== null && isChart(rawFigure) && chart === null) return null;
  if (it.read === null) {
    // A number asked about a chart is a reading, or a calculation from readings: without the
    // claim of what it reads, its key could not be checked.
    if (chart !== null && it.kind === 'numeric') return null;
    return it;
  }
  if (chart === null) return null;
  const answer = readChart(chart, it.read);
  if (answer === null) return null;
  const lang = asLocale(it.prompt_lang) ?? asLocale(locale);

  switch (answer.kind) {
    case 'number': {
      if (it.kind !== 'numeric') return null;
      const tolerance = numberKeyTolerance(it.answer, answer.value, answer.tol);
      if (tolerance === undefined) return null;
      return { ...it, tolerance };
    }
    case 'label': {
      const texts = labelsOf(chart, answer.index, (m) => monthNames(lang, m));
      if (texts.length === 0) return null;
      const matches = (x: string) => texts.some((tx) => sameLabel(tx, x));
      if (it.kind === 'multiple_choice') {
        if (!it.choices || it.correct_choice === null) return null;
        const chosen = it.choices[it.correct_choice];
        if (chosen === undefined || !matches(chosen)) return null;
        // Another option with the same label would be right too, and graded wrong.
        if (it.choices.some((c, k) => k !== it.correct_choice && matches(c))) return null;
        return it;
      }
      if (it.kind !== 'short' && it.kind !== 'numeric') return null;
      if (!matches(it.answer)) return null;
      // The other ways to write the label are right, and nothing the model added besides.
      return {
        ...it,
        accepted_answers: texts.filter((tx) => !sameLabel(tx, it.answer)),
        tolerance: null,
      };
    }
    case 'choice': {
      if (it.kind !== 'multiple_choice' || it.correct_choice !== answer.correct) return null;
      if (lang === null) return null;
      const choices = answer.options.map((o) => (isOption(o) ? t(lang, OPTION_KEYS[o]) : o));
      const right = choices[answer.correct];
      if (right === undefined) return null;
      return { ...it, choices, answer: right, accepted_answers: [], tolerance: null };
    }
  }
}
