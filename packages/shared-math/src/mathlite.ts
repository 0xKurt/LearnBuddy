// MathLite — natural typed math syntax used by learners.
// Hand-written recursive-descent parser. Spec: docs/07-content-types.md §4.2.
//
// Public API:
//   parseMathLite(input) -> { ast, latex, mathjs, errors }
//
// The same module is imported by mobile and api so client-side parsing and
// server-side validation produce identical ASTs.

// ─── AST ─────────────────────────────────────────────────────────────────────

export type Pos = { start: number; end: number };

export type AstNode =
  | { kind: 'num'; value: number; pos: Pos }
  | { kind: 'ident'; name: string; pos: Pos }
  | { kind: 'unary'; op: '-' | '+'; arg: AstNode; pos: Pos }
  | { kind: 'binop'; op: BinOp; left: AstNode; right: AstNode; pos: Pos }
  | { kind: 'call'; callee: string; args: AstNode[]; pos: Pos }
  | { kind: 'root'; degree: AstNode | null; arg: AstNode; pos: Pos }
  | { kind: 'abs'; arg: AstNode; pos: Pos }
  | { kind: 'compare'; op: CompareOp; left: AstNode; right: AstNode; pos: Pos }
  | { kind: 'pair'; left: AstNode; right: AstNode; pos: Pos };

export type BinOp = '+' | '-' | '*' | '/' | '^';
export type CompareOp = '=' | '>=' | '<=' | '>' | '<' | '!=';

export type ParseError = { message: string; pos: Pos };

export type ParseResult = {
  ast: AstNode | null;
  latex: string;
  mathjs: string;
  errors: ParseError[];
};

// ─── Built-in identifier dictionary ──────────────────────────────────────────
// Multi-char names matched greedily by the tokenizer. Listed longest-first.

const MULTI_CHAR_IDS = [
  // Functions
  'sqrt',
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'log',
  'ln',
  'exp',
  'abs',
  // Greek (lowercase by convention except Delta)
  'alpha',
  'beta',
  'gamma',
  'delta',
  'Delta',
  'epsilon',
  'zeta',
  'eta',
  'theta',
  'iota',
  'kappa',
  'lambda',
  'mu',
  'nu',
  'xi',
  'omicron',
  'pi',
  'rho',
  'sigma',
  'tau',
  'upsilon',
  'phi',
  'chi',
  'psi',
  'omega',
  // Constants
  'inf',
].sort((a, b) => b.length - a.length);

const FUNCTION_NAMES = new Set([
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'log',
  'ln',
  'exp',
  'abs',
]);

const GREEK_LATEX: Record<string, string> = {
  alpha: '\\alpha',
  beta: '\\beta',
  gamma: '\\gamma',
  delta: '\\delta',
  Delta: '\\Delta',
  epsilon: '\\epsilon',
  zeta: '\\zeta',
  eta: '\\eta',
  theta: '\\theta',
  iota: '\\iota',
  kappa: '\\kappa',
  lambda: '\\lambda',
  mu: '\\mu',
  nu: '\\nu',
  xi: '\\xi',
  omicron: 'o',
  pi: '\\pi',
  rho: '\\rho',
  sigma: '\\sigma',
  tau: '\\tau',
  upsilon: '\\upsilon',
  phi: '\\phi',
  chi: '\\chi',
  psi: '\\psi',
  omega: '\\omega',
};

const GREEK_MATHJS: Record<string, string> = Object.fromEntries(
  Object.keys(GREEK_LATEX).map((k) => [k, k]),
);
GREEK_MATHJS['inf'] = 'Infinity';

// ─── Tokenizer ───────────────────────────────────────────────────────────────

type TokenKind =
  | 'num'
  | 'ident'
  | 'lparen'
  | 'rparen'
  | 'lbrack'
  | 'rbrack'
  | 'lbrace'
  | 'rbrace'
  | 'pipe'
  | 'op'
  | 'comma'
  | 'semi'
  | 'eof';

type Token = { kind: TokenKind; text: string; pos: Pos };

function tokenize(input: string): { tokens: Token[]; errors: ParseError[] } {
  const tokens: Token[] = [];
  const errors: ParseError[] = [];
  let i = 0;

  const peek = (off = 0) => input[i + off];
  const push = (kind: TokenKind, start: number, text: string) =>
    tokens.push({ kind, text, pos: { start, end: start + text.length } });

  while (i < input.length) {
    const ch = peek();
    if (ch === undefined) break;

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Numbers: digits with optional dot or comma decimal
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(peek(1) ?? ''))) {
      const start = i;
      while (i < input.length && /[0-9]/.test(input[i]!)) i++;
      if (input[i] === '.' || input[i] === ',') {
        i++;
        while (i < input.length && /[0-9]/.test(input[i]!)) i++;
      }
      push('num', start, input.slice(start, i));
      continue;
    }

    // Multi-character operators
    if (ch === '>' && peek(1) === '=') {
      push('op', i, '>=');
      i += 2;
      continue;
    }
    if (ch === '<' && peek(1) === '=') {
      push('op', i, '<=');
      i += 2;
      continue;
    }
    if (ch === '!' && peek(1) === '=') {
      push('op', i, '!=');
      i += 2;
      continue;
    }

    // Single-character punctuation and operators
    const singles: Record<string, TokenKind> = {
      '(': 'lparen',
      ')': 'rparen',
      '[': 'lbrack',
      ']': 'rbrack',
      '{': 'lbrace',
      '}': 'rbrace',
      '|': 'pipe',
      ',': 'comma',
      ';': 'semi',
    };
    if (ch in singles) {
      push(singles[ch]!, i, ch);
      i++;
      continue;
    }

    if ('+-*/^=<>'.includes(ch)) {
      push('op', i, ch);
      i++;
      continue;
    }

    // Identifiers: multi-char greedy match, then single ASCII letter.
    if (/[a-zA-Z_]/.test(ch)) {
      const start = i;
      let matched: string | null = null;
      for (const name of MULTI_CHAR_IDS) {
        if (input.startsWith(name, i)) {
          // Must not be followed by another identifier char (avoid matching
          // `pi` inside `pizza`).
          const after = input[i + name.length];
          if (after === undefined || !/[a-zA-Z0-9_]/.test(after)) {
            matched = name;
            break;
          }
        }
      }
      if (matched) {
        i += matched.length;
        push('ident', start, matched);
        continue;
      }
      // Single ASCII letter identifier with optional underscore suffix.
      i++;
      while (i < input.length && (input[i] === '_' || /[a-zA-Z0-9]/.test(input[i]!))) i++;
      push('ident', start, input.slice(start, i));
      continue;
    }

    errors.push({
      message: `Unexpected character '${ch}'`,
      pos: { start: i, end: i + 1 },
    });
    i++;
  }

  push('eof', i, '');
  return { tokens, errors };
}

// ─── Parser ──────────────────────────────────────────────────────────────────

class Parser {
  private p = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly errors: ParseError[],
  ) {}

  private peek(off = 0): Token {
    return this.tokens[this.p + off]!;
  }

  private eat(kind: TokenKind, text?: string): Token | null {
    const t = this.peek();
    if (t.kind === kind && (text === undefined || t.text === text)) {
      this.p++;
      return t;
    }
    return null;
  }

  private expect(kind: TokenKind, text?: string): Token {
    const t = this.eat(kind, text);
    if (!t) {
      const here = this.peek();
      this.errors.push({
        message: `Expected ${text ?? kind}, got '${here.text || here.kind}'`,
        pos: here.pos,
      });
      // Synthesize a dummy token so the parser can keep going.
      return { kind, text: text ?? '', pos: here.pos };
    }
    return t;
  }

  parseExpr(): AstNode {
    return this.parseComparison();
  }

  private parseComparison(): AstNode {
    const left = this.parseAdd();
    const t = this.peek();
    if (t.kind === 'op' && ['=', '>=', '<=', '>', '<', '!='].includes(t.text)) {
      this.p++;
      const right = this.parseAdd();
      return {
        kind: 'compare',
        op: t.text as CompareOp,
        left,
        right,
        pos: { start: left.pos.start, end: right.pos.end },
      };
    }
    return left;
  }

  private parseAdd(): AstNode {
    let left = this.parseMul();
    while (true) {
      const t = this.peek();
      if (t.kind === 'op' && (t.text === '+' || t.text === '-')) {
        this.p++;
        const right = this.parseMul();
        left = {
          kind: 'binop',
          op: t.text as BinOp,
          left,
          right,
          pos: { start: left.pos.start, end: right.pos.end },
        };
      } else break;
    }
    return left;
  }

  private parseMul(): AstNode {
    let left = this.parseUnary();
    while (true) {
      const t = this.peek();
      if (t.kind === 'op' && (t.text === '*' || t.text === '/')) {
        this.p++;
        const right = this.parseUnary();
        left = {
          kind: 'binop',
          op: t.text as BinOp,
          left,
          right,
          pos: { start: left.pos.start, end: right.pos.end },
        };
        continue;
      }
      // Implicit multiplication: number-then-{ident|lparen|sqrt|abs|...},
      // or ident-then-{ident|lparen} when ident is not itself a function call.
      if (this.isImplicitMulCandidate(left)) {
        const next = this.peek();
        if (next.kind === 'ident' || next.kind === 'lparen') {
          const right = this.parseUnary();
          left = {
            kind: 'binop',
            op: '*',
            left,
            right,
            pos: { start: left.pos.start, end: right.pos.end },
          };
          continue;
        }
      }
      break;
    }
    return left;
  }

  private isImplicitMulCandidate(node: AstNode): boolean {
    return (
      node.kind === 'num' ||
      node.kind === 'ident' ||
      node.kind === 'binop' ||
      node.kind === 'unary' ||
      node.kind === 'call' ||
      node.kind === 'root' ||
      node.kind === 'abs'
    );
  }

  private parseUnary(): AstNode {
    const t = this.peek();
    if (t.kind === 'op' && (t.text === '-' || t.text === '+')) {
      this.p++;
      const arg = this.parseUnary();
      return {
        kind: 'unary',
        op: t.text as '-' | '+',
        arg,
        pos: { start: t.pos.start, end: arg.pos.end },
      };
    }
    return this.parsePower();
  }

  private parsePower(): AstNode {
    const left = this.parsePrimary();
    const t = this.peek();
    if (t.kind === 'op' && t.text === '^') {
      this.p++;
      const right = this.parseUnary(); // right-associative
      return {
        kind: 'binop',
        op: '^',
        left,
        right,
        pos: { start: left.pos.start, end: right.pos.end },
      };
    }
    return left;
  }

  private parsePrimary(): AstNode {
    const t = this.peek();

    if (t.kind === 'num') {
      this.p++;
      const raw = t.text.replace(',', '.');
      const value = Number(raw);
      return { kind: 'num', value, pos: t.pos };
    }

    if (t.kind === 'pipe') {
      this.p++;
      const arg = this.parseExpr();
      const close = this.expect('pipe');
      return { kind: 'abs', arg, pos: { start: t.pos.start, end: close.pos.end } };
    }

    if (t.kind === 'lparen') {
      this.p++;
      const first = this.parseExpr();
      // Coordinate pair: `(a; b)`
      if (this.peek().kind === 'semi') {
        this.p++;
        const second = this.parseExpr();
        const close = this.expect('rparen');
        return {
          kind: 'pair',
          left: first,
          right: second,
          pos: { start: t.pos.start, end: close.pos.end },
        };
      }
      const close = this.expect('rparen');
      // Recompute pos to include the parens for nicer error spans.
      return { ...first, pos: { start: t.pos.start, end: close.pos.end } };
    }

    if (t.kind === 'ident') {
      this.p++;
      // sqrt[n](x)
      if (t.text === 'sqrt' && this.peek().kind === 'lbrack') {
        this.p++;
        const degree = this.parseExpr();
        this.expect('rbrack');
        this.expect('lparen');
        const arg = this.parseExpr();
        const close = this.expect('rparen');
        return {
          kind: 'root',
          degree,
          arg,
          pos: { start: t.pos.start, end: close.pos.end },
        };
      }
      // sqrt(x)
      if (t.text === 'sqrt' && this.peek().kind === 'lparen') {
        this.p++;
        const arg = this.parseExpr();
        const close = this.expect('rparen');
        return {
          kind: 'root',
          degree: null,
          arg,
          pos: { start: t.pos.start, end: close.pos.end },
        };
      }
      // abs(x) — also written |x|, but the function form is accepted.
      if (t.text === 'abs' && this.peek().kind === 'lparen') {
        this.p++;
        const arg = this.parseExpr();
        const close = this.expect('rparen');
        return { kind: 'abs', arg, pos: { start: t.pos.start, end: close.pos.end } };
      }
      // generic function call
      if (FUNCTION_NAMES.has(t.text) && this.peek().kind === 'lparen') {
        this.p++;
        const args: AstNode[] = [this.parseExpr()];
        while (this.eat('comma')) args.push(this.parseExpr());
        const close = this.expect('rparen');
        return {
          kind: 'call',
          callee: t.text,
          args,
          pos: { start: t.pos.start, end: close.pos.end },
        };
      }
      return { kind: 'ident', name: t.text, pos: t.pos };
    }

    this.errors.push({
      message: `Unexpected token '${t.text || t.kind}'`,
      pos: t.pos,
    });
    // Don't consume EOF; advance otherwise.
    if (t.kind !== 'eof') this.p++;
    return { kind: 'num', value: 0, pos: t.pos };
  }
}

// ─── LaTeX renderer ──────────────────────────────────────────────────────────

export function toLatex(node: AstNode): string {
  switch (node.kind) {
    case 'num':
      return Number.isInteger(node.value) ? String(node.value) : String(node.value);
    case 'ident': {
      const greek = GREEK_LATEX[node.name];
      if (greek) return greek;
      if (node.name === 'inf') return '\\infty';
      // Multi-char generic identifier with subscript: split on first underscore.
      if (node.name.includes('_')) {
        const [head, ...rest] = node.name.split('_');
        return `${head}_{${rest.join('_')}}`;
      }
      return node.name;
    }
    case 'unary': {
      return `${node.op}${wrapForLatex(node.arg, 'unary')}`;
    }
    case 'binop': {
      if (node.op === '/') return `\\frac{${toLatex(node.left)}}{${toLatex(node.right)}}`;
      if (node.op === '^') {
        const base = wrapForLatex(node.left, 'power-base');
        const exp = toLatex(node.right);
        return `${base}^{${exp}}`;
      }
      const lhs = wrapForLatex(node.left, node.op);
      const rhs = wrapForLatex(node.right, node.op);
      if (node.op === '*') {
        if (shouldRenderImplicit(node.left, node.right)) {
          // Insert a space when concatenation would fuse a LaTeX command
          // (`\Delta`) into the next identifier (`x`) → `\Delta x`.
          const sep = lhs.endsWith('}') || /\\[a-zA-Z]+$/.test(lhs) ? ' ' : '';
          return `${lhs}${sep}${rhs}`;
        }
        return `${lhs} \\cdot ${rhs}`;
      }
      return `${lhs} ${node.op} ${rhs}`;
    }
    case 'call':
      return `\\${node.callee}(${node.args.map(toLatex).join(', ')})`;
    case 'root':
      if (node.degree) return `\\sqrt[${toLatex(node.degree)}]{${toLatex(node.arg)}}`;
      return `\\sqrt{${toLatex(node.arg)}}`;
    case 'abs':
      return `\\lvert ${toLatex(node.arg)} \\rvert`;
    case 'compare': {
      const op =
        node.op === '>=' ? '\\geq' : node.op === '<=' ? '\\leq' : node.op === '!=' ? '\\neq' : node.op;
      return `${toLatex(node.left)} ${op} ${toLatex(node.right)}`;
    }
    case 'pair':
      return `(${toLatex(node.left)};\\,${toLatex(node.right)})`;
  }
}

function shouldRenderImplicit(left: AstNode, right: AstNode): boolean {
  // 2x, 2pi, x(y+1), etc. — but not when both sides are bare numbers.
  if (left.kind === 'num' && right.kind === 'num') return false;
  if (right.kind === 'num') return false;
  return true;
}

function wrapForLatex(node: AstNode, ctx: BinOp | 'unary' | 'power-base'): string {
  const inner = toLatex(node);
  const prec = precedence(node);
  const ctxPrec = ctxPrecedence(ctx);
  if (prec < ctxPrec) return `(${inner})`;
  if (ctx === 'power-base' && (node.kind === 'unary' || node.kind === 'binop'))
    return `(${inner})`;
  return inner;
}

function precedence(node: AstNode): number {
  if (node.kind === 'binop') {
    if (node.op === '+' || node.op === '-') return 1;
    if (node.op === '*' || node.op === '/') return 2;
    return 4;
  }
  if (node.kind === 'unary') return 3;
  return 5;
}

function ctxPrecedence(ctx: BinOp | 'unary' | 'power-base'): number {
  if (ctx === '+' || ctx === '-') return 1;
  if (ctx === '*' || ctx === '/') return 2;
  if (ctx === 'unary') return 3;
  if (ctx === '^' || ctx === 'power-base') return 4;
  return 0;
}

// ─── mathjs renderer ─────────────────────────────────────────────────────────
// Produces a string that mathjs.parse / mathjs.evaluate accepts.

export function toMathjs(node: AstNode): string {
  switch (node.kind) {
    case 'num':
      return String(node.value);
    case 'ident': {
      if (node.name === 'inf') return 'Infinity';
      const greek = GREEK_MATHJS[node.name];
      if (greek) return greek;
      return node.name;
    }
    case 'unary':
      return `(${node.op}${toMathjs(node.arg)})`;
    case 'binop':
      return `(${toMathjs(node.left)} ${node.op === '^' ? '^' : node.op} ${toMathjs(node.right)})`;
    case 'call':
      return `${node.callee}(${node.args.map(toMathjs).join(', ')})`;
    case 'root':
      if (node.degree) return `nthRoot(${toMathjs(node.arg)}, ${toMathjs(node.degree)})`;
      return `sqrt(${toMathjs(node.arg)})`;
    case 'abs':
      return `abs(${toMathjs(node.arg)})`;
    case 'compare': {
      const op = node.op === '=' ? '==' : node.op === '!=' ? 'unequal' : node.op;
      if (node.op === '!=') return `unequal(${toMathjs(node.left)}, ${toMathjs(node.right)})`;
      return `(${toMathjs(node.left)} ${op} ${toMathjs(node.right)})`;
    }
    case 'pair':
      return `[${toMathjs(node.left)}, ${toMathjs(node.right)}]`;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function parseMathLite(input: string): ParseResult {
  const { tokens, errors } = tokenize(input);
  if (tokens[0]?.kind === 'eof' && input.trim() === '') {
    return { ast: null, latex: '', mathjs: '', errors };
  }
  const parser = new Parser(tokens, errors);
  const ast = parser.parseExpr();
  return {
    ast,
    latex: toLatex(ast),
    mathjs: toMathjs(ast),
    errors,
  };
}
