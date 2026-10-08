// Bruchbalken: the first learning surface she can WORK with (issue #162).
//
// The model CHOOSES, code COMPUTES. A `BarTask` is everything the model may say about a
// fraction-bar question: which of three reviewed tasks, and a handful of small whole
// numbers. It has no field for a question text, an answer, a figure, a hint or a worked
// solution — those are computed from the task on the server (`practice/bars.ts`), which is
// why no parameter set, valid or not, can produce a question whose key is wrong or whose
// picture contradicts its words. The worst a bad parameter set can do is produce NO
// question (CLAUDE.md rule 1, issue #157's answer for maths).
//
// What the ranges already make inexpressible, so that nothing has to be "validated away":
// an improper fraction, a zero numerator, a name that is not in lowest terms, a count
// outside the bar, a denominator no bar on a phone can draw.

import { z } from 'zod';

import { RhythmTapSurface, StaffWriteSurface } from './staff.js';

/**
 * The most equal parts a bar may have. Six, because the bar she taps is one row of
 * segments: inside a 360 pt phone's 16 pt margins and the 16 pt the surface keeps, a
 * segment is then ~49 pt wide — a real touch target (`TOUCH` in `lib/theme/space.ts`),
 * which eighths or twelfths would not be. Finer divisions wait for a representation that
 * is not operated with a fingertip.
 */
export const MAX_BAR_PARTS = 6;

/**
 * The fractions a bar task may NAME: every proper fraction in lowest terms with a
 * denominator of at most {@link MAX_BAR_PARTS}. A closed vocabulary rather than a pair of
 * numbers, so "4/3", "0/5" and "2/4" cannot be written at all — and so two different
 * members always have two different values (lowest terms are unique), which is what makes
 * "which of these two is more?" a question with one answer.
 */
export const BAR_FRACTIONS = [
  '1/2',
  '1/3',
  '2/3',
  '1/4',
  '3/4',
  '1/5',
  '2/5',
  '3/5',
  '4/5',
  '1/6',
  '5/6',
] as const;
export const BarFraction = z.enum(BAR_FRACTIONS);
export type BarFraction = z.infer<typeof BarFraction>;

/** How many equal parts a bar is divided into. */
const Parts = z.number().int().min(2).max(MAX_BAR_PARTS);
/** A number of those parts; never the whole bar, so the amount stays a fraction. */
const Units = z
  .number()
  .int()
  .min(1)
  .max(MAX_BAR_PARTS - 1);

/**
 * One reviewed fraction-bar task. The server writes the question, draws the bars and
 * computes the solution from exactly this object (acceptance criterion of #162: the
 * representation, the question text and the solution come from ONE validated object).
 */
export const BarTask = z.discriminatedUnion('task', [
  z
    .object({
      task: z.literal('shade'),
      parts: Parts,
      units: Units,
    })
    .describe(
      'Shade a fraction on a bar: the bar has `parts` equal parts and `units` of them are the amount asked for. The question names that amount in lowest terms, so parts 4 / units 2 asks for one half on a bar of quarters — splitting a half into quarters. `units` must be smaller than `parts`.',
    ),
  z
    .object({
      task: z.literal('compare'),
      left: BarFraction,
      right: BarFraction,
    })
    .describe(
      'Which of two fractions is more? Both are drawn as bars of the same length, each divided into its own parts, and she taps the one she means. The two must be different fractions.',
    ),
  z
    .object({
      task: z.literal('add'),
      parts: Parts,
      first: Units,
      second: Units,
    })
    .describe(
      'Add two fractions that share one bar: `first` and `second` parts of `parts`. Both are drawn, the question names them in lowest terms (parts 4 / first 2 / second 1 is "1/2 + 1/4"), and she shades the result. `first` + `second` must not exceed `parts`.',
    ),
]);
export type BarTask = z.infer<typeof BarTask>;

/** A bar as it is drawn: `filled` of `parts` equal parts are coloured in. */
export const BarShape = z.object({ parts: Parts, filled: Units });
export type BarShape = z.infer<typeof BarShape>;

/**
 * What she touches (`ItemView.surface`): the fraction bar or the empty staff the question is
 * answered on, or the pad she taps a heard rhythm on. It never carries the solution — `shade`
 * says only how fine the empty bar is, `pick` only what the two bars look like, `notes` only which
 * clef, time signature and how many bars, all of which the question already says in words, and
 * `taps` nothing at all (issue #445).
 *
 * A figure (`ItemView.figure`) is what she READS; a surface is what she WORKS with. Both
 * can be on the same question: the sum of two bars is read above and shaded below.
 *
 * Every member belongs to a question whose text, drawing and key CODE computed — the fraction
 * bar from a `BarTask` (issue #162), the staff from a `StaffTask` (`staff.ts`, issue #226).
 * That is not a coincidence: a surface is only honest where the key cannot disagree with the
 * picture, which is why the union lives next to the first of them and takes the second in from
 * its own file rather than growing a second concept.
 */
export const AnswerSurface = z.discriminatedUnion('mode', [
  z
    .object({ mode: z.literal('shade'), parts: Parts })
    .describe('An empty bar of `parts` equal parts; tapping a part fills the bar up to it.'),
  z
    .object({ mode: z.literal('pick'), bars: z.array(BarShape).length(2) })
    .describe('Two drawn bars; tapping one answers with its fraction.'),
  StaffWriteSurface.describe(
    'An empty staff of `bars` bars; tapping one places a note, and the line she writes is the answer.',
  ),
  RhythmTapSurface.describe('A pad she taps a heard rhythm on; her taps are the answer.'),
]);
export type AnswerSurface = z.infer<typeof AnswerSurface>;

/**
 * The two modes a BAR can be (`shade`, `pick`) — not every mode a surface can be. Since the note
 * line (issue #226) and the rhythm pad (issue #445) joined the union, naming them is the difference
 * between a caller that handles both cases and one that silently skips a third it never sees.
 */
export type BarSurface = Extract<AnswerSurface, { mode: 'shade' | 'pick' }>;
