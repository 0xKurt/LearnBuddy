// Fehlerdetektiv (issue #260): a worked solution with one wrong line. She taps it and writes it
// as it should be. docs/architecture.md §Practice ("Structured items").
//
// Both directions of #224's "Regel 0", and both are code (`steps.ts`, the same machinery that
// checks her own path since #209):
//
//   1. What the MODEL wrote is checked before it is stored, and rejected — never repaired —
//      unless it is exactly what the task claims: every line parses, all are equations or all
//      are terms, the line the model SAYS is wrong is the first line that does not follow from
//      the line above it, every line after it follows from the one before (the mistake carried
//      on, as on paper — so there is exactly ONE wrong line), and the model's corrected line
//      does follow from the line above. A path without a break, with two, or with the break
//      somewhere else than stated gives no question.
//   2. What SHE answers is checked by the same code: the line she tapped against the one code
//      found, and her corrected line by whether it follows from the line above it (an
//      equivalent equation, a term of the same value). Not by comparing characters with the
//      model's correction — "x = 2" is as right as "2x = 4" there — and not by a model.
//
// A correction that only copies the line above is refused as one: it "follows", but corrects
// nothing.

import {
  FIND_ERROR_LINE_MAX,
  FIND_ERROR_LINES_MAX,
  FIND_ERROR_LINES_MIN,
  type FindErrorAnswer,
  type FindErrorChain,
  type FindErrorTask,
  type PartId,
  StructuredTask,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

import { t } from '../../i18n/index.js';
import { ItemDraft } from './items.js';
import { followsFrom, lineShape } from './steps.js';

/** The instruction above the lines: two lines of the question card on 360×740 at most. */
export const FIND_ERROR_PROMPT_MAX = 56;

/**
 * What the generator is told about find_error items — exact and minimal, without an example
 * (models copy examples). The model writes the path WITH its one mistake; code finds the
 * mistake itself and checks it is where the model says.
 */
export const FIND_ERROR_RULES = `Error-detective tasks ("structured", type "find_error"): a short worked solution in maths with exactly ONE mistake for the learner to find — a sign, a bracket, a calculation slip in one line. lines: ${FIND_ERROR_LINES_MIN}–${FIND_ERROR_LINES_MAX} lines, each at most ${FIND_ERROR_LINE_MAX} characters, in the notation of the path checker: either every line an equation in one variable (each an equivalent transformation of the line before), or every line a term without "=" (each the same value as the line before; the app writes "=" in front). The first line is the task and is correct. Exactly one line (wrong_line, counted from 1, never 1) does not follow from the line before; every later line follows correctly from the wrong one, so the mistake carries on to the end. fixed_line: the wrong line as it should be. Plain text, no dollar signs; "·" for times, ":" for divided by. prompt: at most ${FIND_ERROR_PROMPT_MAX} characters, the instruction to find and correct the mistake; it never says where it is.`;

/** The model's find_error task: the path with its mistake, where it says the mistake is, and the fix. */
export const FindErrorDraftBase = z.object({
  type: z.literal('find_error'),
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(600)
    .describe('The instruction: find and correct the one mistake; never where it is'),
  lines: z
    .array(z.string().trim().min(1).max(120))
    .max(FIND_ERROR_LINES_MAX * 2)
    .describe(
      `${FIND_ERROR_LINES_MIN}–${FIND_ERROR_LINES_MAX} lines of the worked solution, with exactly one mistake carried on to the end`,
    ),
  wrong_line: z
    .number()
    .int()
    .min(1)
    .max(FIND_ERROR_LINES_MAX * 2)
    .describe('The line with the mistake, counted from 1 (never 1, the task itself)'),
  fixed_line: z.string().trim().min(1).max(120).describe('The wrong line as it should be'),
  topic: ItemDraft.shape.topic,
  difficulty: ItemDraft.shape.difficulty,
  prompt_lang: ItemDraft.shape.prompt_lang,
});
export type FindErrorDraft = Pick<
  z.infer<typeof FindErrorDraftBase>,
  'lines' | 'wrong_line' | 'fixed_line'
> & { prompt?: string };

/** Why a find_error task is not stored. Each one is a test (`__tests__/findError.test.ts`). */
export type FindErrorProblem =
  /** Fewer than FIND_ERROR_LINES_MIN or more than FIND_ERROR_LINES_MAX lines. */
  | 'count'
  /** A line over FIND_ERROR_LINE_MAX, or the prompt over FIND_ERROR_PROMPT_MAX: it would not fit. */
  | 'too_long'
  /** A line the path checker cannot read completely: nothing about it could be decided. */
  | 'unreadable'
  /** Equations and terms mixed: one line could not be compared with the next. */
  | 'mixed'
  /** Every line follows from the one before: there is no mistake to find. */
  | 'no_error'
  /** The first broken step is not the line the model says is wrong. */
  | 'not_where_said'
  /** A later line does not follow from the line before it either: two mistakes. */
  | 'two_errors'
  /** The corrected line does not follow from the line above, or is the wrong line again. */
  | 'fix_wrong';

/** A line as stored and shown: no math markup, single spaces, no "=" in front of a term. */
export function cleanLine(text: string): string {
  return text
    .replace(/[$]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^=\s*/, '')
    .replace(/\*/g, '·');
}

/** Two lines that read the same (spacing set aside). */
function sameText(a: string, b: string): boolean {
  const norm = (x: string) => cleanLine(x).replace(/\s+/g, '').replace(/[−–]/g, '-');
  return norm(a) === norm(b);
}

/** Line ids by position: l1, l2 … (they say where a line STANDS, which she sees anyway). */
function lineId(index: number): PartId {
  return `l${index + 1}`;
}

/**
 * Where the lines of a path stop following from each other: the 1-based number of every line
 * that does not follow from the line above it, or null when a step cannot be decided.
 */
function brokenLines(lines: readonly string[]): number[] | null {
  const broken: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const verdict = followsFrom(lines[i - 1]!, lines[i]!);
    if (verdict === null) return null;
    if (verdict === 'different') broken.push(i + 1);
  }
  return broken;
}

/** The shape all lines share, or the problem with them. */
function chainOf(lines: readonly string[]): FindErrorChain | FindErrorProblem {
  const shapes = lines.map((l) => lineShape(l));
  if (shapes.some((s) => s === null)) return 'unreadable';
  if (new Set(shapes).size > 1) return 'mixed';
  return shapes[0] === 'equation' ? 'equation' : 'term';
}

/**
 * What is wrong with a path, its stated wrong line and its correction — the checks shared by
 * the model's draft and a stored task (which is read back through them, never trusted).
 */
function pathProblem(
  lines: readonly string[],
  wrongLine: number,
  fixed: string,
): FindErrorProblem | null {
  if (lines.length < FIND_ERROR_LINES_MIN || lines.length > FIND_ERROR_LINES_MAX) return 'count';
  if ([...lines, fixed].some((l) => l.length === 0 || l.length > FIND_ERROR_LINE_MAX)) {
    return 'too_long';
  }
  const chain = chainOf(lines);
  if (chain !== 'equation' && chain !== 'term') return chain;
  const broken = brokenLines(lines);
  if (broken === null) return 'unreadable';
  if (broken.length === 0) return 'no_error';
  if (broken[0] !== wrongLine) return 'not_where_said';
  if (broken.length > 1) return 'two_errors';
  // The fix stands where the wrong line stood: it must follow from the line above it, be of the
  // same shape, and not be the wrong line again.
  if (lineShape(fixed) !== chain) return 'fix_wrong';
  if (sameText(fixed, lines[wrongLine - 1]!)) return 'fix_wrong';
  return followsFrom(lines[wrongLine - 2]!, fixed) === 'same' ? null : 'fix_wrong';
}

/** What is wrong with the model's draft, or null when it is a Fehlerdetektiv with one mistake. */
export function findErrorDraftProblem(draft: FindErrorDraft): FindErrorProblem | null {
  if (draft.prompt !== undefined && draft.prompt.trim().length > FIND_ERROR_PROMPT_MAX) {
    return 'too_long';
  }
  return pathProblem(draft.lines.map(cleanLine), draft.wrong_line, cleanLine(draft.fixed_line));
}

/** What is wrong with a stored or built task, or null. */
export function findErrorProblem(task: FindErrorTask): FindErrorProblem | null {
  const ids = task.lines.map((l) => l.id);
  if (new Set(ids).size !== ids.length) return 'count';
  const at = ids.indexOf(task.wrong);
  if (at < 1) return 'not_where_said';
  const lines = task.lines.map((l) => l.text);
  const problem = pathProblem(lines, at + 1, task.fixed);
  if (problem !== null) return problem;
  return chainOf(lines) === task.chain ? null : 'mixed';
}

/** The stored task for the model's draft, or null when Regel 0 rejects it. */
export function findErrorTaskFrom(draft: FindErrorDraft): FindErrorTask | null {
  if (findErrorDraftProblem(draft) !== null) return null;
  const lines = draft.lines.map(cleanLine);
  const chain = chainOf(lines);
  if (chain !== 'equation' && chain !== 'term') return null;
  const task: FindErrorTask = {
    type: 'find_error',
    chain,
    lines: lines.map((text, i) => ({ id: lineId(i), text })),
    wrong: lineId(draft.wrong_line - 1),
    fixed: cleanLine(draft.fixed_line),
  };
  const parsed = StructuredTask.safeParse(task);
  if (!parsed.success || parsed.data.type !== 'find_error') return null;
  return findErrorProblem(parsed.data) === null ? parsed.data : null;
}

/** A line as she reads it: "= 80 + 12" for every line of a term chain after the first. */
export function shownLine(task: Pick<FindErrorTask, 'chain' | 'lines'>, id: PartId): string {
  const at = task.lines.findIndex((l) => l.id === id);
  const text = task.lines[at]?.text ?? '';
  return task.chain === 'term' && at > 0 ? `= ${text}` : text;
}

/** The number she sees in front of a line (1-based). */
export function lineNumber(task: Pick<FindErrorTask, 'lines'>, id: PartId): number {
  return task.lines.findIndex((l) => l.id === id) + 1;
}

/** The solution in words: which line, and how it should read. */
export function findErrorSolution(task: FindErrorTask, locale: string = 'de'): string {
  return t(locale, 'practice.find_error.solution', {
    n: lineNumber(task, task.wrong),
    line: task.chain === 'term' ? `= ${task.fixed}` : task.fixed,
  });
}

// ─────────────── her answer, checked ───────────────

export type FindErrorCheck = {
  type: 'find_error';
  correct: boolean;
  /** The line she tapped, and whether it is the wrong one. */
  parts: Array<{ id: PartId; ok: boolean }>;
  /** The number of the line she tapped (1-based). */
  line: number;
  line_ok: boolean;
  /** Whether her correction follows; null when the line was not the wrong one (not judged). */
  fix_ok: boolean | null;
  /** Her correction is the line above copied: it follows, but corrects nothing. */
  copied: boolean;
};

/**
 * Her answer against the task, or null when it does not fit (a line that is not there, the
 * task's first line — which is the task, not a step).
 */
export function checkFindError(
  task: FindErrorTask,
  answer: FindErrorAnswer,
): FindErrorCheck | null {
  const at = task.lines.findIndex((l) => l.id === answer.line);
  if (at < 1) return null;
  const lineOk = answer.line === task.wrong;
  let fixOk: boolean | null = null;
  let copied = false;
  if (lineOk) {
    const fix = cleanLine(answer.fix);
    const above = task.lines[at - 1]!.text;
    copied = fix !== '' && sameText(fix, above);
    fixOk =
      fix !== '' && !copied && lineShape(fix) === task.chain && followsFrom(above, fix) === 'same';
  }
  return {
    type: 'find_error',
    correct: lineOk && fixOk === true,
    parts: [{ id: answer.line, ok: lineOk }],
    line: at + 1,
    line_ok: lineOk,
    fix_ok: fixOk,
    copied,
  };
}

/** Her answer in the conversation: "Zeile 3: 2x = 4". */
export function findErrorAnswerText(
  task: FindErrorTask,
  answer: FindErrorAnswer,
  locale: string = 'de',
): string {
  const fix = cleanLine(answer.fix);
  const line = task.chain === 'term' && fix !== '' ? `= ${fix}` : fix;
  return t(locale, 'practice.find_error.answer', {
    n: lineNumber(task, answer.line),
    line: line === '' ? '…' : line,
  });
}

/** The reply to an answer that is not right yet: which half is missing, kindly. */
export function findErrorReply(locale: string, check: FindErrorCheck): string {
  if (!check.line_ok) return t(locale, 'practice.find_error.line_fine', { n: check.line });
  if (check.copied) return t(locale, 'practice.find_error.copied', { n: check.line });
  return t(locale, 'practice.find_error.fix_wrong', { n: check.line, above: check.line - 1 });
}
