// The spoken form of a text with math, for screen readers: "$\frac{3}{4}$" →
// "3 durch 4". The words come from the locale (locales/<lang>/math.json,
// key "spoken"); this module only arranges them. Pure logic, unit-tested.

import { splitMath, type MathAtom } from './parse.js';

export type SpokenWords = {
  /** "{{num}} durch {{den}}" — the fallback for a denominator with no simple word. */
  frac: string;
  /** "ein {{name}}" (numerator 1: "ein Fünftel", "un demi", "one half") */
  frac_one: string;
  /** "{{num}} {{name}}" ("2 Fünftel", "2 fifths", "2 cinquièmes") */
  frac_named: string;
  /**
   * What a denominator is called, singular and plural ("5" → Fünftel/Fünftel,
   * fifth/fifths, demi/demis). A denominator the language has no simple word for is
   * absent, and the fraction falls back to `frac` — clumsy, but never a made-up word.
   */
  frac_names: Readonly<Record<string, { one: string; many: string }>>;
  /** "Bruch: {{num}} durch {{den}}" (numerator or denominator longer than one term) */
  frac_long: string;
  /** "und {{frac}}": the fraction of a mixed number ($3\frac{1}{2}$ → "3 und ein Halb") */
  mixed: string;
  /** "hoch {{exp}}" */
  power: string;
  squared: string;
  cubed: string;
  /** "Index {{sub}}" */
  sub: string;
  /** "Wurzel aus {{body}}" */
  sqrt: string;
  /** "{{index}}. Wurzel aus {{body}}" */
  root: string;
  /** "dritte Wurzel aus {{body}}" */
  cbrt: string;
  /** "Periode {{body}}" (\overline over digits: 0,\overline{3}) */
  period: string;
  /** "Strecke {{body}}" (\overline over letters: \overline{AB}) */
  segment: string;
  /** "Vektor {{body}}" */
  vector: string;
  /** "Lücke" (a gap to fill in inside math) */
  blank: string;
  /** Operators and symbols by character. */
  symbols: Readonly<Record<string, string>>;
};

/** Characters read out as words → their key under "spoken.symbols" in locales/<lang>/math.json. */
export const SYMBOL_KEYS: Readonly<Record<string, string>> = {
  '+': 'plus',
  '−': 'minus',
  '=': 'equals',
  '<': 'lt',
  '>': 'gt',
  '·': 'times',
  '×': 'times',
  '÷': 'div',
  // Division as written in German-speaking schools ("6 : 3"); only inside math.
  ':': 'div',
  '/': 'slash',
  π: 'pi',
  '≤': 'le',
  '≥': 'ge',
  '≠': 'ne',
  '≈': 'approx',
  '°': 'degree',
  '±': 'pm',
  '∞': 'infty',
  '⇒': 'implies',
  '→': 'to',
  '⇔': 'iff',
  '(': 'lparen',
  ')': 'rparen',
  '%': 'percent',
  '∠': 'angle',
  '∥': 'parallel',
  '⊥': 'perp',
  '△': 'triangle',
  '≅': 'cong',
  '∼': 'sim',
  '∈': 'in',
  '∉': 'notin',
};

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => values[k] ?? '');
}

function squash(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function speakChars(text: string, words: SpokenWords): string {
  let out = '';
  for (const ch of text) {
    const word = words.symbols[ch];
    out += word !== undefined ? ` ${word} ` : ch === ' ' ? ' ' : ch;
  }
  return out;
}

function isShort(atoms: MathAtom[]): boolean {
  return atoms.length === 1 && atoms[0]?.type === 'chars' && /^[\w.,]+$/.test(atoms[0].text);
}

/**
 * A fraction as the language names it: "2/5" → "zwei Fünftel", not "zwei durch fünf"
 * (issue #175, owner 01.10.). A fraction is not a division, and reading it as one is the
 * very distinction the exercise is about.
 *
 * Only whole numbers, and only denominators the locale has a word for; everything else
 * keeps the plain form. The numeral stays a digit — every voice reads "2 Fünftel" as
 * "zwei Fünftel", and spelling it out would need a second set of number words.
 */
function namedFraction(num: string, den: string, words: SpokenWords): string | null {
  if (!/^\d+$/.test(num) || !/^\d+$/.test(den)) return null;
  const name = words.frac_names[String(Number(den))];
  if (!name) return null;
  return num === '1'
    ? fill(words.frac_one, { name: name.one })
    : fill(words.frac_named, { num, name: name.many });
}

/** A whole number right before a simple fraction: a mixed number (3½), not "3 times ½". */
function followsWholeNumber(atoms: MathAtom[], i: number): boolean {
  let j = i - 1;
  while (j >= 0 && atoms[j]?.type === 'text' && (atoms[j] as { text: string }).text.trim() === '')
    j -= 1;
  const prev = atoms[j];
  return prev?.type === 'chars' && /(^|[^\d.,])\d+$/.test(prev.text);
}

function speakAtoms(atoms: MathAtom[], words: SpokenWords): string {
  return squash(
    atoms
      .map((a, i) => {
        switch (a.type) {
          case 'chars':
            return speakChars(a.text, words);
          case 'symbol':
            return ` ${words.symbols[a.char.trim()] ?? a.char.trim()} `;
          case 'text':
            return a.text;
          case 'frac': {
            const num = speakAtoms(a.num, words);
            const den = speakAtoms(a.den, words);
            const short = isShort(a.num) && isShort(a.den);
            const named = short ? namedFraction(num, den, words) : null;
            const plain = named ?? fill(short ? words.frac : words.frac_long, { num, den });
            if (short && /^\d+$/.test(num) && /^\d+$/.test(den) && followsWholeNumber(atoms, i))
              return ` ${fill(words.mixed, { frac: named ?? fill(words.frac, { num, den }) })} `;
            return ` ${plain} `;
          }
          case 'sup': {
            const exp = speakAtoms(a.body, words);
            if (exp === '2') return ` ${words.squared} `;
            if (exp === '3') return ` ${words.cubed} `;
            return ` ${fill(words.power, { exp })} `;
          }
          case 'sub':
            return ` ${fill(words.sub, { sub: speakAtoms(a.body, words) })} `;
          case 'sqrt': {
            const body = speakAtoms(a.body, words);
            if (!a.index) return ` ${fill(words.sqrt, { body })} `;
            const index = speakAtoms(a.index, words);
            if (index === '2') return ` ${fill(words.sqrt, { body })} `;
            if (index === '3') return ` ${fill(words.cbrt, { body })} `;
            return ` ${fill(words.root, { index, body })} `;
          }
          case 'overline': {
            const body = speakAtoms(a.body, words);
            const digits = /^[0-9\s]+$/.test(body);
            return ` ${fill(digits ? words.period : words.segment, { body })} `;
          }
          case 'vec':
            return ` ${fill(words.vector, { body: speakAtoms(a.body, words) })} `;
          case 'blank':
            return ` ${words.blank} `;
        }
      })
      .join(''),
  );
}

/** The whole text in words: plain runs as they are, math read out. */
export function speakMathText(text: string, words: SpokenWords): string {
  return squash(
    splitMath(text)
      .map((s) => (s.type === 'plain' ? s.text : ` ${speakAtoms(s.atoms, words)} `))
      .join(''),
  ).replace(/\s+([.,!?;:])(?=\s|$)/g, '$1');
}
