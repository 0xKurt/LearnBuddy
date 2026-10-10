// Informatik: read a program, predict its output, find the line it stops at, write a function,
// write an SQL query (issue #262, building blocks QUELLTEXT and CODE_RUN of the analysis #224).
// docs/architecture.md §Informatik.
//
// The same way as the fraction bar (#162) and the note line (#226): **the model chooses, code
// computes.** A `CodeTask` is everything the model may say — a program or a table, a task, test
// inputs. What she sees and what she is measured against the server writes
// (`apps/api/src/modules/practice/code.ts`), and every key comes from RUNNING it in a sandbox
// (`apps/api/src/sandbox/`):
//   · "What does the program print?" — its output is the key;
//   · "In which line does it stop?" — the line of the Python error is the key;
//   · "Write a function …" — the model's solution runs on the test inputs; its results are the
//     expected values, and her own function later runs against exactly those;
//   · "Write an SQL query …" — the model's query runs on the table; its rows are the key, and her
//     query's rows are compared with them (order only where the key asks for one).
// What the model claims besides (`output`, `line`, `expected`, `result`) is only a PROBE: when it
// differs from the run, the model did not understand its own task, and no question is written.

import { z } from 'zod';

/** The language a SHOWN program is in (an SQL task shows its table, never a program). */
export const CODE_LANGUAGES = ['python'] as const;
export const CodeLanguage = z.enum(CODE_LANGUAGES);
export type CodeLanguage = z.infer<typeof CodeLanguage>;

/**
 * The most lines of a SHOWN program: twelve. At 20 pt a line that is 240 pt of code, and on a
 * 360×740 phone the question, the answer field and "Prüfen" still stand beside it (rule 16).
 */
export const CODE_LINES_MAX = 12;
/** The most lines of a program whose failing line she taps: each line is a 44-pt target. */
export const CODE_PICK_LINES_MAX = 8;
/** The longest line: what 13-pt monospace fits on a 360-pt phone; more scrolls inside the block. */
export const CODE_LINE_CHARS_MAX = 48;
/** The longest output that is asked for: eight lines, 160 characters. */
export const OUTPUT_LINES_MAX = 8;
export const OUTPUT_CHARS_MAX = 160;

// ─────────────── what she sees ───────────────

/**
 * A program as shown (`ItemView.figure`), line by line, exactly as it runs. The app draws it in
 * monospace with its indentation and, where `numbered`, the line numbers (index + 1); a line wider
 * than the phone scrolls inside the block.
 *
 * It stands in `Figure` and NOT in `ModelFigure`: a program whose output or failing line is asked
 * IS the key, so the model never writes it next to a question of its own (the lesson of #157).
 */
export const CodeFigure = z.object({
  type: z.literal('code'),
  language: CodeLanguage,
  lines: z.array(z.string().max(200)).min(1).max(CODE_LINES_MAX),
  /** Line numbers: a program has them (they are asked for), the example calls of a task do not. */
  numbered: z.boolean().default(true),
});
export type CodeFigure = z.infer<typeof CodeFigure>;

/** She taps the line the program stops at (`ItemView.surface`); the answer is its number as text. */
export const CodeLineSurface = z.object({
  mode: z.literal('code_line'),
  lines: z.number().int().min(1).max(CODE_PICK_LINES_MAX),
});
export type CodeLineSurface = z.infer<typeof CodeLineSurface>;

/**
 * She types code, a query or an output into a monospace field without autocorrect and without
 * automatic capitals — a phone keyboard that turns `print` into `Print` would hand her an error
 * she never made. `starter` is what the field already holds (`def summe(a, b):` and an
 * indentation) — never part of the solution: the name and the parameters stand in the question.
 */
export const CodeTypeSurface = z.object({
  mode: z.literal('code_type'),
  purpose: z.enum(['output', 'program', 'query']),
  starter: z.string().max(200),
});
export type CodeTypeSurface = z.infer<typeof CodeTypeSurface>;

// ─────────────── the task as the model writes it ───────────────

/** A Python or SQL name as a child types it: ASCII, so it can be typed everywhere. */
const Identifier = z.string().regex(/^[a-z_][a-z0-9_]{0,23}$/);

const Program = z
  .string()
  .min(1)
  .max(600)
  .describe(`Python, at most ${CODE_LINES_MAX} lines of at most 40 characters, 4-space indent`);

/** A cell of a table as text: a number for INTEGER/REAL columns, "" for NULL. */
const Cell = z.string().max(30);

export const SqlColumnDraft = z.object({
  name: Identifier,
  type: z.enum(['INTEGER', 'REAL', 'TEXT']),
});
export type SqlColumnDraft = z.infer<typeof SqlColumnDraft>;

export const CodeTask = z.discriminatedUnion('task', [
  z
    .object({
      task: z.literal('predict_output'),
      program: Program,
      output: z
        .string()
        .max(400)
        .describe('Exactly what it prints; the app RUNS it and drops the task if this differs'),
    })
    .describe('What does this program print? Deterministic, at most 8 printed lines.'),
  z
    .object({
      task: z.literal('find_error'),
      program: Program,
      line: z
        .number()
        .int()
        .min(1)
        .max(CODE_PICK_LINES_MAX)
        .describe('The line where Python stops; the app runs it and drops the task if not'),
    })
    .describe(
      `Which line stops it? At most ${CODE_PICK_LINES_MAX} lines ending in a RUNTIME error Python reports in one line (unknown name, text plus number, division by zero, missing index or key, bad conversion) — not a syntax error, not a wrong result.`,
    ),
  z
    .object({
      task: z.literal('write_function'),
      name: Identifier,
      params: z.array(Identifier).max(3),
      statement: z
        .string()
        .min(10)
        .max(300)
        .describe('What it RETURNS, in her language; no signature, no examples'),
      tests: z
        .array(
          z.object({
            args: z.string().max(80).describe('Python literals, comma-separated'),
            expected: z.string().max(80).describe('The returned value as a Python literal'),
          }),
        )
        .min(3)
        .max(6),
      solution: Program.describe('A correct solution that defines the function and nothing else'),
    })
    .describe(
      'Write a function: hers runs against the tests; the expected values come from RUNNING your solution.',
    ),
  z
    .object({
      task: z.literal('sql_query'),
      table: Identifier,
      columns: z.array(SqlColumnDraft).min(2).max(5),
      rows: z.array(z.array(Cell).min(2).max(5)).min(3).max(8),
      statement: z
        .string()
        .min(10)
        .max(300)
        .describe('What the query should find, in her language; never the query'),
      query: z.string().min(10).max(400).describe('One SQLite SELECT that answers it'),
      result: z
        .array(z.array(Cell).max(5))
        .max(8)
        .describe('The rows it returns; the app runs it and drops the task if they differ'),
    })
    .describe('Write an SQL query on one small table; hers runs and its rows are compared.'),
]);
export type CodeTask = z.infer<typeof CodeTask>;
export type CodeTaskName = CodeTask['task'];
