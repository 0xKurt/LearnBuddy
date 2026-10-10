// Informatik: her answer, checked by code — never a model (issue #262, docs/architecture.md
// §Informatik). An output line by line against the run's output, a tapped line against the line
// the run stopped at, her function RUN against the tests, her query RUN on the table. The reply
// comes from what really ran: the first test that fails, the line where her output departs.

import type { CodeTask } from '@learnbuddy/shared-types/contracts';

import { FUNCTION_LIMITS, runFunction, type PyError } from '../../sandbox/python.js';
import { callText, cleanProgram, outputLines, reasonOf } from './code.js';
import { codeText } from './codeParts.js';
import { checkSql, sqlReply, type SqlCheck } from './codeSql.js';

/** Where her answer goes wrong — ONE place, as with the note line and answers in parts. */
type CodeFault =
  | { at: 'output_line'; line: number; hint: 'case' | 'quotes' | null }
  | { at: 'output_count'; more: boolean }
  | { at: 'line' }
  | { at: 'program'; error: PyError }
  | { at: 'too_long' }
  | { at: 'missing'; name: string }
  | { at: 'params'; signature: string }
  | {
      at: 'test';
      call: string;
      expected: string;
      outcome: { got: string } | { printed: true } | { none: true } | { error: PyError };
    }
  | { at: 'sql'; check: SqlCheck };

export type CodeCheck = {
  /** How much holds: lines from the top, or tests passed. */
  held: number;
  total: number;
  verdict: 'correct' | 'partly' | 'wrong';
  fault: CodeFault | null;
};

/** A line number as the line surface sends it: digits only. */
export function pickedLine(text: string): number | null {
  const m = /^\s*([0-9]{1,2})\s*$/.exec(text);
  return m ? Number(m[1]) : null;
}

function checkOutput(task: Extract<CodeTask, { task: 'predict_output' }>, answer: string) {
  // The key is the run's output, stored with the task when the question was written.
  const wanted = outputLines(task.output);
  const given = outputLines(answer);
  let held = 0;
  while (held < wanted.length && held < given.length && wanted[held] === given[held]) held++;
  const whole = held === wanted.length && given.length === wanted.length;
  const verdict = whole ? 'correct' : held > 0 ? 'partly' : 'wrong';
  const base = { held, total: wanted.length, verdict } as const;
  if (whole) return { ...base, fault: null };
  if (held === Math.min(wanted.length, given.length)) {
    return { ...base, fault: { at: 'output_count', more: given.length < wanted.length } } as const;
  }
  const w = wanted[held]!;
  const g = given[held]!;
  const hint =
    w.toLowerCase() === g.toLowerCase()
      ? 'case'
      : g.replace(/^["'„“‚‘]|["'“”‘’]$/g, '') === w
        ? 'quotes'
        : null;
  return { ...base, fault: { at: 'output_line', line: held + 1, hint } } as const;
}

async function checkFunction(
  task: Extract<CodeTask, { task: 'write_function' }>,
  answer: string,
): Promise<CodeCheck> {
  const total = task.tests.length;
  const wrong = (fault: CodeFault): CodeCheck => ({ held: 0, total, verdict: 'wrong', fault });
  // Typographic quotes come from her phone's keyboard, never from her: they count as plain ones.
  const program = cleanProgram(answer.replace(/[„“”]/g, '"').replace(/[‚‘’]/g, "'"));
  const run = await runFunction(program, task.name, task.tests, FUNCTION_LIMITS);
  if (run.kind === 'limit') return wrong({ at: 'too_long' });
  if (run.kind === 'module_error') return wrong({ at: 'program', error: run.error });
  if (run.kind === 'missing') return wrong({ at: 'missing', name: task.name });
  if (run.params !== task.params.length) {
    return wrong({ at: 'params', signature: `${task.name}(${task.params.join(', ')})` });
  }
  let passed = 0;
  let first: CodeFault | null = null;
  for (const [i, result] of run.results.entries()) {
    if (result.kind === 'value' && result.same) {
      passed++;
      continue;
    }
    if (first !== null) continue;
    const test = task.tests[i]!;
    const base = {
      at: 'test',
      call: callText(task.name, test.args),
      expected: test.expected,
    } as const;
    first =
      result.kind === 'error'
        ? { ...base, outcome: { error: result.error } }
        : result.kind === 'none'
          ? { ...base, outcome: result.printed ? { printed: true } : { none: true } }
          : { ...base, outcome: { got: result.repr.slice(0, 60) } };
  }
  const verdict = passed === total ? 'correct' : passed > 0 ? 'partly' : 'wrong';
  return { held: passed, total, verdict, fault: first };
}

/**
 * Her answer against the task. No model, in no branch. Null only means: for "which line?" no line
 * number of the program arrived — a form the question never offered; the caller refuses it.
 */
export async function checkCode(task: CodeTask, answer: string): Promise<CodeCheck | null> {
  switch (task.task) {
    case 'predict_output':
      return checkOutput(task, answer);
    case 'find_error': {
      const picked = pickedLine(answer);
      if (picked === null || picked < 1 || picked > cleanProgram(task.program).split('\n').length) {
        return null;
      }
      const right = picked === task.line;
      return {
        held: right ? 1 : 0,
        total: 1,
        verdict: right ? 'correct' : 'wrong',
        fault: right ? null : { at: 'line' },
      };
    }
    case 'write_function':
      return checkFunction(task, answer);
    case 'sql_query': {
      const check = await checkSql(task, answer);
      const verdict = check.verdict;
      return {
        held: verdict === 'correct' ? 1 : 0,
        total: 1,
        verdict,
        fault: verdict === 'correct' ? null : { at: 'sql', check },
      };
    }
  }
}

// ─────────────── what she reads ───────────────

/** Her answer as it stands in the thread: the tapped line in words. */
export function writtenCode(locale: string, task: CodeTask, answer: string): string | null {
  if (task.task !== 'find_error') return null;
  const line = pickedLine(answer);
  return line === null ? null : codeText(locale, 'line_named', { line });
}

/**
 * The reply to an answer that is not right yet — by code, from the real run. For an output with
 * the place from the second try on (the same ladder as the note line); for a function at once with
 * the first test that fails: that is the feedback a test run gives, and without it "2 of 4" would
 * be a riddle.
 */
export function codeReply(locale: string, check: CodeCheck, attempts: number): string {
  const fault = check.fault;
  if (fault === null) return codeText(locale, 'line_again');
  switch (fault.at) {
    case 'line':
      return codeText(locale, 'line_again');
    case 'output_count':
    case 'output_line': {
      const held =
        check.held > 0
          ? codeText(locale, 'output_held', {
              held: check.held,
              total: check.total,
              count: check.held,
            })
          : codeText(locale, 'output_held_none');
      if (fault.at === 'output_line' && fault.hint !== null) {
        const key = fault.hint === 'case' ? 'output_case' : 'output_quotes';
        return `${held} ${codeText(locale, key, { line: fault.line })}`;
      }
      if (attempts === 0) return held;
      if (fault.at === 'output_count') {
        return `${held} ${codeText(locale, fault.more ? 'output_more' : 'output_fewer')}`;
      }
      return `${held} ${codeText(locale, 'output_fault_line', { line: fault.line })}`;
    }
    case 'program':
      return fault.error.line === null
        ? codeText(locale, 'program_stopped', { reason: reasonOf(locale, fault.error) })
        : codeText(locale, 'program_error', {
            line: fault.error.line,
            reason: reasonOf(locale, fault.error),
          });
    case 'too_long':
      return codeText(locale, 'program_stopped', { reason: codeText(locale, 'err.steps') });
    case 'missing':
      return codeText(locale, 'missing_function', { name: fault.name });
    case 'params':
      return codeText(locale, 'wrong_params', { signature: fault.signature });
    case 'test': {
      const passed = codeText(locale, 'tests_passed', { passed: check.held, total: check.total });
      const o = fault.outcome;
      const { call, expected } = fault;
      const detail =
        'got' in o
          ? codeText(locale, 'test_failed', { call, expected, got: o.got })
          : 'printed' in o
            ? codeText(locale, 'test_printed', { call })
            : 'none' in o
              ? codeText(locale, 'test_none', { call })
              : codeText(locale, 'test_error', {
                  call,
                  line: o.error.line ?? '?',
                  reason: reasonOf(locale, o.error),
                });
      return `${passed} ${detail}`;
    }
    case 'sql':
      return sqlReply(locale, fault.check);
  }
}

/** The line over a program that passed: how many tests, so "right" has a content. */
export function codePassed(locale: string, check: CodeCheck, task: CodeTask): string | null {
  return task.task === 'write_function'
    ? codeText(locale, 'tests_all', { total: check.total })
    : null;
}
