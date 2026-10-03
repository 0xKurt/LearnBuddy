// Which insert keys a question gets, and what a "raise" or "lower" key does to what she types
// next (issue #239; the row is components/math/MathKeys.tsx).
//
// Chosen by code from the question itself — its kind, its unit, its subject and the notation
// in its text — never from the answer key, which the app does not have while a question is
// open. Three rows exist:
//
//   - chemistry (a formula in Chemie, or a question whose text shows a reaction arrow):
//     lower the next digits (H₂O), raise a charge (SO₄²⁻), +, the reaction arrow, the
//     equilibrium arrow and brackets — "2 H₂ + O₂ → 2 H₂O" without leaving the row. What the
//     keys write is what the counting check reads (apps/api/src/modules/practice/chemistry.ts);
//   - math: the exponent, the fraction bar, =, the comparisons, root, π …, ordered so that what
//     the question shows comes first (an inequality puts < ≤ > ≥ up front);
//   - a number: the decimal separator, the fraction bar and the minus sign, plus the
//     operators a written path needs.
//
// A table cell whose key is a whole number gets only the minus (issue #286 finding 5): the
// phone's digits write the rest, and a row of /, √, π over a number wall is noise.
//
// The row never scrolls sideways (a key she has to scroll to find is a key she does not know
// exists): as many keys as fit on one line, and a "…" key that shows the next ones.
//
// Pure logic without React Native imports, so it runs in the unit tests.

import type { ItemKind, SubjectKind } from '@learnbuddy/shared-types/contracts';

import { mathSpans } from './parse.js';

export type KeyId =
  | 'newline'
  | 'power'
  | 'sub'
  | 'charge'
  | 'fraction'
  | 'decimal'
  | 'minus'
  | 'plus'
  | 'times'
  | 'equals'
  | 'lt'
  | 'le'
  | 'gt'
  | 'ge'
  | 'pm'
  | 'brackets'
  | 'sqrt'
  | 'pi'
  | 'degree'
  | 'reacts'
  | 'equilibrium';

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

/** The keys of a chemistry formula, in the order she reaches for them. */
const CHEMISTRY: readonly KeyId[] = ['sub', 'charge', 'plus', 'reacts', 'equilibrium', 'brackets'];

/** The keys of a question that is answered with a single typed value — or none at all. */
export function keysFor(ctx: KeyContext): KeyId[] {
  const { kind, subjectKind } = ctx;
  if (kind !== 'numeric' && kind !== 'formula' && kind !== 'short') return [];
  const math = mathOf(ctx.prompt);
  const reaction = REACTION.test(math);
  const formulaLike = kind === 'formula' || (kind === 'short' && math !== '');
  if (formulaLike && (subjectKind === 'chemistry' || reaction)) return [...CHEMISTRY];
  if (kind === 'short' && math === '') return [];

  const lead: KeyId[] = ctx.path ? ['newline'] : [];
  const shown = (re: RegExp, ids: KeyId[]): KeyId[] => (re.test(math) ? ids : []);
  if (kind === 'numeric') {
    // A measure (a unit stands next to the field — an area, a length) is computed ("7 · 4") and
    // written with a decimal separator far more often than as a fraction; a bare number is the
    // other way round.
    const number: KeyId[] = ctx.unit
      ? ['decimal', 'times', 'minus', 'fraction']
      : ['fraction', 'decimal', 'minus'];
    return unique([
      ...lead,
      ...number,
      ...shown(POWER, ['power']),
      ...shown(ROOT, ['sqrt']),
      ...shown(PI, ['pi']),
      'times',
      'equals',
      'brackets',
    ]);
  }
  const compare: KeyId[] = ['lt', 'le', 'gt', 'ge'];
  const inequality = INEQUALITY.test(math);
  return unique([
    ...lead,
    'power',
    ...(inequality ? compare : []),
    'fraction',
    'equals',
    'minus',
    'times',
    'brackets',
    'sqrt',
    'pi',
    ...(inequality ? [] : compare),
    'pm',
    'decimal',
  ]);
}

/** A gap of a table: a whole number needs nothing beyond the digits; any other number its signs. */
export function cellKeys(input: 'math' | 'text', whole: boolean): KeyId[] {
  if (input !== 'math') return [];
  // A whole number: the digits are the phone's, but its sign is not on every keyboard (an
  // Android letter keyboard hides "−"). So the minus alone — no fraction bar, no root, no π.
  if (whole) return ['minus'];
  // A number or a short term: its signs, and the exponent for a term like x².
  return ['decimal', 'fraction', 'minus', 'power', 'brackets'];
}

function unique(ids: KeyId[]): KeyId[] {
  return ids.filter((id, i) => ids.indexOf(id) === i);
}

// ─────────────── one line, never sideways ───────────────

/** The smallest key (TOUCH in lib/theme/space.ts) and the gap between two keys (SPACE.sm). */
const KEY_MIN = 44;
export const KEY_GAP = 8;

/** How many key places one line of this width holds. */
export function slotsIn(width: number): number {
  return Math.max(3, Math.floor((width + KEY_GAP) / (KEY_MIN + KEY_GAP)));
}

/** "↵ Neue Zeile" carries a word, so it takes two places. */
export function slotsOf(id: KeyId): number {
  return id === 'newline' ? 2 : 1;
}

/**
 * The keys split into pages of one line each. Everything on one page when it fits; otherwise
 * every page keeps its last place for the "…" key that turns to the next page.
 */
export function pagesOf(keys: readonly KeyId[], slots: number): KeyId[][] {
  const total = keys.reduce((n, id) => n + slotsOf(id), 0);
  if (total <= slots) return keys.length > 0 ? [[...keys]] : [];
  const room = slots - 1;
  const pages: KeyId[][] = [];
  let page: KeyId[] = [];
  let used = 0;
  for (const id of keys) {
    const need = slotsOf(id);
    if (used + need > room && page.length > 0) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(id);
    used += need;
  }
  if (page.length > 0) pages.push(page);
  return pages;
}

// ─────────────── what a key writes ───────────────

/** What a key inserts at the cursor; the cursor lands `caret` characters in (default: after it). */
export function insertionOf(id: Exclude<KeyId, ScriptMode | 'newline'>, decimal: string) {
  switch (id) {
    case 'fraction':
      return { text: '/' };
    case 'decimal':
      return { text: decimal };
    // Shown as a real minus sign, typed as the plain one every checker reads.
    case 'minus':
      return { text: '-' };
    case 'plus':
      return { text: ' + ' };
    case 'times':
      return { text: '·' };
    case 'equals':
      return { text: ' = ' };
    case 'lt':
      return { text: ' < ' };
    case 'le':
      return { text: ' ≤ ' };
    case 'gt':
      return { text: ' > ' };
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
    case 'degree':
      return { text: '°' };
    case 'reacts':
      return { text: ' → ' };
    case 'equilibrium':
      return { text: ' ⇌ ' };
  }
}

/** What the key shows. */
export function glyphOf(id: Exclude<KeyId, 'newline'>, decimal: string): string {
  switch (id) {
    case 'power':
      return 'xⁿ';
    case 'sub':
      return 'x₂';
    case 'charge':
      return 'x⁺⁻';
    case 'fraction':
      return '/';
    case 'decimal':
      return decimal;
    case 'minus':
      return '−';
    case 'plus':
      return '+';
    case 'times':
      return '·';
    case 'equals':
      return '=';
    case 'lt':
      return '<';
    case 'le':
      return '≤';
    case 'gt':
      return '>';
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
    case 'degree':
      return '°';
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
