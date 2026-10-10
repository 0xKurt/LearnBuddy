// Informatik: the question, the program shown, the key — all by code (issue #262,
// docs/architecture.md §Informatik).
//
// The model writes a program (or a table and a query) and picks one of four tasks (`CodeTask`,
// `contracts/code.ts`). Here it is RUN in the sandbox (`src/sandbox/`), and only the run makes a
// question of it:
//
//   predict_output  The run's output is the key. The output the model claimed is a probe: when it
//                   differs, no question.
//   find_error      The run must stop with a real Python error; its line is the key. Stopping
//                   elsewhere than claimed, or not at all: no question.
//   write_function  The solution runs on every test input; its results are the expected values. A
//                   model `expected` that differs: no question. Her function later runs against
//                   exactly these tests (`codeCheck.ts`).
//   sql_query       The query runs on the table; its rows are the key (`codeSql.ts`).
//
// No model call per answer, in no branch — and no tutor on a wrong one either: it cannot run a
// program, and a model writing about the output of a program it did not run produces exactly the
// confident wrong statement rule 5 forbids. The feedback is written by code from what really ran.

import {
  CODE_LINE_CHARS_MAX,
  CODE_LINES_MAX,
  CODE_PICK_LINES_MAX,
  CodeTask,
  OUTPUT_CHARS_MAX,
  OUTPUT_LINES_MAX,
  type CodeFigure,
  type CodeLineSurface,
  type CodeTypeSurface,
} from '@learnbuddy/shared-types/contracts';

import { isLiteral, runFunction, runProgram, type PyError } from '../../sandbox/python.js';
import { CODE_COMMON, codeText, type Built, type CodeItem, type CodeMessage } from './codeParts.js';
import { sqlItem } from './codeSql.js';

/** How many Informatik questions a prepared set may have — like the note lines. */
export const MAX_CODE_ITEMS = 6;

/**
 * What the generator is told. Categories and limits, never a written-out example program (the
 * standing rule: a sentence in the prompt comes back as a reading of her own sheet).
 */
export const CODE_RULES = `Programs ("codes"): small Python programs or one SQL query the learner reads, debugs or writes — only for computer science (Informatik) and a topic about programming or databases. You write the program or the table and choose the task; the app shows it, RUNS it and takes the key from that run, so never write a question text, an answer, options or a figure for one, and never put one into "items". Python: variables, int/float/str/bool/None, lists, tuples, dicts, if/elif/else, while, for, def, return, print, f-strings, len, range, the usual built-ins and str/list/dict methods; import only math; no input(), no random, no files. Every program short (at most ${CODE_LINES_MAX} lines of at most 40 characters, 4-space indent), deterministic, traceable by hand. SQL: one small table (2–5 columns, 3–8 rows) and one SQLite SELECT. At most ${MAX_CODE_ITEMS}, and an empty list for any other subject or topic.`;

/** The errors a program shown for "which line?" may stop with: Python reports each in one line. */
const RUNTIME_ERRORS: Readonly<Record<string, CodeMessage>> = {
  ZeroDivisionError: 'err.zero_division',
  NameError: 'err.name',
  UnboundLocalError: 'err.name',
  TypeError: 'err.type',
  ValueError: 'err.value',
  IndexError: 'err.index',
  KeyError: 'err.key',
  AttributeError: 'err.attribute',
};

/** The reason a run stopped, as part of a sentence ("es wird durch null geteilt"). */
export function reasonOf(locale: string, error: PyError): string {
  const runtime = RUNTIME_ERRORS[error.type];
  // The name Python could not find, quoted in its own message ("name 'x' is not defined").
  const name = /'([^']{1,40})'/.exec(error.message)?.[1] ?? '';
  if (runtime) return codeText(locale, runtime, { name });
  if (/^(Syntax|Indentation|Tab)Error$/.test(error.type)) return codeText(locale, 'err.syntax');
  if (/^(Import|ModuleNotFound)Error$/.test(error.type)) return codeText(locale, 'err.import');
  if (/input/.test(error.message)) return codeText(locale, 'err.input');
  if (error.type === 'ExternalError' || error.type === 'InternalError') {
    return codeText(locale, 'err.crashed');
  }
  return codeText(locale, 'err.other', { name: error.type });
}

// ─────────────── output ───────────────

/**
 * Output as lines: line ends unified, every line without edge spaces, empty lines at the end gone.
 * That the edges do not count is honest only because a question whose real output HAS edge spaces
 * is never written (`outputUsable`) — leniency in typing cannot make a wrong answer right.
 */
export function outputLines(output: string): string[] {
  const lines = output
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim());
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Usable as a key: short, not empty, no edge spaces, no `$` (the app would read it as math). */
function outputUsable(output: string): boolean {
  const raw = output.replace(/\n+$/, '').split('\n');
  if (output.trim() === '' || raw.length > OUTPUT_LINES_MAX) return false;
  if (output.length > OUTPUT_CHARS_MAX || output.includes('$')) return false;
  return raw.every((l) => l === l.trim());
}

// ─────────────── programs ───────────────

/** The program as it is shown and run: line ends unified, no blank lines around it. */
export function cleanProgram(program: string): string {
  return program.replace(/\r\n?/g, '\n').replace(/\n+$/, '').replace(/^\n+/, '');
}

/** Fits the display: line count, line width, no tabs, no `$`. */
function displayable(program: string, maxLines: number): boolean {
  const lines = program.split('\n');
  if (lines.length > maxLines) return false;
  if (lines.some((l) => l.length > CODE_LINE_CHARS_MAX || l.includes('\t'))) return false;
  return !program.includes('$');
}

function codeFigure(program: string, numbered = true): CodeFigure {
  return { type: 'code', language: 'python', lines: program.split('\n'), numbered };
}

/** Names she would call herself: a function may not hide one of them. */
const BUILTINS = new Set(
  'print len range int float str bool abs min max sum sorted list tuple dict set enumerate zip reversed round chr ord any all repr input type map filter open id pow divmod'.split(
    ' ',
  ),
);

async function predictOutput(
  task: Extract<CodeTask, { task: 'predict_output' }>,
  locale: string,
): Promise<Built> {
  const program = cleanProgram(task.program);
  if (!displayable(program, CODE_LINES_MAX)) return { reject: 'display' };
  const run = await runProgram(program);
  if (run.kind === 'limit') return { reject: 'ran_too_long' };
  if (run.error !== null) return { reject: 'did_not_run' };
  if (!outputUsable(run.output)) return { reject: 'output_unusable' };
  const lines = outputLines(run.output);
  // The probe: did the model read its own program right?
  if (outputLines(task.output).join('\n') !== lines.join('\n')) {
    return { reject: 'output_disagrees' };
  }
  const answer = lines.join('\n');
  return {
    item: {
      ...CODE_COMMON,
      code_task: { ...task, program, output: answer },
      kind: 'short',
      prompt: codeText(locale, 'predict_prompt'),
      answer,
      topic: codeText(locale, 'topic_output'),
      difficulty: program.split('\n').length > 6 ? 3 : 2,
      figure: codeFigure(program),
      hints: [
        codeText(locale, 'hint_trace'),
        lines.length > 1
          ? codeText(locale, 'hint_first_line', { line: lines[0]! })
          : codeText(locale, 'hint_print'),
      ],
      worked_solution: codeText(locale, 'worked_output'),
    },
  };
}

async function findError(
  task: Extract<CodeTask, { task: 'find_error' }>,
  locale: string,
): Promise<Built> {
  const program = cleanProgram(task.program);
  if (!displayable(program, CODE_PICK_LINES_MAX)) return { reject: 'display' };
  const run = await runProgram(program);
  if (run.kind === 'limit') return { reject: 'ran_too_long' };
  if (run.error === null) return { reject: 'no_error' };
  // Only an error real Python reports at exactly this place. A syntax error has no clear line (an
  // open bracket is reported elsewhere than where one looks for it), and a limit is no error.
  if (!(run.error.type in RUNTIME_ERRORS) || run.error.line === null) {
    return { reject: 'not_a_runtime_error' };
  }
  if (run.error.line !== task.line) return { reject: 'line_disagrees' };
  const line = run.error.line;
  const reason = reasonOf(locale, run.error);
  return {
    item: {
      ...CODE_COMMON,
      code_task: { ...task, program },
      kind: 'short',
      prompt: codeText(locale, 'find_prompt'),
      answer: codeText(locale, 'line_named', { line }),
      topic: codeText(locale, 'topic_errors'),
      difficulty: 3,
      figure: codeFigure(program),
      hints: [codeText(locale, 'hint_trace'), codeText(locale, 'hint_error_kind', { reason })],
      worked_solution: codeText(locale, 'worked_error', { line, reason }),
    },
  };
}

/** `summe(2, 3)` — the call as the question and the feedback write it. */
export function callText(name: string, args: string): string {
  return `${name}(${args.trim()})`;
}

async function writeFunction(
  task: Extract<CodeTask, { task: 'write_function' }>,
  locale: string,
): Promise<Built> {
  const solution = cleanProgram(task.solution);
  if (!displayable(solution, CODE_LINES_MAX)) return { reject: 'display' };
  if (task.statement.includes('$')) return { reject: 'display' };
  const names = [task.name, ...task.params];
  if (new Set(names).size !== names.length || BUILTINS.has(task.name)) {
    return { reject: 'bad_signature' };
  }
  if (
    task.tests.some((c) => !isLiteral(c.args) || !isLiteral(c.expected) || c.args.includes('$'))
  ) {
    return { reject: 'bad_test' };
  }
  if (new Set(task.tests.map((c) => c.args.replace(/\s+/g, ''))).size < 3) {
    return { reject: 'tests_not_distinct' };
  }
  const run = await runFunction(solution, task.name, task.tests);
  if (run.kind === 'limit') return { reject: 'ran_too_long' };
  if (run.kind !== 'ran') return { reject: 'did_not_run' };
  if (run.params !== task.params.length) return { reject: 'bad_signature' };
  const tests: Array<{ args: string; expected: string }> = [];
  for (const [i, result] of run.results.entries()) {
    // A function that returns nothing is no task here: "return, not print".
    if (result.kind !== 'value') return { reject: 'did_not_run' };
    // The probe, strict: the same value (Python's ==, floats within a tolerance).
    if (!result.same) return { reject: 'expected_disagrees' };
    if (result.repr.length > 60 || result.repr.includes('$')) return { reject: 'bad_test' };
    tests.push({ args: task.tests[i]!.args.trim(), expected: result.repr });
  }
  const signature = `${task.name}(${task.params.join(', ')})`;
  const prompt = codeText(locale, 'write_prompt', { signature, statement: task.statement.trim() });
  if (prompt.length > 600) return { reject: 'display' };
  const first = tests[0]!;
  // The examples as code, not as a sentence: two calls with what comes out, from the run.
  const examples = tests
    .slice(0, 2)
    .map((c) => `${callText(task.name, c.args)}  # → ${c.expected}`);
  return {
    item: {
      ...CODE_COMMON,
      code_task: { ...task, solution, tests },
      kind: 'long',
      prompt,
      answer: solution,
      topic: codeText(locale, 'topic_functions'),
      difficulty: 3,
      figure: codeFigure(examples.join('\n'), false),
      hints: [
        codeText(locale, 'hint_example', {
          call: callText(task.name, first.args),
          result: first.expected,
        }),
        codeText(locale, 'hint_return'),
      ],
      worked_solution: codeText(locale, 'worked_write'),
    },
  };
}

/** The question a task becomes — or why none. For tests; the rest takes `codeItems`. */
export async function buildCodeItem(raw: unknown, locale: string): Promise<Built> {
  const parsed = CodeTask.safeParse(raw);
  if (!parsed.success) return { reject: 'display' };
  const task = parsed.data;
  switch (task.task) {
    case 'predict_output':
      return predictOutput(task, locale);
    case 'find_error':
      return findError(task, locale);
    case 'write_function':
      return writeFunction(task, locale);
    case 'sql_query':
      return sqlItem(task, locale);
  }
}

/** The tasks of a prepared set as questions; one that does not run costs only itself. */
export async function codeItems(tasks: readonly CodeTask[], locale: string): Promise<CodeItem[]> {
  const out: CodeItem[] = [];
  for (const task of tasks.slice(0, MAX_CODE_ITEMS)) {
    const built = await buildCodeItem(task, locale);
    if ('item' in built) out.push(built.item);
  }
  return out;
}

/** The stored task, read forgivingly: what does not parse is none. */
export function codeTaskOf(stored: unknown): CodeTask | null {
  if (stored === null || stored === undefined) return null;
  const parsed = CodeTask.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

/** The surface she answers on. It shows nothing the question does not already say. */
export function codeSurfaceOf(task: CodeTask): CodeLineSurface | CodeTypeSurface {
  switch (task.task) {
    case 'predict_output':
      return { mode: 'code_type', purpose: 'output', starter: '' };
    case 'find_error':
      return {
        mode: 'code_line',
        lines: Math.min(cleanProgram(task.program).split('\n').length, CODE_PICK_LINES_MAX),
      };
    case 'write_function':
      return {
        mode: 'code_type',
        purpose: 'program',
        starter: `def ${task.name}(${task.params.join(', ')}):\n    `,
      };
    case 'sql_query':
      return { mode: 'code_type', purpose: 'query', starter: '' };
  }
}
