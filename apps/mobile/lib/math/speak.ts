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
  /** "hoch 2" — what a reader says for x², NOT the noun "Quadrat" (issue #175). */
  squared: string;
  /** "hoch 3" */
  cubed: string;
  /** "Quadrat{{unit}}": a unit squared is one word, not a power ("3 cm²"). */
  unit_area: string;
  /** "Kubik{{unit}}" */
  unit_volume: string;
  /**
   * How a unit is spoken: alone in singular and plural ("cm" → Zentimeter,
   * "centimetre/centimetres"), and the form that goes inside a squared unit — German glues
   * and lowercases it ("Quadrat**z**entimeter"), the others keep the plural ("square
   * centimetres"). The locale says which, so no casing rule lives in the code.
   *
   * A symbol the locale does not name stays as it is: a voice spelling out "ha" is clumsy,
   * inventing a word for it is worse (rule 5).
   */
  units: Readonly<Record<string, { one: string; many: string; compound: string }>>;
  /** "Index {{sub}}" */
  sub: string;
  /** "Wurzel aus {{body}}" */
  sqrt: string;
  /**
   * "{{index}}. Wurzel aus {{body}}" — the fallback for an index the language has no
   * ordinal for (a letter, a fraction, above 20). Clumsy, but never an invented word.
   */
  root: string;
  /** "{{ordinal}} Wurzel aus {{body}}" ("vierte Wurzel aus 16", "fourth root of 16") */
  root_named: string;
  /**
   * The ordinal that stands in front of this language's word for "root" ("4" → vierte,
   * fourth, quatrième). Only that one grammatical slot: German, Spanish and Italian
   * ordinals inflect, so there is no single ordinal word per number (issue #175).
   * The entries for 2 and 3 are not used by a root — those have their own names (`sqrt`,
   * `cbrt`) — they are here so the set 1–20 stays complete and readable.
   */
  root_ordinals: Readonly<Record<string, string>>;
  /** "dritte Wurzel aus {{body}}" */
  cbrt: string;
  /** "Komma" / "point": the decimal separator as a word, where it has no digit after it. */
  decimal: string;
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
  /** What an operator with limits is called: sum "Summe", prod "Produkt", int "Integral", lim "Grenzwert" (issue #239). */
  operators: Readonly<Record<'sum' | 'prod' | 'int' | 'lim', string>>;
  /** "{{op}} von {{from}} bis {{to}}" — both limits. */
  op_range: string;
  /** "{{op}} für {{from}}" — only the lower one (lim_{x→0}, \sum_{k}). */
  op_lower: string;
  /** "{{op}} bis {{to}}" — only the upper one. */
  op_upper: string;
  /** "{{top}} über {{bottom}}" — a binomial coefficient. */
  binom: string;
  /** "Spaltenvektor {{entries}}" — a matrix of one column; entries joined by ", ". */
  column_vector: string;
  /** "Matrix mit den Zeilen {{rows}}" — rows joined by "; ", cells by ", ". */
  matrix: string;
  /** "reagiert zu, Bedingung: {{label}}" — a reaction arrow with its condition above it. */
  arrow_label: string;
  /** "groß {{letter}}" — an allele written as a capital letter, in a genotype (issue #352). */
  allele_upper: string;
  /** "klein {{letter}}" — an allele written as a small letter. */
  allele_lower: string;
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
  // Chemistry (issue #239): a reaction "reagiert zu", an equilibrium "steht im Gleichgewicht mit".
  '⟶': 'reacts',
  '⇌': 'equilibrium',
  ℕ: 'naturals',
  ℤ: 'integers',
  ℚ: 'rationals',
  ℝ: 'reals',
};

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => values[k] ?? '');
}

function squash(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function speakChars(text: string, words: SpokenWords): string {
  let out = '';
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    // "15 °C" is one thing to say, not a degree sign and a letter (issue #175): a voice
    // reading "Grad C" sounds like an abbreviation nobody says out loud.
    if (ch === '°') {
      const unit = words.units[`°${chars[i + 1] ?? ''}`];
      if (unit) {
        out += ` ${unit.many} `;
        i += 1;
        continue;
      }
    }
    const word = words.symbols[ch];
    out += word !== undefined ? ` ${word} ` : ch === ' ' ? ' ' : ch;
  }
  return out;
}

/**
 * A unit as it is spoken, if the locale names this symbol.
 *
 * Not a word list standing in for language understanding (rule 3): a unit symbol is
 * notation with one fixed reading, like a date format. What the locale does not name
 * stays as written — a voice spelling out "ha" is clumsy, inventing a word is worse.
 */
type UnitForm = 'one' | 'many' | 'compound';

function spokenUnit(symbol: string, words: SpokenWords, form: UnitForm): string | null {
  return words.units[symbol.trim()]?.[form] ?? null;
}

/**
 * A unit standing right before a ² or ³, as one word: "3 cm²" is
 * "3 Quadratzentimeter", never "3 Zentimeter hoch 2" (issue #175).
 *
 * Returns the unit's spoken form and what is left of the atom that carried it ("3 cm"
 * keeps "3"). Both the unit's atom and the power ask this, so they always agree.
 */
function unitPower(
  atoms: MathAtom[],
  powerAt: number,
  words: SpokenWords,
): { unit: string; keep: string } | null {
  const power = atoms[powerAt];
  if (power?.type !== 'sup') return null;
  const body = power.body;
  if (body.length !== 1 || body[0]?.type !== 'chars') return null;
  const exp = body[0].text.trim();
  if (exp !== '2' && exp !== '3') return null;
  const prev = atoms[powerAt - 1];
  if (prev?.type === 'text') {
    const unit = spokenUnit(prev.text, words, 'compound');
    return unit === null ? null : { unit, keep: '' };
  }
  if (prev?.type === 'chars') {
    const tail = /([A-Za-zμ]+)\s*$/.exec(prev.text);
    if (!tail) return null;
    const unit = spokenUnit(tail[1]!, words, 'compound');
    return unit === null ? null : { unit, keep: prev.text.slice(0, tail.index) };
  }
  return null;
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

/**
 * The digits of a repeating decimal, if the next atom is one: `0{,}\overline{3}`.
 *
 * Positional, not guessed (rule 3): an \overline over digits right after an atom is the
 * period of the number that atom ends with — the same kind of fixed reading as a unit
 * before a ².
 */
function startsRepeatingDecimal(next: MathAtom | undefined): boolean {
  if (next?.type !== 'overline') return false;
  const body = next.body;
  return body.length === 1 && body[0]?.type === 'chars' && /^[0-9\s]+$/.test(body[0].text);
}

/**
 * The decimal separator in front of a period, as a word: "0,\overline{3}" is
 * "0 Komma Periode 3", not "0, Periode 3" (issue #175). With no digit behind it, the comma
 * is punctuation to every voice — a pause where the child must hear "Komma".
 *
 * Which character marks the separator differs by language, which word is said comes from
 * the locale; only a separator with nothing after it is ever spoken.
 */
function withSpokenSeparator(said: string, words: SpokenWords): string {
  return said.replace(/[.,]\s*$/, ` ${words.decimal} `);
}

/** A whole number right before a simple fraction: a mixed number (3½), not "3 times ½". */
function followsWholeNumber(atoms: MathAtom[], i: number): boolean {
  let j = i - 1;
  while (j >= 0 && atoms[j]?.type === 'text' && (atoms[j] as { text: string }).text.trim() === '')
    j -= 1;
  const prev = atoms[j];
  return prev?.type === 'chars' && /(^|[^\d.,])\d+$/.test(prev.text);
}

/** What stands right before a subscript reads as a chemical element or a closed group. */
function formulaBase(prev: MathAtom | undefined): boolean {
  return prev?.type === 'chars' && /(?:[A-Z][a-z]?|\))$/.test(prev.text);
}

function speakAtoms(atoms: MathAtom[], words: SpokenWords): string {
  return squash(
    atoms
      .map((a, i) => {
        switch (a.type) {
          case 'chars': {
            // "3 cm" before a ²: the unit is spoken by the power as one word, so only what
            // stands before it is said here.
            const absorbed = unitPower(atoms, i + 1, words);
            const said = speakChars(absorbed ? absorbed.keep : a.text, words);
            return startsRepeatingDecimal(atoms[i + 1]) ? withSpokenSeparator(said, words) : said;
          }
          case 'symbol':
            return ` ${words.symbols[a.char.trim()] ?? a.char.trim()} `;
          case 'text': {
            // Spaces around it: "$3\\text{cm}$" used to come out "3cm", which a voice reads
            // as one word (issue #175). `squash` takes the extra air back out.
            if (unitPower(atoms, i + 1, words)) return ' ';
            const unit = spokenUnit(a.text, words, 'many');
            return ` ${unit ?? a.text} `;
          }
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
            // A unit squared is one word — "Quadratzentimeter", not "Zentimeter hoch 2"
            // (issue #175). Only for a unit the locale names; everything else is a power.
            const asUnit = unitPower(atoms, i, words);
            if (asUnit)
              return ` ${fill(exp === '2' ? words.unit_area : words.unit_volume, {
                unit: asUnit.unit,
              })} `;
            if (exp === '2') return ` ${words.squared} `;
            if (exp === '3') return ` ${words.cubed} `;
            return ` ${fill(words.power, { exp })} `;
          }
          case 'sub': {
            const sub = speakAtoms(a.body, words);
            // A chemical formula is said the way a chemistry teacher says it: "H zwei O",
            // "C O zwei" — never "H Index 2 O" (issue #238). It is a formula when a number
            // stands under an element symbol (a capital, maybe one small letter) or under a
            // closing bracket ("Ca(OH)₂"). x₁, aₙ keep their "Index".
            if (/^\d+$/.test(sub) && formulaBase(atoms[i - 1])) return ` ${sub} `;
            return ` ${fill(words.sub, { sub })} `;
          }
          case 'sqrt': {
            const body = speakAtoms(a.body, words);
            if (!a.index) return ` ${fill(words.sqrt, { body })} `;
            const index = speakAtoms(a.index, words);
            if (index === '2') return ` ${fill(words.sqrt, { body })} `;
            if (index === '3') return ` ${fill(words.cbrt, { body })} `;
            // "4. Wurzel aus 16" is read "vier Punkt Wurzel"; a teacher says "vierte
            // Wurzel" (issue #175). The ordinal comes from the locale, and an index the
            // language has no ordinal for (a letter, 25) keeps the plain form.
            const ordinal = /^\d+$/.test(index) ? words.root_ordinals[String(Number(index))] : null;
            if (ordinal) return ` ${fill(words.root_named, { ordinal, body })} `;
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
          case 'limits': {
            const op =
              a.name === 'sum' || a.name === 'prod' || a.name === 'int' || a.name === 'lim'
                ? words.operators[a.name]
                : a.op;
            const from = a.lower ? speakAtoms(a.lower, words) : null;
            const to = a.upper ? speakAtoms(a.upper, words) : null;
            if (from !== null && to !== null) return ` ${fill(words.op_range, { op, from, to })} `;
            if (from !== null) return ` ${fill(words.op_lower, { op, from })} `;
            if (to !== null) return ` ${fill(words.op_upper, { op, to })} `;
            return ` ${op} `;
          }
          case 'binom':
            return ` ${fill(words.binom, {
              top: speakAtoms(a.top, words),
              bottom: speakAtoms(a.bottom, words),
            })} `;
          case 'matrix': {
            const rows = a.rows.map((row) => row.map((cell) => speakAtoms(cell, words)));
            if (rows.every((row) => row.length === 1))
              return ` ${fill(words.column_vector, { entries: rows.map((row) => row[0]).join(', ') })} `;
            return ` ${fill(words.matrix, { rows: rows.map((row) => row.join(', ')).join('; ') })} `;
          }
          case 'arrow': {
            const label = speakAtoms(a.above, words);
            return label === ''
              ? ` ${words.symbols['⟶'] ?? '⟶'} `
              : ` ${fill(words.arrow_label, { label })} `;
          }
        }
      })
      .join(''),
  );
}

// ─────────────── genotypes (issue #352) ───────────────

/** One allele letter with its case said out loud: "A" → "groß A", "a" → "klein a". */
function spokenAllele(letter: string, words: SpokenWords): string {
  const upper = letter === letter.toUpperCase();
  return fill(upper ? words.allele_upper : words.allele_lower, { letter });
}

/** A single letter as the whole body of a superscript: the allele on a sex chromosome. */
function alleleOf(atom: MathAtom | undefined): string | null {
  if (atom?.type !== 'sup' || atom.body.length !== 1) return null;
  const only = atom.body[0];
  return only?.type === 'chars' && /^[A-Za-z]$/.test(only.text) ? only.text : null;
}

/**
 * A genotype, read so that its alleles differ by ear: "$Aa$" → "groß A, klein a". A voice
 * does not say case, so "AA", "Aa" and "aa" — three different answer options — sound alike.
 *
 * Decided by structure, never by a list of words (rule 3), and only when the whole math run
 * is the genotype: a pair of one letter in any case ("AA", "Aa", "bb"), or a gonosomal one
 * — an X with one allele letter as its superscript, followed by a second such X or by a Y
 * ("$X^{A}X^{a}$", "$X^{a}Y$"). These are exactly the forms the pedigree options are written
 * in (shared-math `genotypeOptions`). Anything longer or mixed is ordinary math.
 */
function speakGenotype(atoms: MathAtom[], words: SpokenWords): string | null {
  const first = atoms[0];
  if (atoms.length === 1 && first?.type === 'chars' && /^([A-Za-z])\1$/i.test(first.text)) {
    return [...first.text].map((letter) => spokenAllele(letter, words)).join(', ');
  }
  const isX = (a: MathAtom | undefined) => a?.type === 'chars' && a.text === 'X';
  const a1 = alleleOf(atoms[1]);
  if (!isX(first) || a1 === null) return null;
  const head = `X ${spokenAllele(a1, words)}`;
  if (atoms.length === 3 && atoms[2]?.type === 'chars' && atoms[2].text === 'Y')
    return `${head}, Y`;
  const a2 = alleleOf(atoms[3]);
  if (atoms.length === 4 && isX(atoms[2]) && a2 !== null && a1.toUpperCase() === a2.toUpperCase())
    return `${head}, X ${spokenAllele(a2, words)}`;
  return null;
}

/** The whole text in words: plain runs as they are, math read out. */
export function speakMathText(text: string, words: SpokenWords): string {
  return squash(
    splitMath(text)
      .map((s) =>
        s.type === 'plain'
          ? s.text
          : ` ${speakGenotype(s.atoms, words) ?? speakAtoms(s.atoms, words)} `,
      )
      .join(''),
  ).replace(/\s+([.,!?;:])(?=\s|$)/g, '$1');
}
