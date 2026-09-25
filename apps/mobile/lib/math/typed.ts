// What the learner typed into the answer field → the same text with its math
// set as $…$ (LaTeX subset of parse.ts), for the live preview under the field:
// "3/4" → "$\frac{3}{4}$", "x^2" / "x²" → "$x^{2}$", "sqrt(16)" / "√16" →
// "$\sqrt{16}$", "2*3" → "$2\cdot 3$". Words stay words ("3/4 kg" → "$\frac{3}{4}$ kg").
//
// The grouping follows how the answer check reads the text
// (packages/shared-math: "/" and "·" left to right, "^" binds tighter), so the
// preview never shows a different fraction than the one that gets checked.
// Pure logic without React Native imports, so it runs in the unit tests.

export type TypedMath = {
  /** The text with its math as $…$; plain parts escaped so they never turn into math. */
  text: string;
  /** True when there is math worth drawing: a fraction, a power, a root or an operator between two terms. */
  worth: boolean;
};

/** Longer answers are sentences, not formulas: no preview. */
export const MAX_PREVIEW_INPUT = 200;

type Tok =
  | { t: 'word'; v: string }
  | { t: 'num'; v: string }
  | { t: 'var'; v: string }
  | { t: 'pi' }
  | { t: 'sqrt' }
  | { t: 'op'; v: string }
  | { t: 'slash' }
  | { t: 'caret' }
  | { t: 'pow'; v: string }
  | { t: 'suffix'; v: string }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'space'; v: string }
  | { t: 'other'; v: string };

const OPS = [
  '<=',
  '>=',
  '!=',
  '+',
  '-',
  '−',
  '–',
  '*',
  '·',
  '×',
  '÷',
  ':',
  '=',
  '<',
  '>',
  '≤',
  '≥',
  '≠',
  '≈',
  '±',
];

function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const num = /^\d+(?:[.,]\d+)*/.exec(rest);
    if (num) {
      out.push({ t: 'num', v: num[0] });
      i += num[0].length;
      continue;
    }
    const c = text[i] as string;
    if (c === 'π') {
      out.push({ t: 'pi' });
      i++;
      continue;
    }
    const letters = /^\p{L}+/u.exec(rest);
    if (letters) {
      const w = letters[0];
      const lower = w.toLowerCase();
      if (lower === 'sqrt') out.push({ t: 'sqrt' });
      else if (lower === 'pi') out.push({ t: 'pi' });
      else if (w.length === 1 && /[a-zA-Z]/.test(w)) out.push({ t: 'var', v: w });
      else out.push({ t: 'word', v: w });
      i += w.length;
      continue;
    }
    const space = /^\s+/.exec(rest);
    if (space) {
      out.push({ t: 'space', v: space[0] });
      i += space[0].length;
      continue;
    }
    const op = OPS.find((o) => rest.startsWith(o));
    if (op) {
      out.push({ t: 'op', v: op });
      i += op.length;
      continue;
    }
    i++;
    if (c === '√') out.push({ t: 'sqrt' });
    else if (c === '/') out.push({ t: 'slash' });
    else if (c === '^') out.push({ t: 'caret' });
    else if (c === '²' || c === '³') out.push({ t: 'pow', v: c === '²' ? '2' : '3' });
    else if (c === '°' || c === '%') out.push({ t: 'suffix', v: c });
    else if (c === '(') out.push({ t: 'lp' });
    else if (c === ')') out.push({ t: 'rp' });
    else out.push({ t: 'other', v: c });
  }
  return out;
}

// ─────────────── one run of math: a small tree ───────────────

type Node =
  | { k: 'atom'; latex: string }
  | { k: 'group'; items: Node[]; closed: boolean }
  | { k: 'sqrt'; body: Node | null }
  | { k: 'pow'; base: Node; exp: Node | null; sign: string }
  | { k: 'frac'; num: Node; den: Node }
  | { k: 'op'; v: string }
  | { k: 'space' }
  | { k: 'lit'; v: string };

const isOperand = (n: Node | undefined): boolean =>
  n !== undefined &&
  (n.k === 'atom' || n.k === 'group' || n.k === 'sqrt' || n.k === 'pow' || n.k === 'frac');

class Parser {
  pos = 0;
  constructor(readonly toks: Tok[]) {}

  /** A sequence up to the end (or up to the ")" that closes a group). */
  seq(inGroup: boolean): { items: Node[]; closed: boolean } {
    const items: Node[] = [];
    while (this.pos < this.toks.length) {
      const tok = this.toks[this.pos] as Tok;
      if (tok.t === 'rp') {
        this.pos++;
        if (inGroup) return { items: fractions(items), closed: true };
        items.push({ k: 'lit', v: ')' });
        continue;
      }
      if (tok.t === 'op') {
        this.pos++;
        items.push({ k: 'op', v: tok.v });
        continue;
      }
      if (tok.t === 'space') {
        this.pos++;
        items.push({ k: 'space' });
        continue;
      }
      if (tok.t === 'slash') {
        this.pos++;
        items.push({ k: 'lit', v: '/' });
        continue;
      }
      if (tok.t === 'suffix') {
        this.pos++;
        const prev = items[items.length - 1];
        if (prev?.k === 'atom')
          items[items.length - 1] = { k: 'atom', latex: prev.latex + suffix(tok.v) };
        else items.push({ k: 'lit', v: suffix(tok.v) });
        continue;
      }
      const operand = this.operand();
      if (operand) items.push(operand);
      else {
        // caret without a base, stray power sign, word, other
        this.pos++;
        items.push({
          k: 'lit',
          v: tok.t === 'pow' ? tok.v : tok.t === 'caret' ? '^' : 'v' in tok ? tok.v : '',
        });
      }
    }
    return { items: fractions(items), closed: false };
  }

  /** A term with its powers: 3, x, π, (…), √…, x^2, (a+b)², … — or null. */
  operand(): Node | null {
    let base = this.primary();
    if (!base) return null;
    for (;;) {
      const tok = this.toks[this.pos];
      if (tok?.t === 'pow') {
        this.pos++;
        base = { k: 'pow', base, exp: { k: 'atom', latex: tok.v }, sign: '' };
        continue;
      }
      if (tok?.t === 'caret') {
        this.pos++;
        let sign = '';
        const s = this.toks[this.pos];
        if (s?.t === 'op' && (s.v === '-' || s.v === '−' || s.v === '–' || s.v === '+')) {
          sign = s.v === '+' ? '+' : '-';
          this.pos++;
        }
        base = { k: 'pow', base, exp: this.operand(), sign };
        continue;
      }
      return base;
    }
  }

  primary(): Node | null {
    const tok = this.toks[this.pos];
    if (!tok) return null;
    switch (tok.t) {
      case 'num':
        this.pos++;
        return { k: 'atom', latex: tok.v };
      case 'var':
        this.pos++;
        return { k: 'atom', latex: tok.v };
      case 'pi':
        this.pos++;
        return { k: 'atom', latex: '\\pi ' };
      case 'lp': {
        this.pos++;
        const g = this.seq(true);
        return { k: 'group', items: g.items, closed: g.closed };
      }
      case 'sqrt': {
        this.pos++;
        while (this.toks[this.pos]?.t === 'space') this.pos++;
        // Like the check: "√x²" is (√x)², the power belongs to the root.
        return { k: 'sqrt', body: this.primary() };
      }
      default:
        return null;
    }
  }
}

function suffix(c: string): string {
  return c === '%' ? '\\%' : c;
}

/** "a / b" → a fraction, left to right ("6/2/3" = (6/2)/3), where both sides are terms. */
function fractions(items: Node[]): Node[] {
  const out: Node[] = [];
  for (let i = 0; i < items.length; i++) {
    const n = items[i] as Node;
    if (n.k === 'lit' && n.v === '/') {
      let l = out.length - 1;
      while (out[l]?.k === 'space') l--;
      let r = i + 1;
      while (items[r]?.k === 'space') r++;
      const left = out[l];
      const right = items[r];
      if (left && right && isOperand(left) && isOperand(right)) {
        out.length = l;
        out.push({ k: 'frac', num: left, den: right });
        i = r;
        continue;
      }
    }
    out.push(n);
  }
  return out;
}

// ─────────────── worth drawing? ───────────────

function worth(items: Node[]): boolean {
  for (let i = 0; i < items.length; i++) {
    const n = items[i] as Node;
    if (n.k === 'frac' || n.k === 'sqrt') return true;
    if (n.k === 'pow' && n.exp !== null) return true;
    if (n.k === 'group' && worth(n.items)) return true;
    if (n.k === 'op') {
      let l = i - 1;
      while (items[l]?.k === 'space') l--;
      let r = i + 1;
      while (items[r]?.k === 'space') r++;
      if (isOperand(items[l]) && isOperand(items[r])) return true;
    }
  }
  return false;
}

// ─────────────── LaTeX ───────────────

const OP_LATEX: Readonly<Record<string, string>> = {
  '*': '\\cdot ',
  '·': '\\cdot ',
  '×': '\\times ',
  '÷': '\\div ',
  ':': '\\,:\\,',
  '-': '-',
  '−': '-',
  '–': '-',
  '<=': '\\le ',
  '>=': '\\ge ',
  '!=': '\\ne ',
  '≤': '\\le ',
  '≥': '\\ge ',
  '≠': '\\ne ',
  '≈': '\\approx ',
  '±': '\\pm ',
};

function escapeLatex(s: string): string {
  return s.replace(/[\\{}$_^%#&]/g, (c) => (c === '\\' ? '' : `\\${c}`));
}

function seqLatex(items: Node[]): string {
  let out = '';
  items.forEach((n, i) => {
    if (n.k === 'space') {
      // Between two terms a space means something ("1 1/2"): keep a small gap.
      let r = i + 1;
      while (items[r]?.k === 'space') r++;
      if (isOperand(items[i - 1]) && isOperand(items[r]) && items[i - 1]?.k !== 'space')
        out += '\\,';
      return;
    }
    out += nodeLatex(n);
  });
  return out;
}

/** A term as the argument of \frac, \sqrt or ^: the brackets that group it are not drawn. */
function argLatex(n: Node | null): string {
  if (n === null) return '';
  return n.k === 'group' ? seqLatex(n.items) : nodeLatex(n);
}

function nodeLatex(n: Node): string {
  switch (n.k) {
    case 'atom':
      return n.latex;
    case 'group':
      return `(${seqLatex(n.items)}${n.closed ? ')' : ''}`;
    case 'sqrt':
      return `\\sqrt{${argLatex(n.body)}}`;
    case 'pow':
      return `${nodeLatex(n.base)}^{${n.sign}${argLatex(n.exp)}}`;
    case 'frac':
      return `\\frac{${argLatex(n.num)}}{${argLatex(n.den)}}`;
    case 'op':
      return OP_LATEX[n.v] ?? n.v;
    case 'space':
      return '';
    case 'lit':
      return escapeLatex(n.v);
  }
}

// ─────────────── the whole answer ───────────────

/** Words, sentence punctuation and line breaks end a run of math. */
function breaksMath(tok: Tok): boolean {
  return tok.t === 'word' || tok.t === 'other' || (tok.t === 'space' && tok.v.includes('\n'));
}

function tokText(tok: Tok): string {
  switch (tok.t) {
    case 'pi':
      return 'π';
    case 'sqrt':
      return '√';
    case 'slash':
      return '/';
    case 'caret':
      return '^';
    case 'lp':
      return '(';
    case 'rp':
      return ')';
    case 'pow':
      return tok.v === '2' ? '²' : '³';
    default:
      return tok.v;
  }
}

/** Plain text that must never be read as math or bold by MathText. */
function escapePlain(s: string): string {
  return s.replace(/\$/g, '\\$');
}

/** The typed text with its math as $…$, and whether that math is worth a preview. */
export function typedMath(input: string): TypedMath {
  if (input.length > MAX_PREVIEW_INPUT) return { text: escapePlain(input), worth: false };
  const toks = tokenize(input);
  let text = '';
  let any = false;
  let i = 0;
  while (i < toks.length) {
    const tok = toks[i] as Tok;
    if (breaksMath(tok) || tok.t === 'space') {
      text += escapePlain(tokText(tok));
      i++;
      continue;
    }
    // A run of math: up to the next word/punctuation, without trailing spaces.
    let j = i;
    while (j < toks.length && !breaksMath(toks[j] as Tok)) j++;
    let end = j;
    while (end > i && toks[end - 1]?.t === 'space') end--;
    const run = toks.slice(i, end);
    const { items } = new Parser(run).seq(false);
    if (worth(items)) {
      any = true;
      text += `$${seqLatex(items)}$`;
    } else text += escapePlain(run.map(tokText).join(''));
    i = end;
  }
  return { text, worth: any };
}
