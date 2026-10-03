// The math notation a text may carry (issue #239): the one list of LaTeX commands the app
// draws and reads out, and the rule the model is given, built from that same list.
//
// Three places used to keep their own idea of it — the app's parser (what it draws), the
// model's prompt (what it is told it may write) and nobody at all for what is checked. They
// drifted: the prompt promised `\rightleftharpoons`, and the app showed the word
// "rightleftharpoons" in the middle of an equation. Now:
//
//   - the app's parser takes its symbols from `MATH_SYMBOLS` and handles every name in
//     `MATH_COMMANDS` (apps/mobile/lib/math/parse.ts; a unit test there parses each one and
//     fails on any that falls through to the "unknown command" path);
//   - every entry of `MATH_PROMPTED` is parsed AND spoken by the app (unit test in
//     apps/mobile/lib/math/__tests__/notation.test.ts), and `MATH_NOTATION_RULE` — the
//     sentence the model reads — is generated from it;
//   - `unsupportedMath` finds a command outside the list, and the server drops a question
//     that uses one (apps/api/src/modules/practice/items.ts) instead of showing a learner
//     a backslash word.
//
// Lives in the contracts because it IS one: it says what a question text may contain.

/** Commands drawn as one character. */
export const MATH_SYMBOLS: Readonly<Record<string, string>> = {
  cdot: '·',
  times: '×',
  div: '÷',
  pi: 'π',
  le: '≤',
  leq: '≤',
  ge: '≥',
  geq: '≥',
  ne: '≠',
  neq: '≠',
  approx: '≈',
  degree: '°',
  circ: '°',
  pm: '±',
  infty: '∞',
  Rightarrow: '⇒',
  rightarrow: '→',
  to: '→',
  Leftrightarrow: '⇔',
  // Chemistry (issue #239): the reaction arrow and the equilibrium. `\rightarrow` stays the
  // arrow of a mapping or a limit ("x → 0"); a reaction has its own, so it can be read out as
  // "reagiert zu" instead of "geht nach".
  longrightarrow: '⟶',
  rightleftharpoons: '⇌',
  cdots: '⋯',
  ldots: '…',
  dots: '…',
  percent: '%',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  Delta: 'Δ',
  varepsilon: 'ε',
  epsilon: 'ε',
  theta: 'θ',
  lambda: 'λ',
  mu: 'μ',
  sigma: 'σ',
  phi: 'φ',
  varphi: 'φ',
  omega: 'ω',
  // Geometry and sets (grade 5–8).
  angle: '∠',
  measuredangle: '∠',
  parallel: '∥',
  perp: '⊥',
  bot: '⊥',
  triangle: '△',
  cong: '≅',
  sim: '∼',
  in: '∈',
  notin: '∉',
  subset: '⊂',
  subseteq: '⊆',
  cup: '∪',
  cap: '∩',
  emptyset: '∅',
  varnothing: '∅',
  setminus: '∖',
  mid: '|',
  equiv: '≡',
  neg: '¬',
  wedge: '∧',
  vee: '∨',
  prime: '′',
};

/**
 * Operators that carry limits below and above (∑ from i = 1 to n). Drawn as one atom with its
 * limits, read as "Summe von … bis …" — not as a character followed by an index and a power.
 */
export const MATH_LIMIT_OPERATORS: Readonly<Record<string, string>> = {
  sum: '∑',
  prod: '∏',
  int: '∫',
  lim: 'lim',
};

/** \mathbb{…} letters for the number sets. */
export const MATH_BLACKBOARD: Readonly<Record<string, string>> = {
  N: 'ℕ',
  Z: 'ℤ',
  Q: 'ℚ',
  R: 'ℝ',
  C: 'ℂ',
};

/** Commands that build structure, style or spacing — each handled by name in the app's parser. */
export const MATH_STRUCTURES = [
  'frac',
  'dfrac',
  'tfrac',
  'sqrt',
  'binom',
  'xrightarrow',
  'begin',
  'end',
  'left',
  'right',
  'big',
  'Big',
  'text',
  'mathrm',
  'textrm',
  'mbox',
  'operatorname',
  'quad',
  'qquad',
  'square',
  'Box',
  'overline',
  'bar',
  'vec',
  'overrightarrow',
  'mathbb',
  'mathbf',
  'mathit',
  'boldsymbol',
  'displaystyle',
  'textstyle',
  'sin',
  'cos',
  'tan',
  'log',
  'ln',
  'exp',
  'min',
  'max',
] as const;

/** The environments \begin{…} may open: a column vector or a small matrix in round brackets. */
export const MATH_ENVIRONMENTS = ['pmatrix'] as const;

/** One-character commands: spacing (\, \;), escaped braces and signs, a row break (\\). */
const ESCAPES = new Set([',', ';', ':', ' ', '!', '{', '}', '%', '$', '#', '&', '_', '\\']);

/** Every named command the app handles. */
export const MATH_COMMANDS: ReadonlySet<string> = new Set([
  ...Object.keys(MATH_SYMBOLS),
  ...Object.keys(MATH_LIMIT_OPERATORS),
  ...MATH_STRUCTURES,
]);

/**
 * The commands in a text the app does not handle — named commands outside `MATH_COMMANDS`
 * and environments outside `MATH_ENVIRONMENTS` — each once, in the order they appear. Empty
 * when everything can be drawn and read out.
 *
 * Checked over the WHOLE text, not only inside $…$: a command outside math is shown as it is
 * written, backslash and all, which is the same failure in a different place.
 */
export function unsupportedMath(text: string): string[] {
  const out: string[] = [];
  const add = (s: string) => {
    if (!out.includes(s)) out.push(s);
  };
  const re = /\\([a-zA-Z]+|[^a-zA-Z])/g;
  for (const m of text.matchAll(re)) {
    const name = m[1]!;
    if (name.length === 1 && !/[a-zA-Z]/.test(name)) {
      if (!ESCAPES.has(name)) add(`\\${name}`);
      continue;
    }
    if (!MATH_COMMANDS.has(name)) {
      add(`\\${name}`);
      continue;
    }
    if (name === 'begin' || name === 'end') {
      const env = /^\s*\{([^{}]*)\}/.exec(text.slice(m.index + m[0].length));
      const which = env?.[1]?.trim() ?? '';
      if (!(MATH_ENVIRONMENTS as readonly string[]).includes(which)) add(`\\${name}{${which}}`);
    }
  }
  return out;
}

/** One entry of what the model is told it may write. */
export type PromptedNotation = { latex: string; note?: string };

/**
 * Exactly what the model is told (`MATH_NOTATION_RULE`). Every entry is drawn and spoken by
 * the app — the test in apps/mobile/lib/math/__tests__/notation.test.ts walks this list, so an
 * entry added here without its drawing or its spoken words fails there.
 */
export const MATH_PROMPTED: readonly PromptedNotation[] = [
  { latex: '\\frac{a}{b}' },
  { latex: 'x^{2}' },
  { latex: 'x_{1}' },
  { latex: '\\sqrt{x}' },
  { latex: '\\sqrt[3]{x}' },
  { latex: '\\cdot' },
  { latex: '\\times' },
  { latex: '\\div' },
  { latex: '\\pi' },
  { latex: '\\le' },
  { latex: '\\ge' },
  { latex: '\\ne' },
  { latex: '\\approx' },
  { latex: '\\pm' },
  { latex: '\\degree' },
  { latex: '\\text{cm}', note: 'a unit or a word inside math' },
  { latex: '\\longrightarrow', note: 'the reaction arrow' },
  { latex: '\\xrightarrow{\\text{light}}', note: 'a reaction arrow with its condition above it' },
  { latex: '\\rightleftharpoons', note: 'an equilibrium' },
  { latex: '\\rightarrow', note: 'maps to, tends to — never for a reaction' },
  { latex: '\\overline{3}', note: 'repeating decimal, segment' },
  { latex: '\\angle' },
  { latex: '\\parallel' },
  { latex: '\\perp' },
  { latex: '\\in' },
  { latex: '\\mathbb{N}' },
  { latex: '\\vec{v}' },
  { latex: '\\sum_{i=1}^{n}' },
  { latex: '\\int_{a}^{b}' },
  { latex: '\\lim_{x \\to 0}' },
  { latex: '\\binom{n}{k}' },
  { latex: '\\begin{pmatrix} 1 \\\\ 2 \\end{pmatrix}', note: 'a column vector' },
];

/** The rule every prompt that lets the model write math carries, generated from the list above. */
export const MATH_NOTATION_RULE = `Math (also in choices, answers and accepted_answers): write it between dollar signs, using ONLY these LaTeX commands — the app cannot show any other, and a question that uses one is dropped: ${MATH_PROMPTED.map(
  (e) => (e.note ? `${e.latex} (${e.note})` : e.latex),
).join(
  ', ',
)}. Example: "Kürze $\\frac{6}{8}$." Chemistry: indices and charges as sub- and superscripts, "$2H_{2} + O_{2} \\longrightarrow 2H_{2}O$", "$SO_{4}^{2-}$". Plain numbers and words stay outside the dollar signs. A dollar sign meaning money is written \\$ ("kostet \\$5").`;

/** The short form for a reply in a conversation (tutor, hints, Buddy's own explanations). */
export const MATH_NOTATION_SHORT = `Math between dollar signs, only in this LaTeX subset: ${MATH_PROMPTED.map(
  (e) => e.latex,
).join(', ')}.`;
