// A small, safe compiler for the function expressions in figures
// (packages/shared-types/src/contracts/figure.ts, FunctionPlotFigure.functions[].expr).
// Hand-written recursive-descent parser: no eval, no Function, no mathjs — the
// result is a closure tree that only knows the operations listed below.
//
// Grammar (whitespace ignored):
//   expr    := term (('+' | '-') term)*
//   term    := unary (('*' | '/' | '·' | implicit) unary)*
//   unary   := ('-' | '+') unary | power
//   power   := atom ('^' unary)?            (right-associative; -x^2 = -(x^2))
//   atom    := number | 'x' | 'pi' | 'e' | func '(' expr ')' | '(' expr ')'
//   func    := sqrt | abs | sin | cos | tan | ln | log (base 10) | exp
// Numbers take a decimal point or a decimal comma (1.5 / 1,5).
// Implicit multiplication: 2x, 3(x+1), x(x-1), (x+1)(x-1), 2pi, 2sqrt(x).

export type CompiledFunction = (x: number) => number;

type Node = (x: number) => number;

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

type Token =
  | { t: 'num'; v: number }
  | { t: 'id'; v: string }
  | { t: 'op'; v: '+' | '-' | '*' | '/' | '^' }
  | { t: '('; v: '(' }
  | { t: ')'; v: ')' };

const MAX_LENGTH = 200;

function tokenize(src: string): Token[] | null {
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
      if ((src[j] === '.' || src[j] === ',') && /[0-9]/.test(src[j + 1] ?? '')) {
        j++;
        while (j < src.length && /[0-9]/.test(src[j] as string)) j++;
      }
      const v = Number(src.slice(i, j).replace(',', '.'));
      if (!Number.isFinite(v)) return null;
      out.push({ t: 'num', v });
      i = j;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z]/.test(src[j] as string)) j++;
      out.push({ t: 'id', v: src.slice(i, j).toLowerCase() });
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
      out.push({ t: 'op', v: '^' }, { t: 'num', v: c === '²' ? 2 : 3 });
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

/** Splits an identifier run like "xpi" or "2x" leftovers into known names; null if unknown. */
function splitIdentifier(id: string): string[] | null {
  const names = ['sqrt', 'abs', 'sin', 'cos', 'tan', 'exp', 'log', 'ln', 'pi', 'x', 'e'];
  const parts: string[] = [];
  let rest = id;
  while (rest.length > 0) {
    const hit = names.find((n) => rest.startsWith(n));
    if (!hit) return null;
    parts.push(hit);
    rest = rest.slice(hit.length);
  }
  return parts;
}

class ParseError extends Error {}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): Node {
    const node = this.expr();
    if (this.pos !== this.tokens.length) throw new ParseError('trailing input');
    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private expr(): Node {
    let left = this.term();
    for (;;) {
      const tok = this.peek();
      if (tok?.t === 'op' && (tok.v === '+' || tok.v === '-')) {
        this.pos++;
        const right = this.term();
        const l = left;
        left = tok.v === '+' ? (x) => l(x) + right(x) : (x) => l(x) - right(x);
      } else return left;
    }
  }

  private startsAtom(tok: Token | undefined): boolean {
    return tok !== undefined && (tok.t === 'num' || tok.t === 'id' || tok.t === '(');
  }

  private term(): Node {
    let left = this.unary();
    for (;;) {
      const tok = this.peek();
      if (tok?.t === 'op' && (tok.v === '*' || tok.v === '/')) {
        this.pos++;
        const right = this.unary();
        const l = left;
        left = tok.v === '*' ? (x) => l(x) * right(x) : (x) => l(x) / right(x);
      } else if (this.startsAtom(tok)) {
        // Implicit multiplication: 2x, 3(x+1), x(x-1), (x+1)(x-1).
        const right = this.power();
        const l = left;
        left = (x) => l(x) * right(x);
      } else return left;
    }
  }

  private unary(): Node {
    const tok = this.peek();
    if (tok?.t === 'op' && (tok.v === '-' || tok.v === '+')) {
      this.pos++;
      const inner = this.unary();
      return tok.v === '-' ? (x) => -inner(x) : inner;
    }
    return this.power();
  }

  private power(): Node {
    const base = this.atom();
    const tok = this.peek();
    if (tok?.t === 'op' && tok.v === '^') {
      this.pos++;
      const exponent = this.unary(); // right-assoc: unary → power → '^' …
      return (x) => Math.pow(base(x), exponent(x));
    }
    return base;
  }

  private atom(): Node {
    const tok = this.peek();
    if (!tok) throw new ParseError('unexpected end');
    if (tok.t === 'num') {
      this.pos++;
      const v = tok.v;
      return () => v;
    }
    if (tok.t === '(') {
      this.pos++;
      const inner = this.expr();
      if (this.peek()?.t !== ')') throw new ParseError('missing )');
      this.pos++;
      return inner;
    }
    if (tok.t === 'id') {
      const parts = splitIdentifier(tok.v);
      if (!parts) throw new ParseError(`unknown name ${tok.v}`);
      this.pos++;
      // "xpi" → x·pi; a function name must be the last part and take its argument.
      const nodes: Node[] = [];
      for (let k = 0; k < parts.length; k++) {
        const name = parts[k] as string;
        const fn = FUNCTIONS[name];
        if (fn) {
          if (k !== parts.length - 1) throw new ParseError('function without argument');
          nodes.push(this.functionCall(fn));
        } else if (name === 'x') nodes.push((x) => x);
        else if (name === 'pi') nodes.push(() => Math.PI);
        else if (name === 'e') nodes.push(() => Math.E);
        else throw new ParseError(`unknown name ${name}`);
      }
      return nodes.reduce((a, b) => (x) => a(x) * b(x));
    }
    throw new ParseError('unexpected token');
  }

  private functionCall(fn: (v: number) => number): Node {
    if (this.peek()?.t !== '(') throw new ParseError('function needs (');
    this.pos++;
    const arg = this.expr();
    if (this.peek()?.t !== ')') throw new ParseError('missing )');
    this.pos++;
    return (x) => fn(arg(x));
  }
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
  const tokens = tokenize(body);
  if (!tokens || tokens.length === 0) return null;
  try {
    return new Parser(tokens).parse();
  } catch (e) {
    if (e instanceof ParseError) return null;
    throw e;
  }
}
