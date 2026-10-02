// Informatik: Frage, Programmanzeige, Schlüssel und Urteil — alles von Code (issue #262).
//
// Das Modell schreibt ein Programm und wählt eine von drei Aufgaben (`CodeTask`,
// `contracts/code.ts`). Hier wird es AUSGEFÜHRT, im Interpreter der Lehr-Teilmenge
// (`python/`), und erst die Ausführung macht daraus eine Frage:
//
//   predict_output  Die Ausgabe des Laufs ist der Schlüssel. Die Ausgabe, die das Modell
//                   behauptet hat, ist nur eine Probe: weicht sie ab, entsteht keine Frage.
//   find_error      Der Lauf muss mit einem echten Python-Fehler abbrechen; seine Zeile ist der
//                   Schlüssel. Bricht er woanders ab als behauptet, oder gar nicht: keine Frage.
//   write_function  Die Musterlösung läuft auf jeder Testeingabe; ihre Ergebnisse sind die
//                   erwarteten Werte. Ein `expected` des Modells, das abweicht: keine Frage.
//                   Ihre eigene Funktion läuft später gegen genau diese Tests.
//
// Kein Modellaufruf pro Antwort, in keinem Zweig — und auch kein Tutor bei einer falschen: er
// kann kein Programm ausführen, und ein Modell, das über die Ausgabe eines Programms schreibt,
// das es nicht laufen lassen kann, erzeugt genau die sicher klingende Falschaussage, die Regel 5
// verbietet. Die Rückmeldung schreibt Code, aus dem, was der Lauf wirklich ergeben hat.

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
  type Figure,
} from '@learnbuddy/shared-types/contracts';

import { t, type MessageKey } from '../../i18n/index.js';
import type { Expr } from './python/ast.js';
import { PYTHON_ERRORS, PyError } from './python/errors.js';
import { highlight } from './python/highlight.js';
import { parseExpression, parseProgram } from './python/parse.js';
import { DEFAULT_LIMITS, Machine, type Limits } from './python/run.js';
import { eq, isNumber, numeric, repr, type Value } from './python/values.js';
import type { ItemDraft } from './items.js';

/** Wie viele Informatikfragen ein vorbereiteter Satz haben darf — wie die Notenzeilen. */
export const MAX_CODE_ITEMS = 8;

/**
 * Die Grenzen eines Programms, das sie im KOPF nachvollziehen soll: 5 000 Schritte. Ein Programm,
 * das mehr braucht, mag richtig sein, aber eine Schleife über tausend Werte verfolgt niemand von
 * Hand — als Frage „Was gibt es aus?" wäre es eine Rechenaufgabe für den Taschenrechner.
 */
const TRACE_LIMITS: Limits = { ...DEFAULT_LIMITS, steps: 5_000 };
/** Die Grenzen eines Laufs ihrer eigenen Funktion, je Testfall (Schritte werden neu gezählt). */
const TEST_LIMITS: Limits = { ...DEFAULT_LIMITS, steps: 50_000 };

/**
 * Was dem Generator über Informatikaufgaben gesagt wird. Kategorien und Verbote, nie ein
 * ausgeschriebenes Beispielprogramm (die stehende Regel: ein Satz im Prompt kommt als Lesart des
 * eigenen Blattes zurück).
 */
export const CODE_RULES = `Programs ("codes"): small Python programs the learner reads, debugs or writes — only for a learner who has computer science (Informatik) as a subject and a topic about programming. You write the program and choose the task; the app shows the code, RUNS it and takes the key from that run, so never write a question text, an answer, options or a figure for one, and never put a program into "items". Only this teaching subset runs: variables, int/float/str/bool/None, lists, tuples, dicts, if/elif/else, while, for over range/lists/strings/dicts, def with plain positional parameters, return, print (sep, end), f-strings (optionally :.2f), len, range, int, float, str, abs, min, max, sum, sorted, round, enumerate, zip and the common methods of str, list and dict. No import, no input(), no classes, no try/except, no lambda, no list comprehensions, no global, no default parameter values. Keep every program short (at most ${CODE_LINES_MAX} lines, at most 40 characters per line, 4-space indentation), deterministic and traceable by hand. At most ${MAX_CODE_ITEMS}, and an empty list for any other subject or topic. The ordinary questions in "items" are unaffected.`;

/** Eine Frage, deren Felder aus `code_task` gerechnet sind; `insertItems` speichert beides. */
export type CodeItem = Omit<ItemDraft, 'figure'> & {
  figure: Figure | null;
  code_task: CodeTask;
};

// ─────────────── Worte ───────────────

type SuffixOf<T> = T extends `practice.code.${infer S}` ? S : never;
type CodeMessage = SuffixOf<MessageKey>;

function text(
  locale: string,
  suffix: CodeMessage,
  vars: Record<string, string | number> = {},
): string {
  return t(locale, `practice.code.${suffix}`, vars);
}

/** Warum ein Lauf abbrach, als Satzteil („es wird durch null geteilt"). */
export function reasonOf(locale: string, error: PyError): string {
  return text(locale, `err.${error.kind}` as CodeMessage, { name: error.detail ?? '' });
}

// ─────────────── Ausgabe vergleichen ───────────────

/**
 * Die Ausgabe als Zeilen: Zeilenenden vereinheitlicht, jede Zeile ohne Rand-Leerzeichen, leere
 * Zeilen am Ende weg. Dass der Rand nicht zählt, ist nur deshalb ehrlich, weil eine Frage, deren
 * echte Ausgabe Rand-Leerzeichen HAT, gar nicht erst entsteht (`outputUsable`) — so kann
 * Nachsicht beim Tippen keine falsche Antwort richtig machen.
 */
export function outputLines(output: string): string[] {
  const lines = output
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim());
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Taugt diese echte Ausgabe als Schlüssel? Kurz, nicht leer, ohne Rand-Leerzeichen, ohne `$`. */
function outputUsable(output: string): boolean {
  const raw = output.replace(/\n+$/, '').split('\n');
  if (output.trim() === '' || raw.length > OUTPUT_LINES_MAX) return false;
  if (output.length > OUTPUT_CHARS_MAX) return false;
  // `$` öffnet in der App eine Formel (MathText): eine Ausgabe damit würde falsch gezeigt.
  if (output.includes('$')) return false;
  return raw.every((l) => l === l.trim());
}

// ─────────────── Programme prüfen ───────────────

export type RejectReason =
  | 'not_python'
  | 'unsupported'
  | 'too_long'
  | 'display'
  | 'did_not_run'
  | 'ran_too_long'
  | 'output_unusable'
  | 'output_disagrees'
  | 'no_error'
  | 'not_a_runtime_error'
  | 'line_disagrees'
  | 'bad_signature'
  | 'bad_test'
  | 'expected_disagrees'
  | 'tests_not_distinct';

type Built = { item: CodeItem } | { reject: RejectReason };

/** Passt das Programm in die Anzeige? Zeilenzahl, Zeilenbreite, keine Tabs, kein `$`. */
function displayable(program: string, maxLines: number): boolean {
  const lines = program.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  if (lines.length > maxLines) return false;
  if (lines.some((l) => l.length > CODE_LINE_CHARS_MAX || l.includes('\t'))) return false;
  return !program.includes('$');
}

/** Das Programm, normalisiert so, wie es gezeigt und ausgeführt wird. */
function clean(program: string): string {
  return program.replace(/\r\n?/g, '\n').replace(/\n+$/, '').replace(/^\n+/, '');
}

function figureOf(program: string, numbered = true): CodeFigure {
  return { type: 'code', language: 'python', lines: highlight(program), numbered };
}

/** Führt ein Programm aus; der Fehler, mit dem es abbricht, oder null. */
function execute(program: string, limits: Limits): { output: string; error: PyError | null } {
  const m = new Machine(limits);
  try {
    m.run(parseProgram(program));
    return { output: m.output, error: null };
  } catch (e) {
    if (e instanceof PyError) return { output: m.output, error: e };
    throw e;
  }
}

/** Ein Lauf, der an einer GRENZE endete (nicht an einem Python-Fehler). */
function hitLimit(e: PyError): boolean {
  return ['steps', 'memory', 'output', 'recursion', 'number_too_big'].includes(e.kind);
}

const COMMON = {
  accepted_answers: [] as string[],
  unit: null,
  choices: null,
  correct_choice: null,
  prompt_lang: null,
  lang: null,
  tolerance: null,
  spelling: null,
  source_excerpt: null,
  // Eine Programmfrage hat einen Wert gegen einen Schlüssel, keine Teile (#228–#230); keine der
  // länderabhängigen Lehrplanstellen ist Informatik (#214); sie ist keine Schreibaufgabe mit
  // Pflichtelementen (#211) und wird nicht gehört (#210).
  parts_task: null,
  curriculum_point: null,
  rubric: null,
  listen_task: null,
} as const;

/** Ein Ausdruck aus lauter Literalen — Zahlen, Texte, True/False/None, Listen, Tupel, Dicts davon. */
function literalOnly(x: Expr): boolean {
  switch (x.e) {
    case 'int':
    case 'float':
    case 'str':
    case 'const':
      return true;
    case 'unary':
      return x.x.e === 'int' || x.x.e === 'float';
    case 'list':
    case 'tuple':
      return x.items.every(literalOnly);
    case 'dict':
      return x.keys.every(literalOnly) && x.values.every(literalOnly);
    default:
      return false;
  }
}

/** Die Argumente eines Testfalls als Werte, oder null, wenn sie keine reinen Literale sind. */
export function parseArgs(args: string): Value[] | null {
  if (args.trim() === '') return [];
  try {
    // In ein Tupel gepackt, damit `[1, 2]` EIN Argument bleibt und `3, 4` zwei werden.
    const x = parseExpression(`(${args},)`);
    if (x.e !== 'tuple' || !literalOnly(x)) return null;
    return x.items.map((i) => new Machine().evaluate(i));
  } catch (e) {
    if (e instanceof PyError) return null;
    throw e;
  }
}

/** Ein einzelner erwarteter Wert, oder null, wenn er kein reines Literal ist. */
function parseLiteral(source: string): Value | null {
  const args = parseArgs(source);
  return args !== null && args.length === 1 ? (args[0] as Value) : null;
}

/** `summe(2, 3)` — der Aufruf so, wie er in der Frage und in der Rückmeldung steht. */
function callText(name: string, args: readonly Value[]): string {
  return `${name}(${args.map((a) => repr(a, 1)).join(', ')})`;
}

/**
 * Ein Ergebnis gegen das erwartete, wie ein Test es prüft: Python-Gleichheit (`2 == 2.0`), bei
 * Gleitkommazahlen aber mit relativer Toleranz wie `math.isclose` — `0.1 + 0.2` und `0.3`
 * sind dieselbe richtige Antwort, nur anders gerechnet. Rekursiv durch Listen und Tupel.
 */
export function sameResult(expected: Value, got: Value): boolean {
  if (isNumber(expected) && isNumber(got)) {
    const a = numeric(expected);
    const b = numeric(got);
    if (typeof a === 'number' || typeof b === 'number') {
      const x = Number(a);
      const y = Number(b);
      return Math.abs(x - y) <= Math.max(1e-9 * Math.max(Math.abs(x), Math.abs(y)), 1e-12);
    }
    return a === b;
  }
  if (
    expected !== null &&
    got !== null &&
    typeof expected === 'object' &&
    typeof got === 'object' &&
    (expected.t === 'list' || expected.t === 'tuple') &&
    expected.t === got.t
  ) {
    const gi = (got as { items: readonly Value[] }).items;
    return (
      expected.items.length === gi.length &&
      expected.items.every((v, i) => sameResult(v, gi[i] as Value))
    );
  }
  return eq(expected, got);
}

/** Ein Lauf einer Funktion auf einem Testfall: geladen auf einer frischen Maschine. */
type CallOutcome =
  | { ok: true; value: Value; printed: boolean }
  | { ok: false; error: PyError; at: 'module' | 'call' };

function callOnFresh(program: string, name: string, args: Value[], curly: boolean): CallOutcome {
  const m = new Machine(TEST_LIMITS);
  let parsed;
  try {
    parsed = parseProgram(program, curly);
  } catch (e) {
    if (e instanceof PyError) return { ok: false, error: e, at: 'module' };
    throw e;
  }
  try {
    m.run(parsed);
  } catch (e) {
    if (e instanceof PyError) return { ok: false, error: e, at: 'module' };
    throw e;
  }
  const before = m.output.length;
  m.resetSteps();
  try {
    const value = m.call(name, args);
    return { ok: true, value, printed: m.output.length > before };
  } catch (e) {
    if (e instanceof PyError) return { ok: false, error: e, at: 'call' };
    throw e;
  }
}

/** Die Funktion, die ein Programm definiert — oder warum es keine passende gibt. */
function defined(
  program: string,
  name: string,
  curly: boolean,
): { params: number } | PyError | null {
  const m = new Machine(TEST_LIMITS);
  try {
    m.run(parseProgram(program, curly));
  } catch (e) {
    if (e instanceof PyError) return e;
    throw e;
  }
  const f = m.globals.get(name);
  if (f === undefined || f === null || typeof f !== 'object' || f.t !== 'func') return null;
  return { params: f.params.length };
}

// ─────────────── die Frage, die daraus wird ───────────────

/** `summe([1, 2])  # → 3`, untereinander ausgerichtet. */
function examplesOf(
  name: string,
  results: ReadonlyArray<{ args: Value[]; result: Value }>,
): string {
  const calls = results.map((r) => callText(name, r.args));
  const width = Math.max(...calls.map((c) => c.length));
  return results
    .map((r, i) => `${(calls[i] as string).padEnd(width)}  # → ${repr(r.result, 1)}`)
    .join('\n');
}

/** Die Frage, die eine Aufgabe wird — oder warum keine. Für Tests; der Rest nimmt `codeItem`. */
export function buildCodeItem(raw: CodeTask, locale: string): Built {
  const parsedTask = CodeTask.safeParse(raw);
  if (!parsedTask.success) return { reject: 'not_python' };
  const task = parsedTask.data;
  switch (task.task) {
    case 'predict_output': {
      const program = clean(task.program);
      if (!displayable(program, CODE_LINES_MAX)) return { reject: 'display' };
      const run = guarded(() => execute(program, TRACE_LIMITS));
      if ('reject' in run) return run;
      if (run.error !== null) {
        return { reject: run.error.kind === 'steps' ? 'ran_too_long' : rejectOf(run.error) };
      }
      if (!outputUsable(run.output)) return { reject: 'output_unusable' };
      const lines = outputLines(run.output);
      // Die Probe: hat das Modell sein eigenes Programm richtig gelesen?
      if (outputLines(task.output).join('\n') !== lines.join('\n')) {
        return { reject: 'output_disagrees' };
      }
      const answer = lines.join('\n');
      return {
        item: {
          ...COMMON,
          code_task: { ...task, program },
          kind: 'short',
          prompt: text(locale, 'predict_prompt'),
          answer,
          topic: text(locale, 'topic_output'),
          difficulty: program.split('\n').length > 6 ? 3 : 2,
          figure: figureOf(program),
          hints: [
            text(locale, 'hint_trace'),
            lines.length > 1
              ? text(locale, 'hint_first_line', { line: lines[0] as string })
              : text(locale, 'hint_print'),
          ],
          worked_solution: text(locale, 'worked_output'),
        },
      };
    }
    case 'find_error': {
      const program = clean(task.program);
      if (!displayable(program, CODE_PICK_LINES_MAX)) return { reject: 'display' };
      const run = guarded(() => execute(program, TRACE_LIMITS));
      if ('reject' in run) return run;
      if (run.error === null) return { reject: 'no_error' };
      // Nur ein Fehler, den echtes Python an GENAU dieser Stelle ebenso meldet. Ein Syntaxfehler
      // hat keine eindeutige Zeile (eine offene Klammer meldet Python woanders, als man sie
      // sucht), und eine Grenze dieses Interpreters ist kein Fehler im Programm.
      if (!PYTHON_ERRORS.has(run.error.kind)) {
        return { reject: run.error.kind === 'unsupported' ? 'unsupported' : 'not_a_runtime_error' };
      }
      if (run.error.line !== task.line) return { reject: 'line_disagrees' };
      const line = run.error.line;
      return {
        item: {
          ...COMMON,
          code_task: { ...task, program },
          kind: 'short',
          prompt: text(locale, 'find_prompt'),
          answer: text(locale, 'line_named', { line }),
          topic: text(locale, 'topic_errors'),
          difficulty: 3,
          figure: figureOf(program),
          hints: [
            text(locale, 'hint_trace'),
            text(locale, 'hint_error_kind', { reason: reasonOf(locale, run.error) }),
          ],
          worked_solution: text(locale, 'worked_error', {
            line,
            reason: reasonOf(locale, run.error),
          }),
        },
      };
    }
    case 'write_function': {
      const solution = clean(task.solution);
      if (!displayable(solution, CODE_LINES_MAX)) return { reject: 'display' };
      if (task.statement.includes('$') || task.tests.some((c) => c.args.includes('$'))) {
        return { reject: 'display' };
      }
      // Der Name darf nichts verdecken, was sie sonst aufrufen würde (`sum`, `print`, `len`).
      const names = [task.name, ...task.params];
      if (new Set(names).size !== names.length || shadowsBuiltin(task.name)) {
        return { reject: 'bad_signature' };
      }
      const shape = defined(solution, task.name, false);
      if (shape instanceof PyError) return { reject: rejectOf(shape) };
      if (shape === null || shape.params !== task.params.length) return { reject: 'bad_signature' };
      const results: Array<{ args: Value[]; result: Value }> = [];
      for (const c of task.tests) {
        const args = parseArgs(c.args);
        const claimed = parseLiteral(c.expected);
        if (args === null || claimed === null || args.length !== task.params.length) {
          return { reject: 'bad_test' };
        }
        const run = callOnFresh(solution, task.name, args, false);
        if (!run.ok) return { reject: hitLimit(run.error) ? 'ran_too_long' : 'did_not_run' };
        // Eine Funktion, die nichts zurückgibt, ist hier keine Aufgabe: „return, nicht print".
        if (run.value === null) return { reject: 'did_not_run' };
        let shown: string;
        try {
          shown = repr(run.value, 1);
        } catch {
          return { reject: 'did_not_run' };
        }
        // Die Probe, und streng: dieselbe Darstellung, nicht bloß gleich (`2` ist nicht `2.0`).
        if (repr(claimed, 1) !== shown) return { reject: 'expected_disagrees' };
        if (shown.length > 60 || shown.includes('$')) return { reject: 'bad_test' };
        if (callText(task.name, args).includes('$')) return { reject: 'bad_test' };
        results.push({ args, result: run.value });
      }
      const distinct = new Set(results.map((r) => callText(task.name, r.args)));
      if (distinct.size < 3) return { reject: 'tests_not_distinct' };
      const signature = `${task.name}(${task.params.join(', ')})`;
      const first = results[0] as { args: Value[]; result: Value };
      const prompt = text(locale, 'write_prompt', { signature, statement: task.statement.trim() });
      if (prompt.length > 600) return { reject: 'display' };
      return {
        item: {
          ...COMMON,
          code_task: { ...task, solution },
          kind: 'long',
          prompt,
          answer: solution,
          topic: text(locale, 'topic_functions'),
          difficulty: 3,
          // Die Beispiele als Code, nicht als Satz: zwei Aufrufe mit dem, was herauskommt — aus
          // dem Lauf der Musterlösung, und so, wie man es in Python selbst notieren würde.
          figure: figureOf(examplesOf(task.name, results.slice(0, 2)), false),
          hints: [
            text(locale, 'hint_example', {
              call: callText(task.name, first.args),
              result: repr(first.result, 1),
            }),
            text(locale, 'hint_return'),
          ],
          worked_solution: text(locale, 'worked_write'),
        },
      };
    }
  }
}

/** Ein Fehler beim Lesen oder Ausführen, als Grund, keine Frage zu schreiben. */
function rejectOf(e: PyError): RejectReason {
  if (e.kind === 'unsupported') return 'unsupported';
  if (e.kind === 'too_long') return 'too_long';
  if (e.kind === 'syntax' || e.kind === 'indent') return 'not_python';
  if (hitLimit(e)) return 'ran_too_long';
  return 'did_not_run';
}

/** Ein Lesefehler wird zu einem Ablehnungsgrund; alles andere läuft durch. */
function guarded<T>(fn: () => T): T | { reject: RejectReason } {
  try {
    return fn();
  } catch (e) {
    if (e instanceof PyError) return { reject: rejectOf(e) };
    throw e;
  }
}

const BUILTIN_NAMES = new Set([
  'print',
  'len',
  'range',
  'int',
  'float',
  'str',
  'bool',
  'abs',
  'min',
  'max',
  'sum',
  'sorted',
  'list',
  'tuple',
  'dict',
  'enumerate',
  'zip',
  'reversed',
  'round',
  'chr',
  'ord',
  'any',
  'all',
  'repr',
  'input',
  'type',
  'map',
  'filter',
  'set',
  'open',
  'id',
  'pow',
  'divmod',
]);

function shadowsBuiltin(name: string): boolean {
  return BUILTIN_NAMES.has(name);
}

/** Die Frage, oder null — nie eine, deren Schlüssel nicht aus einer Ausführung kommt. */
export function codeItem(task: CodeTask, locale: string): CodeItem | null {
  const built = buildCodeItem(task, locale);
  return 'item' in built ? built.item : null;
}

/** Die Aufgaben eines vorbereiteten Satzes als Fragen; was nicht läuft, ergibt nichts. */
export function codeItems(tasks: readonly CodeTask[], locale: string): CodeItem[] {
  return tasks.slice(0, MAX_CODE_ITEMS).flatMap((task) => {
    const item = codeItem(task, locale);
    return item ? [item] : [];
  });
}

/** Die gespeicherte Aufgabe, nachsichtig gelesen: was nicht passt, ist keine. */
export function codeTaskOf(stored: unknown): CodeTask | null {
  if (stored === null || stored === undefined) return null;
  const parsed = CodeTask.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

/** Die Fläche, auf der sie antwortet. Sie verrät nichts, was nicht schon in der Frage steht. */
export function codeSurfaceOf(task: CodeTask): CodeLineSurface | CodeTypeSurface {
  switch (task.task) {
    case 'predict_output':
      return { mode: 'code_type', purpose: 'output', starter: '' };
    case 'find_error':
      return {
        mode: 'code_line',
        lines: Math.min(clean(task.program).split('\n').length, CODE_PICK_LINES_MAX),
      };
    case 'write_function':
      return {
        mode: 'code_type',
        purpose: 'program',
        starter: `def ${task.name}(${task.params.join(', ')}):\n    `,
      };
  }
}

// ─────────────── ihre Antwort prüfen ───────────────

/** Wo es bei ihrer Antwort hakt — EINE Stelle, wie bei Notenzeile und mehrteiligen Antworten. */
export type CodeFault =
  // Ausgabe
  | { at: 'output_line'; line: number; hint: 'case' | 'quotes' | null }
  | { at: 'output_count'; more: boolean }
  // Fehlerzeile
  | { at: 'line' }
  // eigenes Programm
  | { at: 'program'; error: PyError }
  | { at: 'missing'; name: string }
  | { at: 'params'; signature: string }
  | {
      at: 'test';
      call: string;
      expected: string;
      outcome: { got: string } | { printed: true } | { none: true } | { error: PyError };
    };

export type CodeCheck = {
  /** Wie viel hält: Zeilen von vorne, oder bestandene Tests. */
  held: number;
  total: number;
  verdict: 'correct' | 'partly' | 'wrong';
  fault: CodeFault | null;
};

/** Eine Zeilennummer, wie die Fläche sie schickt: nur Ziffern. */
export function pickedLine(text: string): number | null {
  const m = /^\s*([0-9]{1,2})\s*$/.exec(text);
  return m ? Number(m[1]) : null;
}

/**
 * Ihre Antwort gegen die Aufgabe. Kein Modell, in keinem Zweig. Null heißt nur: bei der
 * Fehlerzeile kam keine Zeilennummer an — eine Form, die die Frage nicht angeboten hat; der
 * Aufrufer lehnt sie als ungültige Anfrage ab.
 */
export function checkCode(stored: CodeTask, answer: string): CodeCheck | null {
  switch (stored.task) {
    case 'predict_output': {
      // Der Schlüssel wird hier NEU ausgeführt, nicht aus `items.answer` gelesen: dieselbe Quelle,
      // die die Frage geschrieben hat, und ein Test sieht, dass beide übereinstimmen.
      const run = execute(clean(stored.program), TRACE_LIMITS);
      const wanted = outputLines(run.output);
      const given = outputLines(answer);
      let held = 0;
      while (held < wanted.length && held < given.length && wanted[held] === given[held]) held++;
      const whole = held === wanted.length && given.length === wanted.length;
      const verdict = whole ? 'correct' : held > 0 ? 'partly' : 'wrong';
      const base = { held, total: wanted.length, verdict } as const;
      if (whole) return { ...base, fault: null };
      if (held === Math.min(wanted.length, given.length)) {
        return { ...base, fault: { at: 'output_count', more: given.length < wanted.length } };
      }
      const w = wanted[held] as string;
      const g = given[held] as string;
      const hint =
        w.toLowerCase() === g.toLowerCase()
          ? 'case'
          : g.replace(/^["'„“‚‘]|["'“”‘’]$/g, '') === w
            ? 'quotes'
            : null;
      return { ...base, fault: { at: 'output_line', line: held + 1, hint } };
    }
    case 'find_error': {
      const picked = pickedLine(answer);
      const program = clean(stored.program);
      if (picked === null || picked < 1 || picked > program.split('\n').length) return null;
      const run = execute(program, TRACE_LIMITS);
      const right = run.error !== null && picked === run.error.line;
      return {
        held: right ? 1 : 0,
        total: 1,
        verdict: right ? 'correct' : 'wrong',
        fault: right ? null : { at: 'line' },
      };
    }
    case 'write_function':
      return checkFunction(stored, answer);
  }
}

function checkFunction(
  task: Extract<CodeTask, { task: 'write_function' }>,
  answer: string,
): CodeCheck {
  const total = task.tests.length;
  const wrong = (fault: CodeFault): CodeCheck => ({ held: 0, total, verdict: 'wrong', fault });
  // Ihr Programm darf typografische Anführungszeichen tragen (`curly`): die setzt ihre Tastatur.
  const shape = defined(answer, task.name, true);
  if (shape instanceof PyError) return wrong({ at: 'program', error: shape });
  if (shape === null) return wrong({ at: 'missing', name: task.name });
  if (shape.params !== task.params.length) {
    return wrong({ at: 'params', signature: `${task.name}(${task.params.join(', ')})` });
  }
  const solution = clean(task.solution);
  let passed = 0;
  let first: CodeFault | null = null;
  for (const c of task.tests) {
    const args = parseArgs(c.args) ?? [];
    const want = callOnFresh(solution, task.name, args, false);
    if (!want.ok) continue; // kann nicht passieren: die Frage entstand nur, wenn das hier lief
    const mine = callOnFresh(answer, task.name, parseArgs(c.args) ?? [], true);
    const call = callText(task.name, args);
    const expected = repr(want.value, 1);
    if (mine.ok && sameResult(want.value, mine.value)) {
      passed++;
      continue;
    }
    if (first !== null) continue;
    if (!mine.ok) first = { at: 'test', call, expected, outcome: { error: mine.error } };
    else if (mine.value === null) {
      first = {
        at: 'test',
        call,
        expected,
        outcome: mine.printed ? { printed: true } : { none: true },
      };
    } else {
      let got: string;
      try {
        got = repr(mine.value, 1);
      } catch {
        got = '…';
      }
      first = { at: 'test', call, expected, outcome: { got } };
    }
  }
  const verdict = passed === total ? 'correct' : passed > 0 ? 'partly' : 'wrong';
  return { held: passed, total, verdict, fault: first };
}

// ─────────────── Rückmeldung ───────────────

/** Ihre Antwort, wie sie im Gesprächsfaden steht — die angetippte Zeile in Worten. */
export function writtenCode(locale: string, task: CodeTask, answer: string): string | null {
  if (task.task !== 'find_error') return null;
  const line = pickedLine(answer);
  return line === null ? null : text(locale, 'line_named', { line });
}

/**
 * Die Rückmeldung auf eine Antwort, die noch nicht stimmt — von Code, aus dem echten Lauf.
 * Bei der Ausgabe ab dem zweiten Versuch mit der Stelle (dieselbe Leiter wie bei der Notenzeile);
 * bei einer Funktion sofort mit dem ersten Test, der scheitert: das ist die Rückmeldung, die ein
 * Testlauf gibt, und ohne sie wäre „2 von 4" ein Rätsel.
 */
export function codeReply(locale: string, check: CodeCheck, attempts: number): string {
  const fault = check.fault;
  if (fault === null) return text(locale, 'line_again');
  switch (fault.at) {
    case 'line':
      return text(locale, 'line_again');
    case 'output_count':
    case 'output_line': {
      const counts = { held: String(check.held), total: String(check.total), count: check.held };
      const held =
        check.held > 0 ? text(locale, 'output_held', counts) : text(locale, 'output_held_none');
      if (fault.at === 'output_line' && fault.hint !== null) {
        return `${held} ${text(locale, fault.hint === 'case' ? 'output_case' : 'output_quotes', { line: fault.line })}`;
      }
      if (attempts === 0) return held;
      if (fault.at === 'output_count') {
        return `${held} ${text(locale, fault.more ? 'output_more' : 'output_fewer')}`;
      }
      return `${held} ${text(locale, 'output_fault_line', { line: fault.line })}`;
    }
    case 'program':
      return text(locale, 'program_error', {
        line: fault.error.line,
        reason: reasonOf(locale, fault.error),
      });
    case 'missing':
      return text(locale, 'missing_function', { name: fault.name });
    case 'params':
      return text(locale, 'wrong_params', { signature: fault.signature });
    case 'test': {
      const passed = text(locale, 'tests_passed', { passed: check.held, total: check.total });
      const o = fault.outcome;
      const detail =
        'got' in o
          ? text(locale, 'test_failed', { call: fault.call, expected: fault.expected, got: o.got })
          : 'printed' in o
            ? text(locale, 'test_printed', { call: fault.call })
            : 'none' in o
              ? text(locale, 'test_none', { call: fault.call })
              : text(locale, 'test_error', {
                  call: fault.call,
                  line: o.error.line,
                  reason: reasonOf(locale, o.error),
                });
      return `${passed} ${detail}`;
    }
  }
}

/** Die Zeile über ein bestandenes Programm: wie viele Tests, damit „richtig" einen Inhalt hat. */
export function codePassed(locale: string, check: CodeCheck, task: CodeTask): string | null {
  return task.task === 'write_function' ? text(locale, 'tests_all', { total: check.total }) : null;
}
