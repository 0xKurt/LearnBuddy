// Python for the Informatik questions (issue #262, docs/architecture.md §Informatik): Skulpt (MIT),
// a Python 3 interpreter written in JavaScript, running INSIDE the QuickJS sandbox (`quickjs.ts`).
// Skulpt is the language, QuickJS the wall: whatever a program reaches through Skulpt — even its
// `jseval` — is the empty JavaScript world of a fresh QuickJS runtime, never this server.
//
// Two jobs, both deterministic:
//   · `runProgram` — a whole program: what it printed, and the Python error it stopped with
//     (its type and the line), or the limit that ended it;
//   · `runFunction` — a program that defines a function, called on test cases: per case the
//     value's repr, whether it equals the expected value (Python's ==, floats with a relative
//     tolerance like `math.isclose`), whether it printed, or the error.
//
// Imports: `math` and nothing else (and `sys`, which `print` needs). No `input()`, no `random`,
// no `time` — a question whose program reads, draws lots or looks at the clock has no key.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { runIsolated, type SandboxLimit, type SandboxLimits } from './quickjs.js';

/** The Python error a run stopped with: its type ("ZeroDivisionError") and the line, 1-based. */
export type PyError = { type: string; line: number | null; message: string };

/** How a run ended when it did not end by itself: a limit, or output past `OUTPUT_MAX`. */
type PyLimit = SandboxLimit | 'output';

export type ProgramRun =
  | { kind: 'ran'; output: string; error: PyError | null }
  | { kind: 'limit'; limit: PyLimit };

type CallResult =
  | { kind: 'value'; repr: string; same: boolean; printed: boolean }
  | { kind: 'none'; printed: boolean }
  | { kind: 'error'; error: PyError };

export type FunctionRun =
  | { kind: 'module_error'; error: PyError }
  | { kind: 'missing' }
  | { kind: 'ran'; params: number; results: CallResult[] }
  | { kind: 'limit'; limit: PyLimit };

/** One test case: the arguments and the expected value, both as Python literals. */
export type PyCase = { args: string; expected: string };

/** More output than any question needs: past it the run is a limit, not an answer. */
const OUTPUT_MAX = 4_000;

/** A program she reads or writes for school runs in milliseconds; a second is a loop that hangs. */
const PROGRAM_LIMITS: SandboxLimits = { ms: 1_500, memory: 48 * 1024 * 1024 };
/** Her function on all test cases at once (at most six), the interpreter's start included. */
export const FUNCTION_LIMITS: SandboxLimits = { ms: 2_500, memory: 64 * 1024 * 1024 };

const require = createRequire(import.meta.url);

type Sources = { skulpt: string; files: string };
let sources: Sources | null = null;

/** Skulpt and the two library modules a program may import, read once per process. */
function skulptSources(): Sources {
  if (sources) return sources;
  const skulpt = readFileSync(require.resolve('skulpt/dist/skulpt.min.js'), 'utf8');
  const stdlib = readFileSync(require.resolve('skulpt/dist/skulpt-stdlib.js'), 'utf8');
  const all = (
    JSON.parse(stdlib.slice(stdlib.indexOf('{'), stdlib.lastIndexOf('}') + 1)) as {
      files: Record<string, string>;
    }
  ).files;
  const allowed: Record<string, string> = {};
  for (const path of ['src/builtin/sys.js', 'src/lib/math.js']) {
    const file = all[path];
    if (file === undefined) throw new Error(`skulpt stdlib lacks ${path}`);
    allowed[path] = file;
  }
  sources = { skulpt, files: JSON.stringify(allowed) };
  return sources;
}

/**
 * The part of the job every run shares (JavaScript, evaluated INSIDE the sandbox after Skulpt):
 * output into a bounded buffer, imports only from the allowed files, `input()` refused, and an
 * error turned into {type, line, message}. Skulpt lists the frames innermost first; the line is
 * the innermost one in the program, where Python itself would point.
 *
 * Skulpt's two bridges into JavaScript (`jseval`, `jsmillis`) are removed before any program
 * runs: the wall around the server is QuickJS, but the JavaScript of the JOB — which checks her
 * function and writes the result — lives inside it too, and a program that could rewrite it
 * could report any test as passed (PR #536 review). Without them Python reaches no JavaScript.
 *
 * `__plain` reads a value as the check compares it, in JavaScript her program cannot touch: only
 * Python's plain types, each by its EXACT type (a subclass or an object with its own `__eq__` is
 * no plain value), at most 2 000 parts and 20 levels deep (a list that holds itself is not one).
 */
const PRELUDE = `
delete Sk.builtins.jseval;
delete Sk.builtins.jsmillis;
var __none = Sk.builtin.none.none$;
function __plain(value) {
  var nodes = 0;
  function walk(v, depth) {
    if (v === undefined || v === null || ++nodes > 2000 || depth > 20) return null;
    if (v === __none) return { none: true };
    var t = v.ob$type;
    if (t === Sk.builtin.bool) return { bool: v === Sk.builtin.bool.true$ };
    if (t === Sk.builtin.int_) return { int: String(Sk.misceval.objectRepr(v)) };
    if (t === Sk.builtin.float_) return { float: String(v.v) };
    if (t === Sk.builtin.str) return { str: v.v };
    if (t === Sk.builtin.list || t === Sk.builtin.tuple) {
      var items = [];
      for (var i = 0; i < v.v.length; i++) {
        var item = walk(v.v[i], depth + 1);
        if (item === null) return null;
        items.push(item);
      }
      return t === Sk.builtin.list ? { list: items } : { tuple: items };
    }
    if (t === Sk.builtin.dict) {
      var pairs = v.$items();
      var entries = [];
      for (var j = 0; j < pairs.length; j++) {
        var key = walk(pairs[j][0], depth + 1);
        var val = walk(pairs[j][1], depth + 1);
        if (key === null || val === null) return null;
        entries.push([key, val]);
      }
      return { dict: entries };
    }
    return null;
  }
  return walk(value, 0);
}
function __repr(v) {
  try { return String(Sk.misceval.objectRepr(v)).slice(0, 200); } catch (e) { return '?'; }
}
var __out = '';
var __over = false;
var __files = JSON.parse(FILES);
var __max = Number(OUTPUT_MAX);
Sk.configure({
  output: function (t) {
    if (__out.length + t.length > __max) { __over = true; throw new Error('output'); }
    __out += t;
  },
  read: function (f) {
    if (Object.prototype.hasOwnProperty.call(__files, f)) return __files[f];
    throw new Error('no such module');
  },
  inputfun: function () { throw new Error('input'); },
  inputfunTakesPrompt: true,
  __future__: Sk.python3
});
function __failure(e) {
  if (e instanceof Sk.builtin.BaseException) {
    var tb = e.traceback || [];
    var line = null;
    for (var i = 0; i < tb.length; i++) {
      if (typeof tb[i].lineno === 'number') { line = tb[i].lineno; break; }
    }
    var message = '';
    try { message = e.args && e.args.v && e.args.v.length ? String(e.args.v[0].v) : ''; } catch (x) {}
    return { type: e.tp$name, line: line, message: message };
  }
  return { type: 'InternalError', line: null, message: String(e && e.message || e) };
}
`;

const PROGRAM_JOB = `
(function () {
  try {
    Sk.importMainWithBody('programm', false, SOURCE, false);
    return JSON.stringify({ kind: 'ran', output: __out, error: null });
  } catch (e) {
    if (__over) return JSON.stringify({ kind: 'limit', limit: 'output' });
    return JSON.stringify({ kind: 'ran', output: __out, error: __failure(e) });
  }
})()
`;

/**
 * The tests are read BEFORE her program is loaded, their expected values as plain values: nothing
 * her program does later changes them. Per call the job hands back the value as a plain value
 * (`__plain`) and its repr for the reply; the comparison itself is `samePlain`, outside the engine.
 */
const FUNCTION_JOB = `
(function () {
  var harness = Sk.importMainWithBody('pruefung', false, HARNESS, false);
  var cases = harness.$d.__cases__.v.map(function (c) {
    return { args: c.v[0].v, expected: __plain(c.v[1]) };
  });
  var mod;
  try {
    mod = Sk.importMainWithBody('loesung', false, SOURCE, false);
  } catch (e) {
    if (__over) return JSON.stringify({ kind: 'limit', limit: 'output' });
    return JSON.stringify({ kind: 'module_error', error: __failure(e) });
  }
  var fn = mod.$d[NAME];
  if (!(fn instanceof Sk.builtin.func)) return JSON.stringify({ kind: 'missing' });
  var code = fn.func_code;
  var params = code && code.co_varnames ? code.co_varnames.length : -1;
  var results = [];
  for (var i = 0; i < cases.length; i++) {
    var before = __out.length;
    var value;
    try {
      value = Sk.misceval.callsimArray(fn, cases[i].args);
    } catch (e) {
      if (__over) return JSON.stringify({ kind: 'limit', limit: 'output' });
      results.push({ kind: 'error', error: __failure(e) });
      continue;
    }
    var printed = __out.length > before;
    if (value === __none) { results.push({ kind: 'none', printed: printed }); continue; }
    var repr = __repr(value);
    if (__over) return JSON.stringify({ kind: 'limit', limit: 'output' });
    results.push({ kind: 'value', repr: repr, value: __plain(value), printed: printed });
  }
  var expected = cases.map(function (c) { return c.expected; });
  return JSON.stringify({ kind: 'ran', params: params, expected: expected, results: results });
})()
`;

/** A value as the check compares it (`__plain`): Python's plain types, each by its exact type. */
type Plain =
  | { none: true }
  | { bool: boolean }
  | { int: string }
  | { float: string }
  | { str: string }
  | { list: Plain[] }
  | { tuple: Plain[] }
  | { dict: Array<[Plain, Plain]> };

function numberOf(p: Plain): number | null {
  if ('int' in p) return Number(p.int);
  return 'float' in p ? Number(p.float) : null;
}

const sameItems = (a: readonly Plain[], b: readonly Plain[]): boolean =>
  a.length === b.length && a.every((x, i) => samePlain(x, b[i]!));

/**
 * Equality as a test checks it: Python's ==, but True is not 1, a list is not a tuple, and floats
 * are equal within a relative tolerance (0.1 + 0.2 is 0.3 computed another way) — at every depth.
 */
function samePlain(a: Plain, b: Plain): boolean {
  if ('int' in a && 'int' in b) return a.int === b.int;
  const x = numberOf(a);
  const y = numberOf(b);
  if (x !== null || y !== null) {
    if (x === null || y === null) return false;
    return Math.abs(x - y) <= Math.max(1e-9 * Math.max(Math.abs(x), Math.abs(y)), 1e-12);
  }
  if ('none' in a) return 'none' in b;
  if ('bool' in a) return 'bool' in b && a.bool === b.bool;
  if ('str' in a) return 'str' in b && a.str === b.str;
  if ('list' in a) return 'list' in b && sameItems(a.list, b.list);
  if ('tuple' in a) return 'tuple' in b && sameItems(a.tuple, b.tuple);
  return (
    'dict' in a &&
    'dict' in b &&
    a.dict.length === b.dict.length &&
    a.dict.every(([k, v]) => b.dict.some(([k2, v2]) => samePlain(k, k2) && samePlain(v, v2)))
  );
}

async function run(job: string, globals: Record<string, string>, limits: SandboxLimits) {
  const { skulpt, files } = skulptSources();
  const result = await runIsolated(
    [
      { name: 'skulpt.js', code: skulpt },
      { name: 'prelude.js', code: PRELUDE },
      { name: 'job.js', code: job },
    ],
    { FILES: files, OUTPUT_MAX: String(OUTPUT_MAX), ...globals },
    limits,
  );
  if ('limit' in result) return { kind: 'limit', limit: result.limit } as const;
  // Not a Python error and not a limit: the sandbox itself failed. Never an answer about her code.
  if ('failed' in result) throw new Error(`python sandbox: ${result.failed}`);
  return JSON.parse(result.json) as unknown;
}

/**
 * The engine ran out of its memory limit. Skulpt catches the engine's error and hands it on as a
 * Python `ExternalError` ("InternalError: out of memory") — or, when even that cannot be built,
 * the job reports an error that is no Python exception at all. Both are the limit, not her bug.
 */
function exhausted(error: PyError | null): boolean {
  if (error === null) return false;
  return /out of memory/i.test(error.message) || error.type === 'InternalError';
}

const MEMORY: { kind: 'limit'; limit: PyLimit } = { kind: 'limit', limit: 'memory' };

/** Runs a whole program: what it printed and the error it stopped with. */
export async function runProgram(
  source: string,
  limits: SandboxLimits = PROGRAM_LIMITS,
): Promise<ProgramRun> {
  const result = (await run(PROGRAM_JOB, { SOURCE: source }, limits)) as ProgramRun;
  return result.kind === 'ran' && exhausted(result.error) ? MEMORY : result;
}

/**
 * Loads a program that defines `name` and calls it on every case. The cases are Python literals,
 * checked by the caller (`isLiteral`), so building them into the harness runs nothing of theirs.
 */
export async function runFunction(
  source: string,
  name: string,
  cases: readonly PyCase[],
  limits: SandboxLimits = FUNCTION_LIMITS,
): Promise<FunctionRun> {
  const list = cases.map((c) => `((${c.args},), ${c.expected})`).join(', ');
  const harness = `__cases__ = [${list}]\n`;
  const result = (await run(
    FUNCTION_JOB,
    { SOURCE: source, NAME: name, HARNESS: harness },
    limits,
  )) as JobRun;
  if (result.kind === 'module_error' && exhausted(result.error)) return MEMORY;
  if (result.kind !== 'ran') return result;
  if (result.results.some((r) => r.kind === 'error' && exhausted(r.error))) return MEMORY;
  const results = result.results.map((r, i): CallResult => {
    if (r.kind !== 'value') return r;
    const expected = result.expected[i] ?? null;
    const same = expected !== null && r.value !== null && samePlain(expected, r.value);
    return { kind: 'value', repr: r.repr, same, printed: r.printed };
  });
  return { kind: 'ran', params: result.params, results };
}

/** What `FUNCTION_JOB` hands back: values as plain values (null: none), compared here. */
type JobRun =
  | Exclude<FunctionRun, { kind: 'ran' }>
  | {
      kind: 'ran';
      params: number;
      expected: Array<Plain | null>;
      results: Array<
        | Exclude<CallResult, { kind: 'value' }>
        | { kind: 'value'; repr: string; value: Plain | null; printed: boolean }
      >;
    };

// ─────────────── literals ───────────────

/** One token of a Python literal: a string, a number, a constant or a bracket, comma or colon. */
const LITERAL_TOKEN =
  /\s*(?:'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?|True\b|False\b|None\b|[[\](){},:])/y;

/**
 * Is this a Python literal and nothing else — numbers, strings, True/False/None, lists, tuples
 * and dicts of them, brackets balanced? A test's arguments and expected value are built into the
 * harness as source, so anything else (a call, a name) is refused before it could run.
 *
 * Two values never stand side by side: `"a" "b"` is one string to Python, `(1)(2)` a call — and
 * `''' ' '''` is ONE triple-quoted string to Python where the tokens here see three, so code
 * between two such runs would run (PR #536 review).
 */
export function isLiteral(source: string): boolean {
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  const open: string[] = [];
  LITERAL_TOKEN.lastIndex = 0;
  let at = 0;
  let tokens = 0;
  let afterValue = false;
  while (at < source.length) {
    if (source.slice(at).trim() === '') break;
    LITERAL_TOKEN.lastIndex = at;
    const m = LITERAL_TOKEN.exec(source);
    if (!m) return false;
    const token = m[0].trim();
    const separator = token === ',' || token === ':';
    const opening = token === '(' || token === '[' || token === '{';
    if (afterValue && !separator && !(token in pairs)) return false;
    afterValue = !separator && !opening;
    if (opening) open.push(token);
    else if (token in pairs && open.pop() !== pairs[token]) return false;
    at = LITERAL_TOKEN.lastIndex;
    tokens++;
  }
  return tokens > 0 && open.length === 0;
}
