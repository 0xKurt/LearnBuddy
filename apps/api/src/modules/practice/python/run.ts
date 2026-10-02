// Der Interpreter der Lehr-Teilmenge von Python (issue #262).
//
// ─────────────── Warum er sicher ist ───────────────
//
// Er führt nichts aus außer dem Baum, den `parse.ts` gebaut hat, und dieser Baum kann nur
// benennen, was hier steht. Es gibt keinen Weg hinaus, weil es keine Tür gibt — nicht, weil eine
// Tür bewacht wird:
//   · kein `eval`, kein `new Function`, kein `import()`, kein `require` — nirgends in diesem
//     Ordner (`__tests__/python.test.ts` prüft den Quelltext darauf);
//   · Werte sind eigene, getaggte Objekte (`values.ts`). Ein Attribut wird NIE per Name auf einem
//     JavaScript-Objekt nachgeschlagen (`obj[name]`): Methoden sind ein `switch` über feste
//     Namen. `__class__`, `__globals__`, `constructor` und `__proto__` sind darum einfach
//     unbekannte Namen, und ein Dict ist eine `Map`, deren Schlüssel nie Eigenschaften werden;
//   · keine Ein- und Ausgabe außer `print` in einen Puffer: kein `open`, kein `input`, kein Netz,
//     keine Uhr, kein Zufall — der Lauf ist eine reine Funktion seiner Quelle.
//
// Was bleibt, sind Ressourcen, und die sind gezählt, nicht gemessen (keine Uhr, Regel 7): jeder
// Knoten kostet einen Schritt (`steps`), jedes erzeugte Element und Zeichen eine Einheit
// (`memory`), jede Ausgabe ihre Länge (`output`), jeder Aufruf eine Ebene (`depth`), und eine
// ganze Zahl darf nicht über 2^1024 wachsen. Ein Lauf endet also nach einer festen, kleinen
// Arbeit — auch eine Endlosschleife, auch `"a" * 10**9`, auch eine Rekursion ohne Ende. Die
// Grenzen und was sie in Millisekunden bedeuten, stehen in `docs/architecture.md` §Informatik.

import type { BinOpName, CmpOp, Expr, Program, Stmt, Target } from './ast.js';
import { PyError } from './errors.js';
import {
  cmp,
  eq,
  finite,
  floatRepr,
  formatFixed,
  hashKey,
  isNumber,
  numeric,
  rangeAt,
  rangeLength,
  repr,
  roundFloat,
  roundToInt,
  str,
  toFloat,
  truthy,
  type PyDict,
  type PyFunc,
  type PyIter,
  type PyList,
  type PyRange,
  type PyTuple,
  type Value,
} from './values.js';

export type Limits = {
  /** Wie viele Schritte (Knoten, Schleifendurchläufe, Elemente) ein Lauf machen darf. */
  steps: number;
  /** Wie viele Elemente und Zeichen ein Lauf insgesamt erzeugen darf. */
  memory: number;
  /** Wie viele Zeichen `print` insgesamt schreiben darf. */
  output: number;
  /** Wie tief Funktionsaufrufe geschachtelt sein dürfen. */
  depth: number;
};

/**
 * Die Grenzen eines Laufs. Gerechnet für Schulprogramme: eine Schleife über tausend Zahlen mit
 * ein paar Operationen kostet etwa 20 000 Schritte, `fib(15)` rekursiv etwa 40 000.
 */
export const DEFAULT_LIMITS: Limits = {
  steps: 200_000,
  memory: 100_000,
  output: 4_000,
  depth: 40,
};

/** Der größte Betrag einer ganzen Zahl: 2^1024 (309 Stellen). */
const INT_LIMIT = 1n << 1024n;
/** Die längste einzelne Zeichenkette oder Liste. */
const SEQ_MAX = 20_000;

/**
 * Die eingebauten Funktionen, die diese Teilmenge KENNT. Alle anderen Namen, die echtes Python
 * eingebaut hat, stehen in `PYTHON_BUILTINS` und enden in `unsupported` statt in einem NameError.
 */
const BUILTINS: ReadonlySet<string> = new Set([
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
]);

/** Alles, was echtes Python 3.11 eingebaut hat — damit `input` kein NameError ist. */
const PYTHON_BUILTINS: ReadonlySet<string> = new Set([
  'abs',
  'aiter',
  'all',
  'anext',
  'any',
  'ascii',
  'bin',
  'bool',
  'breakpoint',
  'bytearray',
  'bytes',
  'callable',
  'chr',
  'classmethod',
  'compile',
  'complex',
  'copyright',
  'credits',
  'delattr',
  'dict',
  'dir',
  'divmod',
  'enumerate',
  'eval',
  'exec',
  'exit',
  'filter',
  'float',
  'format',
  'frozenset',
  'getattr',
  'globals',
  'hasattr',
  'hash',
  'help',
  'hex',
  'id',
  'input',
  'int',
  'isinstance',
  'issubclass',
  'iter',
  'len',
  'license',
  'list',
  'locals',
  'map',
  'max',
  'memoryview',
  'min',
  'next',
  'object',
  'oct',
  'open',
  'ord',
  'pow',
  'print',
  'property',
  'quit',
  'range',
  'repr',
  'reversed',
  'round',
  'set',
  'setattr',
  'slice',
  'sorted',
  'staticmethod',
  'str',
  'sum',
  'super',
  'tuple',
  'type',
  'vars',
  'zip',
  '__import__',
  '__build_class__',
  '__name__',
  '__debug__',
  '__doc__',
  '__spec__',
  '__loader__',
  '__package__',
  '__builtins__',
  'Exception',
  'BaseException',
  'ValueError',
  'TypeError',
  'KeyError',
  'IndexError',
  'NameError',
  'ZeroDivisionError',
  'RuntimeError',
  'StopIteration',
  'ArithmeticError',
  'AssertionError',
  'AttributeError',
  'LookupError',
  'OverflowError',
  'RecursionError',
  'NotImplemented',
  'NotImplementedError',
  'Ellipsis',
  'OSError',
  'IOError',
  'EOFError',
  'ImportError',
  'ModuleNotFoundError',
  'KeyboardInterrupt',
  'SystemExit',
  'UnboundLocalError',
]);

/** Methoden, die es in Python gibt — damit eine fehlende `unsupported` heißt und nicht AttributeError. */
const PY_METHODS: Record<'str' | 'list' | 'dict' | 'tuple' | 'number', ReadonlySet<string>> = {
  str: new Set([
    'capitalize',
    'casefold',
    'center',
    'count',
    'encode',
    'endswith',
    'expandtabs',
    'find',
    'format',
    'format_map',
    'index',
    'isalnum',
    'isalpha',
    'isascii',
    'isdecimal',
    'isdigit',
    'isidentifier',
    'islower',
    'isnumeric',
    'isprintable',
    'isspace',
    'istitle',
    'isupper',
    'join',
    'ljust',
    'lower',
    'lstrip',
    'maketrans',
    'partition',
    'removeprefix',
    'removesuffix',
    'replace',
    'rfind',
    'rindex',
    'rjust',
    'rpartition',
    'rsplit',
    'rstrip',
    'split',
    'splitlines',
    'startswith',
    'strip',
    'swapcase',
    'title',
    'translate',
    'upper',
    'zfill',
  ]),
  list: new Set([
    'append',
    'clear',
    'copy',
    'count',
    'extend',
    'index',
    'insert',
    'pop',
    'remove',
    'reverse',
    'sort',
  ]),
  dict: new Set([
    'clear',
    'copy',
    'fromkeys',
    'get',
    'items',
    'keys',
    'pop',
    'popitem',
    'setdefault',
    'update',
    'values',
  ]),
  tuple: new Set(['count', 'index']),
  number: new Set([
    'as_integer_ratio',
    'bit_count',
    'bit_length',
    'conjugate',
    'denominator',
    'from_bytes',
    'fromhex',
    'hex',
    'imag',
    'is_integer',
    'numerator',
    'real',
    'to_bytes',
  ]),
};

type Signal = undefined | 'break' | 'continue' | { ret: Value };

type Frame = { locals: Map<string, Value> | null; func: PyFunc | null };

type Kw = Array<{ name: string; value: Value }>;

export class Machine {
  private steps = 0;
  private memory = 0;
  private depth = 0;
  private out = '';
  readonly globals = new Map<string, Value>();

  constructor(private readonly limits: Limits = DEFAULT_LIMITS) {}

  /** Was `print` bisher geschrieben hat. */
  get output(): string {
    return this.out;
  }

  /** Ein neues Schrittbudget, z. B. für den nächsten Testfall; Speicher und Ausgabe zählen weiter. */
  resetSteps(): void {
    this.steps = 0;
  }

  private tick(line: number, n = 1): void {
    this.steps += n;
    if (this.steps > this.limits.steps) throw new PyError('steps', line);
  }

  private alloc(line: number, n: number): void {
    if (n > SEQ_MAX) throw new PyError('memory', line);
    this.memory += n;
    if (this.memory > this.limits.memory) throw new PyError('memory', line);
  }

  private int(v: bigint, line: number): bigint {
    if (v >= INT_LIMIT || v <= -INT_LIMIT) throw new PyError('number_too_big', line);
    return v;
  }

  private newStr(s: string, line: number): string {
    this.alloc(line, s.length);
    return s;
  }

  private newList(items: Value[], line: number): PyList {
    this.alloc(line, items.length + 1);
    return { t: 'list', items };
  }

  private newTuple(items: Value[], line: number): PyTuple {
    this.alloc(line, items.length + 1);
    return { t: 'tuple', items };
  }

  /** Führt ein Programm aus. Wirft `PyError`; die Ausgabe bis dahin steht in `output`. */
  run(program: Program): void {
    this.guard(() => {
      const sig = this.block(program.body, { locals: null, func: null });
      if (sig !== undefined) throw new PyError('syntax', 1);
    });
  }

  /** Ruft eine Funktion des geladenen Programms mit fertigen Werten auf (ein Testfall). */
  call(name: string, args: Value[], line = 1): Value {
    return this.guard(() => {
      const f = this.globals.get(name);
      if (f === undefined) throw new PyError('name', line, name);
      return this.callValue(f, args, [], line);
    });
  }

  /** Wertet einen einzelnen Ausdruck im globalen Rahmen aus (die Argumente eines Testfalls). */
  evaluate(x: Expr): Value {
    return this.guard(() => this.value(x, { locals: null, func: null }));
  }

  /**
   * Das letzte Netz: läuft der JavaScript-Stapel trotz aller Grenzen über, ist das eine Grenze
   * und kein Absturz des Servers. Es sollte nie greifen (`depth` und die Schachtelungsgrenze des
   * Parsers liegen weit darunter) — ein Test prüft, dass es auch dann hält.
   */
  private guard<T>(fn: () => T): T {
    try {
      return fn();
    } catch (e) {
      if (e instanceof RangeError) throw new PyError('recursion', 1);
      throw e;
    }
  }

  // ─────────────── Anweisungen ───────────────

  private block(body: readonly Stmt[], f: Frame): Signal {
    for (const s of body) {
      const sig = this.stmt(s, f);
      if (sig !== undefined) return sig;
    }
    return undefined;
  }

  private stmt(s: Stmt, f: Frame): Signal {
    this.tick(s.line);
    switch (s.s) {
      case 'expr':
        this.value(s.x, f);
        return undefined;
      case 'assign': {
        const v = this.value(s.value, f);
        for (const t of s.targets) this.assign(t, v, f);
        return undefined;
      }
      case 'aug': {
        const cur = this.readTarget(s.target, f);
        const rhs = this.value(s.value, f);
        // `liste += [x]` verändert DIESELBE Liste (wie `extend`), `liste = liste + [x]` nicht.
        if (s.op === '+' && isList(cur)) {
          const add = this.materialize(rhs, s.line);
          this.alloc(s.line, add.length);
          if (cur.items.length + add.length > SEQ_MAX) throw new PyError('memory', s.line);
          cur.items.push(...add);
          this.assign(s.target, cur, f);
          return undefined;
        }
        this.assign(s.target, this.binop(s.op, cur, rhs, s.line), f);
        return undefined;
      }
      case 'if':
        return this.block(truthy(this.value(s.test, f)) ? s.body : s.orelse, f);
      case 'while':
        while (truthy(this.value(s.test, f))) {
          const sig = this.block(s.body, f);
          if (sig === 'break') break;
          if (sig !== undefined && sig !== 'continue') return sig;
        }
        return undefined;
      case 'for': {
        const it = this.value(s.iter, f);
        for (const v of this.iterate(it, s.line)) {
          this.tick(s.line);
          this.assign(s.target, v, f);
          const sig = this.block(s.body, f);
          if (sig === 'break') break;
          if (sig !== undefined && sig !== 'continue') return sig;
        }
        return undefined;
      }
      case 'break':
      case 'continue':
        return s.s;
      case 'pass':
        return undefined;
      case 'def': {
        const fn: PyFunc = {
          t: 'func',
          name: s.name,
          params: s.params,
          body: s.body,
          locals: s.locals,
        };
        this.setName(s.name, fn, f);
        return undefined;
      }
      case 'return':
        return { ret: s.value === null ? null : this.value(s.value, f) };
    }
  }

  private setName(name: string, v: Value, f: Frame): void {
    if (f.locals !== null) f.locals.set(name, v);
    else this.globals.set(name, v);
  }

  private assign(t: Target, v: Value, f: Frame): void {
    switch (t.t) {
      case 'name':
        this.setName(t.id, v, f);
        return;
      case 'index': {
        const obj = this.value(t.obj, f);
        const key = this.value(t.index, f);
        this.setItem(obj, key, v, t.line);
        return;
      }
      case 'tuple': {
        const items = this.materialize(v, t.line);
        if (items.length !== t.items.length) throw new PyError('value', t.line);
        t.items.forEach((target, i) => this.assign(target, items[i] as Value, f));
        return;
      }
    }
  }

  private readTarget(t: Target, f: Frame): Value {
    switch (t.t) {
      case 'name':
        return this.lookup(t.id, f, t.line);
      case 'index':
        return this.getItem(this.value(t.obj, f), this.value(t.index, f), t.line);
      case 'tuple':
        throw new PyError('syntax', t.line);
    }
  }

  private lookup(name: string, f: Frame, line: number): Value {
    if (f.func !== null && f.func.locals.has(name)) {
      const v = f.locals?.get(name);
      if (v === undefined) throw new PyError('unbound_local', line, name);
      return v;
    }
    const g = this.globals.get(name);
    if (g !== undefined) return g;
    if (BUILTINS.has(name)) return { t: 'builtin', name };
    if (PYTHON_BUILTINS.has(name)) throw new PyError('unsupported', line, name);
    throw new PyError('name', line, name);
  }

  // ─────────────── Ausdrücke ───────────────

  private value(x: Expr, f: Frame): Value {
    this.tick(x.line);
    switch (x.e) {
      case 'int':
        return this.int(x.v, x.line);
      case 'float':
        return x.v;
      case 'str':
        return x.v;
      case 'fstr': {
        let s = '';
        for (const p of x.parts) {
          if (typeof p === 'string') s += p;
          else {
            const v = this.value(p.expr, f);
            if (p.digits === null) s += str(v, x.line);
            else {
              if (!isNumber(v)) throw new PyError('value', x.line);
              s += formatFixed(toFloat(numeric(v), x.line), p.digits);
            }
          }
          if (s.length > SEQ_MAX) throw new PyError('memory', x.line);
        }
        return this.newStr(s, x.line);
      }
      case 'const':
        return x.v;
      case 'name':
        return this.lookup(x.id, f, x.line);
      case 'list':
        return this.newList(
          x.items.map((i) => this.value(i, f)),
          x.line,
        );
      case 'tuple':
        return this.newTuple(
          x.items.map((i) => this.value(i, f)),
          x.line,
        );
      case 'dict': {
        const d: PyDict = { t: 'dict', map: new Map() };
        x.keys.forEach((k, i) => {
          const key = this.value(k, f);
          const val = this.value(x.values[i] as Expr, f);
          this.dictSet(d, key, val, x.line);
        });
        return d;
      }
      case 'bin':
        return this.binop(x.op, this.value(x.l, f), this.value(x.r, f), x.line);
      case 'unary': {
        const v = this.value(x.x, f);
        if (!isNumber(v)) throw new PyError('type', x.line);
        const n = numeric(v);
        if (x.op === '+') return n;
        return typeof n === 'bigint' ? this.int(-n, x.line) : -n;
      }
      case 'not':
        return !truthy(this.value(x.x, f));
      case 'bool': {
        const l = this.value(x.l, f);
        if (x.op === 'and') return truthy(l) ? this.value(x.r, f) : l;
        return truthy(l) ? l : this.value(x.r, f);
      }
      case 'cmp': {
        let left = this.value(x.first, f);
        for (const { op, x: rx } of x.rest) {
          const right = this.value(rx, f);
          if (!this.compare(op, left, right, x.line)) return false;
          left = right;
        }
        return true;
      }
      case 'ifexp':
        return truthy(this.value(x.test, f)) ? this.value(x.then, f) : this.value(x.else, f);
      case 'call': {
        const kwargs: Kw = x.kwargs.map((k) => ({ name: k.name, value: this.value(k.value, f) }));
        if (x.fn.e === 'attr') {
          const obj = this.value(x.fn.obj, f);
          const args = x.args.map((a) => this.value(a, f));
          return this.method(obj, x.fn.name, args, kwargs, x.line);
        }
        const fn = this.value(x.fn, f);
        const args = x.args.map((a) => this.value(a, f));
        return this.callValue(fn, args, kwargs, x.line);
      }
      case 'attr': {
        // Ein Attribut ohne Aufruf (`liste.append`, `x.real`): in dieser Teilmenge gibt es keine
        // Methodenobjekte und keine Attribute — nur den Aufruf einer bekannten Methode.
        const obj = this.value(x.obj, f);
        const known = methodFamily(obj);
        if (known !== null && PY_METHODS[known].has(x.name)) {
          throw new PyError('unsupported', x.line, 'attribute');
        }
        throw new PyError('attribute', x.line, x.name);
      }
      case 'index':
        return this.getItem(this.value(x.obj, f), this.value(x.index, f), x.line);
      case 'slice': {
        const obj = this.value(x.obj, f);
        const lo = x.lo === null ? null : this.value(x.lo, f);
        const hi = x.hi === null ? null : this.value(x.hi, f);
        const step = x.step === null ? null : this.value(x.step, f);
        return this.slice(obj, lo, hi, step, x.line);
      }
    }
  }

  // ─────────────── Rechnen ───────────────

  private binop(op: BinOpName, a: Value, b: Value, line: number): Value {
    if (isNumber(a) && isNumber(b)) return this.arith(op, numeric(a), numeric(b), line);
    if (op === '+') {
      if (typeof a === 'string' && typeof b === 'string') {
        if (a.length + b.length > SEQ_MAX) throw new PyError('memory', line);
        return this.newStr(a + b, line);
      }
      if (isList(a) && isList(b)) return this.newList([...a.items, ...b.items], line);
      if (isTuple(a) && isTuple(b)) return this.newTuple([...a.items, ...b.items], line);
      throw new PyError('type', line);
    }
    if (op === '*') {
      const [seq, n] = isNumber(a) ? [b, a] : [a, b];
      if (!isNumber(n) || typeof numeric(n) !== 'bigint') throw new PyError('type', line);
      const times = numeric(n) as bigint;
      const k = times < 0n ? 0 : times > BigInt(SEQ_MAX) ? SEQ_MAX + 1 : Number(times);
      if (typeof seq === 'string') {
        if (seq.length * k > SEQ_MAX) throw new PyError('memory', line);
        this.tick(line, Math.ceil((seq.length * k) / 16));
        return this.newStr(seq.repeat(k), line);
      }
      if (isList(seq) || isTuple(seq)) {
        if (seq.items.length * k > SEQ_MAX) throw new PyError('memory', line);
        this.tick(line, seq.items.length * k);
        const items: Value[] = [];
        for (let i = 0; i < k; i++) items.push(...seq.items);
        return isList(seq) ? this.newList(items, line) : this.newTuple(items, line);
      }
      throw new PyError('type', line);
    }
    if (op === '%' && typeof a === 'string')
      throw new PyError('unsupported', line, 'percent_format');
    throw new PyError('type', line);
  }

  private arith(op: BinOpName, a: bigint | number, b: bigint | number, line: number): Value {
    if (typeof a === 'bigint' && typeof b === 'bigint') {
      switch (op) {
        case '+':
          return this.int(a + b, line);
        case '-':
          return this.int(a - b, line);
        case '*':
          return this.int(a * b, line);
        case '/':
          if (b === 0n) throw new PyError('zero_division', line);
          return finite(toFloat(a, line) / toFloat(b, line), line);
        case '//':
          if (b === 0n) throw new PyError('zero_division', line);
          return floorDiv(a, b);
        case '%':
          if (b === 0n) throw new PyError('zero_division', line);
          return a - floorDiv(a, b) * b;
        case '**': {
          if (b < 0n) {
            if (a === 0n) throw new PyError('zero_division', line);
            return finite(Math.pow(toFloat(a, line), toFloat(b, line)), line);
          }
          const abs = a < 0n ? -a : a;
          if (abs > 1n && BigInt(abs.toString(2).length) * b > 1100n) {
            throw new PyError('number_too_big', line);
          }
          this.tick(line, Number(b > 1000n ? 1000n : b) / 10);
          return this.int(a ** b, line);
        }
      }
    }
    const x = toFloat(a, line);
    const y = toFloat(b, line);
    switch (op) {
      case '+':
        return finite(x + y, line);
      case '-':
        return finite(x - y, line);
      case '*':
        return finite(x * y, line);
      case '/':
        if (y === 0) throw new PyError('zero_division', line);
        return finite(x / y, line);
      case '//':
        if (y === 0) throw new PyError('zero_division', line);
        return floatDivmod(x, y)[0];
      case '%':
        if (y === 0) throw new PyError('zero_division', line);
        return floatDivmod(x, y)[1];
      case '**': {
        if (x === 0 && y < 0) throw new PyError('zero_division', line);
        // Eine negative Basis mit gebrochenem Exponenten ergibt in Python eine komplexe Zahl.
        if (x < 0 && !Number.isInteger(y)) throw new PyError('unsupported', line, 'complex');
        return finite(Math.pow(x, y), line);
      }
    }
  }

  private compare(op: CmpOp, a: Value, b: Value, line: number): boolean {
    switch (op) {
      case '==':
        return eq(a, b);
      case '!=':
        return !eq(a, b);
      case '<':
        return cmp(a, b, line) < 0;
      case '>':
        return cmp(a, b, line) > 0;
      case '<=':
        return cmp(a, b, line) <= 0;
      case '>=':
        return cmp(a, b, line) >= 0;
      case 'in':
        return this.contains(b, a, line);
      case 'not in':
        return !this.contains(b, a, line);
      case 'is':
      case 'is not': {
        // `is` ist in Python Identität. Für None und True/False ist das eindeutig; für Zahlen und
        // Texte hängt es an CPythons Zwischenspeicher (`1000 is 1000`), und eine Antwort, die
        // davon abhängt, wäre geraten.
        const sure = (v: Value) => v === null || typeof v === 'boolean';
        if (!sure(a) && !sure(b)) {
          if (typeof a === 'object' && typeof b === 'object') {
            return op === 'is' ? a === b : a !== b;
          }
          throw new PyError('unsupported', line, 'is');
        }
        return op === 'is' ? a === b : a !== b;
      }
    }
  }

  private contains(container: Value, x: Value, line: number): boolean {
    if (typeof container === 'string') {
      if (typeof x !== 'string') throw new PyError('type', line);
      this.tick(line, Math.ceil(container.length / 16));
      return container.includes(x);
    }
    if (container !== null && typeof container === 'object') {
      switch (container.t) {
        case 'list':
        case 'tuple':
        case 'iter':
          for (const v of container.items) {
            this.tick(line);
            if (eq(v, x)) return true;
          }
          return false;
        case 'dict':
          return container.map.has(hashKey(x, line));
        case 'range': {
          if (!isNumber(x)) return false;
          const n = numeric(x);
          if (typeof n === 'number' && !Number.isInteger(n)) return false;
          const v = typeof n === 'number' ? BigInt(n) : n;
          const r = container;
          const len = rangeLength(r);
          if (len === 0n) return false;
          const off = v - r.start;
          if (off % r.step !== 0n) return false;
          const i = off / r.step;
          return i >= 0n && i < len;
        }
        default:
          break;
      }
    }
    throw new PyError('type', line);
  }

  // ─────────────── Indizes ───────────────

  private index(i: Value, len: number, line: number): number {
    if (!isNumber(i) || typeof numeric(i) !== 'bigint') throw new PyError('type', line);
    let n = numeric(i) as bigint;
    if (n < 0n) n += BigInt(len);
    if (n < 0n || n >= BigInt(len)) throw new PyError('index', line);
    return Number(n);
  }

  private getItem(obj: Value, key: Value, line: number): Value {
    if (typeof obj === 'string') return obj[this.index(key, obj.length, line)] as string;
    if (obj !== null && typeof obj === 'object') {
      switch (obj.t) {
        case 'list':
        case 'tuple':
          return obj.items[this.index(key, obj.items.length, line)] as Value;
        case 'dict': {
          const hit = obj.map.get(hashKey(key, line));
          if (hit === undefined) throw new PyError('key', line);
          return hit[1];
        }
        case 'range': {
          const len = rangeLength(obj);
          if (len > BigInt(Number.MAX_SAFE_INTEGER)) throw new PyError('number_too_big', line);
          return rangeAt(obj, BigInt(this.index(key, Number(len), line)));
        }
        default:
          break;
      }
    }
    throw new PyError('type', line);
  }

  private setItem(obj: Value, key: Value, v: Value, line: number): void {
    if (isList(obj)) {
      obj.items[this.index(key, obj.items.length, line)] = v;
      return;
    }
    if (isDict(obj)) {
      this.dictSet(obj, key, v, line);
      return;
    }
    throw new PyError('type', line);
  }

  private dictSet(d: PyDict, key: Value, v: Value, line: number): void {
    const k = hashKey(key, line);
    const old = d.map.get(k);
    // Python behält den ERSTEN Schlüssel (`{1: 'a', 1.0: 'b'}` ist `{1: 'b'}`).
    if (old === undefined) this.alloc(line, 1);
    d.map.set(k, [old === undefined ? key : old[0], v]);
  }

  private slice(obj: Value, lo: Value, hi: Value, step: Value, line: number): Value {
    const len =
      typeof obj === 'string' ? obj.length : isList(obj) || isTuple(obj) ? obj.items.length : null;
    if (len === null) {
      throw new PyError(isNumber(obj) || obj === null ? 'type' : 'unsupported', line, 'slice');
    }
    const asInt = (v: Value): bigint | null => {
      if (v === null) return null;
      if (!isNumber(v) || typeof numeric(v) !== 'bigint') throw new PyError('type', line);
      return numeric(v) as bigint;
    };
    const st = asInt(step) ?? 1n;
    if (st === 0n) throw new PyError('value', line);
    const L = BigInt(len);
    const adjust = (v: bigint | null, dflt: bigint, neg: boolean): bigint => {
      if (v === null) return dflt;
      let n = v < 0n ? v + L : v;
      if (n < 0n) n = neg ? -1n : 0n;
      if (n >= L) n = neg ? L - 1n : L;
      return n;
    };
    const negative = st < 0n;
    const start = adjust(asInt(lo), negative ? L - 1n : 0n, negative);
    const stop = adjust(asInt(hi), negative ? -1n : L, negative);
    const picks: number[] = [];
    for (let i = start; negative ? i > stop : i < stop; i += st) picks.push(Number(i));
    this.tick(line, picks.length);
    if (typeof obj === 'string') return this.newStr(picks.map((i) => obj[i]).join(''), line);
    const items = picks.map((i) => (obj as PyList | PyTuple).items[i] as Value);
    return isList(obj) ? this.newList(items, line) : this.newTuple(items, line);
  }

  // ─────────────── Iteration ───────────────

  private *iterate(v: Value, line: number): Generator<Value> {
    if (typeof v === 'string') {
      for (const ch of v) yield ch;
      return;
    }
    if (v !== null && typeof v === 'object') {
      switch (v.t) {
        case 'list':
          // Wie CPython: über die LEBENDE Liste, Index für Index — wer in der Schleife anhängt,
          // verlängert sie (und läuft in die Schrittgrenze, wenn es nie aufhört).
          for (let i = 0; i < v.items.length; i++) yield v.items[i] as Value;
          return;
        case 'tuple':
        case 'iter':
          for (const x of v.items) yield x;
          return;
        case 'dict': {
          const size = v.map.size;
          for (const [k] of [...v.map.values()]) {
            if (v.map.size !== size) throw new PyError('runtime', line);
            yield k;
          }
          // CPython prüft auch beim letzten Schritt, der die Schleife beendet.
          if (v.map.size !== size) throw new PyError('runtime', line);
          return;
        }
        case 'range': {
          const len = rangeLength(v);
          for (let i = 0n; i < len; i++) yield rangeAt(v, i);
          return;
        }
        default:
          break;
      }
    }
    throw new PyError('type', line);
  }

  private materialize(v: Value, line: number): Value[] {
    const out: Value[] = [];
    for (const x of this.iterate(v, line)) {
      this.tick(line);
      out.push(x);
      if (out.length > SEQ_MAX) throw new PyError('memory', line);
    }
    return out;
  }

  // ─────────────── Aufrufe ───────────────

  private callValue(fn: Value, args: Value[], kwargs: Kw, line: number): Value {
    if (fn !== null && typeof fn === 'object') {
      if (fn.t === 'func') return this.callFunc(fn, args, kwargs, line);
      if (fn.t === 'builtin') return this.builtin(fn.name, args, kwargs, line);
    }
    throw new PyError('type', line);
  }

  private callFunc(fn: PyFunc, args: Value[], kwargs: Kw, line: number): Value {
    if (args.length > fn.params.length) throw new PyError('type', line);
    const locals = new Map<string, Value>();
    fn.params.forEach((p, i) => {
      if (i < args.length) locals.set(p, args[i] as Value);
    });
    for (const k of kwargs) {
      if (!fn.params.includes(k.name) || locals.has(k.name)) throw new PyError('type', line);
      locals.set(k.name, k.value);
    }
    if (locals.size !== fn.params.length) throw new PyError('type', line);
    this.depth++;
    if (this.depth > this.limits.depth) throw new PyError('recursion', line);
    try {
      const sig = this.block(fn.body, { locals, func: fn });
      return typeof sig === 'object' ? sig.ret : null;
    } finally {
      this.depth--;
    }
  }

  private noKw(kwargs: Kw, line: number, allowed: readonly string[] = []): Map<string, Value> {
    const out = new Map<string, Value>();
    for (const k of kwargs) {
      if (!allowed.includes(k.name)) throw new PyError('unsupported', line, 'keyword_argument');
      out.set(k.name, k.value);
    }
    return out;
  }

  private arity(args: Value[], min: number, max: number, line: number): void {
    if (args.length < min || args.length > max) throw new PyError('type', line);
  }

  private builtin(name: string, args: Value[], kwargs: Kw, line: number): Value {
    switch (name) {
      case 'print': {
        const kw = this.noKw(kwargs, line, ['sep', 'end']);
        const sep = kw.get('sep') ?? null;
        const end = kw.get('end') ?? null;
        if (
          (sep !== null && typeof sep !== 'string') ||
          (end !== null && typeof end !== 'string')
        ) {
          throw new PyError('type', line);
        }
        const text = args.map((a) => str(a, line)).join(sep ?? ' ') + (end ?? '\n');
        this.out += text;
        if (this.out.length > this.limits.output) throw new PyError('output', line);
        this.tick(line, Math.ceil(text.length / 16));
        return null;
      }
      case 'len': {
        this.noKw(kwargs, line);
        this.arity(args, 1, 1, line);
        const v = args[0] as Value;
        if (typeof v === 'string') return BigInt(v.length);
        if (v !== null && typeof v === 'object') {
          if (v.t === 'list' || v.t === 'tuple') return BigInt(v.items.length);
          if (v.t === 'dict') return BigInt(v.map.size);
          if (v.t === 'range') return rangeLength(v);
          if (v.t === 'iter' && v.view !== null) return BigInt(v.items.length);
        }
        throw new PyError('type', line);
      }
      case 'range': {
        this.noKw(kwargs, line);
        this.arity(args, 1, 3, line);
        const ints = args.map((a) => {
          if (!isNumber(a) || typeof numeric(a) !== 'bigint') throw new PyError('type', line);
          return numeric(a) as bigint;
        });
        const [start, stop, step] =
          ints.length === 1
            ? [0n, ints[0] as bigint, 1n]
            : [ints[0] as bigint, ints[1] as bigint, ints[2] ?? 1n];
        if (step === 0n) throw new PyError('value', line);
        return { t: 'range', start, stop, step } satisfies PyRange;
      }
      case 'int': {
        this.noKw(kwargs, line);
        this.arity(args, 0, 1, line);
        if (args.length === 0) return 0n;
        const v = args[0] as Value;
        if (isNumber(v)) {
          const n = numeric(v);
          if (typeof n === 'bigint') return n;
          return this.int(BigInt(Math.trunc(finite(n, line))), line);
        }
        if (typeof v === 'string') {
          const s = v.trim();
          if (s.includes('_')) throw new PyError('unsupported', line, 'int_underscore');
          if (!/^[+-]?[0-9]+$/.test(s)) throw new PyError('value', line);
          if (s.length > 300) throw new PyError('number_too_big', line);
          return this.int(BigInt(s), line);
        }
        throw new PyError('type', line);
      }
      case 'float': {
        this.noKw(kwargs, line);
        this.arity(args, 0, 1, line);
        if (args.length === 0) return 0;
        const v = args[0] as Value;
        if (isNumber(v)) return toFloat(numeric(v), line);
        if (typeof v === 'string') {
          const s = v.trim();
          if (/^[+-]?(inf|infinity|nan)$/i.test(s)) throw new PyError('unsupported', line, 'inf');
          if (s.includes('_')) throw new PyError('unsupported', line, 'int_underscore');
          if (!/^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(s)) {
            throw new PyError('value', line);
          }
          return finite(Number(s), line);
        }
        throw new PyError('type', line);
      }
      case 'str': {
        this.noKw(kwargs, line);
        this.arity(args, 0, 1, line);
        return args.length === 0 ? '' : this.newStr(str(args[0] as Value, line), line);
      }
      case 'repr':
        this.noKw(kwargs, line);
        this.arity(args, 1, 1, line);
        return this.newStr(repr(args[0] as Value, line), line);
      case 'bool':
        this.noKw(kwargs, line);
        this.arity(args, 0, 1, line);
        return args.length === 0 ? false : truthy(args[0] as Value);
      case 'abs': {
        this.noKw(kwargs, line);
        this.arity(args, 1, 1, line);
        const v = args[0] as Value;
        if (!isNumber(v)) throw new PyError('type', line);
        const n = numeric(v);
        return typeof n === 'bigint' ? (n < 0n ? -n : n) : Math.abs(n);
      }
      case 'min':
      case 'max': {
        this.noKw(kwargs, line);
        if (args.length === 0) throw new PyError('type', line);
        const items = args.length === 1 ? this.materialize(args[0] as Value, line) : args;
        if (items.length === 0) throw new PyError('value', line);
        let best = items[0] as Value;
        for (const v of items.slice(1)) {
          this.tick(line);
          const c = cmp(v, best, line);
          if (name === 'min' ? c < 0 : c > 0) best = v;
        }
        return best;
      }
      case 'sum': {
        this.noKw(kwargs, line);
        this.arity(args, 1, 2, line);
        const start = args.length === 2 ? (args[1] as Value) : 0n;
        if (!isNumber(start))
          throw new PyError(typeof start === 'string' ? 'type' : 'unsupported', line, 'sum');
        const items = this.materialize(args[0] as Value, line);
        let acc: Value = numeric(start);
        let anyFloat = typeof acc === 'number';
        for (const v of items) {
          if (!isNumber(v)) throw new PyError('type', line);
          if (typeof v === 'number') anyFloat = true;
          acc = this.arith('+', acc as bigint | number, numeric(v), line);
        }
        // Seit Python 3.12 summiert `sum` Gleitkommazahlen kompensiert (Neumaier), davor einfach.
        // Wo beide Verfahren verschieden ausgehen, hinge die richtige Ausgabe an der
        // Python-Version der Schule — dann gibt es diese Ausgabe nicht.
        if (anyFloat && typeof acc === 'number') {
          const compensated = neumaier(
            [numeric(start), ...items.map((v) => numeric(v as bigint | number))],
            line,
          );
          if (compensated !== acc) throw new PyError('unsupported', line, 'float_sum');
        }
        return acc;
      }
      case 'sorted': {
        const kw = this.noKw(kwargs, line, ['reverse']);
        this.arity(args, 1, 1, line);
        const items = this.materialize(args[0] as Value, line);
        this.sortItems(items, truthy(kw.get('reverse') ?? false), line);
        return this.newList(items, line);
      }
      case 'list':
        this.noKw(kwargs, line);
        this.arity(args, 0, 1, line);
        return this.newList(
          args.length === 0 ? [] : this.materialize(args[0] as Value, line),
          line,
        );
      case 'tuple':
        this.noKw(kwargs, line);
        this.arity(args, 0, 1, line);
        return this.newTuple(
          args.length === 0 ? [] : this.materialize(args[0] as Value, line),
          line,
        );
      case 'dict':
        this.noKw(kwargs, line);
        if (args.length > 0) throw new PyError('unsupported', line, 'dict_arguments');
        return { t: 'dict', map: new Map() };
      case 'enumerate': {
        const kw = this.noKw(kwargs, line, ['start']);
        this.arity(args, 1, 2, line);
        const s = args[1] ?? kw.get('start') ?? 0n;
        if (!isNumber(s) || typeof numeric(s) !== 'bigint') throw new PyError('type', line);
        const base = numeric(s) as bigint;
        const items = this.materialize(args[0] as Value, line);
        return this.iterOf(
          items.map((v, i) => this.newTuple([base + BigInt(i), v], line)),
          line,
        );
      }
      case 'zip': {
        this.noKw(kwargs, line);
        const lists = args.map((a) => this.materialize(a, line));
        const n = lists.length === 0 ? 0 : Math.min(...lists.map((l) => l.length));
        const out: Value[] = [];
        for (let i = 0; i < n; i++)
          out.push(
            this.newTuple(
              lists.map((l) => l[i] as Value),
              line,
            ),
          );
        return this.iterOf(out, line);
      }
      case 'reversed': {
        this.noKw(kwargs, line);
        this.arity(args, 1, 1, line);
        const v = args[0] as Value;
        if (isDict(v) || (v !== null && typeof v === 'object' && v.t === 'iter')) {
          throw new PyError('type', line);
        }
        return this.iterOf(this.materialize(v, line).reverse(), line);
      }
      case 'round': {
        this.noKw(kwargs, line);
        this.arity(args, 1, 2, line);
        const v = args[0] as Value;
        if (!isNumber(v)) throw new PyError('type', line);
        const n = numeric(v);
        const d = args[1] ?? null;
        if (d === null) return typeof n === 'bigint' ? n : this.int(roundToInt(n, line), line);
        if (!isNumber(d) || typeof numeric(d) !== 'bigint') throw new PyError('type', line);
        const digits = numeric(d) as bigint;
        if (digits < 0n || digits > 15n) throw new PyError('unsupported', line, 'round_digits');
        return typeof n === 'bigint' ? n : roundFloat(finite(n, line), Number(digits));
      }
      case 'chr': {
        this.noKw(kwargs, line);
        this.arity(args, 1, 1, line);
        const v = args[0] as Value;
        if (!isNumber(v) || typeof numeric(v) !== 'bigint') throw new PyError('type', line);
        const c = numeric(v) as bigint;
        if (c < 0n || c > 0x10ffffn) throw new PyError('value', line);
        if (c > 0xffffn || (c >= 0xd800n && c <= 0xdfffn))
          throw new PyError('unsupported', line, 'emoji');
        return String.fromCharCode(Number(c));
      }
      case 'ord': {
        this.noKw(kwargs, line);
        this.arity(args, 1, 1, line);
        const v = args[0] as Value;
        if (typeof v !== 'string' || v.length !== 1) throw new PyError('type', line);
        return BigInt(v.charCodeAt(0));
      }
      case 'any':
      case 'all': {
        this.noKw(kwargs, line);
        this.arity(args, 1, 1, line);
        for (const v of this.iterate(args[0] as Value, line)) {
          this.tick(line);
          if (name === 'any' && truthy(v)) return true;
          if (name === 'all' && !truthy(v)) return false;
        }
        return name === 'all';
      }
      default:
        throw new PyError('unsupported', line, name);
    }
  }

  private iterOf(items: Value[], line: number): PyIter {
    this.alloc(line, items.length + 1);
    return { t: 'iter', items, view: null };
  }

  /** Stabil sortieren wie Python (Timsort ist stabil, `Array.prototype.sort` seit ES2019 auch). */
  private sortItems(items: Value[], reverse: boolean, line: number): void {
    this.tick(line, Math.ceil(items.length * Math.log2(items.length + 2)));
    // `reverse=True` in Python ist NICHT „sortieren und umdrehen": gleiche Elemente behalten
    // ihre ursprüngliche Reihenfolge. Also wird absteigend verglichen, nicht umgedreht.
    items.sort((a, b) => (reverse ? cmp(b, a, line) : cmp(a, b, line)));
  }

  // ─────────────── Methoden ───────────────

  private method(obj: Value, name: string, args: Value[], kwargs: Kw, line: number): Value {
    if (typeof obj === 'string') return this.strMethod(obj, name, args, kwargs, line);
    if (isList(obj)) return this.listMethod(obj, name, args, kwargs, line);
    if (isDict(obj)) return this.dictMethod(obj, name, args, kwargs, line);
    if (isTuple(obj)) {
      this.noKw(kwargs, line);
      if (name === 'count' || name === 'index') return this.seqSearch(obj.items, name, args, line);
    }
    const family = methodFamily(obj);
    if (family !== null && PY_METHODS[family].has(name))
      throw new PyError('unsupported', line, name);
    throw new PyError('attribute', line, name);
  }

  private seqSearch(
    items: readonly Value[],
    name: 'count' | 'index',
    args: Value[],
    line: number,
  ): Value {
    this.arity(args, 1, 1, line);
    const x = args[0] as Value;
    let count = 0n;
    for (let i = 0; i < items.length; i++) {
      this.tick(line);
      if (eq(items[i] as Value, x)) {
        if (name === 'index') return BigInt(i);
        count++;
      }
    }
    if (name === 'index') throw new PyError('value', line);
    return count;
  }

  private strArg(args: Value[], i: number, line: number): string {
    const v = args[i];
    if (typeof v !== 'string') throw new PyError('type', line);
    return v;
  }

  private strMethod(s: string, name: string, args: Value[], kwargs: Kw, line: number): Value {
    this.noKw(kwargs, line);
    this.tick(line, Math.ceil(s.length / 16));
    switch (name) {
      case 'upper':
      case 'lower':
        this.arity(args, 0, 0, line);
        return this.newStr(name === 'upper' ? s.toUpperCase() : s.toLowerCase(), line);
      case 'capitalize': {
        this.arity(args, 0, 0, line);
        const first = s.slice(0, 1).toUpperCase();
        return this.newStr(first + s.slice(1).toLowerCase(), line);
      }
      case 'strip':
      case 'lstrip':
      case 'rstrip': {
        this.arity(args, 0, 1, line);
        const chars = args.length === 1 && args[0] !== null ? this.strArg(args, 0, line) : null;
        const strip = (c: string) => (chars === null ? /\s/.test(c) : chars.includes(c));
        let a = 0;
        let b = s.length;
        if (name !== 'rstrip') while (a < b && strip(s[a] as string)) a++;
        if (name !== 'lstrip') while (b > a && strip(s[b - 1] as string)) b--;
        return s.slice(a, b);
      }
      case 'split': {
        this.arity(args, 0, 1, line);
        let parts: string[];
        if (args.length === 0 || args[0] === null) parts = s.split(/\s+/).filter((p) => p !== '');
        else {
          const sep = this.strArg(args, 0, line);
          if (sep === '') throw new PyError('value', line);
          parts = s.split(sep);
        }
        this.alloc(line, s.length);
        return this.newList(parts, line);
      }
      case 'join': {
        this.arity(args, 1, 1, line);
        const items = this.materialize(args[0] as Value, line);
        if (!items.every((i) => typeof i === 'string')) throw new PyError('type', line);
        const total = items.reduce((n, i) => n + (i as string).length, 0) + s.length * items.length;
        if (total > SEQ_MAX) throw new PyError('memory', line);
        return this.newStr((items as string[]).join(s), line);
      }
      case 'replace': {
        this.arity(args, 2, 2, line);
        const from = this.strArg(args, 0, line);
        const to = this.strArg(args, 1, line);
        const result =
          from === '' ? to + [...s].join(to) + (s.length > 0 ? to : '') : s.split(from).join(to);
        if (result.length > SEQ_MAX) throw new PyError('memory', line);
        return this.newStr(from === '' && s.length === 0 ? to : result, line);
      }
      case 'count': {
        this.arity(args, 1, 1, line);
        const sub = this.strArg(args, 0, line);
        if (sub === '') return BigInt(s.length + 1);
        return BigInt(s.split(sub).length - 1);
      }
      case 'find':
      case 'index': {
        this.arity(args, 1, 1, line);
        const at = s.indexOf(this.strArg(args, 0, line));
        if (at < 0 && name === 'index') throw new PyError('value', line);
        return BigInt(at);
      }
      case 'startswith':
      case 'endswith': {
        this.arity(args, 1, 1, line);
        const fix = this.strArg(args, 0, line);
        return name === 'startswith' ? s.startsWith(fix) : s.endsWith(fix);
      }
      case 'isdigit':
      case 'isalpha':
      case 'isupper':
      case 'islower': {
        this.arity(args, 0, 0, line);
        // Python zählt hier Unicode-Kategorien (`'²'.isdigit()` ist True). Für ASCII ist das
        // eindeutig; was darüber hinausgeht, wird nicht geraten.
        if (name === 'isdigit') {
          if ([...s].some((c) => c.charCodeAt(0) > 0x7f))
            throw new PyError('unsupported', line, 'unicode_digits');
          return s.length > 0 && /^[0-9]+$/.test(s);
        }
        if (name === 'isalpha') return s.length > 0 && /^\p{L}+$/u.test(s);
        const cased = /[\p{Lu}\p{Ll}]/u.test(s);
        return name === 'isupper' ? cased && !/\p{Ll}/u.test(s) : cased && !/\p{Lu}/u.test(s);
      }
      default:
        if (PY_METHODS.str.has(name)) throw new PyError('unsupported', line, name);
        throw new PyError('attribute', line, name);
    }
  }

  private listMethod(l: PyList, name: string, args: Value[], kwargs: Kw, line: number): Value {
    if (name === 'sort') {
      const kw = this.noKw(kwargs, line, ['reverse']);
      this.arity(args, 0, 0, line);
      this.sortItems(l.items, truthy(kw.get('reverse') ?? false), line);
      return null;
    }
    this.noKw(kwargs, line);
    switch (name) {
      case 'append':
        this.arity(args, 1, 1, line);
        if (l.items.length >= SEQ_MAX) throw new PyError('memory', line);
        this.alloc(line, 1);
        l.items.push(args[0] as Value);
        return null;
      case 'extend': {
        this.arity(args, 1, 1, line);
        const add = this.materialize(args[0] as Value, line);
        if (l.items.length + add.length > SEQ_MAX) throw new PyError('memory', line);
        this.alloc(line, add.length);
        l.items.push(...add);
        return null;
      }
      case 'insert': {
        this.arity(args, 2, 2, line);
        const i = args[0] as Value;
        if (!isNumber(i) || typeof numeric(i) !== 'bigint') throw new PyError('type', line);
        let n = numeric(i) as bigint;
        const len = BigInt(l.items.length);
        if (n < 0n) n = n + len < 0n ? 0n : n + len;
        if (n > len) n = len;
        if (l.items.length >= SEQ_MAX) throw new PyError('memory', line);
        this.alloc(line, 1);
        this.tick(line, l.items.length);
        l.items.splice(Number(n), 0, args[1] as Value);
        return null;
      }
      case 'pop': {
        this.arity(args, 0, 1, line);
        if (l.items.length === 0) throw new PyError('index', line);
        const at =
          args.length === 0
            ? l.items.length - 1
            : this.index(args[0] as Value, l.items.length, line);
        this.tick(line, l.items.length - at);
        return l.items.splice(at, 1)[0] as Value;
      }
      case 'remove': {
        this.arity(args, 1, 1, line);
        const at = l.items.findIndex((v) => eq(v, args[0] as Value));
        this.tick(line, l.items.length);
        if (at < 0) throw new PyError('value', line);
        l.items.splice(at, 1);
        return null;
      }
      case 'index':
      case 'count':
        return this.seqSearch(l.items, name, args, line);
      case 'reverse':
        this.arity(args, 0, 0, line);
        this.tick(line, l.items.length);
        l.items.reverse();
        return null;
      case 'clear':
        this.arity(args, 0, 0, line);
        l.items.length = 0;
        return null;
      case 'copy':
        this.arity(args, 0, 0, line);
        return this.newList([...l.items], line);
      default:
        if (PY_METHODS.list.has(name)) throw new PyError('unsupported', line, name);
        throw new PyError('attribute', line, name);
    }
  }

  private dictMethod(d: PyDict, name: string, args: Value[], kwargs: Kw, line: number): Value {
    this.noKw(kwargs, line);
    switch (name) {
      case 'keys':
      case 'values':
      case 'items': {
        this.arity(args, 0, 0, line);
        const entries = [...d.map.values()];
        const items =
          name === 'keys'
            ? entries.map(([k]) => k)
            : name === 'values'
              ? entries.map(([, v]) => v)
              : entries.map(([k, v]) => this.newTuple([k, v], line));
        this.alloc(line, items.length + 1);
        return { t: 'iter', items, view: `dict_${name}` };
      }
      case 'get': {
        this.arity(args, 1, 2, line);
        const hit = d.map.get(hashKey(args[0] as Value, line));
        return hit === undefined ? (args[1] ?? null) : hit[1];
      }
      case 'pop': {
        this.arity(args, 1, 2, line);
        const k = hashKey(args[0] as Value, line);
        const hit = d.map.get(k);
        if (hit === undefined) {
          if (args.length === 2) return args[1] as Value;
          throw new PyError('key', line);
        }
        d.map.delete(k);
        return hit[1];
      }
      default:
        if (PY_METHODS.dict.has(name)) throw new PyError('unsupported', line, name);
        throw new PyError('attribute', line, name);
    }
  }
}

// ─────────────── Hilfen ───────────────

function isList(v: Value): v is PyList {
  return v !== null && typeof v === 'object' && v.t === 'list';
}
function isTuple(v: Value): v is PyTuple {
  return v !== null && typeof v === 'object' && v.t === 'tuple';
}
function isDict(v: Value): v is PyDict {
  return v !== null && typeof v === 'object' && v.t === 'dict';
}

function methodFamily(v: Value): keyof typeof PY_METHODS | null {
  if (typeof v === 'string') return 'str';
  if (isNumber(v)) return 'number';
  if (isList(v)) return 'list';
  if (isDict(v)) return 'dict';
  if (isTuple(v)) return 'tuple';
  return null;
}

/** Ganzzahlige Division wie Python: abgerundet, nicht zur Null hin. */
function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  return a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q;
}

/** `divmod` für Gleitkommazahlen genau wie CPython (`float_divmod` in floatobject.c). */
function floatDivmod(vx: number, wx: number): [number, number] {
  let mod = vx % wx;
  let div = (vx - mod) / wx;
  if (mod) {
    if (wx < 0 !== mod < 0) {
      mod += wx;
      div -= 1.0;
    }
  } else {
    mod = wx < 0 ? -0 : 0;
  }
  let floordiv: number;
  if (div) {
    floordiv = Math.floor(div);
    if (div - floordiv > 0.5) floordiv += 1.0;
  } else {
    floordiv = vx / wx < 0 || Object.is(vx / wx, -0) ? -0 : 0;
  }
  return [floordiv, mod];
}

/** Die kompensierte Summe, wie `sum` sie ab Python 3.12 bildet. */
function neumaier(values: Array<bigint | number>, line: number): number {
  let s = 0;
  let c = 0;
  for (const v of values) {
    const x = toFloat(v, line);
    const t = s + x;
    if (Math.abs(s) >= Math.abs(x)) c += s - t + x;
    else c += x - t + s;
    s = t;
  }
  return s + c;
}

// ─────────────── die Schnittstelle nach außen ───────────────

export type RunOutcome =
  | { ok: true; output: string }
  | { ok: false; output: string; error: PyError };

/** Führt ein schon gelesenes Programm aus und sammelt die Ausgabe. */
export function runParsed(program: Program, limits: Limits = DEFAULT_LIMITS): RunOutcome {
  const m = new Machine(limits);
  try {
    m.run(program);
    return { ok: true, output: m.output };
  } catch (e) {
    if (e instanceof PyError) return { ok: false, output: m.output, error: e };
    throw e;
  }
}

export { floatRepr, repr, str };
