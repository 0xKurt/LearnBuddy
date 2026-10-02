// Inline math in question texts: "Kürze $\frac{6}{8}$." → plain runs and math
// segments, each math segment a small tree (fractions, powers, indices, roots,
// symbols). Pure logic without React Native imports, so it runs in the unit tests.
// Supported LaTeX subset: packages/shared-types/src/contracts/learning.ts (ItemView).

import {
  MATH_BLACKBOARD as BLACKBOARD,
  MATH_LIMIT_OPERATORS,
  MATH_SYMBOLS,
} from '@learnbuddy/shared-types/contracts';

export type MathAtom =
  /** Digits, letters and operators as they are written (operators already spaced). */
  | { type: 'chars'; text: string }
  /** A named symbol (\cdot, \pi, \le, …) with the character that shows it. */
  | { type: 'symbol'; name: string; char: string }
  /** \text{…}: words inside math, shown upright. */
  | { type: 'text'; text: string }
  | { type: 'frac'; num: MathAtom[]; den: MathAtom[] }
  /** Raised after the atom before it (x^{2}). */
  | { type: 'sup'; body: MathAtom[] }
  /** Lowered after the atom before it (x_{1}). */
  | { type: 'sub'; body: MathAtom[] }
  | { type: 'sqrt'; index: MathAtom[] | null; body: MathAtom[] }
  /** \overline{…}: a repeating decimal (0,\overline{3}) or a segment (\overline{AB}). */
  | { type: 'overline'; body: MathAtom[] }
  /** \vec{…}: a vector, drawn with an arrow above. */
  | { type: 'vec'; body: MathAtom[] }
  /** A gap to fill in inside math: "___" (3+ underscores), \square or \Box. */
  | { type: 'blank' }
  /**
   * An operator with limits (issue #239): \sum_{i=1}^{n}, \int_{a}^{b}, \lim_{x \to 0}. The
   * limits belong to the operator — drawn with it and read as "Summe von … bis …".
   */
  | { type: 'limits'; op: string; name: string; lower: MathAtom[] | null; upper: MathAtom[] | null }
  /** \binom{n}{k}: n over k in round brackets, without a bar. */
  | { type: 'binom'; top: MathAtom[]; bottom: MathAtom[] }
  /** \begin{pmatrix} … \end{pmatrix}: rows of cells in round brackets — one column is a vector. */
  | { type: 'matrix'; rows: MathAtom[][][] }
  /** \xrightarrow{…}: the reaction arrow with its condition written above it. */
  | { type: 'arrow'; above: MathAtom[] };

export type MathSegment = { type: 'plain'; text: string } | { type: 'math'; atoms: MathAtom[] };

/** Symbol commands → the character shown (the one list, issue #239: contracts/notation.ts). */
export const SYMBOLS = MATH_SYMBOLS;

/** A thin space: the gap around + − = … (narrower than a normal space). */
export const THIN = '\u2009';

/** Operators written with a little space on both sides when used between two terms. */
const BINARY = new Set([
  '+',
  '−',
  '=',
  '<',
  '>',
  '·',
  '×',
  '÷',
  '≤',
  '≥',
  '≠',
  '≈',
  '±',
  '⇒',
  '→',
  '⇔',
  '⟶',
  '⇌',
  '∥',
  '⊥',
  '≅',
  '∼',
  '∈',
  '∉',
  '⊂',
  '⊆',
  '∪',
  '∩',
  '≡',
]);

/**
 * Where the $…$ (and $$…$$) math sits in a text: `start`/`end` include the
 * dollar signs, `inner` is the LaTeX between them. An unmatched or empty $…$
 * is not math; an escaped \$ never opens one.
 */
export type MathSpan = { start: number; end: number; inner: string };

export function mathSpans(text: string): MathSpan[] {
  const out: MathSpan[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i] as string;
    if (c === '\\' && text[i + 1] === '$') {
      i += 2;
      continue;
    }
    if (c !== '$') {
      i++;
      continue;
    }
    const display = text[i + 1] === '$';
    const open = display ? 2 : 1;
    // Math starts right after its dollar sign ("$\frac…"); "5$ und" or "$ 3" is money.
    if (!display && /\s/.test(text[i + 1] ?? ' ')) {
      i += 1;
      continue;
    }
    const close = findClosingDollar(text, i + open, display);
    if (close === -1) {
      i += open;
      continue;
    }
    const inner = text.slice(i + open, close);
    if (inner.trim().length > 0) out.push({ start: i, end: close + open, inner });
    i = close + open;
  }
  return out;
}

/** Plain text between math: an escaped \$ shows as $. */
function unescapeDollar(plain: string): string {
  return plain.replace(/\\\$/g, '$');
}

/** Splits a text into plain runs and $…$ math segments; an unmatched $ stays plain text. */
export function splitMath(text: string): MathSegment[] {
  const out: MathSegment[] = [];
  let last = 0;
  for (const span of mathSpans(text)) {
    if (span.start > last)
      out.push({ type: 'plain', text: unescapeDollar(text.slice(last, span.start)) });
    out.push({ type: 'math', atoms: parseMath(span.inner) });
    last = span.end;
  }
  if (last < text.length) out.push({ type: 'plain', text: unescapeDollar(text.slice(last)) });
  return out;
}

function findClosingDollar(text: string, from: number, display: boolean): number {
  for (let j = from; j < text.length; j++) {
    if (text[j] === '\\') {
      j++;
      continue;
    }
    if (text[j] === '$') {
      if (display) {
        if (text[j + 1] === '$') return j;
        continue;
      }
      // A dollar sign right before a digit opens an amount ("… costs $3"), it never closes
      // math: "$5 and the book costs $3" is two prices, not math around the words between.
      if (/[0-9]/.test(text[j + 1] ?? '')) continue;
      return j;
    }
  }
  return -1;
}

/** True when the text holds at least one math segment. */
export function hasMath(text: string): boolean {
  return splitMath(text).some((s) => s.type === 'math');
}

// ─────────────── the math parser ───────────────

class Reader {
  pos = 0;
  constructor(readonly src: string) {}
  peek(): string | undefined {
    return this.src[this.pos];
  }
  done(): boolean {
    return this.pos >= this.src.length;
  }
  skipSpace(): void {
    while (!this.done() && /\s/.test(this.src[this.pos] as string)) this.pos++;
  }
  /** Reads "\name" (letters) or "\x" (one non-letter); the reader stands on the backslash. */
  command(): string {
    this.pos++; // backslash
    const start = this.pos;
    while (!this.done() && /[a-zA-Z]/.test(this.src[this.pos] as string)) this.pos++;
    if (this.pos === start && !this.done()) this.pos++;
    return this.src.slice(start, this.pos);
  }
}

/** Parses the inside of $…$ into atoms. Never throws: unknown input shows as it is written. */
export function parseMath(src: string): MathAtom[] {
  const r = new Reader(src);
  const atoms = parseList(r, false);
  return finish(atoms);
}

function parseList(r: Reader, inGroup: boolean): MathAtom[] {
  const out: MathAtom[] = [];
  while (!r.done()) {
    const c = r.peek() as string;
    if (c === '}') {
      if (inGroup) {
        r.pos++;
        return out;
      }
      r.pos++; // stray brace: drop it
      continue;
    }
    if (/\s/.test(c)) {
      r.pos++;
      continue;
    }
    if (c === '{') {
      r.pos++;
      out.push(...parseList(r, true));
      continue;
    }
    if (c === '_' && r.src.startsWith('___', r.pos)) {
      while (r.peek() === '_') r.pos++;
      out.push({ type: 'blank' });
      continue;
    }
    if (c === '^' || c === '_') {
      r.pos++;
      const body = parseArgument(r, true);
      if (body.length === 0) out.push({ type: 'chars', text: c });
      else out.push({ type: c === '^' ? 'sup' : 'sub', body });
      continue;
    }
    if (c === '\\') {
      out.push(...parseCommand(r));
      continue;
    }
    r.pos++;
    out.push({ type: 'chars', text: normalizeChar(c) });
  }
  return out;
}

function normalizeChar(c: string): string {
  if (c === '-' || c === '–') return '−';
  if (c === '*') return '·';
  return c;
}

/**
 * One argument of ^, _, \frac or \sqrt: a {group}, a command, or one character
 * — for ^ and _ a run of digits counts as one (x^12 means x^{12} in class).
 */
function parseArgument(r: Reader, digitRun: boolean): MathAtom[] {
  r.skipSpace();
  const c = r.peek();
  if (c === undefined) return [];
  if (c === '{') {
    r.pos++;
    return parseList(r, true);
  }
  if (c === '\\') return parseCommand(r);
  if (c === '}') return [];
  if (digitRun && /[0-9]/.test(c)) {
    const start = r.pos;
    while (!r.done() && /[0-9]/.test(r.peek() as string)) r.pos++;
    return [{ type: 'chars', text: r.src.slice(start, r.pos) }];
  }
  r.pos++;
  return [{ type: 'chars', text: normalizeChar(c) }];
}

function parseCommand(r: Reader): MathAtom[] {
  const name = r.command();
  switch (name) {
    case 'frac':
    case 'dfrac':
    case 'tfrac': {
      const num = parseArgument(r, false);
      const den = parseArgument(r, false);
      return [{ type: 'frac', num, den }];
    }
    case 'binom': {
      const top = parseArgument(r, false);
      const bottom = parseArgument(r, false);
      return [{ type: 'binom', top, bottom }];
    }
    case 'xrightarrow': {
      // An optional [below] is read and dropped: a school writes the condition above.
      r.skipSpace();
      if (r.peek() === '[') {
        const close = r.src.indexOf(']', r.pos);
        if (close !== -1) r.pos = close + 1;
      }
      return [{ type: 'arrow', above: parseArgument(r, false) }];
    }
    case 'sum':
    case 'prod':
    case 'int':
    case 'lim': {
      // The limits that follow belong to the operator, in either order (\sum_{i=1}^{n}).
      let lower: MathAtom[] | null = null;
      let upper: MathAtom[] | null = null;
      for (let k = 0; k < 2; k++) {
        r.skipSpace();
        const c = r.peek();
        if (c === '_' && lower === null && !r.src.startsWith('___', r.pos)) {
          r.pos++;
          lower = parseArgument(r, true);
        } else if (c === '^' && upper === null) {
          r.pos++;
          upper = parseArgument(r, true);
        } else break;
      }
      return [{ type: 'limits', op: MATH_LIMIT_OPERATORS[name] ?? name, name, lower, upper }];
    }
    case 'begin': {
      r.skipSpace();
      if (r.peek() !== '{') return [];
      const close = r.src.indexOf('}', r.pos);
      if (close === -1) return [];
      const env = r.src.slice(r.pos + 1, close).trim();
      r.pos = close + 1;
      const endTag = new RegExp(`\\\\end\\s*\\{\\s*${env.replace(/[^a-zA-Z*]/g, '')}\\s*\\}`);
      const rest = r.src.slice(r.pos);
      const end = endTag.exec(rest);
      const body = end ? rest.slice(0, end.index) : rest;
      r.pos += end ? end.index + end[0].length : rest.length;
      if (env !== 'pmatrix') return [{ type: 'text', text: ` ${env} ` }];
      const rows = body
        .split(/\\\\/)
        .map((row) => row.split('&').map((cell) => parseMath(cell)))
        .filter((row) => row.some((cell) => cell.length > 0));
      return rows.length > 0 ? [{ type: 'matrix', rows }] : [];
    }
    case 'end':
      // A stray \end{…}: its environment name is not shown.
      r.skipSpace();
      if (r.peek() === '{') {
        const close = r.src.indexOf('}', r.pos);
        r.pos = close === -1 ? r.src.length : close + 1;
      }
      return [];
    case 'sqrt': {
      r.skipSpace();
      let index: MathAtom[] | null = null;
      if (r.peek() === '[') {
        const close = r.src.indexOf(']', r.pos);
        if (close !== -1) {
          index = parseMath(r.src.slice(r.pos + 1, close));
          r.pos = close + 1;
          if (index.length === 0) index = null;
        }
      }
      return [{ type: 'sqrt', index, body: parseArgument(r, false) }];
    }
    case 'left':
    case 'right':
    case 'big':
    case 'Big': {
      // \left( … \right): just the parenthesis; "\left." shows nothing.
      r.skipSpace();
      const c = r.peek();
      if (c === undefined) return [];
      if (c === '\\') {
        const inner = r.command();
        if (inner === '{' || inner === '}') return [{ type: 'chars', text: inner }];
        if (inner === '|' || inner === 'vert') return [{ type: 'chars', text: '|' }];
        return [];
      }
      r.pos++;
      return c === '.' ? [] : [{ type: 'chars', text: c }];
    }
    case 'text':
    case 'mathrm':
    case 'textrm':
    case 'mbox':
    case 'operatorname': {
      r.skipSpace();
      if (r.peek() !== '{') return [];
      const close = matchingBrace(r.src, r.pos);
      const raw = r.src.slice(r.pos + 1, close === -1 ? r.src.length : close);
      r.pos = close === -1 ? r.src.length : close + 1;
      return [{ type: 'text', text: raw.replace(/\\\$/g, '$') }];
    }
    case ',':
    case ';':
    case ':':
    case ' ':
    case 'quad':
    case 'qquad':
      return [{ type: 'text', text: ' ' }];
    case '!':
      return [];
    case '{':
    case '}':
    case '%':
    case '$':
    case '#':
    case '&':
    case '_':
      return [{ type: 'chars', text: name }];
    case '\\':
      return [{ type: 'text', text: ' ' }];
    case 'square':
    case 'Box':
      return [{ type: 'blank' }];
    case 'overline':
    case 'bar':
      return [{ type: 'overline', body: parseArgument(r, false) }];
    case 'vec':
    case 'overrightarrow':
      return [{ type: 'vec', body: parseArgument(r, false) }];
    case 'mathbb': {
      const arg = parseArgument(r, false);
      const letter = arg.length === 1 && arg[0]?.type === 'chars' ? arg[0].text : '';
      const set = BLACKBOARD[letter];
      return set ? [{ type: 'chars', text: set }] : arg;
    }
    case 'mathbf':
    case 'mathit':
    case 'boldsymbol':
    case 'displaystyle':
    case 'textstyle':
      // Style only: show the argument as it is.
      return parseArgument(r, false);
    case 'sin':
    case 'cos':
    case 'tan':
    case 'log':
    case 'ln':
    case 'exp':
    case 'min':
    case 'max':
      return [{ type: 'text', text: name }];
    default: {
      const char = SYMBOLS[name];
      if (char !== undefined) return [{ type: 'symbol', name, char }];
      // Unknown command: its name, set apart by spaces so it never glues to its neighbours
      // ("g \foo h" → "g foo h", not "gfooh").
      return name.length > 0 ? [{ type: 'text', text: ` ${name} ` }] : [];
    }
  }
}

function matchingBrace(src: string, open: number): number {
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '\\') {
      j++;
      continue;
    }
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

/** Merges neighbouring characters, turns "^\circ" into "°", spaces binary operators. */
function finish(atoms: MathAtom[]): MathAtom[] {
  const merged: MathAtom[] = [];
  for (const a0 of atoms) {
    let a = mapChildren(a0);
    // x^{\circ} / 90^\circ → a plain degree sign.
    if (a.type === 'sup' && a.body.length === 1) {
      const only = a.body[0] as MathAtom;
      if (only.type === 'symbol' && only.char === '°') a = only;
    }
    merged.push(a);
  }
  // Space binary operators; a minus/plus at the start or after another operator or "(" is a sign.
  const out: MathAtom[] = [];
  let prevOperand = false;
  for (const a of merged) {
    const op = operatorChar(a);
    if (op !== null && BINARY.has(op)) {
      const binary = prevOperand || !(op === '−' || op === '+' || op === '±');
      const shown = binary ? `${THIN}${op}${THIN}` : op;
      pushChars(out, a.type === 'symbol' ? { ...a, char: shown } : { type: 'chars', text: shown });
      prevOperand = false;
      continue;
    }
    if (a.type === 'chars') {
      for (const ch of a.text) {
        if (BINARY.has(ch)) {
          const binary = prevOperand || !(ch === '−' || ch === '+' || ch === '±');
          pushChars(out, { type: 'chars', text: binary ? `${THIN}${ch}${THIN}` : ch });
          prevOperand = false;
        } else {
          pushChars(out, { type: 'chars', text: ch });
          prevOperand = !(ch === '(' || ch === '[' || ch === ',' || ch === ';');
        }
      }
      continue;
    }
    out.push(a);
    prevOperand = a.type !== 'text' || a.text.trim().length > 0;
  }
  return out;
}

function operatorChar(a: MathAtom): string | null {
  if (a.type === 'symbol') return a.char;
  return null;
}

function pushChars(out: MathAtom[], a: MathAtom): void {
  const last = out[out.length - 1];
  if (a.type === 'chars' && last?.type === 'chars') {
    out[out.length - 1] = { type: 'chars', text: last.text + a.text };
  } else out.push(a);
}

function mapChildren(a: MathAtom): MathAtom {
  switch (a.type) {
    case 'frac':
      return { type: 'frac', num: finish(a.num), den: finish(a.den) };
    case 'sup':
      return { type: 'sup', body: finish(a.body) };
    case 'sub':
      return { type: 'sub', body: finish(a.body) };
    case 'sqrt':
      return { type: 'sqrt', index: a.index ? finish(a.index) : null, body: finish(a.body) };
    case 'overline':
      return { type: 'overline', body: finish(a.body) };
    case 'vec':
      return { type: 'vec', body: finish(a.body) };
    case 'limits':
      return {
        ...a,
        lower: a.lower ? finish(a.lower) : null,
        upper: a.upper ? finish(a.upper) : null,
      };
    case 'binom':
      return { type: 'binom', top: finish(a.top), bottom: finish(a.bottom) };
    case 'arrow':
      return { type: 'arrow', above: finish(a.above) };
    default:
      return a;
  }
}

/** The text as plain characters (for copying, fallbacks, comparisons): ¾-like math → "3/4". */
export function plainText(segments: MathSegment[]): string {
  return segments.map((s) => (s.type === 'plain' ? s.text : atomsToPlain(s.atoms))).join('');
}

function atomsToPlain(atoms: MathAtom[]): string {
  return atoms
    .map((a) => {
      switch (a.type) {
        case 'chars':
          return a.text;
        case 'symbol':
          return a.char;
        case 'text':
          return a.text;
        case 'frac':
          return `${wrap(a.num)}/${wrap(a.den)}`;
        case 'sup':
          return `^${wrap(a.body)}`;
        case 'sub':
          return `_${wrap(a.body)}`;
        case 'sqrt':
          return a.index
            ? `√[${atomsToPlain(a.index)}](${atomsToPlain(a.body)})`
            : `√(${atomsToPlain(a.body)})`;
        case 'overline':
          // A combining overline on every character: 0,3̅.
          return [...atomsToPlain(a.body)].map((ch) => `${ch}\u0305`).join('');
        case 'vec':
          return `${atomsToPlain(a.body)}\u20D7`;
        case 'blank':
          return '___';
        case 'limits':
          return `${a.op}${a.lower ? `_${wrap(a.lower)}` : ''}${a.upper ? `^${wrap(a.upper)}` : ''}`;
        case 'binom':
          return `binom(${atomsToPlain(a.top)}, ${atomsToPlain(a.bottom)})`;
        case 'matrix':
          return `(${a.rows.map((row) => row.map(atomsToPlain).join(' ')).join('; ')})`;
        case 'arrow':
          return ` ⟶ (${atomsToPlain(a.above)}) `;
      }
    })
    .join('');
}

function wrap(atoms: MathAtom[]): string {
  const s = atomsToPlain(atoms);
  return /^[\w.,]+$/.test(s) ? s : `(${s})`;
}
