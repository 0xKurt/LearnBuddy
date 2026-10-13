// Which insert keys a question gets, and what a "raise" or "lower" key does to what she types
// next (issue #239; the row is components/math/MathKeys.tsx).
//
// Chosen by code from the question itself — its kind, its unit, its subject and the notation
// in its text — never from the answer key, which the app does not have while a question is
// open. The rows are the design's (issue #599), in the design's order, and they hold only what
// the phone's own keyboard does not offer at a tap — digits, letters, the comma, < and > are the
// device's (design components/practice/Tasks.prompt.md "Tasten"):
//
//   - "Chemie" (a formula in Chemie, or a question whose text shows a reaction arrow) —
//     ui_kits/app/Tasks.jsx:162: the elements the question names, lower the next digits (H₂O),
//     the reaction arrow, +, raise a charge (SO₄²⁻); the equilibrium arrow where a reaction may
//     be one. What the keys write is what the counting check reads
//     (apps/api/src/modules/practice/chemistry.ts);
//   - "Formel" — ui_kits/app/Practice.jsx:39 (`x = + − / ( )`) and Tasks.jsx:156
//     (`x xⁿ ≤ ≥ / √`): the question's variable, then the row of an equation — or, where the
//     question shows a comparison, the row of an inequality first; the other row follows;
//   - "Rechnen" (a number) — ui_kits/app/Flows.jsx:57 (`· : + − =`) beside a unit, the equation
//     row for a bare number; a power, a root or π where the question shows one.
//
// The design's rows also show the unit itself as a key ("cm²"). It is not offered: a line of a
// written path with a unit in it is refused by the step check (apps/api/…/steps.ts), and the
// unit stands as a chip beside the field (#522).
//
// A table cell whose key is a whole number is typed on the phone's number pad and gets only the
// minus, which that pad does not have (issue #286 finding 5).
//
// The row never scrolls sideways (a key she has to scroll to find is a key she does not know
// exists): as many keys as fit on one line, and a "…" key that shows the next ones — the one
// key row's rule (lib/keyRow.ts, components/lb/KeyRow.tsx).
//
// Pure logic without React Native imports, so it runs in the unit tests.

import type { ItemKind, SubjectKind } from '@learnbuddy/shared-types/contracts';

import { mathSpans } from './parse.js';

/** A letter the question itself names — its variable, an element — as a key ("letter:x"). */
type LetterKey = `letter:${string}`;

export function isLetterKey(id: KeyId): id is LetterKey {
  return id.startsWith('letter:');
}

type SignKey =
  | 'newline'
  | 'power'
  | 'sub'
  | 'charge'
  | 'fraction'
  | 'minus'
  | 'plus'
  | 'times'
  | 'divide'
  | 'equals'
  | 'le'
  | 'ge'
  | 'pm'
  | 'brackets'
  | 'sqrt'
  | 'pi'
  | 'reacts'
  | 'equilibrium';

export type KeyId = SignKey | LetterKey;

/** The Composer's mode chip: what the keys are for ("Formel", "Rechnen", "Chemie"). */
export type KeyMode = 'formula' | 'calc' | 'chem';

/** A key that does not write a character but changes what the next digits become. */
export type ScriptMode = 'power' | 'sub' | 'charge';

export function isModeKey(id: KeyId): id is ScriptMode {
  return id === 'power' || id === 'sub' || id === 'charge';
}

/** What the question tells about the answer it wants. */
export type KeyContext = {
  kind: ItemKind;
  unit: string | null;
  subjectKind: SubjectKind | null;
  prompt: string;
  /** A written path may be typed here (lib/practice/pathEntry.ts): the row offers "↵ Neue Zeile". */
  path: boolean;
};

/** The math of a text, without the words around it. */
function mathOf(prompt: string): string {
  return mathSpans(prompt)
    .map((s) => s.inner)
    .join(' ');
}

/** A reaction is shown: the reaction arrow, the equilibrium or an arrow with a condition. */
const REACTION = /\\(?:longrightarrow|rightleftharpoons|xrightarrow)(?![a-zA-Z])|[⟶⇌]/;
/** A comparison is shown: < > ≤ ≥ in any spelling. */
const INEQUALITY = /\\(?:le|leq|ge|geq|lt|gt)(?![a-zA-Z])|[<>≤≥]/;
const ROOT = /\\sqrt(?![a-zA-Z])|√/;
const PI = /\\pi(?![a-zA-Z])|π/;
const POWER = /\^|[²³]/;

const PLUS_MINUS = /\\pm(?![a-zA-Z])|±/;

/** The math without its LaTeX commands (`\frac`, `\text{cm}`): what is left names letters. */
function lettersOf(math: string): string {
  return math.replace(/\\text\{[^}]*\}/g, ' ').replace(/\\[a-zA-Z]+/g, ' ');
}

/** The question's variable: the first small letter that stands alone ("2x + 3", never "cm"). */
function variableOf(math: string): KeyId[] {
  for (const run of lettersOf(math).matchAll(/[A-Za-z]+/g))
    if (/^[a-z]$/.test(run[0])) return [`letter:${run[0]}`];
  return [];
}

/** The first two elements the question writes ("N₂ + 3H₂" → N, H). */
function elementsOf(math: string): KeyId[] {
  const found = [...lettersOf(math).matchAll(/[A-Z][a-z]?/g)].map((m): KeyId => `letter:${m[0]}`);
  return unique(found).slice(0, 2);
}

/** ui_kits/app/Tasks.jsx:162, after the elements: `₂ → + ⁺`. */
const CHEMISTRY: readonly KeyId[] = ['sub', 'reacts', 'plus', 'charge', 'equilibrium'];
/** ui_kits/app/Practice.jsx:39, after the variable: `= + − / ( )`. */
const EQUATION: readonly KeyId[] = ['equals', 'plus', 'minus', 'fraction', 'brackets'];
/** ui_kits/app/Tasks.jsx:156, after the variable: `xⁿ ≤ ≥ / √`. */
const INEQUATION: readonly KeyId[] = ['power', 'le', 'ge', 'fraction', 'sqrt'];
/** ui_kits/app/Flows.jsx:57, without its unit: `· : + − =`. */
const MEASURE: readonly KeyId[] = ['times', 'divide', 'plus', 'minus', 'equals'];

/** What the question is typed as, or null where it gets no keys. */
function typedAs(ctx: KeyContext): { mode: KeyMode; math: string } | null {
  // A line of a worked solution she writes right (Fehlerdetektiv, #260) is typed like a formula.
  const kind = ctx.kind === 'find_error' ? 'formula' : ctx.kind;
  if (kind !== 'numeric' && kind !== 'formula' && kind !== 'short') return null;
  const math = mathOf(ctx.prompt);
  const formulaLike = kind === 'formula' || (kind === 'short' && math !== '');
  if (formulaLike && (ctx.subjectKind === 'chemistry' || REACTION.test(math)))
    return { mode: 'chem', math };
  if (kind === 'short' && math === '') return null;
  return { mode: kind === 'numeric' ? 'calc' : 'formula', math };
}

/** The mode chip of a question that is answered with a single typed value — or none at all. */
export function modeFor(ctx: KeyContext): KeyMode | null {
  return typedAs(ctx)?.mode ?? null;
}

/** The keys of a question that is answered with a single typed value — or none at all. */
export function keysFor(ctx: KeyContext): KeyId[] {
  const typed = typedAs(ctx);
  if (typed === null) return [];
  const { mode, math } = typed;
  if (mode === 'chem') return unique([...elementsOf(math), ...CHEMISTRY]);

  const lead: KeyId[] = ctx.path ? ['newline'] : [];
  const shown = (re: RegExp, ids: KeyId[]): KeyId[] => (re.test(math) ? ids : []);
  if (mode === 'calc') {
    return unique([
      ...lead,
      ...(ctx.unit ? MEASURE : [...variableOf(math), ...EQUATION]),
      ...shown(POWER, ['power']),
      ...shown(ROOT, ['sqrt']),
      ...shown(PI, ['pi']),
    ]);
  }
  const rows = INEQUALITY.test(math) ? [...INEQUATION, ...EQUATION] : [...EQUATION, ...INEQUATION];
  return unique([
    ...lead,
    ...variableOf(math),
    ...rows,
    'times',
    ...shown(PI, ['pi']),
    ...shown(PLUS_MINUS, ['pm']),
  ]);
}

/** A gap of a table: a whole number needs nothing beyond the digits; any other number its signs. */
export function cellKeys(input: 'math' | 'text', whole: boolean): KeyId[] {
  if (input !== 'math') return [];
  // A whole number is typed on the number pad (`cellKeyboard`), which has no sign: the minus
  // alone — no fraction bar, no root, no π.
  if (whole) return ['minus'];
  // A number or a short term on the full keyboard: its sign, and the exponent for a term like x².
  return ['minus', 'power'];
}

function unique(ids: KeyId[]): KeyId[] {
  return ids.filter((id, i) => ids.indexOf(id) === i);
}

// ─────────────── its places on the line ───────────────

/**
 * "↵ Neue Zeile" carries a word, so it takes two places; every other key one. How the places
 * fill a line and turn into pages is the one key row's (lib/keyRow.ts, issue #310).
 */
export function slotsOf(id: KeyId): number {
  return id === 'newline' ? 2 : 1;
}

// ─────────────── what a key writes ───────────────

/** What a key inserts at the cursor; the cursor lands `caret` characters in (default: after it). */
export function insertionOf(id: Exclude<KeyId, ScriptMode | 'newline'>) {
  if (isLetterKey(id)) return { text: glyphOf(id) };
  switch (id) {
    case 'fraction':
      return { text: '/' };
    // Shown as a real minus sign, typed as the plain one every checker reads.
    case 'minus':
      return { text: '-' };
    case 'plus':
      return { text: ' + ' };
    case 'times':
      return { text: '·' };
    // The division sign the expression reader takes (packages/shared-math expression.ts).
    case 'divide':
      return { text: ':' };
    case 'equals':
      return { text: ' = ' };
    case 'le':
      return { text: ' ≤ ' };
    case 'ge':
      return { text: ' ≥ ' };
    case 'pm':
      return { text: '±' };
    // One key for both: the pair, the cursor between them — "Ca(|)₂" (one place instead of two,
    // so the chemistry row fits a 360 phone without "…").
    case 'brackets':
      return { text: '()', caret: 1 };
    // The cursor lands inside the brackets: "√(|)".
    case 'sqrt':
      return { text: '√()', caret: 2 };
    case 'pi':
      return { text: 'π' };
    case 'reacts':
      return { text: ' → ' };
    case 'equilibrium':
      return { text: ' ⇌ ' };
  }
}

/** What the key shows. */
export function glyphOf(id: Exclude<KeyId, 'newline'>): string {
  if (isLetterKey(id)) return id.slice('letter:'.length);
  switch (id) {
    case 'power':
      return 'xⁿ';
    case 'sub':
      return 'x₂';
    case 'charge':
      return 'x⁺⁻';
    case 'fraction':
      return '/';
    case 'minus':
      return '−';
    case 'plus':
      return '+';
    case 'times':
      return '·';
    case 'divide':
      return ':';
    case 'equals':
      return '=';
    case 'le':
      return '≤';
    case 'ge':
      return '≥';
    case 'pm':
      return '±';
    case 'brackets':
      return '( )';
    case 'sqrt':
      return '√';
    case 'pi':
      return 'π';
    case 'reacts':
      return '→';
    case 'equilibrium':
      return '⇌';
  }
}

// ─────────────── raised and lowered digits ───────────────

const DIGITS = '0123456789';
const LOWERED = '₀₁₂₃₄₅₆₇₈₉';
const RAISED = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/**
 * One typed character under a mode, or null when the mode does not take it (and ends).
 *   power  — digits are raised (x⁴, 10¹²); a minus right after it is a sign, not part of it.
 *   sub    — digits are lowered (H₂O, C₆H₁₂O₆).
 *   charge — digits and the sign are raised (SO₄²⁻, Fe³⁺); the sign closes the charge.
 */
function scripted(ch: string, mode: ScriptMode): string | null {
  const d = DIGITS.indexOf(ch);
  if (d >= 0 && ch.length === 1) return mode === 'sub' ? LOWERED[d]! : RAISED[d]!;
  if (mode === 'charge' && ch === '+') return '⁺';
  if (mode === 'charge' && (ch === '-' || ch === '−')) return '⁻';
  return null;
}

/**
 * What she just typed, under a raise/lower mode. The field reports its whole new text; when
 * exactly one character was typed and the mode takes it, that character is replaced by its
 * raised or lowered form. Anything else — a letter, a space, a paste, a deletion — is left
 * exactly as typed and ends the mode, so the mode never changes text she did not just type.
 */
export function typedUnder(
  prev: string,
  next: string,
  mode: ScriptMode | null,
): { value: string; mode: ScriptMode | null; at: number | null } {
  if (mode === null) return { value: next, mode: null, at: null };
  if (next.length !== prev.length + 1) return { value: next, mode: null, at: null };
  let i = 0;
  while (i < prev.length && prev[i] === next[i]) i++;
  if (next.slice(i + 1) !== prev.slice(i)) return { value: next, mode: null, at: null };
  const out = scripted(next[i]!, mode);
  if (out === null) return { value: next, mode: null, at: null };
  const value = next.slice(0, i) + out + next.slice(i + 1);
  // A sign completes a charge: the next "+" is the one between two substances again.
  const done = mode === 'charge' && (out === '⁺' || out === '⁻');
  return { value, mode: done ? null : mode, at: i + 1 };
}
