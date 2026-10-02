// Reaction equations, judged by counting (issue #212).
//
// A balanced equation is one of the few things a school asks for where code can be certain:
// the atoms and the charge on the left must equal those on the right, and the coefficients
// must be the smallest whole numbers that do it. Until now `evaluate.ts` compared a `formula`
// answer as one string, so "2 H2 + O2 → 2 H2O" and "O2 + 2 H2 → 2 H2O" — the same equation
// written in the other order — did not match, and anything that did not match the key exactly
// was handed to the model. The model then judged chemistry by looking at it.
//
// So this counts instead. CLAUDE.md rule 1: the model interprets, code enforces.
//
// What it deliberately does NOT do:
//   - decide whether the reaction itself is the one the task asked for. Different substances
//     mean a different reaction, and that is a question about chemistry, not about counting;
//     it stays `unknown` and goes to the model.
//   - handle hydrates ("CuSO4 · 5 H2O") or structural formulae. Both are real and neither is
//     countable this way; they stay `unknown` rather than being guessed at.

/** How many of each element, and the total charge, one side of an equation holds. */
export type Atoms = { counts: Map<string, number>; charge: number };

/** An element symbol: one capital, optionally one or two lower-case letters (Na, Cl, Uus). */
const ELEMENT = /^[A-Z][a-z]{0,2}/;

/**
 * States of matter are notation, not substance: (s) (l) (g) (aq) and their German and
 * Romance equivalents all mean "and it is a solid/liquid/gas/dissolved". They are dropped
 * before parsing — never parsed, because "(aq)" is not a group of elements.
 */
const STATE = /\((?:s|l|g|aq|fest|flüssig|gasf|gasförmig|sol|liq|gaz|ac|aq\.)\)/gi;

/**
 * The arrows a school writes for a reaction. Deliberately NOT "=", "=>" or "⇒": those are
 * equals and implication, and a physics formula like "U = R I" is three real element
 * symbols (uranium, roentgenium, iodine). Counting that as a reaction equation would
 * produce a confident, wrong verdict — exactly what rule 5 forbids. A reaction needs a
 * reaction arrow.
 */
const ARROW = /(?:<=>|<->|⇌|⟶|→|->|\\rightleftharpoons|\\rightarrow|\\longrightarrow|\\to)/;

function cleaned(s: string): string {
  return (
    s
      .replace(STATE, '')
      // The app's math notation reaches here as plain text: $…$, \cdot and friends carry no
      // chemistry, and a stray \, is a thin space.
      .replace(/\$/g, '')
      .replace(/\\(?:cdot|,|;|:|!|quad|qquad|text|mathrm|ce)\b/g, ' ')
      // The key is written in the app's notation (MATH_NOTATION_RULE, issue #239): an index is
      // `_{2}` and a charge `^{2-}`. The index is just the digits that follow the symbol; the
      // charge keeps its caret, which is what tells "SO4^2-" from "SO42-".
      .replace(
        /_\{\s*(\d+)\s*\}|_(\d+)/g,
        (_, braced?: string, bare?: string) => braced ?? bare ?? '',
      )
      .replace(/\^\{\s*([^{}]*?)\s*\}/g, '^$1')
      .replace(/[{}]/g, ' ')
      // Non-breaking and thin spaces are spaces; a middle dot or bullet is NOT normalised
      // away, because it marks a hydrate ("CuSO4 · 5 H2O"), which this module refuses — and
      // leaving the character in is what makes the parse fail instead of silently dropping
      // the water from the formula.
      .replace(/[\u00a0\u2007\u202f\u2009\u2002-\u2006]/g, ' ')
      .trim()
  );
}

/** Subscript and superscript digits a phone keyboard or a paste can produce. */
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';

function digitsNormalised(s: string): string {
  let out = '';
  let inSuper = false;
  for (const ch of s) {
    const sub = SUB.indexOf(ch);
    const sup = SUP.indexOf(ch);
    if (sub >= 0) {
      out += String(sub);
      inSuper = false;
    } else if (sup >= 0) {
      // One caret per RUN of superscript digits: "SO₄²⁻" is a charge of 2-, and emitting
      // "^2^-" would make the charge unreadable.
      if (!inSuper) out += '^';
      out += String(sup);
      inSuper = true;
    } else if (ch === '⁺' || ch === '⁻') {
      // A raised sign is a charge as surely as a caret is: "MnO₄⁻" is permanganate, never MnO
      // with a charge of 4−. Without a superscript digit before it, the caret says so.
      out += `${inSuper ? '' : '^'}${ch === '⁺' ? '+' : '-'}`;
      inSuper = false;
    } else {
      out += ch;
      inSuper = false;
    }
  }
  return out;
}

type Parsed = { atoms: Map<string, number>; charge: number } | null;

/**
 * One substance: element symbols with indices, brackets, and an optional charge at the end.
 * Returns null for anything it cannot account for completely — a parser that guesses is worse
 * than no parser, because its verdict would be certain and wrong (rule 5).
 */
export function parseFormula(raw: string): Parsed {
  const spaced = digitsNormalised(cleaned(raw)).trim();
  if (spaced === '') return null;
  let charge = 0;

  // The charge sits at the end. Three forms, most explicit first:
  //   SO4^2-   the caret says the 2 belongs to the charge
  //   SO4 2-   a space does the same
  //   Fe3+     shorthand — ONE digit only. "SO42-" is genuinely ambiguous (SO4 charge 2-, or
  //            SO42 charge 1-), and this module refuses ambiguity instead of picking one.
  const caret = /\^\s*(\d*)\s*([+-])\s*$/.exec(spaced);
  const spacedSign = /\s(\d*)\s*([+-])\s*$/.exec(spaced);
  const bare = /(\d?)([+-])\s*$/.exec(spaced);
  const m = caret ?? spacedSign ?? bare;
  let body = spaced;
  if (m) {
    // A trailing sign with two or more digits and no caret and no space: ambiguous, refuse.
    if (!caret && !spacedSign && /\d{2,}[+-]\s*$/.test(spaced)) return null;
    // One digit before the sign after SEVERAL element symbols is the same ambiguity one size
    // smaller: "NO3-" is nitrate (an index 3, charge 1−) and was read as NO with a charge of
    // 3−, which made a right half-equation "unbalanced" with full confidence (issue #263). For
    // a single element ("Fe3+", "S2-") the digit can only be the charge; for more it is not
    // certain which, so it is refused like "SO42-" — "NO3^-" or "NO3 -" says it.
    // A complex ion's bracket ("[Cu(NH3)4]2+") closes the formula, so a digit after it is the
    // charge; only a digit right after an element symbol is in question.
    if (
      !caret &&
      !spacedSign &&
      m[1] !== '' &&
      /[A-Za-z]\d[+-]\s*$/.test(spaced) &&
      (spaced.match(/[A-Z]/g) ?? []).length > 1
    ) {
      return null;
    }
    const size = Number(m[1] === '' ? '1' : m[1]) || 1;
    charge = size * (m[2] === '-' ? -1 : 1);
    body = spaced.slice(0, m.index);
    if (body.trim() === '') return null;
  }
  body = body.replace(/\s+/g, '');
  if (body === '') return null;

  const atoms = new Map<string, number>();
  // Each open bracket pushes the counts collected so far; closing it multiplies and merges.
  const stack: Map<string, number>[] = [];
  let current = atoms;
  let i = 0;

  const index = (): number => {
    const d = /^\d+/.exec(body.slice(i));
    if (!d) return 1;
    i += d[0].length;
    return Number(d[0]);
  };

  while (i < body.length) {
    const ch = body[i]!;
    if (ch === '(' || ch === '[') {
      stack.push(current);
      current = new Map();
      i += 1;
      continue;
    }
    if (ch === ')' || ch === ']') {
      i += 1;
      const n = index();
      const outer = stack.pop();
      if (!outer) return null;
      for (const [el, c] of current) outer.set(el, (outer.get(el) ?? 0) + c * n);
      current = outer;
      continue;
    }
    const el = ELEMENT.exec(body.slice(i));
    if (!el) return null;
    // "Cl2" is chlorine, but "Clx" is nothing: a symbol is only as long as what follows it
    // can start the next thing. Two lower-case letters are rare but real (Uus).
    let symbol = el[0];
    while (symbol.length > 1) {
      const rest = body.slice(i + symbol.length);
      if (rest === '' || /^[\d([A-Z)\]]/.test(rest)) break;
      symbol = symbol.slice(0, -1);
    }
    i += symbol.length;
    const n = index();
    current.set(symbol, (current.get(symbol) ?? 0) + n);
  }
  if (stack.length > 0) return null;
  if (atoms.size === 0) return null;
  return { atoms, charge };
}

/**
 * The substances of one side. A "+" is a SEPARATOR between substances, except where it is the
 * sign of a charge — and the two are told apart without guessing: a charge "+" is the last
 * thing on the side, or the next thing after it is the separator itself. "Fe^3+ + 3 OH-" has
 * one of each, "2 H2 + O2" has only a separator, "Na+" only a charge.
 */
export function termsOf(side: string): string[] {
  const s = digitsNormalised(cleaned(side));
  const terms: string[] = [];
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '+') continue;
    const after = s.slice(i + 1).replace(/^\s+/, '');
    // Nothing follows, or what follows is the separator: this "+" is a charge.
    if (after === '' || after.startsWith('+')) continue;
    terms.push(s.slice(start, i));
    start = i + 1;
  }
  terms.push(s.slice(start));
  return terms.map((t) => t.trim()).filter((t) => t !== '');
}

/** "e-", "e^-", "e⁻", "e^{-}": the electron, however it is written. Never a bare "e". */
function isElectron(raw: string): boolean {
  return /^e\^?-$/.test(digitsNormalised(cleaned(raw)).replace(/\s+/g, ''));
}

/** One side: substances joined by "+", each with an optional coefficient. */
function parseSide(raw: string): { atoms: Atoms; coefficients: number[] } | null {
  const parts = termsOf(raw);
  if (parts.length === 0) return null;
  const counts = new Map<string, number>();
  let charge = 0;
  const coefficients: number[] = [];
  for (const part of parts) {
    const m = /^(\d+)\s*(.+)$/.exec(digitsNormalised(cleaned(part)));
    const n = m ? Number(m[1]) : 1;
    const formula = m ? m[2]! : part;
    if (n === 0) return null;
    // An electron in a half-equation (issue #263, redox): no atoms, one negative charge each.
    // "Fe → Fe³⁺ + 3 e⁻" is balanced by charge exactly when the electrons are counted right,
    // so a wrong electron count is found by the charge check below and named by it.
    if (isElectron(formula)) {
      coefficients.push(n);
      charge -= n;
      continue;
    }
    const parsed = parseFormula(formula);
    if (!parsed) return null;
    coefficients.push(n);
    charge += parsed.charge * n;
    for (const [el, c] of parsed.atoms) counts.set(el, (counts.get(el) ?? 0) + c * n);
  }
  return { atoms: { counts, charge }, coefficients };
}

export type Equation = {
  left: Atoms;
  right: Atoms;
  coefficients: number[];
  /** The substances as written, so two equations can be compared without their coefficients. */
  substances: { left: string[]; right: string[] };
};

/** Whether a string is worth trying as an equation at all — an arrow and a capital letter. */
export function looksLikeEquation(s: string): boolean {
  const c = cleaned(s);
  return ARROW.test(c) && /[A-Z]/.test(c);
}

/** The formula of each substance with its coefficient stripped, for comparing reactions. */
function substancesOf(side: string): string[] {
  return (
    termsOf(side)
      // The caret only says the digits after it are a charge: "Fe^3+" and "Fe3+" are one ion,
      // "e^-" and "e-" one electron.
      // "OH^-" (the app's notation) and "OH⁻" (the charge key) are one ion too (issue #239).
      .map((p) => p.replace(/\s+/g, '').replace(/^\d+/, '').replace(/\^/g, ''))
      .filter((p) => p !== '')
      .sort()
  );
}

export function parseEquation(raw: string): Equation | null {
  const c = cleaned(raw);
  if (!ARROW.test(c)) return null;
  const sides = c.split(ARROW);
  if (sides.length !== 2) return null;
  const [l, r] = sides as [string, string];
  const left = parseSide(l);
  const right = parseSide(r);
  if (!left || !right) return null;
  return {
    left: left.atoms,
    right: right.atoms,
    coefficients: [...left.coefficients, ...right.coefficients],
    substances: { left: substancesOf(l), right: substancesOf(r) },
  };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * What is wrong with an equation, as a fact she can act on. `element` names the one that does
 * not add up; with several, the alphabetically first is named, because naming all of them at
 * once is a list to work through rather than a next step.
 */
export type Imbalance =
  | { kind: 'element'; element: string; left: number; right: number }
  | { kind: 'charge'; left: number; right: number };

export function imbalanceOf(eq: Equation): Imbalance | null {
  const elements = [...new Set([...eq.left.counts.keys(), ...eq.right.counts.keys()])].sort();
  for (const el of elements) {
    const l = eq.left.counts.get(el) ?? 0;
    const r = eq.right.counts.get(el) ?? 0;
    if (l !== r) return { kind: 'element', element: el, left: l, right: r };
  }
  if (eq.left.charge !== eq.right.charge) {
    return { kind: 'charge', left: eq.left.charge, right: eq.right.charge };
  }
  return null;
}

/** Balanced, but every coefficient divisible by the same number: right, and not yet reduced. */
export function needsReducing(eq: Equation): number {
  const factor = eq.coefficients.reduce((a, b) => gcd(a, b), 0);
  return factor > 1 ? factor : 1;
}

/** The two outcomes that carry a fact to tell her; the reply is built from these alone. */
export type EquationFault =
  | { verdict: 'not_lowest'; factor: number }
  | { verdict: 'unbalanced'; imbalance: Imbalance };

export type EquationVerdict =
  | { verdict: 'correct' }
  | EquationFault
  /** Not countable, or about different substances: a question for the model, not for code. */
  | { verdict: 'unknown' };

/**
 * Her equation against the key. The order of the substances does not matter; the coefficients
 * do. Different substances are NOT called wrong here — that is a statement about the reaction,
 * and this module only counts.
 */
export function checkEquation(key: string, text: string): EquationVerdict {
  if (!looksLikeEquation(key) || !looksLikeEquation(text)) return { verdict: 'unknown' };
  const want = parseEquation(key);
  const got = parseEquation(text);
  if (!want || !got) return { verdict: 'unknown' };
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  if (!same(want.substances.left, got.substances.left)) return { verdict: 'unknown' };
  if (!same(want.substances.right, got.substances.right)) return { verdict: 'unknown' };

  const imbalance = imbalanceOf(got);
  if (imbalance) return { verdict: 'unbalanced', imbalance };
  const factor = needsReducing(got);
  if (factor > 1) return { verdict: 'not_lowest', factor };
  return { verdict: 'correct' };
}

/**
 * A ratio with THREE OR MORE parts — the result of a dihybrid cross, 9:3:3:1 — compared
 * reduced rather than as a string, so "18:6:6:2" counts.
 *
 * Two parts are deliberately refused. "3:1" and "14:30" are the same characters, and so is
 * "3:4" written as a division the way German schools write it; which of the three is meant is
 * not in the characters. The grading truth table has a case for exactly this ("14:30" against
 * "14:50" must stay undecided), and issue #175 closed on the same ground: guessing the meaning
 * from context is what CLAUDE.md rule 3 forbids. Three colon-separated numbers have no second
 * reading — no clock time and no division looks like that — so that is where certainty starts.
 *
 * The two-part case needs a marker from the extraction to say "this is a ratio" (issue #157).
 * Until then it goes to the tutor, like any other answer code cannot decide.
 */
export function sameRatio(key: string, text: string): boolean | null {
  const parse = (s: string): number[] | null => {
    const parts = cleaned(s)
      .replace(/\s+/g, '')
      .split(/[:∶﹕：]/);
    // Three or more numbers: unambiguous. See the comment above for why two are not.
    if (parts.length < 3) return null;
    const nums = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
    if (nums.some((n) => !Number.isFinite(n) || n <= 0)) return null;
    return nums;
  };
  const want = parse(key);
  const got = parse(text);
  if (!want || !got) return null;
  if (want.length !== got.length) return false;
  const reduce = (ns: number[]) => {
    const f = ns.reduce((a, b) => gcd(a, b), 0) || 1;
    return ns.map((n) => n / f);
  };
  const a = reduce(want);
  const b = reduce(got);
  return a.every((n, i) => n === b[i]);
}

/**
 * Whether a parsed formula is worth treating as a SUBSTANCE rather than a word that happens to
 * start with a capital. "He" is helium and also the English pronoun; "A" is nothing. Two atoms,
 * or two different elements, is where a chemical formula starts being unmistakable.
 */
function isSubstance(p: { atoms: Map<string, number>; charge: number }): boolean {
  // A charge is never a word: "Fe^3+" is an ion and nothing else, even though it is one atom
  // of one element.
  if (p.charge !== 0) return true;
  if (p.atoms.size >= 2) return true;
  let total = 0;
  for (const n of p.atoms.values()) total += n;
  return total >= 2;
}

export type SubstanceCheck = 'same' | 'different' | 'unknown';

/**
 * Her answer against a key, when BOTH are chemical formulas (issue #227, finding 6). Without
 * this, "H₂SO₄" for a key of "H2SO4" — the same substance, written with subscripts — went to the
 * model, and so did "H2SO3", which is certainly a different substance. Counting decides both.
 *
 * `unknown` whenever either side is not unmistakably a formula: a name ("Wasser"), a single
 * capital letter, anything that does not parse. Code may not turn a word into a substance.
 */
export function sameSubstance(key: string, text: string): SubstanceCheck {
  // An equation is counted by `checkEquation`; this is for a single substance.
  if (looksLikeEquation(key) || looksLikeEquation(text)) return 'unknown';
  const a = parseFormula(key);
  const b = parseFormula(text);
  if (!a || !b || !isSubstance(a) || !isSubstance(b)) return 'unknown';
  if (a.charge !== b.charge) return 'different';
  if (a.atoms.size !== b.atoms.size) return 'different';
  for (const [el, n] of a.atoms) if (b.atoms.get(el) !== n) return 'different';
  return 'same';
}
