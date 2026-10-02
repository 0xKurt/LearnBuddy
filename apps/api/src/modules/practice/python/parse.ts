// Der Parser der Lehr-Teilmenge von Python (issue #262).
//
// Er baut nur, was `ast.ts` kennt. Alles andere, was echtes Python wäre, endet in
// `unsupported` mit einem Namen (`import`, `class`, `lambda`, `comprehension`, …) — nie in einem
// Syntaxfehler, denn es IST kein Fehler in ihrem Programm, und nie in einer stillen Umdeutung.

import type { BinOpName, CmpOp, Expr, Program, Stmt, Target } from './ast.js';
import { PyError } from './errors.js';
import { KEYWORDS, lex, type Token } from './lex.js';

/** Wie tief Ausdrücke und Blöcke geschachtelt sein dürfen — schützt den Stapel des Servers. */
const NESTING_MAX = 40;

/** Schlüsselwörter, die echtes Python kennt und diese Teilmenge bewusst nicht. */
const UNSUPPORTED_KEYWORDS: ReadonlySet<string> = new Set([
  'import',
  'from',
  'class',
  'try',
  'except',
  'finally',
  'with',
  'global',
  'nonlocal',
  'del',
  'assert',
  'raise',
  'lambda',
  'yield',
  'async',
  'await',
  'as',
]);

const AUG: Record<string, BinOpName> = {
  '+=': '+',
  '-=': '-',
  '*=': '*',
  '/=': '/',
  '//=': '//',
  '%=': '%',
  '**=': '**',
};

/** Operatoren, die echtes Python kennt (Bitoperationen, Matrixprodukt) und diese Teilmenge nicht. */
const UNSUPPORTED_OPS: ReadonlySet<string> = new Set([
  '&',
  '|',
  '^',
  '~',
  '<<',
  '>>',
  '@',
  '&=',
  '|=',
  '^=',
  '<<=',
  '>>=',
  ':=',
  ';',
  '->',
]);

const ESCAPES: Record<string, string> = {
  n: '\n',
  t: '\t',
  '\\': '\\',
  "'": "'",
  '"': '"',
  r: '\r',
  '0': '\0',
};

class Parser {
  private pos = 0;
  private depth = 0;
  private loops = 0;
  private inDef = false;

  constructor(
    private readonly toks: Token[],
    private readonly curly: boolean,
  ) {}

  private peek(offset = 0): Token {
    return this.toks[Math.min(this.pos + offset, this.toks.length - 1)] as Token;
  }

  private next(): Token {
    const t = this.peek();
    if (this.pos < this.toks.length - 1) this.pos++;
    return t;
  }

  private isOp(op: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t.kind === 'op' && t.text === op;
  }

  private isKw(word: string): boolean {
    const t = this.peek();
    return t.kind === 'name' && t.text === word;
  }

  private expectOp(op: string): Token {
    const t = this.next();
    if (t.kind !== 'op' || t.text !== op) this.fail(t);
    return t;
  }

  /** Ein Token, das hier nicht stehen darf: echtes Python, das fehlt, oder ein Syntaxfehler. */
  private fail(t: Token): never {
    if (t.kind === 'name' && UNSUPPORTED_KEYWORDS.has(t.text)) {
      throw new PyError('unsupported', t.line, t.text);
    }
    if (t.kind === 'op' && UNSUPPORTED_OPS.has(t.text)) {
      throw new PyError('unsupported', t.line, 'operator');
    }
    throw new PyError('syntax', t.line);
  }

  private enter(line: number): void {
    this.depth++;
    if (this.depth > NESTING_MAX) throw new PyError('too_long', line);
  }

  program(): Program {
    const body: Stmt[] = [];
    while (this.peek().kind !== 'eof') body.push(...this.statement());
    return { body };
  }

  private statement(): Stmt[] {
    const t = this.peek();
    if (t.kind === 'indent') throw new PyError('indent', t.line);
    if (t.kind === 'name') {
      switch (t.text) {
        case 'if':
          return [this.ifStmt()];
        case 'while':
          return [this.whileStmt()];
        case 'for':
          return [this.forStmt()];
        case 'def':
          return [this.defStmt()];
        case 'elif':
        case 'else':
          throw new PyError('syntax', t.line);
      }
    }
    const s = this.simple();
    const end = this.next();
    if (end.kind !== 'newline') this.fail(end);
    return [s];
  }

  private simple(): Stmt {
    const t = this.peek();
    const line = t.line;
    if (t.kind === 'name') {
      if (UNSUPPORTED_KEYWORDS.has(t.text)) throw new PyError('unsupported', line, t.text);
      if (t.text === 'pass') {
        this.next();
        return { s: 'pass', line };
      }
      if (t.text === 'break' || t.text === 'continue') {
        this.next();
        if (this.loops === 0) throw new PyError('syntax', line);
        return { s: t.text, line };
      }
      if (t.text === 'return') {
        this.next();
        if (!this.inDef) throw new PyError('syntax', line);
        const value = this.peek().kind === 'newline' ? null : this.testList();
        return { s: 'return', value, line };
      }
    }
    const first = this.testList();
    const op = this.peek();
    if (op.kind === 'op' && AUG[op.text] !== undefined) {
      this.next();
      const target = this.target(first);
      if (target.t === 'tuple') throw new PyError('syntax', line);
      return { s: 'aug', target, op: AUG[op.text] as BinOpName, value: this.testList(), line };
    }
    if (this.isOp('=')) {
      const targets: Target[] = [this.target(first)];
      let value: Expr = first;
      while (this.isOp('=')) {
        this.next();
        value = this.testList();
        if (this.isOp('=')) targets.push(this.target(value));
      }
      return { s: 'assign', targets, value, line };
    }
    if (op.kind === 'op' && op.text === ':') throw new PyError('unsupported', line, 'annotation');
    return { s: 'expr', x: first, line };
  }

  /** Ein Ausdruck links von `=`, als Ziel gelesen. */
  private target(x: Expr): Target {
    switch (x.e) {
      case 'name':
        if (KEYWORDS.has(x.id)) throw new PyError('syntax', x.line);
        return { t: 'name', id: x.id, line: x.line };
      case 'index':
        return { t: 'index', obj: x.obj, index: x.index, line: x.line };
      case 'tuple':
      case 'list':
        if (x.items.length === 0) throw new PyError('syntax', x.line);
        return { t: 'tuple', items: x.items.map((i) => this.target(i)), line: x.line };
      case 'slice':
        throw new PyError('unsupported', x.line, 'slice_assignment');
      case 'attr':
        throw new PyError('unsupported', x.line, 'attribute_assignment');
      default:
        throw new PyError('syntax', x.line);
    }
  }

  private block(): Stmt[] {
    const colon = this.next();
    if (colon.kind !== 'op' || colon.text !== ':') this.fail(colon);
    this.enter(colon.line);
    try {
      if (this.peek().kind !== 'newline') {
        // `if x: print(x)` — ein Rumpf auf derselben Zeile.
        const s = this.simple();
        const end = this.next();
        if (end.kind !== 'newline') this.fail(end);
        return [s];
      }
      this.next();
      const ind = this.next();
      if (ind.kind !== 'indent') throw new PyError('indent', ind.line);
      const body: Stmt[] = [];
      while (this.peek().kind !== 'dedent' && this.peek().kind !== 'eof') {
        body.push(...this.statement());
      }
      this.next();
      return body;
    } finally {
      this.depth--;
    }
  }

  private ifStmt(): Stmt {
    const line = this.next().line; // if / elif
    const test = this.test();
    const body = this.block();
    let orelse: Stmt[] = [];
    if (this.isKw('elif')) orelse = [this.ifStmt()];
    else if (this.isKw('else')) {
      this.next();
      orelse = this.block();
    }
    return { s: 'if', test, body, orelse, line };
  }

  private loopBody(): Stmt[] {
    this.loops++;
    try {
      return this.block();
    } finally {
      this.loops--;
    }
  }

  private whileStmt(): Stmt {
    const line = this.next().line;
    const test = this.test();
    const body = this.loopBody();
    if (this.isKw('else')) throw new PyError('unsupported', this.peek().line, 'loop_else');
    return { s: 'while', test, body, line };
  }

  private forStmt(): Stmt {
    const line = this.next().line;
    const targetExpr = this.exprList();
    const target = this.target(targetExpr);
    if (!this.isKw('in')) this.fail(this.peek());
    this.next();
    const iter = this.testList();
    const body = this.loopBody();
    if (this.isKw('else')) throw new PyError('unsupported', this.peek().line, 'loop_else');
    return { s: 'for', target, iter, body, line };
  }

  private defStmt(): Stmt {
    const line = this.next().line;
    if (this.inDef) throw new PyError('unsupported', line, 'nested_def');
    const name = this.next();
    if (name.kind !== 'name' || KEYWORDS.has(name.text)) this.fail(name);
    this.expectOp('(');
    const params: string[] = [];
    while (!this.isOp(')')) {
      const p = this.next();
      if (p.kind === 'op' && (p.text === '*' || p.text === '**' || p.text === '/')) {
        throw new PyError('unsupported', p.line, 'star_args');
      }
      if (p.kind !== 'name' || KEYWORDS.has(p.text)) this.fail(p);
      if (params.includes(p.text)) throw new PyError('syntax', p.line);
      params.push(p.text);
      if (this.isOp('=')) throw new PyError('unsupported', p.line, 'default_argument');
      if (this.isOp(':')) throw new PyError('unsupported', p.line, 'annotation');
      if (this.isOp(',')) this.next();
      else if (!this.isOp(')')) this.fail(this.peek());
    }
    this.next();
    if (this.isOp('->')) throw new PyError('unsupported', line, 'annotation');
    const outerLoops = this.loops;
    this.inDef = true;
    this.loops = 0;
    try {
      const body = this.block();
      const locals = new Set<string>(params);
      collectAssigned(body, locals);
      return { s: 'def', name: name.text, params, body, locals, line };
    } finally {
      this.inDef = false;
      this.loops = outerLoops;
    }
  }

  // ── Ausdrücke ──

  /** `a, b` ohne Klammern: ein Tupel, sobald ein Komma dasteht. */
  testList(): Expr {
    const first = this.test();
    if (!this.isOp(',')) return first;
    const items = [first];
    while (this.isOp(',')) {
      this.next();
      if (this.endsList()) break;
      items.push(this.test());
    }
    return { e: 'tuple', items, line: first.line };
  }

  /** Die Ziele einer `for`-Schleife: wie `testList`, aber ohne `in` zu verschlucken. */
  private exprList(): Expr {
    const first = this.orExpr();
    if (!this.isOp(',')) return first;
    const items = [first];
    while (this.isOp(',')) {
      this.next();
      if (this.isKw('in')) break;
      items.push(this.orExpr());
    }
    return { e: 'tuple', items, line: first.line };
  }

  private endsList(): boolean {
    const t = this.peek();
    return (
      t.kind === 'newline' ||
      t.kind === 'eof' ||
      (t.kind === 'op' && [')', ']', '}', '=', ':'].includes(t.text)) ||
      (t.kind === 'op' && AUG[t.text] !== undefined)
    );
  }

  test(): Expr {
    const t = this.peek();
    this.enter(t.line);
    try {
      if (t.kind === 'name' && (t.text === 'lambda' || t.text === 'yield' || t.text === 'await')) {
        throw new PyError('unsupported', t.line, t.text);
      }
      const x = this.orTest();
      if (this.isKw('if')) {
        this.next();
        const test = this.orTest();
        if (!this.isKw('else')) this.fail(this.peek());
        this.next();
        const other = this.test();
        return { e: 'ifexp', test, then: x, else: other, line: x.line };
      }
      if (this.isOp(':=')) throw new PyError('unsupported', t.line, 'operator');
      return x;
    } finally {
      this.depth--;
    }
  }

  private orTest(): Expr {
    let l = this.andTest();
    while (this.isKw('or')) {
      this.next();
      l = { e: 'bool', op: 'or', l, r: this.andTest(), line: l.line };
    }
    return l;
  }

  private andTest(): Expr {
    let l = this.notTest();
    while (this.isKw('and')) {
      this.next();
      l = { e: 'bool', op: 'and', l, r: this.notTest(), line: l.line };
    }
    return l;
  }

  private notTest(): Expr {
    if (this.isKw('not')) {
      const line = this.next().line;
      this.enter(line);
      try {
        return { e: 'not', x: this.notTest(), line };
      } finally {
        this.depth--;
      }
    }
    return this.comparison();
  }

  private compOp(): CmpOp | null {
    const t = this.peek();
    if (t.kind === 'op' && ['==', '!=', '<', '>', '<=', '>='].includes(t.text)) {
      this.next();
      return t.text as CmpOp;
    }
    if (t.kind === 'name' && t.text === 'in') {
      this.next();
      return 'in';
    }
    if (t.kind === 'name' && t.text === 'not' && this.peek(1).text === 'in') {
      this.next();
      this.next();
      return 'not in';
    }
    if (t.kind === 'name' && t.text === 'is') {
      this.next();
      if (this.isKw('not')) {
        this.next();
        return 'is not';
      }
      return 'is';
    }
    return null;
  }

  private comparison(): Expr {
    const first = this.orExpr();
    const rest: Array<{ op: CmpOp; x: Expr }> = [];
    for (let op = this.compOp(); op !== null; op = this.compOp()) {
      rest.push({ op, x: this.orExpr() });
    }
    return rest.length === 0 ? first : { e: 'cmp', first, rest, line: first.line };
  }

  /** Bitoperationen gehören nicht zur Teilmenge; die Stufe existiert nur, um sie zu benennen. */
  private orExpr(): Expr {
    const x = this.arith();
    const t = this.peek();
    if (t.kind === 'op' && UNSUPPORTED_OPS.has(t.text) && t.text !== ';' && t.text !== '->') {
      throw new PyError('unsupported', t.line, 'operator');
    }
    return x;
  }

  private arith(): Expr {
    let l = this.term();
    while (this.isOp('+') || this.isOp('-')) {
      const op = this.next().text as BinOpName;
      l = { e: 'bin', op, l, r: this.term(), line: l.line };
    }
    return l;
  }

  private term(): Expr {
    let l = this.factor();
    while (this.isOp('*') || this.isOp('/') || this.isOp('//') || this.isOp('%')) {
      const op = this.next().text as BinOpName;
      l = { e: 'bin', op, l, r: this.factor(), line: l.line };
    }
    if (this.isOp('@')) throw new PyError('unsupported', this.peek().line, 'operator');
    return l;
  }

  private factor(): Expr {
    if (this.isOp('-') || this.isOp('+')) {
      const t = this.next();
      this.enter(t.line);
      try {
        return { e: 'unary', op: t.text as '-' | '+', x: this.factor(), line: t.line };
      } finally {
        this.depth--;
      }
    }
    if (this.isOp('~')) throw new PyError('unsupported', this.peek().line, 'operator');
    return this.power();
  }

  private power(): Expr {
    const base = this.atomExpr();
    if (this.isOp('**')) {
      this.next();
      return { e: 'bin', op: '**', l: base, r: this.factor(), line: base.line };
    }
    return base;
  }

  private atomExpr(): Expr {
    let x = this.atom();
    for (;;) {
      if (this.isOp('(')) {
        this.next();
        x = this.call(x);
      } else if (this.isOp('[')) {
        this.next();
        x = this.subscript(x);
      } else if (this.isOp('.')) {
        this.next();
        const name = this.next();
        if (name.kind !== 'name') this.fail(name);
        x = { e: 'attr', obj: x, name: name.text, line: name.line };
      } else return x;
    }
  }

  private call(fn: Expr): Expr {
    const args: Expr[] = [];
    const kwargs: Array<{ name: string; value: Expr }> = [];
    while (!this.isOp(')')) {
      if (this.isOp('*') || this.isOp('**')) {
        throw new PyError('unsupported', this.peek().line, 'star_args');
      }
      if (this.peek().kind === 'name' && this.isOp('=', 1)) {
        const name = this.next().text;
        this.next();
        if (kwargs.some((k) => k.name === name)) throw new PyError('syntax', fn.line);
        kwargs.push({ name, value: this.test() });
      } else {
        if (kwargs.length > 0) throw new PyError('syntax', this.peek().line);
        const arg = this.test();
        if (this.isKw('for')) throw new PyError('unsupported', arg.line, 'comprehension');
        args.push(arg);
      }
      if (this.isOp(',')) this.next();
      else if (!this.isOp(')')) this.fail(this.peek());
    }
    this.next();
    return { e: 'call', fn, args, kwargs, line: fn.line };
  }

  private subscript(obj: Expr): Expr {
    const line = obj.line;
    let lo: Expr | null = null;
    if (!this.isOp(':')) {
      lo = this.test();
      if (this.isOp(']')) {
        this.next();
        return { e: 'index', obj, index: lo, line };
      }
      if (this.isOp(',')) throw new PyError('unsupported', line, 'tuple_index');
    }
    this.expectOp(':');
    const hi = this.isOp(':') || this.isOp(']') ? null : this.test();
    let step: Expr | null = null;
    if (this.isOp(':')) {
      this.next();
      step = this.isOp(']') ? null : this.test();
    }
    this.expectOp(']');
    return { e: 'slice', obj, lo, hi, step, line };
  }

  private atom(): Expr {
    const t = this.next();
    const line = t.line;
    switch (t.kind) {
      case 'int':
        return { e: 'int', v: BigInt(t.text), line };
      case 'float': {
        const v = Number(t.text);
        if (!Number.isFinite(v)) throw new PyError('number_too_big', line);
        return { e: 'float', v, line };
      }
      case 'str':
        return this.strings(t);
      case 'name': {
        if (t.text === 'True' || t.text === 'False')
          return { e: 'const', v: t.text === 'True', line };
        if (t.text === 'None') return { e: 'const', v: null, line };
        if (KEYWORDS.has(t.text)) this.fail(t);
        return { e: 'name', id: t.text, line };
      }
      case 'op':
        if (t.text === '(') return this.parens(line);
        if (t.text === '[') return this.listLit(line);
        if (t.text === '{') return this.dictLit(line);
        return this.fail(t);
      default:
        return this.fail(t);
    }
  }

  /** Nebeneinanderstehende Strings werden verbunden, wie in Python (`"a" "b"` ist `"ab"`). */
  private strings(first: Token): Expr {
    const parts: Array<string | { expr: Expr; digits: number | null }> = [];
    let anyF = false;
    const add = (t: Token) => {
      if (t.fstring) {
        anyF = true;
        parts.push(...this.fParts(t));
      } else parts.push(t.text);
    };
    add(first);
    while (this.peek().kind === 'str') add(this.next());
    if (!anyF) return { e: 'str', v: parts.join(''), line: first.line };
    return { e: 'fstr', parts, line: first.line };
  }

  /** Die Teile eines f-Strings: Text, `{ausdruck}` und `{ausdruck:.2f}`, sonst nichts. */
  private fParts(t: Token): Array<string | { expr: Expr; digits: number | null }> {
    const raw = t.raw ?? '';
    const out: Array<string | { expr: Expr; digits: number | null }> = [];
    let text = '';
    let i = 0;
    while (i < raw.length) {
      const c = raw[i] as string;
      if (c === '{' && raw[i + 1] === '{') {
        text += '{';
        i += 2;
        continue;
      }
      if (c === '}') {
        if (raw[i + 1] !== '}') throw new PyError('syntax', t.line);
        text += '}';
        i += 2;
        continue;
      }
      if (c === '\\') {
        const e = raw[i + 1] ?? '';
        text += ESCAPES[e] ?? `\\${e}`;
        i += 2;
        continue;
      }
      if (c !== '{') {
        text += c;
        i++;
        continue;
      }
      // `{ … }` — bis zur schließenden Klammer auf Tiefe 0, Strings darin übersprungen.
      let j = i + 1;
      let depth = 0;
      let quote: string | null = null;
      let colon = -1;
      for (; j < raw.length; j++) {
        const d = raw[j] as string;
        if (quote) {
          if (d === quote) quote = null;
          continue;
        }
        if (d === '"' || d === "'") quote = d;
        else if (d === '\\') throw new PyError('syntax', t.line);
        else if (d === '(' || d === '[' || d === '{') depth++;
        else if ((d === ')' || d === ']') && depth > 0) depth--;
        else if (d === '}' && depth > 0) depth--;
        else if (d === '}') break;
        else if (d === ':' && depth === 0 && colon < 0) colon = j;
        else if (d === '!' && depth === 0 && raw[j + 1] !== '=') {
          throw new PyError('unsupported', t.line, 'format');
        }
      }
      if (j >= raw.length) throw new PyError('syntax', t.line);
      const source = raw.slice(i + 1, colon >= 0 ? colon : j);
      const spec = colon >= 0 ? raw.slice(colon + 1, j) : null;
      if (source.trim() === '') throw new PyError('syntax', t.line);
      let digits: number | null = null;
      if (spec !== null) {
        const m = /^\.([0-9])f$/.exec(spec);
        if (!m) throw new PyError('unsupported', t.line, 'format');
        digits = Number(m[1]);
      }
      if (text) out.push(text);
      text = '';
      out.push({ expr: parseInner(source, t.line, this.curly), digits });
      i = j + 1;
    }
    if (text) out.push(text);
    return out;
  }

  private parens(line: number): Expr {
    if (this.isOp(')')) {
      this.next();
      return { e: 'tuple', items: [], line };
    }
    const first = this.test();
    if (this.isKw('for')) throw new PyError('unsupported', line, 'comprehension');
    if (this.isOp(')')) {
      this.next();
      return first;
    }
    const items = [first];
    while (this.isOp(',')) {
      this.next();
      if (this.isOp(')')) break;
      items.push(this.test());
    }
    this.expectOp(')');
    return { e: 'tuple', items, line };
  }

  private listLit(line: number): Expr {
    const items: Expr[] = [];
    while (!this.isOp(']')) {
      items.push(this.test());
      if (this.isKw('for')) throw new PyError('unsupported', line, 'comprehension');
      if (this.isOp(',')) this.next();
      else if (!this.isOp(']')) this.fail(this.peek());
    }
    this.next();
    return { e: 'list', items, line };
  }

  private dictLit(line: number): Expr {
    const keys: Expr[] = [];
    const values: Expr[] = [];
    while (!this.isOp('}')) {
      const k = this.test();
      if (this.isKw('for')) throw new PyError('unsupported', line, 'comprehension');
      if (!this.isOp(':')) {
        if (this.isOp(',') || this.isOp('}')) throw new PyError('unsupported', line, 'set');
        this.fail(this.peek());
      }
      this.next();
      keys.push(k);
      values.push(this.test());
      if (this.isKw('for')) throw new PyError('unsupported', line, 'comprehension');
      if (this.isOp(',')) this.next();
      else if (!this.isOp('}')) this.fail(this.peek());
    }
    this.next();
    return { e: 'dict', keys, values, line };
  }

  atEnd(): boolean {
    return (
      this.peek().kind === 'eof' || (this.peek().kind === 'newline' && this.peek(1).kind === 'eof')
    );
  }
}

/** Ein Ausdruck in einem f-String, mit der Zeile des Strings. */
function parseInner(source: string, line: number, curly: boolean): Expr {
  let toks: Token[];
  try {
    toks = lex(source.trim(), curly);
  } catch (e) {
    if (e instanceof PyError) throw new PyError(e.kind, line, e.detail);
    throw e;
  }
  const p = new Parser(
    toks.map((t) => ({ ...t, line })),
    curly,
  );
  const x = p.testList();
  if (!p.atEnd()) throw new PyError('syntax', line);
  return x;
}

/**
 * Die Namen, die eine Funktion selbst zuweist — in Python sind genau sie lokal, im ganzen Rumpf,
 * auch VOR der ersten Zuweisung (daher `UnboundLocalError`).
 */
function collectAssigned(body: readonly Stmt[], into: Set<string>): void {
  const target = (t: Target): void => {
    if (t.t === 'name') into.add(t.id);
    else if (t.t === 'tuple') t.items.forEach(target);
  };
  for (const s of body) {
    switch (s.s) {
      case 'assign':
        s.targets.forEach(target);
        break;
      case 'aug':
        target(s.target);
        break;
      case 'for':
        target(s.target);
        collectAssigned(s.body, into);
        break;
      case 'if':
        collectAssigned(s.body, into);
        collectAssigned(s.orelse, into);
        break;
      case 'while':
        collectAssigned(s.body, into);
        break;
      default:
        break;
    }
  }
}

/** Liest ein ganzes Programm. `curly`: siehe `lex` — nur für ihre eigene Antwort. */
export function parseProgram(source: string, curly = false): Program {
  return new Parser(lex(source, curly), curly).program();
}

/**
 * Liest einen einzelnen Ausdruck (die Argumente eines Testfalls, `"[1, 2], 3"`). Der Aufrufer
 * entscheidet, welche Knoten darin erlaubt sind.
 */
export function parseExpression(source: string): Expr {
  const p = new Parser(lex(source), false);
  const x = p.testList();
  if (!p.atEnd()) throw new PyError('syntax', 1);
  return x;
}
