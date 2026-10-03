// A small, safe parser for school maths expressions, used for the function expressions in
// figures (packages/shared-types/src/contracts/figure.ts, FunctionPlotFigure.functions[].expr)
// and for the answer checks in apps/api/src/modules/practice (steps.ts, form.ts).
// Hand-written recursive-descent parser: no eval, no Function, no mathjs — the result is a
// small syntax tree that only knows the operations listed below, and a walker that evaluates it.
//
// Grammar (whitespace ignored):
//   expr    := term (('+' | '-') term)*
//   term    := unary (('*' | '/' | '·' | implicit) unary)*
//   unary   := ('-' | '+') unary | power
//   power   := atom ('^' unary)?            (right-associative; -x^2 = -(x^2))
//   atom    := number | variable | 'pi' | 'e' | func '(' expr ')' | '(' expr ')'
//   func    := sqrt | abs | sin | cos | tan | ln | log (base 10) | exp
// Numbers take a decimal point or a decimal comma (1.5 / 1,5).
// Implicit multiplication: 2x, 3(x+1), x(x-1), (x+1)(x-1), 2pi, 2sqrt(x).
//
// Two ways to read letters (issue #263):
//   - 'x' (the default, and the only one figures use): `x` is the one variable, case folded;
//     any other letter is an error.
//   - 'letters': every single letter is its own variable and case is kept — `s = v·t` and
//     `U = R·I` are three variables each. A run of letters is read as a product of single
//     letters ("vt" = v·t) once the function names, `pi` and `e` have been taken out.
//
// The tree is exported so a caller can ask about the FORM of a term (is it a product? a sum of
// monomials?) — the evaluation alone cannot say that, and the form is sometimes the question
// (issue #235, "Faktorisiere …").

export type CompiledFunction = (x: number) => number;

const FUNCTIONS: Readonly<Record<string, (v: number) => number>> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
};

/** A parsed expression. `integer` says whether a number was written without a decimal part. */
export type Expr =
  | { k: 'num'; v: number; integer: boolean }
  | { k: 'const'; name: 'pi' | 'e'; v: number }
  | { k: 'var'; name: string }
  | { k: 'fn'; name: string; arg: Expr }
  | { k: 'neg'; a: Expr }
  | { k: 'add' | 'sub' | 'mul' | 'div' | 'pow'; a: Expr; b: Expr };

export type ReadLetters = 'x' | 'letters';

type Token =
  | { t: 'num'; v: number; integer: boolean }
  | { t: 'id'; v: string }
  | { t: 'op'; v: '+' | '-' | '*' | '/' | '^' }
  | { t: '('; v: '(' }
  | { t: ')'; v: ')' };

const MAX_LENGTH = 200;

function tokenize(src: string, letters: ReadLetters): Token[] | null {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i] as string;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || ((c === '.' || c === ',') && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      while (j < src.length && /[0-9]/.test(src[j] as string)) j++;
      let integer = true;
      if ((src[j] === '.' || src[j] === ',') && /[0-9]/.test(src[j + 1] ?? '')) {
        integer = false;
        j++;
        while (j < src.length && /[0-9]/.test(src[j] as string)) j++;
      }
      const v = Number(src.slice(i, j).replace(',', '.'));
      if (!Number.isFinite(v)) return null;
      out.push({ t: 'num', v, integer });
      i = j;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z]/.test(src[j] as string)) j++;
      const id = src.slice(i, j);
      out.push({ t: 'id', v: letters === 'x' ? id.toLowerCase() : id });
      i = j;
      continue;
    }
    if (c === 'π') {
      out.push({ t: 'id', v: 'pi' });
      i++;
      continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '^') {
      out.push({ t: 'op', v: c });
      i++;
      continue;
    }
    // Typographic variants the model may write.
    if (c === '−' || c === '–') {
      out.push({ t: 'op', v: '-' });
      i++;
      continue;
    }
    if (c === '·' || c === '×' || c === '⋅') {
      out.push({ t: 'op', v: '*' });
      i++;
      continue;
    }
    if (c === '÷' || c === ':') {
      out.push({ t: 'op', v: '/' });
      i++;
      continue;
    }
    if (c === '²' || c === '³') {
      out.push({ t: 'op', v: '^' }, { t: 'num', v: c === '²' ? 2 : 3, integer: true });
      i++;
      continue;
    }
    if (c === '(' || c === '[') {
      out.push({ t: '(', v: '(' });
      i++;
      continue;
    }
    if (c === ')' || c === ']') {
      out.push({ t: ')', v: ')' });
      i++;
      continue;
    }
    return null;
  }
  return out;
}

const NAMES = ['sqrt', 'abs', 'sin', 'cos', 'tan', 'exp', 'log', 'ln', 'pi'] as const;

/** Splits an identifier run like "xpi" or "vt" into known names; null if unknown. */
function splitIdentifier(id: string, letters: ReadLetters): string[] | null {
  const parts: string[] = [];
  let rest = id;
  while (rest.length > 0) {
    const hit = NAMES.find((n) => rest.startsWith(n));
    if (hit) {
      parts.push(hit);
      rest = rest.slice(hit.length);
      continue;
    }
    const first = rest[0] as string;
    // 'x' mode knows x and Euler's e; 'letters' mode takes every letter, and a lower-case e is
    // still Euler's number — in school maths e is never a variable name.
    if (letters === 'x' ? first === 'x' || first === 'e' : /[a-zA-Z]/.test(first)) {
      parts.push(first);
      rest = rest.slice(1);
      continue;
    }
    return null;
  }
  return parts;
}

class ParseError extends Error {}

class Parser {
  private pos = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly letters: ReadLetters,
  ) {}

  parse(): Expr {
    const node = this.expr();
    if (this.pos !== this.tokens.length) throw new ParseError('trailing input');
    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private expr(): Expr {
    let left = this.term();
    for (;;) {
      const tok = this.peek();
      if (tok?.t === 'op' && (tok.v === '+' || tok.v === '-')) {
        this.pos++;
        const right = this.term();
        left = { k: tok.v === '+' ? 'add' : 'sub', a: left, b: right };
      } else return left;
    }
  }

  private startsAtom(tok: Token | undefined): boolean {
    return tok !== undefined && (tok.t === 'num' || tok.t === 'id' || tok.t === '(');
  }

  private term(): Expr {
    let left = this.unary();
    for (;;) {
      const tok = this.peek();
      if (tok?.t === 'op' && (tok.v === '*' || tok.v === '/')) {
        this.pos++;
        const right = this.unary();
        left = { k: tok.v === '*' ? 'mul' : 'div', a: left, b: right };
      } else if (this.startsAtom(tok)) {
        // Implicit multiplication: 2x, 3(x+1), x(x-1), (x+1)(x-1).
        const right = this.power();
        left = { k: 'mul', a: left, b: right };
      } else return left;
    }
  }

  private unary(): Expr {
    const tok = this.peek();
    if (tok?.t === 'op' && (tok.v === '-' || tok.v === '+')) {
      this.pos++;
      const inner = this.unary();
      return tok.v === '-' ? { k: 'neg', a: inner } : inner;
    }
    return this.power();
  }

  private power(): Expr {
    const base = this.atom();
    const tok = this.peek();
    if (tok?.t === 'op' && tok.v === '^') {
      this.pos++;
      const exponent = this.unary(); // right-assoc: unary → power → '^' …
      return { k: 'pow', a: base, b: exponent };
    }
    return base;
  }

  private atom(): Expr {
    const tok = this.peek();
    if (!tok) throw new ParseError('unexpected end');
    if (tok.t === 'num') {
      this.pos++;
      return { k: 'num', v: tok.v, integer: tok.integer };
    }
    if (tok.t === '(') {
      this.pos++;
      const inner = this.expr();
      if (this.peek()?.t !== ')') throw new ParseError('missing )');
      this.pos++;
      return inner;
    }
    if (tok.t === 'id') {
      const parts = splitIdentifier(tok.v, this.letters);
      if (!parts) throw new ParseError(`unknown name ${tok.v}`);
      this.pos++;
      // "xpi" → x·pi; a function name must be the last part and take its argument.
      const nodes: Expr[] = [];
      for (let k = 0; k < parts.length; k++) {
        const name = parts[k] as string;
        if (FUNCTIONS[name]) {
          if (k !== parts.length - 1) throw new ParseError('function without argument');
          nodes.push(this.functionCall(name));
        } else if (name === 'pi') nodes.push({ k: 'const', name: 'pi', v: Math.PI });
        else if (name === 'e') nodes.push({ k: 'const', name: 'e', v: Math.E });
        else nodes.push({ k: 'var', name });
      }
      return nodes.reduce((a, b) => ({ k: 'mul', a, b }));
    }
    throw new ParseError('unexpected token');
  }

  private functionCall(name: string): Expr {
    if (this.peek()?.t !== '(') throw new ParseError('function needs (');
    this.pos++;
    const arg = this.expr();
    if (this.peek()?.t !== ')') throw new ParseError('missing )');
    this.pos++;
    return { k: 'fn', name, arg };
  }
}

/**
 * Parses an expression into its tree, or null when it cannot be read completely. Nothing is
 * stripped: "f(x) = …" is not an expression (see `compileExpression` for the figure shorthand).
 */
export function parseExpression(src: string, letters: ReadLetters = 'x'): Expr | null {
  if (src.length === 0 || src.length > MAX_LENGTH) return null;
  const tokens = tokenize(src, letters);
  if (!tokens || tokens.length === 0) return null;
  try {
    return new Parser(tokens, letters).parse();
  } catch (e) {
    if (e instanceof ParseError) return null;
    throw e;
  }
}

/**
 * The value of a tree for one assignment of its variables. Never throws: an unassigned
 * variable and anything out of the domain (sqrt(-1), 1/0) come back as NaN / ±Infinity.
 */
export function evaluateExpression(e: Expr, env: Readonly<Record<string, number>>): number {
  switch (e.k) {
    case 'num':
    case 'const':
      return e.v;
    case 'var':
      return Object.prototype.hasOwnProperty.call(env, e.name) ? (env[e.name] as number) : NaN;
    case 'fn': {
      const fn = FUNCTIONS[e.name];
      return fn ? fn(evaluateExpression(e.arg, env)) : NaN;
    }
    case 'neg':
      return -evaluateExpression(e.a, env);
    case 'add':
      return evaluateExpression(e.a, env) + evaluateExpression(e.b, env);
    case 'sub':
      return evaluateExpression(e.a, env) - evaluateExpression(e.b, env);
    case 'mul':
      return evaluateExpression(e.a, env) * evaluateExpression(e.b, env);
    case 'div':
      return evaluateExpression(e.a, env) / evaluateExpression(e.b, env);
    case 'pow':
      return Math.pow(evaluateExpression(e.a, env), evaluateExpression(e.b, env));
  }
}

/** The variable names a tree uses, sorted. */
export function variablesOf(e: Expr): string[] {
  const out = new Set<string>();
  const walk = (n: Expr): void => {
    if (n.k === 'var') out.add(n.name);
    else if (n.k === 'fn') walk(n.arg);
    else if (n.k === 'neg') walk(n.a);
    else if (n.k !== 'num' && n.k !== 'const') {
      walk(n.a);
      walk(n.b);
    }
  };
  walk(e);
  return [...out].sort();
}

/**
 * Compiles a function expression in x into a plain function, or null when the
 * expression can't be parsed. Evaluating never throws; out-of-domain values
 * (sqrt(-1), 1/0) come back as NaN / ±Infinity for the caller to skip.
 */
export function compileExpression(expr: string): CompiledFunction | null {
  if (expr.length === 0 || expr.length > MAX_LENGTH) return null;
  // Accept "y = …" / "f(x) = …" as written in school.
  const body = expr.replace(/^\s*(?:y|[a-z]\s*\(\s*x\s*\))\s*=\s*/i, '');
  const tree = parseExpression(body, 'x');
  if (tree === null) return null;
  return (x) => evaluateExpression(tree, { x });
}
