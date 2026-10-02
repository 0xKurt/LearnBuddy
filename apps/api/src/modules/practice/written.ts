// Schriftlich rechnen (issue #260): add, subtract, multiply and divide in columns, digit by digit.
// docs/architecture.md §Practice ("Structured items").
//
// No model decides anything here, in either direction (#224, "Regel 0"):
//   * the task is the operation and its numbers (`WrittenCalcTask`); what the model wrote is only
//     which numbers, and `writtenProblem` rejects any that do not make a written calculation
//     that fits the phone — nothing is repaired;
//   * the grid (where every digit stands, which boxes she fills) and the key of every box —
//     each digit of the result, of the partial products and of every carry — are COMPUTED from
//     the numbers, column by column, the way the procedure is done on paper. Nothing of it is
//     stored, so nothing stored can disagree with it.
//
// The procedures, as German primary schools teach them (Klasse 3–4):
//   add — the numbers right-aligned, the carries in the small row above the line;
//   sub — every method a Bundesland teaches is right here, because the methods differ only in
//         what is written beside the digits, never in the result digits: the Ergänzungsverfahren
//         and the Abziehverfahren with Borgen (Erweitern) write the same carry in the small row,
//         added to the next digit of the subtrahend; the Abziehverfahren with Entbündeln crosses
//         out in the minuend instead and leaves the small row empty — carries are never
//         required. So nothing here reads the Bundesland, and no table entry is invented for it
//         (docs/architecture.md §Lehrplan und Bundesland). The reply to a digit one too big
//         names both ("Übertrag oder Entbündeln");
//   mul — "schriftlich multiplizieren" starting with the highest digit of the second factor:
//         each partial product ends under its digit, and the partial products are added with
//         carries. By a one-digit number there are no partial products; the carries of the
//         multiplication go into the small row.
//   div — "schriftlich dividieren" by one digit in the short form (Kurzform): from the highest
//         digit down, each step's remainder carried into the next digit ("Rest" — 8 : 3 = 2,
//         Rest 2, 24 : 3 = 8). The quotient stands under the dividend, each digit under the
//         digit its step ended at, and the remainders go into the small row like carries,
//         optional too. The long form writes a times row and a difference row per step: four
//         steps are nine rows, which no phone shows beside a digit pad (rule 16). Only
//         divisions without remainder: "R 2" at the end is a box the grid has no column for.
//
// Carries are optional (owner, #260): an empty carry box is never wrong. A carry she DID write
// must be right, and a wrong digit next to a missing carry is named as exactly that ("Bei den
// Zehnern fehlt der Übertrag").

import {
  type PartId,
  WRITTEN_ADD_MAX,
  WRITTEN_COLS_MAX,
  WRITTEN_DIVISOR_MAX,
  WRITTEN_MUL_DIGITS_MAX,
  type WrittenCalcAnswer,
  type WrittenCalcTask,
  type WrittenCalcTaskView,
  type WrittenCell,
  type WrittenOp,
  type WrittenRow,
  type WrittenRowRole,
} from '@learnbuddy/shared-types/contracts';

import { type MessageKey, t } from '../../i18n/index.js';

/** Why a written calculation is not stored. Each one is a test (`__tests__/written.test.ts`). */
export type WrittenProblem =
  /** The wrong number of numbers for the operation (add 2–3, sub, mul and div exactly 2). */
  | 'operands'
  /**
   * No number with two digits: 7 · 8 is a times table, not a written calculation; likewise a
   * division whose quotient has one digit (56 : 7).
   */
  | 'too_small'
  /** Wider than WRITTEN_COLS_MAX columns: it would not fit a 360-pt phone with 44-pt boxes. */
  | 'too_wide'
  /** A subtraction whose result is zero or below: no written subtraction at school. */
  | 'not_positive'
  /** A multiplication by a number with more than two digits, or with a 0 digit in it. */
  | 'factor'
  /** A division by anything but one digit 2–9. */
  | 'divisor'
  /** A division that does not come out even. */
  | 'remainder';

/** A box she fills: where it is and what belongs in it. */
type Box = {
  id: PartId;
  role: WrittenRowRole;
  /** Which partial product (1, 2), for `partial` boxes; 0 otherwise. */
  row: number;
  /** Place value: 0 Einer, 1 Zehner … */
  place: number;
  /**
   * The digit that belongs here; '' where nothing belongs (a place beyond the number). For a
   * carry, '' means "no carry here".
   */
  want: string;
};

/** The whole layout of one task: what the app is shown, and the key of every box. */
export type WrittenLayout = {
  view: WrittenCalcTaskView;
  boxes: Box[];
};

function digitAt(n: bigint, place: number): number {
  return Number((n / 10n ** BigInt(place)) % 10n);
}

function lengthOf(n: bigint): number {
  return n.toString().length;
}

/** A row of `cols` empty cells. */
function blank(cols: number): WrittenCell[] {
  return Array.from({ length: cols }, () => null);
}

/** What is wrong with a written calculation, or null when it makes one that fits. */
export function writtenProblem(task: WrittenCalcTask): WrittenProblem | null {
  const n = task.operands.map((o) => BigInt(o));
  if (task.op === 'add') {
    if (n.length < 2 || n.length > WRITTEN_ADD_MAX) return 'operands';
    if (n.every((x) => lengthOf(x) < 2)) return 'too_small';
    const sum = n.reduce((a, b) => a + b, 0n);
    const width = Math.max(lengthOf(sum), ...n.map(lengthOf));
    return width + 1 > WRITTEN_COLS_MAX ? 'too_wide' : null;
  }
  if (n.length !== 2) return 'operands';
  const [a, b] = n as [bigint, bigint];
  if (lengthOf(a) < 2) return 'too_small';
  if (task.op === 'sub') {
    if (a <= b) return 'not_positive';
    return lengthOf(a) + 1 > WRITTEN_COLS_MAX ? 'too_wide' : null;
  }
  if (task.op === 'div') {
    if (b < 2n || b > BigInt(WRITTEN_DIVISOR_MAX)) return 'divisor';
    if (a % b !== 0n) return 'remainder';
    if (a < 10n * b) return 'too_small';
    // The dividend, ":", the divisor and the "=" column the quotient row starts with.
    return lengthOf(a) + 3 > WRITTEN_COLS_MAX ? 'too_wide' : null;
  }
  const lb = lengthOf(b);
  if (lb > WRITTEN_MUL_DIGITS_MAX || task.operands[1]!.includes('0')) return 'factor';
  return lengthOf(a) + 1 + lb > WRITTEN_COLS_MAX ? 'too_wide' : null;
}

/** The result of the calculation, exactly. */
export function writtenResult(task: WrittenCalcTask): bigint {
  const n = task.operands.map((o) => BigInt(o));
  switch (task.op) {
    case 'add':
      return n.reduce((a, b) => a + b, 0n);
    case 'sub':
      return n[0]! - n[1]!;
    case 'mul':
      return n[0]! * n[1]!;
    case 'div':
      return n[0]! / n[1]!;
  }
}

/** The sign written in front of a number (a typographic minus and a centred dot, as in the book). */
const SIGN: Record<WrittenOp, string> = { add: '+', sub: '−', mul: '·', div: ':' };

/**
 * The carries of adding `rows` column by column: carry[p] goes INTO place p (carry[0] = 0).
 * The same for a subtraction in the Ergänzungsverfahren: there the carry is 1 wherever the
 * minuend digit is smaller than the subtrahend digit plus the carry before it.
 */
function addCarries(rows: readonly bigint[], places: number): number[] {
  const carry = [0];
  for (let p = 0; p < places; p++) {
    const column = rows.reduce((s, r) => s + digitAt(r, p), 0) + carry[p]!;
    carry.push(Math.floor(column / 10));
  }
  return carry;
}

function subCarries(a: bigint, b: bigint, places: number): number[] {
  const carry = [0];
  for (let p = 0; p < places; p++) {
    carry.push(digitAt(a, p) < digitAt(b, p) + carry[p]! ? 1 : 0);
  }
  return carry;
}

/** The carries of multiplying `a` by one digit (the "Merkzahlen"), into place p. */
function mulCarries(a: bigint, digit: number, places: number): number[] {
  const carry = [0];
  for (let p = 0; p < places; p++) {
    carry.push(Math.floor((digitAt(a, p) * digit + carry[p]!) / 10));
  }
  return carry;
}

/**
 * The remainders of dividing `a` by `d` digit by digit, from the highest: rest[p] is carried
 * INTO place p — the remainder of the step that ended at place p + 1 (846 : 3: 8 : 3 = 2 Rest 2,
 * so rest[1] = 2 and the next step is 24 : 3).
 */
function divRests(a: bigint, d: number): number[] {
  const rest: number[] = [];
  let partial = 0;
  for (let p = lengthOf(a) - 1; p >= 0; p--) {
    rest[p] = partial;
    partial = (partial * 10 + digitAt(a, p)) % d;
  }
  return rest;
}

/**
 * The layout of a task, or null when it is no written calculation (`writtenProblem`). Pure and
 * deterministic: the view the app gets and the key the answer is checked against come from the
 * same call, so they cannot drift apart.
 */
export function writtenLayout(task: WrittenCalcTask): WrittenLayout | null {
  if (writtenProblem(task) !== null) return null;
  const n = task.operands.map((o) => BigInt(o));
  const result = writtenResult(task);
  const rows: WrittenRow[] = [];
  const boxes: Box[] = [];
  let cols: number;
  /** The column the Einer stand in: the last one, except in a division (left of ": 3"). */
  let ones = 0;

  /** A row of boxes for places `from`..`to`, whose wanted digits are `want(place)`. */
  const boxRow = (
    role: WrittenRowRole,
    row: number,
    from: number,
    to: number,
    want: (place: number) => string,
    ruleAbove: boolean,
  ): void => {
    const cells = blank(cols);
    for (let p = from; p <= to; p++) {
      const id = role === 'partial' ? `p${row}_${p}` : `${role === 'carry' ? 'c' : 'r'}${p}`;
      cells[ones - p] = { id, place: p };
      boxes.push({ id, role, row, place: p, want: want(p) });
    }
    rows.push({ role, cells, rule_above: ruleAbove });
  };
  /** The digits of `x` at the places it has, '' beyond them. */
  const digitsOf = (x: bigint) => (p: number) => (p < lengthOf(x) ? String(digitAt(x, p)) : '');
  const carryOf = (carry: readonly number[]) => (p: number) =>
    (carry[p] ?? 0) === 0 ? '' : String(carry[p]);

  if (task.op === 'div') {
    const [a, d] = n as [bigint, bigint];
    const la = lengthOf(a);
    const lq = lengthOf(result);
    cols = la + 3;
    ones = la;
    const given = blank(cols);
    task.operands[0]!.split('').forEach((digit, i) => (given[1 + i] = { text: digit }));
    given[la + 1] = { text: SIGN.div };
    given[la + 2] = { text: task.operands[1]! };
    rows.push({ role: 'given', cells: given, rule_above: false });
    // A remainder goes into every place of the quotient but its first: the first step takes as
    // many digits as it needs (15 : 3, not 1 : 3), and what it carries is not a box.
    if (lq > 1) boxRow('carry', 0, 0, lq - 2, carryOf(divRests(a, Number(d))), false);
    // No rule: the short form has none, and the "=" in front of the quotient says what it is
    // (a rule under the whole row ran under ": 6" too, as if the divisor were summed).
    boxRow('result', 0, 0, lq - 1, digitsOf(result), false);
    rows[rows.length - 1]!.cells[0] = { text: '=' };
  } else if (task.op === 'add' || task.op === 'sub') {
    const width = Math.max(lengthOf(result), ...n.map(lengthOf));
    cols = width + 1;
    ones = cols - 1;
    n.forEach((x, i) => {
      const cells = blank(cols);
      if (i > 0) cells[0] = { text: SIGN[task.op] };
      for (let p = 0; p < lengthOf(x); p++) cells[cols - 1 - p] = { text: String(digitAt(x, p)) };
      rows.push({ role: 'given', cells, rule_above: false });
    });
    const carry = task.op === 'add' ? addCarries(n, width) : subCarries(n[0]!, n[1]!, width);
    if (width > 1) boxRow('carry', 0, 1, width - 1, carryOf(carry), false);
    boxRow('result', 0, 0, width - 1, digitsOf(result), true);
  } else {
    const [a, b] = n as [bigint, bigint];
    const la = lengthOf(a);
    const lb = lengthOf(b);
    cols = la + 1 + lb;
    ones = cols - 1;
    const first = blank(cols);
    task.operands[0]!.split('').forEach((d, i) => (first[i] = { text: d }));
    first[la] = { text: SIGN.mul };
    task.operands[1]!.split('').forEach((d, i) => (first[la + 1 + i] = { text: d }));
    rows.push({ role: 'given', cells: first, rule_above: false });
    // The result can be one digit wider than `a`·`b`'s digits suggest, never wider than the grid.
    const top = Math.min(cols - 1, la + lb - 1);
    if (lb === 1) {
      boxRow('carry', 0, 1, top, carryOf(mulCarries(a, digitAt(b, 0), top)), false);
      boxRow('result', 0, 0, top, digitsOf(result), true);
    } else {
      // Highest digit first: the first partial product ends under the tens digit of `b`.
      const high = a * BigInt(digitAt(b, 1));
      const low = a * BigInt(digitAt(b, 0));
      boxRow('partial', 1, 1, Math.min(cols - 1, la + 1), (p) => digitsOf(high)(p - 1), true);
      boxRow('partial', 2, 0, la, digitsOf(low), false);
      const carry = addCarries([high * 10n, low], top);
      boxRow('carry', 0, 1, top, carryOf(carry), false);
      boxRow('result', 0, 0, top, digitsOf(result), true);
    }
  }
  return { view: { type: 'written_calc', op: task.op, cols, rows }, boxes };
}

/** The view the app shows: the grid without any digit she is to write. */
export function writtenView(task: WrittenCalcTask): WrittenCalcTaskView | null {
  return writtenLayout(task)?.view ?? null;
}

/** The calculation in one line, as it reads in the conversation and as the solution: "476 + 358 = 834". */
export function writtenSolution(task: WrittenCalcTask): string {
  return `${task.operands.join(` ${SIGN[task.op]} `)} = ${writtenResult(task).toString()}`;
}

/** The calculation without its result, as the question's prompt shows it: "476 + 358". */
export function writtenTerm(task: WrittenCalcTask): string {
  return task.operands.join(` ${SIGN[task.op]} `);
}

// ─────────────── her answer, checked ───────────────

/** What went wrong first, in the order the procedure is done (right to left, top to bottom). */
export type WrittenSlip =
  /** A digit of the result (or a partial product) that is wrong. */
  | { kind: 'digit'; role: 'result' | 'partial'; row: number; place: number }
  /**
   * A digit that is wrong by exactly the carry that belonged into its column — in a division,
   * the digit she gets when the remainder carried into it is left out (4 : 3 instead of 24 : 3).
   */
  | { kind: 'carry_missing'; role: 'result' | 'partial'; row: number; place: number }
  /** A box of the result or a partial product left empty where a digit belongs. */
  | { kind: 'empty'; role: 'result' | 'partial'; row: number; place: number }
  /** A carry (a division's remainder) she wrote that is not the one of that column. */
  | { kind: 'carry_wrong'; place: number };

export type WrittenCheck = {
  type: 'written_calc';
  /** The operation: a division names a remainder, a subtraction also Entbündeln. */
  op: WrittenOp;
  correct: boolean;
  /** Every box, right or not (an empty carry box is always right). */
  parts: Array<{ id: PartId; ok: boolean }>;
  /** The first slip in the order the calculation is done, or null when it is right. */
  first: WrittenSlip | null;
};

/**
 * The digit of the result at `place` as it comes out when the carry into it (`carry`) is left
 * out. Without the carry an addition's (and a product's) digit comes out short by it, a
 * subtraction's (the carry adds to the subtrahend) over by it; a division without the remainder
 * divides the bare digit of the dividend.
 */
function withoutCarry(task: WrittenCalcTask, place: number, carry: number): number {
  const right = digitAt(writtenResult(task), place);
  switch (task.op) {
    case 'add':
    case 'mul':
      return (right - carry + 10) % 10;
    case 'sub':
      return (right + carry) % 10;
    case 'div':
      return Math.floor(digitAt(BigInt(task.operands[0]!), place) / Number(task.operands[1]!));
  }
}

/** One box as she wrote it and as it should be. */
function boxOk(box: Box, given: string): boolean {
  if (box.role === 'carry') return given === '' || given === (box.want === '' ? '0' : box.want);
  // A leading zero changes no value ("0 4 2" is 42): written where nothing belongs, it is not wrong.
  if (box.want === '') return given === '' || given === '0';
  return given === box.want;
}

/**
 * Her boxes against the computed key, or null when the answer does not fit this task (a box
 * that is not there, one named twice) — refused as invalid input, never graded.
 */
export function checkWritten(
  task: WrittenCalcTask,
  answer: WrittenCalcAnswer,
): WrittenCheck | null {
  const layout = writtenLayout(task);
  if (!layout) return null;
  const byId = new Map(layout.boxes.map((b) => [b.id, b]));
  const given = new Map<string, string>();
  for (const b of answer.boxes) {
    if (!byId.has(b.id) || given.has(b.id)) return null;
    given.set(b.id, b.digit);
  }
  const parts = layout.boxes.map((b) => ({ id: b.id, ok: boxOk(b, given.get(b.id) ?? '') }));
  const ok = new Map(parts.map((p) => [p.id, p.ok]));
  // The carry that belongs into a column of the result (from the carry row), for naming a
  // missing one. A partial product's carries are kept in the head and have no boxes.
  const carryInto = new Map(
    layout.boxes.filter((b) => b.role === 'carry').map((b) => [b.place, Number(b.want || '0')]),
  );
  // The order the procedure is done in: the partial products first (first, then second), then
  // the sum column by column — the carry into a column before that column's digit. A division
  // goes the other way, from the highest digit down.
  const step = (place: number) => (task.op === 'div' ? WRITTEN_COLS_MAX - place : place);
  const rank = (b: Box) =>
    b.role === 'partial'
      ? b.row * 100 + b.place
      : 1000 + step(b.place) * 2 + (b.role === 'carry' ? 0 : 1);
  const wrong = [...layout.boxes].filter((b) => !ok.get(b.id)).sort((x, y) => rank(x) - rank(y));
  const at = wrong[0];
  let first: WrittenSlip | null = null;
  if (at) {
    if (at.role === 'carry') {
      first = { kind: 'carry_wrong', place: at.place };
    } else {
      const role = at.role === 'partial' ? 'partial' : 'result';
      const her = given.get(at.id) ?? '';
      const carry = at.role === 'result' ? (carryInto.get(at.place) ?? 0) : 0;
      const forgot = her !== '' && carry > 0 && Number(her) === withoutCarry(task, at.place, carry);
      first = {
        kind: her === '' ? 'empty' : forgot ? 'carry_missing' : 'digit',
        role,
        row: at.row,
        place: at.place,
      };
    }
  }
  return { type: 'written_calc', op: task.op, correct: wrong.length === 0, parts, first };
}

/** Her calculation in one line for the conversation: the result as she wrote it. */
export function writtenAnswerText(task: WrittenCalcTask, answer: WrittenCalcAnswer): string {
  const layout = writtenLayout(task);
  if (!layout) return '';
  const given = new Map(answer.boxes.map((b) => [b.id, b.digit]));
  const digits = layout.boxes
    .filter((b) => b.role === 'result')
    .sort((x, y) => y.place - x.place)
    .map((b) => given.get(b.id) ?? '')
    .join('')
    .replace(/^0+(?=\d)/, '');
  return `${writtenTerm(task)} = ${digits === '' ? '…' : digits}`;
}

/** "bei den Zehnern" — a place, as the reply names it. */
const AT_PLACE: readonly MessageKey[] = [
  'practice.written.at.p0',
  'practice.written.at.p1',
  'practice.written.at.p2',
  'practice.written.at.p3',
  'practice.written.at.p4',
  'practice.written.at.p5',
  'practice.written.at.p6',
];

/** The reply to a written calculation that is not right yet: the column, kindly. */
export function writtenReply(locale: string, check: WrittenCheck): string {
  const slip = check.first;
  if (slip === null) return t(locale, 'practice.written.look_again');
  const at = t(locale, AT_PLACE[slip.place] ?? 'practice.written.at.p0');
  if (slip.kind === 'carry_wrong')
    return t(
      locale,
      check.op === 'div' ? 'practice.written.rest_wrong' : 'practice.written.carry_wrong',
      { at },
    );
  const row =
    slip.role === 'partial'
      ? t(locale, slip.row === 1 ? 'practice.written.in_first' : 'practice.written.in_second')
      : '';
  const key: MessageKey =
    slip.kind === 'carry_missing'
      ? check.op === 'div'
        ? 'practice.written.rest_missing'
        : check.op === 'sub'
          ? 'practice.written.carry_missing_sub'
          : 'practice.written.carry_missing'
      : slip.kind === 'empty'
        ? 'practice.written.empty'
        : 'practice.written.digit';
  return t(locale, key, { at, row });
}
