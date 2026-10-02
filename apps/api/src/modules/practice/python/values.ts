// Die Werte der Lehr-Teilmenge und wie Python sie schreibt (issue #262).
//
// Die Darstellung ist nicht Kosmetik, sie ist der Schlüssel: bei „Was gibt das Programm aus?"
// ist die Ausgabe die Lösung, also muss `print(0.1 + 0.2)` hier exakt `0.30000000000000004`
// schreiben und `print([1, 'a'])` exakt `[1, 'a']`. Was sich nicht genau wie CPython darstellen
// lässt (die Adresse eines Iterators, eine Zahl jenseits von 2^53 als Gleitkommazahl), wird
// abgelehnt, statt eine plausible Ausgabe zu erfinden.

import type { Stmt } from './ast.js';
import { PyError } from './errors.js';

export type PyList = { t: 'list'; items: Value[] };
export type PyTuple = { t: 'tuple'; items: readonly Value[] };
export type PyDict = { t: 'dict'; map: Map<string, [Value, Value]> };
export type PyFunc = {
  t: 'func';
  name: string;
  params: readonly string[];
  body: readonly Stmt[];
  locals: ReadonlySet<string>;
};
export type PyBuiltin = { t: 'builtin'; name: string };
export type PyRange = { t: 'range'; start: bigint; stop: bigint; step: bigint };
/**
 * Was `enumerate`, `zip`, `reversed` und die Ansichten eines Dicts liefern. Iterierbar, aber
 * nicht druckbar: CPython schreibt `<enumerate object at 0x7f…>`, mit einer Adresse, die bei
 * jedem Lauf anders ist — eine solche Ausgabe kann kein Schlüssel sein. Die Ansichten eines
 * Dicts (`dict_keys([...])`) sind deterministisch und tragen deshalb ihren Namen.
 */
export type PyIter = {
  t: 'iter';
  items: Value[];
  view: 'dict_keys' | 'dict_values' | 'dict_items' | null;
};

/** None · bool · int (bigint) · float (number) · str · … */
export type Value =
  | null
  | boolean
  | bigint
  | number
  | string
  | PyList
  | PyTuple
  | PyDict
  | PyFunc
  | PyBuiltin
  | PyRange
  | PyIter;

/** Der Python-Name des Typs — für Fehlermeldungen und für `str()` von Funktionen. */
export function typeName(v: Value): string {
  if (v === null) return 'NoneType';
  switch (typeof v) {
    case 'boolean':
      return 'bool';
    case 'bigint':
      return 'int';
    case 'number':
      return 'float';
    case 'string':
      return 'str';
    default:
      return v.t === 'func' || v.t === 'builtin' ? 'function' : v.t === 'iter' ? 'iterator' : v.t;
  }
}

/** Ist es eine Zahl im Sinne von Python (bool zählt als int)? */
export function isNumber(v: Value): v is boolean | bigint | number {
  return typeof v === 'boolean' || typeof v === 'bigint' || typeof v === 'number';
}

/** bool → int, int bleibt; float bleibt float. */
export function numeric(v: boolean | bigint | number): bigint | number {
  return typeof v === 'boolean' ? (v ? 1n : 0n) : v;
}

/** Die größte ganze Zahl, die als Gleitkommazahl noch exakt ist. */
const EXACT = 2n ** 53n;

/**
 * Eine ganze Zahl als Gleitkommazahl. Jenseits von 2^53 rundet JavaScript anders, als CPython
 * es in manchen Operationen täte; statt einer Ausgabe, die in der letzten Stelle abweichen
 * könnte, wird die Zahl abgelehnt.
 */
export function toFloat(v: bigint | number, line: number): number {
  if (typeof v === 'number') return v;
  if (v > EXACT || v < -EXACT) throw new PyError('number_too_big', line);
  return Number(v);
}

/** Eine endliche Gleitkommazahl, oder die Grenze. `inf` und `nan` gehören nicht zur Teilmenge. */
export function finite(v: number, line: number): number {
  if (!Number.isFinite(v)) throw new PyError('number_too_big', line);
  return v;
}

// ─────────────── Gleitkommazahlen genau wie CPython ───────────────

/**
 * `repr(float)` wie in CPython: die kürzeste Ziffernfolge, die genau diese Zahl ergibt (das tut
 * `toExponential()` ohne Argument), aber mit Pythons Umschaltgrenzen — Exponentialschreibweise
 * unter 1e-4 und ab 1e16, wo JavaScript erst bei 1e-7 und 1e21 umschaltet — und `.0` an ganzen
 * Zahlen.
 */
export function floatRepr(v: number): string {
  if (Number.isNaN(v)) return 'nan';
  if (!Number.isFinite(v)) return v > 0 ? 'inf' : '-inf';
  if (v === 0) return Object.is(v, -0) ? '-0.0' : '0.0';
  const sign = v < 0 ? '-' : '';
  const [mant, expText] = Math.abs(v).toExponential().split('e') as [string, string];
  const exp = Number(expText);
  const digits = mant.replace('.', '');
  if (exp < -4 || exp >= 16) {
    const m = digits.length === 1 ? digits : `${digits[0]}.${digits.slice(1)}`;
    const e = Math.abs(exp) < 10 ? `0${Math.abs(exp)}` : String(Math.abs(exp));
    return `${sign}${m}e${exp < 0 ? '-' : '+'}${e}`;
  }
  if (exp < 0) return `${sign}0.${'0'.repeat(-exp - 1)}${digits}`;
  const intPart = digits.slice(0, exp + 1).padEnd(exp + 1, '0');
  const frac = digits.slice(exp + 1);
  return `${sign}${intPart}.${frac === '' ? '0' : frac}`;
}

/**
 * Der GENAUE Dezimalwert einer Gleitkommazahl als Bruch `num / 2^shift` — die Grundlage für
 * Runden wie CPython: `round(2.675, 2)` ist dort 2.67, weil 2.675 binär knapp darunter liegt.
 */
function exactParts(v: number): { num: bigint; shift: bigint } {
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, v);
  const hi = buf.getUint32(0);
  const lo = buf.getUint32(4);
  const expBits = (hi >>> 20) & 0x7ff;
  const mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  const sign = hi >>> 31 ? -1n : 1n;
  if (expBits === 0) return { num: sign * mant, shift: 1074n };
  const m = mant | (1n << 52n);
  const e = BigInt(expBits) - 1075n;
  return e >= 0n ? { num: sign * (m << e), shift: 0n } : { num: sign * m, shift: -e };
}

/**
 * Rundet den genauen Wert auf `digits` Nachkommastellen, kaufmännisch nur bei echter Mitte und
 * dann zur geraden Ziffer — so rechnen `round(x, n)` und `f"{x:.nf}"` in CPython. Ergebnis: die
 * gerundete Zahl als ganze Zahl in Einheiten von 10^-digits.
 */
function roundScaled(v: number, digits: number): bigint {
  const { num, shift } = exactParts(v);
  const scaled = num * 10n ** BigInt(digits);
  const den = 1n << shift;
  const neg = scaled < 0n;
  const a = neg ? -scaled : scaled;
  let q = a / den;
  const r = a - q * den;
  if (r * 2n > den || (r * 2n === den && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

/** `f"{x:.nf}"` wie CPython. */
export function formatFixed(v: number, digits: number): string {
  const q = roundScaled(v, digits);
  const neg = q < 0n || (q === 0n && (v < 0 || Object.is(v, -0)));
  const s = (q < 0n ? -q : q).toString().padStart(digits + 1, '0');
  const body = digits === 0 ? s : `${s.slice(0, -digits)}.${s.slice(-digits)}`;
  return `${neg ? '-' : ''}${body}`;
}

/** `round(x, n)` für eine Gleitkommazahl wie CPython: die nächste Zahl zum genau gerundeten Wert. */
export function roundFloat(v: number, digits: number): number {
  return Number(formatFixed(v, digits));
}

/** `round(x)` ohne Stellen: ganze Zahl, zur geraden bei genauer Mitte. */
export function roundToInt(v: number, line: number): bigint {
  finite(v, line);
  const q = roundScaled(v, 0);
  return q;
}

// ─────────────── Darstellung ───────────────

/** `repr(str)`: einfache Anführungszeichen, außer der Text enthält eins und kein doppeltes. */
export function strRepr(s: string): string {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = quote;
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (ch === '\\') out += '\\\\';
    else if (ch === quote) out += `\\${quote}`;
    else if (ch === '\n') out += '\\n';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\r') out += '\\r';
    else if (/[\p{C}\p{Zl}\p{Zp}]/u.test(ch) || (/\p{Zs}/u.test(ch) && ch !== ' ')) {
      // Was Python nicht druckbar nennt, schreibt es als Escape — \xNN unter 256, sonst \uNNNN.
      out +=
        c < 0x100
          ? `\\x${c.toString(16).padStart(2, '0')}`
          : `\\u${c.toString(16).padStart(4, '0')}`;
    } else out += ch;
  }
  return out + quote;
}

/** `repr(v)` — wie Python einen Wert in einer Liste oder in der Shell zeigt. */
export function repr(v: Value, line: number, depth = 0): string {
  if (depth > 20) throw new PyError('memory', line);
  if (v === null) return 'None';
  switch (typeof v) {
    case 'boolean':
      return v ? 'True' : 'False';
    case 'bigint':
      return v.toString();
    case 'number':
      return floatRepr(v);
    case 'string':
      return strRepr(v);
  }
  switch (v.t) {
    case 'list':
      return `[${v.items.map((i) => repr(i, line, depth + 1)).join(', ')}]`;
    case 'tuple':
      return v.items.length === 1
        ? `(${repr(v.items[0] as Value, line, depth + 1)},)`
        : `(${v.items.map((i) => repr(i, line, depth + 1)).join(', ')})`;
    case 'dict':
      return `{${[...v.map.values()]
        .map(([k, x]) => `${repr(k, line, depth + 1)}: ${repr(x, line, depth + 1)}`)
        .join(', ')}}`;
    case 'range':
      return v.step === 1n
        ? `range(${v.start}, ${v.stop})`
        : `range(${v.start}, ${v.stop}, ${v.step})`;
    case 'iter':
      if (v.view) return `${v.view}([${v.items.map((i) => repr(i, line, depth + 1)).join(', ')}])`;
      throw new PyError('unsupported', line, 'print_iterator');
    case 'func':
    case 'builtin':
      // CPython schreibt `<function f at 0x…>` — die Adresse ist bei jedem Lauf anders.
      throw new PyError('unsupported', line, 'print_function');
  }
}

/** `str(v)` — was `print` schreibt: Text ohne Anführungszeichen, alles andere wie `repr`. */
export function str(v: Value, line: number): string {
  return typeof v === 'string' ? v : repr(v, line);
}

// ─────────────── Wahrheit, Gleichheit, Ordnung ───────────────

export function truthy(v: Value): boolean {
  if (v === null) return false;
  switch (typeof v) {
    case 'boolean':
      return v;
    case 'bigint':
      return v !== 0n;
    case 'number':
      return v !== 0;
    case 'string':
      return v.length > 0;
  }
  switch (v.t) {
    case 'list':
    case 'tuple':
    case 'iter':
      return v.items.length > 0;
    case 'dict':
      return v.map.size > 0;
    case 'range':
      return rangeLength(v) > 0n;
    default:
      return true;
  }
}

/** Vergleich zweier Zahlen beliebiger Art: −1, 0, 1. bigint und number vergleicht JS exakt. */
function numCmp(a: bigint | number, b: bigint | number): number {
  if (typeof a === 'number' && Number.isNaN(a)) return NaN;
  if (typeof b === 'number' && Number.isNaN(b)) return NaN;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** `a == b` in Python. */
export function eq(a: Value, b: Value, depth = 0): boolean {
  if (depth > 50) return false;
  if (isNumber(a) && isNumber(b)) return numCmp(numeric(a), numeric(b)) === 0;
  if (a === null || b === null) return a === b;
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  if (isNumber(a) || isNumber(b)) return false;
  if (a.t !== b.t) {
    return false;
  }
  switch (a.t) {
    case 'list':
    case 'tuple': {
      const bi = (b as PyList | PyTuple).items;
      return (
        a.items.length === bi.length && a.items.every((x, i) => eq(x, bi[i] as Value, depth + 1))
      );
    }
    case 'dict': {
      const bm = (b as PyDict).map;
      if (a.map.size !== bm.size) return false;
      for (const [k, [, x]] of a.map) {
        const other = bm.get(k);
        if (!other || !eq(x, other[1], depth + 1)) return false;
      }
      return true;
    }
    case 'range': {
      const br = b as PyRange;
      const la = rangeLength(a);
      const lb = rangeLength(br);
      if (la !== lb) return false;
      if (la === 0n) return true;
      if (a.start !== br.start) return false;
      return la === 1n || a.step === br.step;
    }
    default:
      return a === b;
  }
}

/** `a < b` in Python: −1, 0, 1 — oder ein TypeError, wenn sich die beiden nicht ordnen lassen. */
export function cmp(a: Value, b: Value, line: number, depth = 0): number {
  if (depth > 50) throw new PyError('memory', line);
  if (isNumber(a) && isNumber(b)) return numCmp(numeric(a), numeric(b));
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (
    a !== null &&
    b !== null &&
    typeof a === 'object' &&
    typeof b === 'object' &&
    a.t === b.t &&
    (a.t === 'list' || a.t === 'tuple')
  ) {
    const ai = a.items;
    const bi = (b as PyList | PyTuple).items;
    for (let i = 0; i < Math.min(ai.length, bi.length); i++) {
      if (!eq(ai[i] as Value, bi[i] as Value))
        return cmp(ai[i] as Value, bi[i] as Value, line, depth + 1);
    }
    return ai.length - bi.length < 0 ? -1 : ai.length > bi.length ? 1 : 0;
  }
  throw new PyError('type', line);
}

// ─────────────── Schlüssel eines Dicts ───────────────

/**
 * Der Schlüssel, unter dem ein Wert im Dict steht. Python behandelt `1`, `1.0` und `True` als
 * denselben Schlüssel — hier auch. Nicht hashbare Werte (Listen, Dicts) sind ein TypeError, wie
 * in Python.
 */
export function hashKey(v: Value, line: number): string {
  if (v === null) return 'N';
  if (isNumber(v)) {
    const n = numeric(v);
    if (typeof n === 'number' && !Number.isInteger(n)) return `f:${n}`;
    return `i:${typeof n === 'number' ? BigInt(n).toString() : n.toString()}`;
  }
  if (typeof v === 'string') return `s:${v}`;
  if (v.t === 'tuple') return `t(${v.items.map((i) => hashKey(i, line)).join(',')})`;
  throw new PyError('type', line);
}

// ─────────────── range ───────────────

export function rangeLength(r: PyRange): bigint {
  if (r.step > 0n) return r.stop > r.start ? (r.stop - r.start + r.step - 1n) / r.step : 0n;
  return r.start > r.stop ? (r.start - r.stop - r.step - 1n) / -r.step : 0n;
}

export function rangeAt(r: PyRange, i: bigint): bigint {
  return r.start + r.step * i;
}
