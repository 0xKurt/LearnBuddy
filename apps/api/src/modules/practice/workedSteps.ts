// A guided worked example (issue #298, docs/architecture.md §Practice): Vormachen → Mitmachen →
// Selbermachen. Worked examples that fade step by step help novices more than a full worked
// solution or a bare problem (Renkl & Atkinson 2003; Atkinson, Renkl & Merrill 2003).
//
// The way is written by the background hints call (`hints.ts`), one line of maths and a short
// note per step. Code keeps it only when it proves it (CLAUDE.md rule 1):
//   - every line follows from the one before (`checkPath`, the Rechenweg checker of #209);
//   - the first line stands in the question, so the way solves THIS task;
//   - the way ends on the key (`ruleCheck` on the whole path), and no line before the last
//     already is the answer.
// Kept, the steps between the first and the last line ARE the hint ladder: „Tipp" shows the next
// one (Vormachen), the result comes only at the ladder's end (`workedReply`), and the similar task
// after it (#388, `similar.ts`) is Selbermachen. „Zeig mir wie" in her own words shows the same
// next step once the tutor read it as a request for help (`stepOnRequest`).
//
// Mitmachen: once a step was shown, a line she writes that follows from the task's line and is
// not yet the result is a step of hers — „Der Schritt stimmt – und weiter?", no try, no model. A
// line that does not follow is a miss, and code says which: the last step she wrote. Buddy leads
// on from her step: a step of the way she wrote herself is never shown to her again.

import { canonicalMath } from '@learnbuddy/shared-math';
import { z } from 'zod';

import { t } from '../../i18n/index.js';
import { ruleCheck, type ItemForCheck } from './evaluate.js';
import { checkPath, parseLine, pathLines, sameStep, solvedValue } from './steps.js';
import type { TutorDecision } from './tutor.js';

/** The forms a written way is checked for (the ones `ruleCheck` reads a path in). */
const STEP_KINDS: ReadonlySet<string> = new Set(['numeric', 'formula', 'short']);
/** At least: the task, one step, the result. At most what a „Tipp" ladder can carry. */
const MIN_STEPS = 3;
const MAX_STEPS = 8;

export const WorkedStep = z.object({
  line: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe('One line of the way in plain math (no $), e.g. 2x + 6 = 14'),
  note: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .describe('What was done to get this line, in a few words (≤ 8), e.g. "Klammer auflösen"'),
});
export type WorkedStep = z.infer<typeof WorkedStep>;

/** The way as the model writes it and as `items.worked_steps` keeps it. */
export const WorkedSteps = z
  .array(WorkedStep)
  .min(MIN_STEPS)
  .max(MAX_STEPS)
  .describe(
    'Only for a question solved by transforming an equation or a term step by step: the way, line by line — the FIRST line exactly the equation or term from the question, each next line one transformation of the line before, the LAST line the result (x = 4). null for every other question.',
  );

/** Stored steps, read back through the contract they were written under, or none. */
function stepsOf(raw: unknown): WorkedStep[] | null {
  const parsed = WorkedSteps.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * A line as it is compared: how the same symbol is typed (`canonicalMath`: − and -, LaTeX, `$`),
 * spaces and case do not matter — the model may print the question with − and write the way with -.
 */
const flat = (s: string) => canonicalMath(s).replace(/\s/g, '').toLowerCase();

/** The way, kept only when code proves it solves this question (see the header); else null. */
export function checkedSteps(
  raw: unknown,
  item: ItemForCheck & { prompt: string },
): WorkedStep[] | null {
  if (!STEP_KINDS.has(item.kind)) return null;
  const steps = stepsOf(raw);
  if (!steps) return null;
  const lines = steps.map((s) => pathLines(s.line)[0] ?? '');
  if (lines.some((l) => l === '')) return null;
  if (!flat(item.prompt).includes(flat(lines[0]!))) return null;
  if (checkPath(lines.join('\n')).kind !== 'sound') return null;
  if (ruleCheck(item, { text: lines.join('\n'), choice: null }) !== 'correct') return null;
  // No step before the last may already be the answer: the ladder would show the result.
  const early = lines
    .slice(1, -1)
    .some((l) => ruleCheck(item, { text: l, choice: null }) === 'correct');
  return early ? null : steps;
}

/** The hint ladder of a kept way: every step between the task and the result, with its note. */
export function stepHints(steps: readonly WorkedStep[]): string[] {
  return steps.slice(1, -1).map((s) => `${s.note}: $${s.line}$`);
}

/** Her line once a step was shown (Mitmachen), as code reads it. */
export type GuidedStep =
  /** The way's last line in its own form ("x = 4" for a key of 4): right. */
  | { kind: 'solved' }
  /**
   * A line of her own that follows from the task's line. `ladder` is where „Tipp" goes on from:
   * past a step of the way she wrote herself, so the next step shown is the one after hers.
   */
  | { kind: 'step'; ladder: number }
  /** A line that certainly does not follow: a miss. */
  | { kind: 'wrong' };

/**
 * Her line once `shown` steps were shown (Mitmachen), or null when this is not a guided step at
 * all — no kept way, no step shown, several lines, a line code cannot read, the key itself, or a
 * line she was shown copied back. The rules judge those, as before.
 */
export function guidedStep(
  item: ItemForCheck & { worked_steps?: unknown },
  shown: number,
  text: string,
): GuidedStep | null {
  const steps = shown > 0 ? stepsOf(item.worked_steps) : null;
  const written = pathLines(text);
  if (!steps || written.length !== 1) return null;
  const line = written[0]!;
  const mine = parseLine(line);
  const task = parseLine(steps[0]!.line);
  if (!mine || !task) return null;
  if (ruleCheck(item, { text: line, choice: null }) === 'correct') return null;
  // The variable alone on one side, with the key's value on the other: the way's last line.
  const value = solvedValue(line);
  if (value !== null && ruleCheck(item, { text: value, choice: null }) === 'correct') {
    return { kind: 'solved' };
  }
  // Which line of the way this is, if one: the task and the steps she was shown are no step of
  // hers when copied back.
  const at = steps.map((s) => flat(s.line)).lastIndexOf(flat(line));
  if (at !== -1 && at <= shown) return null;
  const verdict = sameStep(task, mine);
  if (verdict === 'different') return { kind: 'wrong' };
  return verdict === 'same' ? { kind: 'step', ladder: Math.max(shown, at) } : null;
}

/**
 * What a guided step gets (Mitmachen): a step of hers that follows is no try and goes on — „Der
 * Schritt stimmt – und weiter?", with the ladder moved past it; one that does not follow is a miss.
 */
export function guidedTurn(
  locale: string,
  guided: Exclude<GuidedStep, { kind: 'solved' }>,
): {
  verdict: 'not_an_attempt' | 'incorrect';
  reply: string;
  revealed: false;
  ownStep?: number;
} {
  return guided.kind === 'step'
    ? {
        verdict: 'not_an_attempt',
        reply: t(locale, 'practice.step_ok'),
        revealed: false,
        ownStep: guided.ladder,
      }
    : { verdict: 'incorrect', reply: t(locale, 'practice.step_wrong'), revealed: false };
}

/**
 * „Zeig mir wie" in her own words (#298): when the tutor read a request for help — or a „weiß
 * nicht" — on a question with a kept way, the reply is the way's next step, the very line „Tipp"
 * shows, and the ladder moves on as for „Tipp". Never the model's paraphrase of it: Mitmachen checks
 * her next line against what she saw. Null when there is no kept way or no step left.
 */
export function stepOnRequest(
  item: { worked_steps?: unknown },
  intent: TutorDecision['intent'],
  nextHint: string | null,
): {
  verdict: 'not_an_attempt';
  evaluatedBy: 'model';
  reply: string;
  gaveHint: true;
  usedPrepared: true;
  revealed: false;
} | null {
  const asks = intent === 'help_request' || intent === 'no_answer';
  if (!asks || nextHint === null || stepsOf(item.worked_steps) === null) return null;
  return {
    verdict: 'not_an_attempt',
    evaluatedBy: 'model',
    reply: nextHint,
    gaveHint: true,
    usedPrepared: true,
    revealed: false,
  };
}
