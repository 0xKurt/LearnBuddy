// Bruchbalken: the question, the picture and the solution, all computed from ONE reviewed
// task (issue #162). The model only ever says which of three tasks and which small whole
// numbers (`BarTask`, contracts/bars.ts); everything a learner sees or is judged against is
// written here.
//
// Why it is built this way round (CLAUDE.md rule 1, and the half of #157 that stayed open):
// a generated answer key can be wrong, and the rule check then rejects a right answer with
// full authority. A key that is COMPUTED from the parameters of a task whose text was also
// computed cannot disagree with its own question — there is no second author to disagree
// with. So the contract has no field for a prompt, an answer, a figure, a hint or a worked
// solution, and the worst a bad parameter set can do is produce no question at all
// (`barItem` returns null, and the item is simply not there — the same thing that happens
// to any item whose shape does not hold together).
//
// Because the prompt is written here, code also KNOWS that it never asks for a particular
// notation — it asks for an amount. That is what licenses value-only grading for these
// items (`evaluate.ts` `form_free`): 2/4, 1/2 and 0,5 are the same answer. For a question
// the model wrote, the same licence would be a guess, and decision D-3 still holds there.

import { BarTask, type AnswerSurface, type Figure } from '@learnbuddy/shared-types/contracts';
import { compareValue } from '@learnbuddy/shared-math';

import { t, type MessageKey } from '../../i18n/index.js';
import type { ItemDraft } from './items.js';

/** At most this many bar questions in one prepared set: a tool, never a catalogue (rule 16). */
export const MAX_BAR_ITEMS = 3;

/**
 * What the generator is told about bars. It says what the model may DECIDE and, just as
 * importantly, what it must not write — there is no field for any of it, and this sentence
 * is there so the model does not try (CLAUDE.md rule 1).
 */
export const BAR_RULES = `Fraction bars ("bars"): a small learning surface the learner WORKS with instead of reading one more sentence about fractions — she taps the parts of a bar. You choose only the task and its whole numbers; the app writes the question, draws the bars and computes the solution, so never write a question text, an answer or a figure for one. Use them ONLY where seeing a bar makes the task clearer than words — naming an amount on a bar, naming the same amount in finer parts (a half on a bar of quarters), comparing two amounts, adding two that share one bar — and only for fractions with halves, thirds, quarters, fifths or sixths. At most ${MAX_BAR_ITEMS}, and an empty list wherever a bar would only be decoration. The ordinary questions in "items" are unaffected.`;

/** An item whose every field was computed from `bar_task`; `insertItems` stores both. */
export type BarItem = ItemDraft & { bar_task: BarTask };

function gcd(a: number, b: number): number {
  let [x, y] = [Math.abs(a), Math.abs(b)];
  while (y !== 0) [x, y] = [y, x % y];
  return x === 0 ? 1 : x;
}

type Frac = { num: number; den: number };

/** `units` of `parts`, in lowest terms — how the question NAMES the amount. */
function lowest(units: number, parts: number): Frac {
  const g = gcd(units, parts);
  return { num: units / g, den: parts / g };
}

/** A fraction as the app sets it: inline math in the LaTeX subset of `MATH_RULES`. */
function latex(f: Frac): string {
  return `$\\frac{${f.num}}{${f.den}}$`;
}

/** A fraction as an answer key: `parseCanonicalKey` reads this exactly (3/4, 4/4). */
function key(units: number, parts: number): string {
  return `${units}/${parts}`;
}

const FRACTION_LITERAL = /^(\d+)\/(\d+)$/;

/** One of `BAR_FRACTIONS` ("3/5") as numbers; the enum guarantees the shape. */
function named(literal: string): Frac {
  const m = FRACTION_LITERAL.exec(literal);
  // Unreachable through the contract (z.enum of literals); a throw beats a silent 0/1.
  if (!m) throw new Error(`not a bar fraction: ${literal}`);
  return { num: Number(m[1]), den: Number(m[2]) };
}

/** Two bars of the same length: which amount is more? */
function isMore(a: Frac, b: Frac): boolean {
  return a.num * b.den > b.num * a.den;
}

/**
 * The surface the app shows for a stored task, or null when the question is answered the
 * ordinary way. Never carries the solution: `shade` says only how fine the empty bar is,
 * `pick` only what the two bars look like — which the question text already says.
 *
 * The return type names the two modes a BAR can be, not every mode a surface can be: since the
 * note line joined the union (issue #226) that is the difference between a caller that handles
 * both cases and a caller that silently skips a third it will never see.
 */
export function surfaceOf(task: BarTask): Exclude<AnswerSurface, { mode: 'notes' }> {
  switch (task.task) {
    case 'shade':
    case 'add':
      return { mode: 'shade', parts: task.parts };
    case 'compare': {
      const l = named(task.left);
      const r = named(task.right);
      return {
        mode: 'pick',
        bars: [
          { parts: l.den, filled: l.num },
          { parts: r.den, filled: r.num },
        ],
      };
    }
  }
}

/**
 * The amounts a `pick` surface offers her, as answer keys; null for every other question.
 * Two bars are two options, so the rule of user feedback #9 applies here too: once one of
 * them has been ruled out, tapping the other is no knowledge, and the question closes with
 * the solution explained rather than counting as right.
 */
export function pickAnswers(task: BarTask): string[] | null {
  if (task.task !== 'compare') return null;
  const l = named(task.left);
  const r = named(task.right);
  return [key(l.num, l.den), key(r.num, r.den)];
}

/**
 * Which of a `pick` surface's amounts she has not ruled out yet, or null when the question
 * has no such surface. Compared by VALUE: a bar she tapped and a number she typed can say
 * the same thing in different words.
 */
export function untriedPicks(task: BarTask | null, said: readonly string[]): string[] | null {
  const picks = task ? pickAnswers(task) : null;
  if (!picks) return null;
  return picks.filter((p) => !said.some((s) => compareValue(p, s) === 'equal'));
}

/** The task a stored row carries, or null (an unreadable column is no task, never a guess). */
export function taskOf(stored: unknown): BarTask | null {
  if (stored === null || stored === undefined) return null;
  const parsed = BarTask.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

/** The suffixes `practice.bar.*` really has, so a typo here fails the typecheck. */
type SuffixOf<T> = T extends `practice.bar.${infer S}` ? S : never;
type BarMessage = SuffixOf<MessageKey>;

function text(
  locale: string,
  suffix: BarMessage,
  vars: Record<string, string | number> = {},
): string {
  return t(locale, `practice.bar.${suffix}`, vars);
}

/**
 * The question one reviewed task becomes, or null when the parameters describe no task at
 * all: more parts shaded than the bar has, a sum past the whole bar, or the same fraction
 * compared with itself. Those are the only ways to get nothing — and nothing is the worst
 * that can happen, because no parameter set can make the key disagree with the prompt.
 */
export function barItem(task: BarTask, locale: string): BarItem | null {
  const common = {
    accepted_answers: [] as string[],
    unit: null,
    choices: null,
    correct_choice: null,
    prompt_lang: null,
    lang: null,
    tolerance: null,
    spelling: null,
    source_excerpt: null,
    // A fraction bar is at none of the state-dependent curriculum places (issue #214):
    // no Bundesland names a fraction differently.
    curriculum_point: null,
    // A fraction-bar question asks for one amount; there are no required elements to tick off
    // (issue #211 — a rubric belongs to a written text, and this question is a number).
    rubric: null,
    bar_task: task,
    // A fraction bar is one value against one key; its answer has no parts (issues #228–#230).
    parts_task: null,
    // Nothing is read off a chart: the bar IS the task (issues #245, #246).
    read: null,
  };

  switch (task.task) {
    case 'shade': {
      // The whole bar is not a fraction of itself, and nothing shaded is no amount to name.
      if (task.units >= task.parts) return null;
      const amount = lowest(task.units, task.parts);
      return {
        ...common,
        kind: 'numeric',
        prompt: text(locale, 'shade_prompt', { fraction: latex(amount) }),
        answer: key(task.units, task.parts),
        topic: text(locale, 'topic_shade'),
        // Naming an amount in finer parts than its own name (one half on a bar of quarters)
        // is the step this task exists for; shading its own parts is the easier version.
        difficulty: amount.den === task.parts ? 2 : 3,
        figure: null,
        hints: [
          text(locale, 'hint_parts', { parts: task.parts }),
          text(locale, 'hint_shade', { fraction: latex(amount) }),
        ],
        worked_solution: text(locale, 'worked_shade', {
          parts: task.parts,
          fraction: latex(amount),
          answer: latex({ num: task.units, den: task.parts }),
        }),
      };
    }
    case 'compare': {
      // Two names in lowest terms are the same amount only when they are the same name.
      if (task.left === task.right) return null;
      const l = named(task.left);
      const r = named(task.right);
      const more = isMore(l, r) ? l : r;
      return {
        ...common,
        kind: 'numeric',
        prompt: text(locale, 'compare_prompt', { left: latex(l), right: latex(r) }),
        answer: key(more.num, more.den),
        topic: text(locale, 'topic_compare'),
        difficulty: 2,
        // The two bars are what she TOUCHES, so they are the surface and not a figure.
        figure: null,
        hints: [text(locale, 'hint_compare_reach'), text(locale, 'hint_compare_parts')],
        worked_solution: text(locale, 'worked_compare', { answer: latex(more) }),
      };
    }
    case 'add': {
      const sum = task.first + task.second;
      // Two amounts that no longer fit on one bar are no bar task.
      if (sum > task.parts) return null;
      const figure: Figure = {
        type: 'fraction',
        shape: 'bar',
        fractions: [
          { parts: task.parts, filled: task.first },
          { parts: task.parts, filled: task.second },
        ],
      };
      return {
        ...common,
        kind: 'numeric',
        prompt: text(locale, 'add_prompt', {
          first: latex(lowest(task.first, task.parts)),
          second: latex(lowest(task.second, task.parts)),
        }),
        answer: key(sum, task.parts),
        topic: text(locale, 'topic_add'),
        difficulty: 3,
        figure,
        hints: [text(locale, 'hint_add_same'), text(locale, 'hint_add_count')],
        worked_solution: text(locale, 'worked_add', {
          parts: task.parts,
          answer: latex({ num: sum, den: task.parts }),
        }),
      };
    }
  }
}

/** The tasks of one prepared set, as questions; unusable parameters yield nothing. */
export function barItems(tasks: readonly BarTask[], locale: string): BarItem[] {
  return tasks.slice(0, MAX_BAR_ITEMS).flatMap((task) => {
    const item = barItem(task, locale);
    return item ? [item] : [];
  });
}
