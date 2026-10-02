// Schriftlich rechnen (issue #260): the grid and every key are computed by code, column by
// column, and her boxes are checked digit by digit — no model, in either direction (#224
// "Regel 0"). Every rejection and every kind of slip the issue names is a test here.

import type {
  WrittenCalcAnswer,
  WrittenCalcTask,
  WrittenCell,
} from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { structuredItem, structuredReply, structuredTaskOf, viewOf } from '../structured.js';
import {
  checkWritten,
  writtenAnswerText,
  writtenLayout,
  writtenProblem,
  writtenReply,
  writtenSolution,
} from '../written.js';

function task(op: WrittenCalcTask['op'], ...operands: string[]): WrittenCalcTask {
  return { type: 'written_calc', op, operands };
}

/** The key of every box, as `{ id: digit }` ('' where nothing belongs). */
function keyOf(t: WrittenCalcTask): Record<string, string> {
  const layout = writtenLayout(t);
  if (!layout) throw new Error('no layout');
  return Object.fromEntries(layout.boxes.map((b) => [b.id, b.want]));
}

/** An answer with the given boxes filled; everything else left empty. */
function answer(boxes: Record<string, string>): WrittenCalcAnswer {
  return {
    type: 'written_calc',
    boxes: Object.entries(boxes).map(([id, digit]) => ({ id, digit })),
  };
}

/** The whole key as her answer: every result/partial digit and every carry. */
function perfect(t: WrittenCalcTask): WrittenCalcAnswer {
  return answer(keyOf(t));
}

/** Only the result and partial digits — no carries written at all. */
function withoutCarries(t: WrittenCalcTask): WrittenCalcAnswer {
  return answer(Object.fromEntries(Object.entries(keyOf(t)).filter(([id]) => !id.startsWith('c'))));
}

/** A row as text, for reading the layout in a test: digits, signs, `_` for a box, `.` empty. */
function rowText(cells: readonly WrittenCell[]): string {
  return cells.map((c) => (c === null ? '.' : 'id' in c ? '_' : c.text)).join('');
}

describe('writtenProblem: what the model wrote, checked (Regel 0)', () => {
  it('takes ordinary school calculations', () => {
    expect(writtenProblem(task('add', '476', '358'))).toBeNull();
    expect(writtenProblem(task('add', '1234', '5678', '999'))).toBeNull();
    expect(writtenProblem(task('sub', '8042', '3567'))).toBeNull();
    expect(writtenProblem(task('mul', '352', '24'))).toBeNull();
    expect(writtenProblem(task('mul', '4087', '6'))).toBeNull();
  });

  it('rejects the wrong number of numbers', () => {
    expect(writtenProblem(task('add', '12', '34', '56', '78'))).toBe('operands');
    expect(writtenProblem(task('sub', '90', '10', '5'))).toBe('operands');
    expect(writtenProblem(task('mul', '12', '3', '4'))).toBe('operands');
  });

  it('rejects a times table: no number with two digits', () => {
    expect(writtenProblem(task('mul', '7', '8'))).toBe('too_small');
    expect(writtenProblem(task('add', '4', '5'))).toBe('too_small');
    expect(writtenProblem(task('sub', '9', '4'))).toBe('too_small');
  });

  it('rejects a subtraction that does not stay above zero', () => {
    expect(writtenProblem(task('sub', '358', '476'))).toBe('not_positive');
    expect(writtenProblem(task('sub', '358', '358'))).toBe('not_positive');
  });

  it('rejects a second factor with three digits or a 0 in it', () => {
    expect(writtenProblem(task('mul', '352', '124'))).toBe('factor');
    expect(writtenProblem(task('mul', '352', '20'))).toBe('factor');
  });

  it('rejects what is wider than the phone holds', () => {
    // 999 999 + 1 = 1 000 000: seven digits, eight columns.
    expect(writtenProblem(task('add', '999999', '1'))).toBe('too_wide');
    expect(writtenProblem(task('mul', '12345', '67'))).toBe('too_wide');
    expect(writtenProblem(task('add', '999998', '1'))).toBeNull();
  });
});

describe('writtenLayout: the grid as in the exercise book', () => {
  it('an addition: numbers right-aligned, carries above the line, the result under it', () => {
    const layout = writtenLayout(task('add', '476', '358'))!;
    expect(layout.view.cols).toBe(4);
    expect(layout.view.rows.map((r) => [r.role, rowText(r.cells), r.rule_above])).toEqual([
      ['given', '.476', false],
      ['given', '+358', false],
      ['carry', '.__.', false],
      ['result', '.___', true],
    ]);
    // 6 + 8 = 14 → carry 1 into the tens; 7 + 5 + 1 = 13 → carry 1 into the hundreds.
    expect(keyOf(task('add', '476', '358'))).toEqual({
      c1: '1',
      c2: '1',
      r0: '4',
      r1: '3',
      r2: '8',
    });
  });

  it('an addition that grows by a digit gets the box for it', () => {
    const t = task('add', '785', '346');
    expect(writtenLayout(t)!.view.cols).toBe(5);
    expect(keyOf(t)).toMatchObject({ r3: '1', r2: '1', r1: '3', r0: '1', c3: '1' });
  });

  it('three summands carry up to 2', () => {
    const t = task('add', '99', '99', '99');
    expect(keyOf(t)).toMatchObject({ c1: '2', r0: '7', r1: '9', r2: '2' });
  });

  it('a subtraction: Ergänzungsverfahren carries, leading places empty', () => {
    const t = task('sub', '8042', '3567');
    // 2 − 7: carry; 4 − (6+1): carry; 0 − (5+1): carry; 8 − (3+1) = 4.
    expect(keyOf(t)).toEqual({
      c1: '1',
      c2: '1',
      c3: '1',
      r0: '5',
      r1: '7',
      r2: '4',
      r3: '4',
    });
    const short = keyOf(task('sub', '1000', '998'));
    expect([short.r3, short.r2, short.r1, short.r0]).toEqual(['', '', '', '2']);
  });

  it('a multiplication by one digit: the carries of the times row, then the result', () => {
    const t = task('mul', '4087', '6');
    const layout = writtenLayout(t)!;
    expect(layout.view.rows.map((r) => rowText(r.cells))).toEqual(['4087·6', '.____.', '._____']);
    // 7·6 = 42 → 4; 8·6 + 4 = 52 → 5; 0·6 + 5 = 5 → 0; 4·6 = 24 → 2.
    expect(keyOf(t)).toMatchObject({ c1: '4', c2: '5', c3: '', c4: '2', r4: '2', r0: '2' });
    expect(writtenSolution(t)).toBe('4087 · 6 = 24522');
  });

  it('a multiplication by two digits: partial products from the highest digit, then the sum', () => {
    const t = task('mul', '352', '24');
    const layout = writtenLayout(t)!;
    expect(layout.view.rows.map((r) => [r.role, rowText(r.cells), r.rule_above])).toEqual([
      ['given', '352·24', false],
      ['partial', '.____.', true],
      ['partial', '..____', false],
      ['carry', '.____.', false],
      ['result', '._____', true],
    ]);
    const key = keyOf(t);
    // 352 · 2 = 704, written ending under the 2 (tens); 352 · 4 = 1408 under the 4.
    expect([key.p1_4, key.p1_3, key.p1_2, key.p1_1]).toEqual(['', '7', '0', '4']);
    expect([key.p2_3, key.p2_2, key.p2_1, key.p2_0]).toEqual(['1', '4', '0', '8']);
    // 7040 + 1408 = 8448 — no carries at all.
    // The result has room for five digits (999 · 99 = 98 901); 8448 leaves the first one empty.
    expect([key.r4, key.r3, key.r2, key.r1, key.r0]).toEqual(['', '8', '4', '4', '8']);
    expect([key.c1, key.c2, key.c3, key.c4]).toEqual(['', '', '', '']);
  });

  it('every row has exactly as many cells as the grid has columns', () => {
    for (const t of [
      task('add', '999998', '1'),
      task('add', '12', '345', '6789'),
      task('sub', '100000', '1'),
      task('mul', '9999', '99'),
      task('mul', '99999', '9'),
    ]) {
      const { view } = writtenLayout(t)!;
      for (const row of view.rows) expect(row.cells).toHaveLength(view.cols);
    }
  });
});

describe('checkWritten: her boxes, digit by digit', () => {
  const add = task('add', '476', '358');

  it('the whole procedure right, with or without the carries', () => {
    expect(checkWritten(add, perfect(add))).toMatchObject({ correct: true, first: null });
    expect(checkWritten(add, withoutCarries(add))).toMatchObject({ correct: true, first: null });
  });

  it('carries are optional, but one she wrote must be right', () => {
    const wrong = { ...keyOf(add), c2: '2' };
    expect(checkWritten(add, answer(wrong))).toMatchObject({
      correct: false,
      first: { kind: 'carry_wrong', place: 2 },
    });
    // A written 0 where no carry belongs is no carry.
    const t = task('mul', '352', '24');
    expect(checkWritten(t, answer({ ...keyOf(t), c1: '0' }))?.correct).toBe(true);
  });

  it('names a forgotten carry by its column („Bei den Zehnern fehlt der Übertrag“)', () => {
    // 7 + 5 = 12 written as 2 instead of 3.
    const her: Record<string, string> = { ...keyOf(add), r1: '2' };
    delete her.c1;
    const check = checkWritten(add, answer(her))!;
    expect(check.first).toEqual({ kind: 'carry_missing', role: 'result', row: 0, place: 1 });
    expect(writtenReply('de', check)).toBe('Fast – bei den Zehnern fehlt der Übertrag.');
    expect(writtenReply('en', check)).toBe('Almost – the carry is missing in the tens.');
  });

  it('names a wrong digit and an empty box by their column', () => {
    // 7 would be the hundreds without the carry (named as such, above); 5 is just wrong.
    const wrongDigit = checkWritten(add, answer({ ...keyOf(add), r2: '5' }))!;
    expect(wrongDigit.first).toMatchObject({ kind: 'digit', place: 2 });
    expect(writtenReply('de', wrongDigit)).toBe(
      'Fast – bei den Hundertern stimmt die Ziffer noch nicht.',
    );
    const empty = checkWritten(add, answer({ r0: '4' }))!;
    expect(empty.first).toMatchObject({ kind: 'empty', place: 1 });
    expect(writtenReply('de', empty)).toBe('Fast – bei den Zehnern fehlt noch eine Ziffer.');
  });

  it('reports the first slip in the order the calculation is done: right to left', () => {
    const her = { ...keyOf(add), r0: '5', r2: '1' };
    expect(checkWritten(add, answer(her))?.first).toMatchObject({ place: 0 });
  });

  it('a leading zero changes no value and is not wrong', () => {
    const t = task('sub', '1000', '998');
    expect(checkWritten(t, answer({ r3: '0', r2: '0', r1: '0', r0: '2' }))?.correct).toBe(true);
    expect(checkWritten(t, answer({ r0: '2' }))?.correct).toBe(true);
    expect(checkWritten(t, answer({ r1: '1', r0: '2' }))?.correct).toBe(false);
  });

  it('subtraction, Ergänzungsverfahren: digit by digit', () => {
    const t = task('sub', '8042', '3567');
    expect(checkWritten(t, withoutCarries(t))?.correct).toBe(true);
    // Forgot the carry in the hundreds: 0 − 5 → 5 instead of 4.
    const her: Record<string, string> = { ...keyOf(t), r2: '5' };
    delete her.c2;
    expect(checkWritten(t, answer(her))?.first).toMatchObject({ kind: 'carry_missing', place: 2 });
  });

  it('multiplication: the partial products are checked first, and named', () => {
    const t = task('mul', '352', '24');
    expect(checkWritten(t, withoutCarries(t))?.correct).toBe(true);
    // The first partial product is 352 · 20 = 7040: its 0 stands in the hundreds column, and
    // the columns keep their names in every row.
    const her = { ...keyOf(t), p1_2: '1' };
    const check = checkWritten(t, answer(her))!;
    expect(check.first).toEqual({ kind: 'digit', role: 'partial', row: 1, place: 2 });
    expect(writtenReply('de', check)).toBe(
      'Fast – bei den Hundertern im ersten Teilprodukt stimmt die Ziffer noch nicht.',
    );
    const second = checkWritten(t, answer({ ...keyOf(t), p2_0: '' }))!;
    expect(writtenReply('de', second)).toBe(
      'Fast – bei den Einern im zweiten Teilprodukt fehlt noch eine Ziffer.',
    );
  });

  it('multiplication with carries: 4087 · 6 = 24522', () => {
    const t = task('mul', '4087', '6');
    expect(checkWritten(t, withoutCarries(t))?.correct).toBe(true);
    // 8·6 + 4 = 52: writing 8 (forgot the 4) is a wrong digit, and the 4 belonged there.
    const her: Record<string, string> = { ...keyOf(t), r1: '8' };
    delete her.c1;
    expect(checkWritten(t, answer(her))?.first).toMatchObject({ kind: 'carry_missing', place: 1 });
  });

  it('refuses an answer that does not fit the task: an unknown box, a box twice', () => {
    expect(checkWritten(add, answer({ r9: '1' }))).toBeNull();
    expect(
      checkWritten(add, {
        type: 'written_calc',
        boxes: [
          { id: 'r0', digit: '4' },
          { id: 'r0', digit: '5' },
        ],
      }),
    ).toBeNull();
  });

  it('writes her result into the conversation as she wrote it', () => {
    expect(writtenAnswerText(add, withoutCarries(add))).toBe('476 + 358 = 834');
    expect(writtenAnswerText(add, answer({}))).toBe('476 + 358 = …');
  });
});

describe('structured: a written calculation as a question', () => {
  const draft = {
    type: 'written_calc' as const,
    op: 'add' as const,
    operands: [476, 358],
    topic: 'Schriftlich addieren',
    difficulty: 2,
    prompt_lang: 'de',
    hints: ['Fang bei den Einern an.', 'Das Ergebnis ist 834.'],
    worked_solution: null,
  };

  it('code writes the instruction, the solution, and drops a hint that gives the result away', () => {
    const item = structuredItem(draft)!;
    expect(item.kind).toBe('written_calc');
    expect(item.prompt).toBe('Rechne schriftlich: 476 + 358');
    expect(item.answer).toBe('476 + 358 = 834');
    expect(item.hints).toEqual(['Fang bei den Einern an.']);
  });

  it('a draft that fails Regel 0 gives no question', () => {
    expect(structuredItem({ ...draft, op: 'sub', operands: [358, 476] })).toBeNull();
    expect(structuredItem({ ...draft, operands: [999_999, 5] })).toBeNull();
  });

  it('a stored task is read back through Regel 0, and its view never carries a digit to write', () => {
    expect(structuredTaskOf(task('sub', '12', '40'), 'written_calc')).toBeNull();
    expect(structuredTaskOf(task('add', '476', '358'), 'order')).toBeNull();
    const stored = structuredTaskOf(task('add', '476', '358'), 'written_calc')!;
    const view = JSON.stringify(viewOf(stored));
    expect(view).not.toContain('834');
    expect(view).not.toContain('want');
  });

  it('the reply goes through the one structured reply', () => {
    const t = task('add', '476', '358');
    const check = checkWritten(t, answer({ r0: '4', r1: '2', r2: '8' }))!;
    expect(structuredReply('fr', check)).toBe('Presque – aux dizaines, il manque la retenue.');
  });
});

describe('subtraction: every method a Bundesland teaches gives the same digits', () => {
  // 8042 − 3567 = 4475. The methods differ only in what is written beside the digits.
  const t = task('sub', '8042', '3567');

  it('Ergänzungsverfahren and Abziehverfahren with Borgen: the same carries, checked', () => {
    // Ergänzen: 7 + 5 = 12, carry 1; 6 + 1 + 7 = 14, carry 1; 5 + 1 + 4 = 10, carry 1; 3 + 1 + 4 = 8.
    // Borgen (Erweitern): 12 − 7 = 5, 1 borrowed into the tens of the subtrahend — the same 1.
    expect(checkWritten(t, perfect(t))?.correct).toBe(true);
  });

  it('Abziehverfahren with Entbündeln: nothing in the small row, the result is right', () => {
    // 8042 regrouped to 7 9 13 12 (crossed out in the minuend, no box for it): 12 − 7 = 5,
    // 13 − 6 = 7, 9 − 5 = 4, 7 − 3 = 4.
    expect(checkWritten(t, withoutCarries(t))).toMatchObject({ correct: true, first: null });
  });

  it('a digit one too big names both the carry and the Entbündeln', () => {
    const her: Record<string, string> = { ...keyOf(t), r1: '8' };
    delete her.c1;
    const check = checkWritten(t, answer(her))!;
    expect(check.first).toMatchObject({ kind: 'carry_missing', place: 1 });
    expect(writtenReply('de', check)).toBe(
      'Fast – bei den Zehnern ist die Ziffer um eins zu groß. Denk an den Übertrag oder ans Entbündeln.',
    );
  });
});

describe('division by one digit, short form: from the highest digit down', () => {
  const div = task('div', '846', '3');

  it('takes school divisions and rejects what is no written division', () => {
    expect(writtenProblem(div)).toBeNull();
    expect(writtenProblem(task('div', '7854', '6'))).toBeNull();
    expect(writtenProblem(task('div', '156', '3'))).toBeNull();
    // A quotient of one digit is a times table.
    expect(writtenProblem(task('div', '56', '7'))).toBe('too_small');
    expect(writtenProblem(task('div', '847', '3'))).toBe('remainder');
    expect(writtenProblem(task('div', '846', '1'))).toBe('divisor');
    expect(writtenProblem(task('div', '8460', '12'))).toBe('divisor');
    expect(writtenProblem(task('div', '84', '2', '3'))).toBe('operands');
    // Five digits, ":", the divisor and the "=" column: eight columns.
    expect(writtenProblem(task('div', '12345', '5'))).toBe('too_wide');
  });

  it('the quotient under the dividend, the remainders in the small row above it', () => {
    const layout = writtenLayout(div)!;
    expect(layout.view.cols).toBe(6);
    expect(layout.view.rows.map((r) => [r.role, rowText(r.cells), r.rule_above])).toEqual([
      ['given', '.846:3', false],
      ['carry', '..__..', false],
      ['result', '=___..', false],
    ]);
    // 8 : 3 = 2 Rest 2 → 24 : 3 = 8 Rest 0 → 6 : 3 = 2.
    expect(keyOf(div)).toEqual({ c1: '2', c0: '', r2: '2', r1: '8', r0: '2' });
    expect(writtenSolution(div)).toBe('846 : 3 = 282');
  });

  it('a first step that takes two digits: the quotient is one shorter, no box before it', () => {
    // 15 : 3 = 5 → 6 : 3 = 2. Writing "1 : 3 = 0" first is no step at school.
    const t = task('div', '156', '3');
    expect(writtenLayout(t)!.view.rows.map((r) => rowText(r.cells))).toEqual([
      '.156:3',
      '..._..',
      '=.__..',
    ]);
    expect(keyOf(t)).toEqual({ c0: '', r1: '5', r0: '2' });
  });

  it('remainders on every step: 7854 : 6 = 1309', () => {
    // 7 : 6 = 1 R 1 → 18 : 6 = 3 R 0 → 5 : 6 = 0 R 5 → 54 : 6 = 9.
    const t = task('div', '7854', '6');
    expect(keyOf(t)).toEqual({ c2: '1', c1: '', c0: '5', r3: '1', r2: '3', r1: '0', r0: '9' });
    expect(checkWritten(t, withoutCarries(t))?.correct).toBe(true);
    expect(checkWritten(t, perfect(t))?.correct).toBe(true);
  });

  it('names a remainder left out by its column', () => {
    // 4 : 3 = 1 instead of 24 : 3 = 8: the 2 from the hundreds was left out.
    const check = checkWritten(div, answer({ r2: '2', r1: '1', r0: '2' }))!;
    expect(check.first).toEqual({ kind: 'carry_missing', role: 'result', row: 0, place: 1 });
    expect(writtenReply('de', check)).toBe(
      'Fast – bei den Zehnern fehlt der Rest von der Stelle davor.',
    );
    expect(writtenReply('en', check)).toBe(
      'Almost – the remainder from the place before is missing in the tens.',
    );
  });

  it('a remainder she wrote must be right; the first slip is the highest place', () => {
    const wrongRest = checkWritten(div, answer({ ...keyOf(div), c1: '1' }))!;
    expect(wrongRest.first).toEqual({ kind: 'carry_wrong', place: 1 });
    expect(writtenReply('de', wrongRest)).toBe(
      'Fast – der Rest bei den Zehnern stimmt noch nicht.',
    );
    // Wrong in the hundreds and in the ones: the hundreds come first in a division.
    const two = checkWritten(div, answer({ r2: '3', r1: '8', r0: '1' }))!;
    expect(two.first).toMatchObject({ kind: 'digit', place: 2 });
  });

  it('as a question: code writes the instruction and the solution', () => {
    const item = structuredItem({
      type: 'written_calc',
      op: 'div',
      operands: [846, 3],
      topic: 'Schriftlich dividieren',
      difficulty: 2,
      prompt_lang: 'de',
      hints: [],
      worked_solution: null,
    })!;
    expect(item.prompt).toBe('Rechne schriftlich: 846 : 3');
    expect(item.answer).toBe('846 : 3 = 282');
    expect(writtenAnswerText(div, withoutCarries(div))).toBe('846 : 3 = 282');
  });
});
