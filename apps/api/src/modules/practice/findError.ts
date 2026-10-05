// Fehlerdetektiv (issue #260): a worked solution with one wrong line — she taps the line where it
// goes wrong and writes it right. docs/architecture.md §Practice ("Structured items" → "Find the
// error"). A structured kind like order; `structured.ts` dispatches here.
//
// Both directions of #224's "Regel 0", both code, no model call:
//
//   1. The MODEL writes the solution CORRECTLY, one step per line. Code checks that every line
//      follows from the one before (`checkPath`, #209) — a path it cannot read, or one that is
//      already broken, gives no question. Then CODE builds the error into one line: a bracket
//      dissolved the wrong way (3(x+2) → 3x+2, −(x−2) → −x−2), a sign turned, a number off by one
//      or by ten. It keeps a candidate only when exactly that line is no longer equivalent to the
//      task and every other line still is — the wrong line is the first one `checkPath` reports.
//      Which line and which error is chosen from the content, never by chance: the same solution
//      gives the same card.
//   2. What SHE answers is the line she tapped and that line written right. The line is compared
//      with the key; the correction with the line BEFORE it, by the same equivalence (`sameStep`):
//      an equivalent line is right however she wrote it. A line it cannot read is said to be
//      unreadable, never called wrong (CLAUDE.md rule 5).
//
// The first line is the task. It is shown, never a target, and never made wrong.

import {
  FIND_ERROR_LINE_MAX,
  FIND_ERROR_LINES_MAX,
  FIND_ERROR_LINES_MIN,
  FindErrorTask,
  findErrorText,
  type FindErrorAnswer,
  type PartId,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

import { t } from '../../i18n/index.js';
import { hash, sameness } from './arrange.js';
import { ItemDraft } from './items.js';
import { checkPath, parseLine, pathLines, sameStep, type Line } from './steps.js';

/** The instruction above the lines: two lines of the question card at most. */
const FIND_ERROR_PROMPT_MAX = 60;

/**
 * What the generator and the photo reading are told. Exact and minimal, and deliberately without
 * an example: models copy examples (repo convention).
 */
export const FIND_ERROR_RULES = `Find-the-error tasks ("structured", type "find_error"): only for a calculation worked line by line — an equation or inequality solved step by step, a term simplified, a sum or product split into easier steps. lines: ${FIND_ERROR_LINES_MIN}–${FIND_ERROR_LINES_MAX} lines; the first is the task as given, every next one follows from the one before. Write every line CORRECT — the app builds one error into one line itself. One equation, inequality or term per line, plain math (x^2, 3/4, ·), at most ${FIND_ERROR_LINE_MAX} characters, no words, no numbering. prompt: the instruction (find the line where the mistake is and write it right), at most ${FIND_ERROR_PROMPT_MAX} characters; it never repeats a line.`;

/** The model's task: a correct worked solution. Code builds the error. */
export const FindErrorDraftBase = z.object({
  type: z.literal('find_error'),
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(FIND_ERROR_PROMPT_MAX * 4)
    .describe(`The instruction, at most ${FIND_ERROR_PROMPT_MAX} characters; never a line`),
  lines: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(FIND_ERROR_LINE_MAX * 2),
    )
    .max(FIND_ERROR_LINES_MAX * 2)
    .describe(
      `${FIND_ERROR_LINES_MIN}–${FIND_ERROR_LINES_MAX} lines of a CORRECT solution; the first is the task`,
    ),
  topic: ItemDraft.shape.topic,
  difficulty: ItemDraft.shape.difficulty,
  prompt_lang: ItemDraft.shape.prompt_lang,
});

/** Why a find-the-error task is not stored. Each one is a test (`find-error.test.ts`). */
export type FindErrorProblem =
  /** Fewer than FIND_ERROR_LINES_MIN or more than FIND_ERROR_LINES_MAX lines. */
  | 'count'
  /** Two lines alike. */
  | 'duplicate'
  /** A line over its cap. */
  | 'too_long'
  /** The solution as written is not one path code can read and follow line by line. */
  | 'not_sound'
  /** No error could be built in, or the stored one is not exactly one wrong line. */
  | 'no_error';

// ─────────────── the error, built by code ───────────────

/** A number with a factor before a bracket ("3(x+2)", "3·(x+2)") or a minus before one. */
const FACTOR_BRACKET = /(\d+)\s*[·*]?\s*\(([^()]+)\)/g;
const MINUS_BRACKET = /[-−]\s*\(([^()]+)\)/g;

/**
 * The line before, with its bracket dissolved the classic wrong way: only the first term times
 * the factor (3(x+2) → 3x+2), or a minus before the bracket that does not turn the signs inside
 * (−(x−2) → −x−2). Only for the line that dissolves the bracket (it has none left itself), and
 * only where the inner term starts with a letter: 3(2+x) would read 32+x.
 */
function bracketErrors(before: string, line: string): string[] {
  if (line.includes('(')) return [];
  const out: string[] = [];
  for (const m of before.matchAll(FACTOR_BRACKET)) {
    const inner = m[2]!.trim();
    if (!/^[a-z]/i.test(inner) || !/[-+−]/.test(inner)) continue;
    out.push(`${before.slice(0, m.index)}${m[1]}${inner}${before.slice(m.index + m[0].length)}`);
  }
  for (const m of before.matchAll(MINUS_BRACKET)) {
    const inner = m[1]!.trim();
    if (!/[-+−]/.test(inner.slice(1))) continue;
    // The brackets go, nothing else: "5 - (x - 2)" reads "5 - x - 2", spaced as she wrote it.
    const open = m[0].replace('(', '').replace(/\)$/, '');
    out.push(`${before.slice(0, m.index)}${open}${before.slice(m.index + m[0].length)}`);
  }
  return out;
}

/** Every operator sign turned once: + to −, − to + (never a leading sign, never an exponent's). */
function signErrors(line: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch !== '+' && ch !== '-' && ch !== '−') continue;
    const left = line.slice(0, i).trimEnd();
    if (!/[\p{L}\p{N})]$/u.test(left)) continue;
    out.push(`${line.slice(0, i)}${ch === '+' ? '-' : '+'}${line.slice(i + 1)}`);
  }
  return out;
}

/** Every whole number off by one, and by ten from 20 on — a slip in the head. Never an exponent. */
function numberErrors(line: string): string[] {
  const out: string[] = [];
  for (const m of line.matchAll(/\d+/g)) {
    const before = line[m.index - 1] ?? '';
    const after = line[m.index + m[0].length] ?? '';
    if (before === '^' || /[.,]/.test(before) || /[.,]/.test(after)) continue;
    const n = Number(m[0]);
    const wrong = [n + 1, n - 1, ...(n >= 20 ? [n + 10, n - 10] : [])].filter((v) => v >= 1);
    for (const v of wrong) {
      out.push(`${line.slice(0, m.index)}${v}${line.slice(m.index + m[0].length)}`);
    }
  }
  return out;
}

/**
 * The lines with line `k` replaced, judged: is exactly line k no longer equivalent to the task,
 * and does `checkPath` report the break there first? Every other line still follows (they are the
 * model's checked solution), so a candidate that passes breaks exactly one line.
 */
function breaksExactly(lines: readonly string[], k: number, wrong: string): boolean {
  if (wrong.length > FIND_ERROR_LINE_MAX) return false;
  const seen = sameness(wrong);
  if (lines.some((l) => sameness(l) === seen)) return false;
  const task = parseLine(lines[0]!);
  const parsed = parseLine(wrong);
  if (task === null || parsed === null) return false;
  if (sameStep(task, parsed) !== 'different') return false;
  const path = lines.map((l, i) => (i === k ? wrong : l));
  const checked = checkPath(path.join('\n'));
  return checked.kind === 'broke' && checked.line === k;
}

/** Every error code can build into this solution, the brackets first (the classic one). */
function candidates(lines: readonly string[]): Array<{ k: number; wrong: string }> {
  const brackets: Array<{ k: number; wrong: string }> = [];
  const others: Array<{ k: number; wrong: string }> = [];
  for (let k = 1; k < lines.length; k++) {
    const line = lines[k]!;
    for (const wrong of bracketErrors(lines[k - 1]!, line)) brackets.push({ k, wrong });
    for (const wrong of [...signErrors(line), ...numberErrors(line)]) others.push({ k, wrong });
  }
  const valid = (c: { k: number; wrong: string }) => breaksExactly(lines, c.k, c.wrong);
  const fromBrackets = brackets.filter(valid);
  return fromBrackets.length > 0 ? fromBrackets : others.filter(valid);
}

/** Ids by line: l1, l2 … — the lines stand in their order, so the id says no more than that. */
function lineId(i: number): PartId {
  return `l${i + 1}`;
}

/** What is wrong with the model's lines as a correct solution, or null. */
function solutionProblem(lines: readonly string[]): FindErrorProblem | null {
  if (lines.length < FIND_ERROR_LINES_MIN || lines.length > FIND_ERROR_LINES_MAX) return 'count';
  if (lines.some((l) => l.length > FIND_ERROR_LINE_MAX)) return 'too_long';
  if (new Set(lines.map(sameness)).size !== lines.length) return 'duplicate';
  return checkPath(lines.join('\n')).kind === 'sound' ? null : 'not_sound';
}

/** The stored task for a correct solution, or null when Regel 0 rejects it. */
export function findErrorTaskFrom(
  draft: Pick<z.infer<typeof FindErrorDraftBase>, 'lines'>,
): FindErrorTask | null {
  const lines = pathLines(draft.lines.join('\n'));
  if (solutionProblem(lines) !== null) return null;
  const options = candidates(lines);
  if (options.length === 0) return null;
  // Chosen by the content: the same solution always gives the same card.
  const { k, wrong } = options[hash(lines.join('\n')) % options.length]!;
  const parsed = FindErrorTask.safeParse({
    type: 'find_error',
    lines: lines.map((text, i) => ({ id: lineId(i), text: i === k ? wrong : text })),
    key: lineId(k),
    right: lines[k],
  });
  if (!parsed.success) return null;
  return findErrorProblem(parsed.data) === null ? parsed.data : null;
}

/** What is wrong with a stored or built task, or null: the right lines sound, exactly one wrong. */
export function findErrorProblem(task: FindErrorTask): FindErrorProblem | null {
  const k = task.lines.findIndex((l) => l.id === task.key);
  if (!task.lines.every((l, i) => l.id === lineId(i)) || k < 1) return 'no_error';
  const right = task.lines.map((l, i) => (i === k ? task.right : l.text));
  const problem = solutionProblem(right);
  if (problem !== null) return problem;
  return breaksExactly(right, k, task.lines[k]!.text) ? null : 'no_error';
}

/** The solution as she reads it: the wrong line's number and the line as it is right. */
export function findErrorSolution(task: FindErrorTask): string {
  return findErrorText(task, task.key, task.right);
}

/** What a hint must not say: the right line (and so where the error is). */
export function findErrorSecrets(task: FindErrorTask): string[] {
  return [task.right];
}

/** Everything she reads: a hint may repeat it. */
export function findErrorVisible(task: FindErrorTask, prompt: string): string {
  return [prompt, ...task.lines.map((l) => l.text)].join(' ');
}

// ─────────────── her answer, checked ───────────────

/** Her correction against the line before it. */
type Fix = 'same' | 'different' | 'unreadable' | 'repeat';

export type FindErrorCheck = {
  type: 'find_error';
  correct: boolean;
  /** The line she tapped, and whether it is the wrong one. */
  parts: Array<{ id: PartId; ok: boolean }>;
  /** She tapped a line above the wrong one (the error comes later) or below it; null: found. */
  look: 'later' | 'earlier' | null;
  /** Her correction, judged only once she found the line. */
  fix: Fix | null;
};

/** Her correction, compared with the line before the wrong one. */
function judgeFix(before: string, fix: string): Fix {
  if (sameness(fix) === sameness(before)) return 'repeat';
  const a: Line | null = parseLine(before);
  const b = pathLines(fix).length === 1 ? parseLine(pathLines(fix)[0]!) : null;
  if (a === null || b === null) return 'unreadable';
  const verdict = sameStep(a, b);
  return verdict === 'unsure' ? 'unreadable' : verdict;
}

/** Her line and correction against the key; null when she tapped no line of this task's targets. */
export function checkFindError(
  task: FindErrorTask,
  answer: FindErrorAnswer,
): FindErrorCheck | null {
  const at = task.lines.findIndex((l) => l.id === answer.line);
  // The first line is the task — never a target, so never an answer.
  if (at < 1) return null;
  const k = task.lines.findIndex((l) => l.id === task.key);
  const found = at === k;
  const fix = found ? judgeFix(task.lines[k - 1]!.text, answer.fix) : null;
  return {
    type: 'find_error',
    correct: found && fix === 'same',
    parts: [{ id: answer.line, ok: found }],
    look: found ? null : at < k ? 'later' : 'earlier',
    fix,
  };
}

/** A line found with a correction not right yet is half of it; a wrong line is wrong. */
export function findErrorVerdict(
  check: FindErrorCheck,
): 'correct' | 'partially_correct' | 'incorrect' {
  if (check.correct) return 'correct';
  return check.look === null ? 'partially_correct' : 'incorrect';
}

/** Her answer in the conversation: "② 3x + 6 = 21". */
export function findErrorAnswerText(task: FindErrorTask, answer: FindErrorAnswer): string {
  return findErrorText(task, answer.line, answer.fix);
}

/** The reply to an answer that is not right yet: where to look, or what the correction lacks. */
export function findErrorReply(locale: string, check: FindErrorCheck): string {
  if (check.look !== null) return t(locale, `practice.find_error.${check.look}`);
  switch (check.fix) {
    case 'different':
      return t(locale, 'practice.find_error.fix_different');
    case 'repeat':
      return t(locale, 'practice.find_error.fix_repeat');
    case 'unreadable':
      return t(locale, 'practice.find_error.fix_unreadable');
    default:
      return t(locale, 'practice.correct');
  }
}
