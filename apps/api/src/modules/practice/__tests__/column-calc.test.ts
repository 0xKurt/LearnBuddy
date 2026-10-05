// Schriftlich rechnen (issue #260), Regel 0 in beiden Richtungen: code computes the procedure
// from the operation and the numbers alone — every digit and every carry, laid out as on squared
// paper — and her cells are compared one by one. The reply names the first place that is not right
// yet, in the order she writes ("bei den Zehnern fehlt noch der Übertrag"), never its digit.

import {
  columnsFit,
  ColumnCalcTaskView,
  type ColumnCalcTask,
  type ColumnOp,
} from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import {
  checkColumns,
  columnLayout,
  columnProblem,
  columnReply,
  columnSolution,
  columnTaskFrom,
  type ColumnCheck,
} from '../columnCalc.js';
import {
  answerTextOf,
  partsVia,
  secretsOf,
  structuredItem,
  structuredTaskOf,
  structuredVerdict,
  viewOf,
} from '../structured.js';

function task(op: ColumnOp, ...operands: string[]): ColumnCalcTask {
  const built = columnTaskFrom({ op, operands });
  if (!built) throw new Error(`expected a task for ${op} ${operands.join(',')}`);
  return built;
}

/** The grid as text: a digit for a key, "_" for a cell that may stay empty, shown cells as they are. */
function drawn(t: ColumnCalcTask): string[] {
  const layout = columnLayout(t)!;
  return layout.view.rows.map(
    (r) =>
      (r.rule ? '— ' : '  ') +
      r.cells
        .map((c) => {
          if (!('id' in c)) return c.text || '.';
          const k = layout.keys.get(c.id)!;
          return k.blank ? '_' : String(k.digit);
        })
        .join(''),
  );
}

/** Her cells: the key everywhere (blank where blank is right), then her changes by id. */
function filled(t: ColumnCalcTask, change: Record<string, string> = {}) {
  const layout = columnLayout(t)!;
  return {
    type: 'column_calc' as const,
    cells: layout.view.order.map((id) => {
      const k = layout.keys.get(id)!;
      return { id, digit: change[id] ?? (k.blank ? '' : String(k.digit)) };
    }),
  };
}

function checked(t: ColumnCalcTask, change: Record<string, string> = {}): ColumnCheck {
  const c = checkColumns(t, filled(t, change));
  if (!c) throw new Error('expected a check');
  return c;
}

/** The id of the cell in row r, column c. */
const at = (r: number, c: number) => `r${r}c${c}`;

describe('column_calc: the procedure, computed by code', () => {
  it('adds with the carries in the small row above the line, a leading cell that may stay empty', () => {
    expect(drawn(task('add', '4721', '1389'))).toEqual([
      '  ..4721',
      '  +.1389',
      '  ..111.',
      '— ._6110',
    ]);
  });

  it('adds three numbers, a carry of two included, and the last carry goes straight into the sum', () => {
    expect(drawn(task('add', '999', '88', '7'))).toEqual([
      '  ..999',
      '  ...88',
      '  +...7',
      '  ..12.',
      '— .1094',
    ]);
  });

  it('subtracts by Ergänzen: the carry under the next column, leading zeros of the result optional', () => {
    expect(drawn(task('sub', '5203', '1874'))).toEqual([
      '  .5203',
      '  −1874',
      '  .111.',
      '— .3329',
    ]);
    expect(drawn(task('sub', '1000', '999'))).toEqual(['  .1000', '  −.999', '  .111.', '— .___1']);
  });

  it('multiplies by one digit straight into the result', () => {
    expect(drawn(task('mul', '352', '4'))).toEqual(['  352·4', '— .1408']);
  });

  it('multiplies by two digits: a partial product per digit, ending under it, then their sum', () => {
    expect(drawn(task('mul', '352', '24'))).toEqual([
      '  352·24',
      '— ._704.',
      '  ..1408',
      '  .____.',
      '— ._8448',
    ]);
    // 789 · 56: 39450 + 4734 carries into the thousands and the ten thousands only.
    expect(drawn(task('mul', '789', '56'))).toEqual([
      '  789·56',
      '— .3945.',
      '  ..4734',
      '  .11__.',
      '— .44184',
    ]);
  });

  it('divides as a staircase: times, then the difference with the next digit brought down', () => {
    expect(drawn(task('div', '96', '4'))).toEqual([
      '  96:4=24',
      '  8......',
      '— 16.....',
      '  16.....',
      '— .0.....',
    ]);
    // The first digit is smaller than the divisor: the first step takes two digits. A remainder.
    expect(drawn(task('div', '173', '4'))).toEqual([
      '  173:4=43',
      '  16......',
      '— .13.....',
      '  .12.....',
      '— ..1.....',
    ]);
    expect(columnSolution(task('div', '173', '4'))).toBe('173 : 4 = 43 R 1');
  });

  it('writes the cells in the order she writes them: right to left, the carry before the digit', () => {
    expect(columnLayout(task('add', '4721', '1389'))!.view.order).toEqual([
      at(3, 5),
      at(2, 4),
      at(3, 4),
      at(2, 3),
      at(3, 3),
      at(2, 2),
      at(3, 2),
      at(3, 1),
    ]);
  });

  it('never sends a key: the view is the contract’s, cells say only where they are', () => {
    const view = viewOf(task('mul', '352', '24'));
    expect(ColumnCalcTaskView.safeParse(view).success).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(/"digit"|"blank"|8448/);
  });
});

describe('column_calc: what the model wrote (Regel 0)', () => {
  it('rejects numbers that do not fit the operation, and nothing is repaired', () => {
    const bad: Array<[ColumnOp, string[]]> = [
      ['add', ['4721']],
      ['add', ['1', '2']],
      ['add', ['12', '34', '56', '78']],
      ['add', ['0123', '45']],
      ['add', ['12.5', '3']],
      ['add', ['1234567', '1']],
      ['sub', ['1389', '4721']],
      ['sub', ['500', '500']],
      ['mul', ['352', '204']],
      ['mul', ['352', '20']],
      ['mul', ['352', '1']],
      ['div', ['672', '12']],
      ['div', ['672', '1']],
      ['div', ['5', '7']],
    ];
    for (const [op, operands] of bad) {
      expect(columnTaskFrom({ op, operands }), `${op} ${operands.join(',')}`).toBeNull();
    }
  });

  it('rejects a grid that would not fit a 360×740 phone: three division steps are too many rows', () => {
    expect(columnProblem({ type: 'column_calc', op: 'div', operands: ['672', '3'] })).toBe(
      'too_long',
    );
    expect(columnProblem({ type: 'column_calc', op: 'div', operands: ['174', '5'] })).toBeNull();
  });

  it('keeps the widest allowed grids within the contract’s width', () => {
    for (const t of [
      task('add', '999999', '999999', '999999'),
      task('mul', '999999', '99'),
      task('div', '199', '2'),
    ]) {
      expect(columnsFit(columnLayout(t)!.view.rows)).toBe(true);
    }
  });

  it('turns a draft into an item whose solution is code’s and whose hints never give the result', () => {
    const item = structuredItem({
      type: 'column_calc',
      prompt: 'Rechne schriftlich.',
      op: 'add',
      operands: ['4721', '1389'],
      hints: ['Fang bei den Einern an.', 'Am Ende steht 6110.'],
      topic: 'Schriftliche Addition',
      difficulty: 2,
      prompt_lang: 'de',
    });
    expect(item).toMatchObject({
      kind: 'column_calc',
      answer: '4721 + 1389 = 6110',
      hints: ['Fang bei den Einern an.'],
      worked_solution: null,
    });
    expect(secretsOf(item!.task, item!.prompt).secrets).toEqual(['6110']);
  });

  it('reads a stored task back only while it still passes Regel 0', () => {
    expect(structuredTaskOf(task('sub', '5203', '1874'), 'column_calc')).not.toBeNull();
    expect(
      structuredTaskOf(
        { type: 'column_calc', op: 'sub', operands: ['1874', '5203'] },
        'column_calc',
      ),
    ).toBeNull();
  });
});

describe('column_calc: her cells, checked', () => {
  const sum = task('add', '4721', '1389');

  it('takes the right grid, empty where nothing belongs or a 0 written there', () => {
    expect(checked(sum).correct).toBe(true);
    // A leading zero written out is not wrong (no carry, the place above the sum).
    expect(checked(sum, { [at(3, 1)]: '0' }).correct).toBe(true);
    expect(structuredVerdict(checked(sum))).toBe('correct');
  });

  it('names the first place that is not right in the order she writes: a missing carry', () => {
    const c = checked(sum, { [at(2, 4)]: '' });
    expect(c.correct).toBe(false);
    expect(c.first).toEqual({ part: 'carry', place: 1, step: 0, missing: true });
    expect(columnReply('de', c)).toBe('Noch nicht ganz – bei den Zehnern fehlt noch der Übertrag.');
  });

  it('checks every carry, even when the digit under it is right', () => {
    const c = checked(sum, { [at(2, 3)]: '2' });
    expect(c.first).toMatchObject({ part: 'carry', place: 2, missing: false });
    expect(columnReply('de', c)).toBe(
      'Noch nicht ganz – bei den Hundertern stimmt der Übertrag noch nicht.',
    );
  });

  it('names a wrong digit of the result by its place, never the digit', () => {
    const c = checked(sum, { [at(3, 2)]: '0', [at(3, 3)]: '2' });
    expect(c.first).toMatchObject({ part: 'result', place: 2 });
    const reply = columnReply('de', c);
    expect(reply).toBe(
      'Noch nicht ganz – bei den Hundertern stimmt die Ziffer im Ergebnis noch nicht.',
    );
    expect(reply).not.toMatch(/1/);
  });

  it('names a partial product by its line, a division step by its number', () => {
    const mul = task('mul', '352', '24');
    expect(columnReply('de', checked(mul, { [at(2, 4)]: '5' }))).toBe(
      'Noch nicht ganz – in der 2. Zeile stimmt bei den Zehnern noch etwas nicht.',
    );
    const div = task('div', '174', '5');
    expect(columnReply('de', checked(div, { [at(0, 7)]: '3' }))).toBe(
      'Noch nicht ganz – die 2. Ziffer des Ergebnisses stimmt noch nicht.',
    );
    expect(columnReply('de', checked(div, { [at(3, 1)]: '9' }))).toBe(
      'Noch nicht ganz – im 2. Schritt stimmt das Malnehmen noch nicht.',
    );
    expect(columnReply('de', checked(div, { [at(4, 2)]: '' }))).toBe(
      'Noch nicht ganz – im 2. Schritt stimmt die Zahl unter dem Strich noch nicht.',
    );
  });

  it('says it in every language of the app', () => {
    const c = checked(sum, { [at(2, 4)]: '' });
    expect(columnReply('en', c)).toBe('Not quite yet – in the tens, the carry is still missing.');
    expect(columnReply('fr', c)).toContain('dans les dizaines');
    expect(columnReply('es', c)).toContain('en las decenas');
    expect(columnReply('it', c)).toContain('nelle decine');
  });

  it('refuses an answer that does not fit the grid: a cell missing, twice, or not there', () => {
    const all = filled(sum);
    expect(checkColumns(sum, { ...all, cells: all.cells.slice(1) })).toBeNull();
    expect(checkColumns(sum, { ...all, cells: [...all.cells.slice(1), all.cells[1]!] })).toBeNull();
    expect(
      checkColumns(sum, { ...all, cells: [...all.cells.slice(1), { id: 'r9c9', digit: '1' }] }),
    ).toBeNull();
  });

  it('keeps her result in the conversation, typed in, judged by code', () => {
    const answer = filled(sum, { [at(3, 3)]: '' });
    expect(answerTextOf(sum, answer, 'de')).toBe('6_10');
    expect(answerTextOf(sum, filled(sum), 'de')).toBe('6110');
    expect(partsVia(sum)).toBe('typed');
  });
});
