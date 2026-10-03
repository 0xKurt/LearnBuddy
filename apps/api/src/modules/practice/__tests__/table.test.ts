// Tabelle ausfüllen (issue #230), Regel 0 in both directions (#224): what the model wrote is
// recomputed where code can — a value table from its function, a number wall from its sums,
// a two-way table from its totals — and checked for its structure everywhere; what she typed
// is checked cell by cell with the rules every answer goes through, never by a model.

import type { TableFillAnswer, TableFillTask } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import {
  answerTextOf,
  checkStructured,
  solutionOf,
  structuredItem,
  structuredReply,
  structuredTaskOf,
  taskProblem,
  viewOf,
} from '../structured.js';
import {
  cellVerdict,
  checkTable,
  tableProblem,
  tableReply,
  tableTaskFrom,
  tableView,
  type TableCheck,
  type TableDraft,
} from '../table.js';

type Cell = { text: string; gap: boolean; also: string[] };
const v = (text: string): Cell => ({ text, gap: false, also: [] });
const g = (text: string, also: string[] = []): Cell => ({ text, gap: true, also });

type Shape = Pick<TableDraft, 'header' | 'rows' | 'family' | 'fn' | 'x_in'>;
const shape = (over: Partial<Shape> & Pick<Shape, 'rows'>): Shape => ({
  header: null,
  family: null,
  fn: null,
  x_in: null,
  ...over,
});

function built(s: Shape): TableFillTask {
  const task = tableTaskFrom(s);
  expect(task, JSON.stringify(s)).not.toBeNull();
  return task!;
}

/** The problem Regel 0 finds in a table the model wrote (null: none, it would be stored). */
function problemOf(s: Shape): string | null {
  const task = tableTaskFrom(s);
  if (task) return null;
  // Rebuild without the final check to name the reason (the builder only says "no").
  const raw = {
    type: 'table_fill' as const,
    header: s.header && s.header.length > 0 ? s.header : null,
    rows: s.rows.map((cells, r) =>
      cells.map((c, col) =>
        c.gap
          ? {
              id: `r${r}c${col}`,
              key: c.text,
              also: c.also,
              input: /^[\p{L}\s]+$/u.test(c.text) ? ('text' as const) : ('math' as const),
            }
          : { text: c.text },
      ),
    ),
    family: s.family,
    fn: s.family === 'values' ? s.fn : null,
    x_in: s.family === 'values' ? s.x_in : null,
  };
  return tableProblem(raw) ?? 'schema';
}

function answer(cells: Record<string, string>): TableFillAnswer {
  return { type: 'table_fill', cells: Object.entries(cells).map(([id, text]) => ({ id, text })) };
}

const CTX = { spelling: null, subject_kind: null };

// f(x) = 2x + 1, the x in the header (one row of values, as in the schoolbook).
const VALUES: Shape = shape({
  header: ['x', '-1', '0', '1', '2'],
  rows: [[v('f(x)'), g('-1'), v('1'), g('3'), g('5')]],
  family: 'values',
  fn: '2*x+1',
  x_in: 'header',
});

// A number wall, top brick first.
const WALL: Shape = shape({
  rows: [[g('20')], [v('8'), g('12')], [g('3'), v('5'), v('7')]],
  family: 'wall',
});

// A Vierfeldertafel with totals.
const TOTALS: Shape = shape({
  header: ['', 'A', 'nicht A', 'Summe'],
  rows: [
    [v('B'), v('12'), g('8'), v('20')],
    [v('nicht B'), g('18'), v('12'), g('30')],
    [v('Summe'), v('30'), v('20'), g('50')],
  ],
  family: 'totals',
});

// No family: a conjugation table, checked for its structure only.
const VERBS: Shape = shape({
  header: ['Person', 'Präsens', 'Präteritum'],
  rows: [
    [v('ich'), v('gehe'), g('ging')],
    [v('du'), g('gehst'), g('gingst')],
  ],
});

describe('table_fill: what the model wrote (Regel 0)', () => {
  it('builds a value table, naming the gaps by place and choosing how each is typed', () => {
    const task = built(VALUES);
    const view = viewOf(task);
    expect(view).toEqual({
      type: 'table_fill',
      header: ['x', '-1', '0', '1', '2'],
      rows: [
        [
          { text: 'f(x)' },
          { id: 'r0c1', input: 'math', whole: true },
          { text: '1' },
          { id: 'r0c3', input: 'math', whole: true },
          { id: 'r0c4', input: 'math', whole: true },
        ],
      ],
      layout: 'grid',
    });
    // The view never carries a key.
    expect(JSON.stringify(view)).not.toContain('"key"');
    expect(solutionOf(task)).toBe('f(x): -1, 3, 5');
  });

  it('recomputes a value table from its function and drops one with a wrong value', () => {
    expect(problemOf(VALUES)).toBeNull();
    const wrong = { ...VALUES, rows: [[v('f(x)'), g('-1'), v('1'), g('3'), g('6')]] };
    expect(problemOf(wrong)).toBe('values_mismatch');
    // A shown value is recomputed as well: the table she reads must be right too.
    const shownWrong = { ...VALUES, rows: [[v('f(x)'), g('-1'), v('2'), g('3'), g('5')]] };
    expect(problemOf(shownWrong)).toBe('values_mismatch');
  });

  it('reads x from the first column, and a rounded value to its own rounding', () => {
    const roots = shape({
      header: ['x', 'y'],
      rows: [
        [v('2'), g('1,41')],
        [v('3'), g('1,73')],
        [v('4'), g('2')],
      ],
      family: 'values',
      fn: 'sqrt(x)',
      x_in: 'first_column',
    });
    expect(problemOf(roots)).toBeNull();
    const tooRough = { ...roots, rows: [...roots.rows.slice(0, 2), [v('4'), g('2,1')]] };
    expect(problemOf(tooRough)).toBe('values_mismatch');
  });

  it('drops a value table it cannot recompute', () => {
    expect(problemOf({ ...VALUES, fn: 'zwei x plus eins' })).toBe('family_shape');
    expect(problemOf({ ...VALUES, fn: null })).toBe('family_shape');
    expect(problemOf({ ...VALUES, x_in: null })).toBe('family_shape');
    // A value that is no number has no value to compare.
    expect(
      problemOf({ ...VALUES, rows: [[v('f(x)'), g('minus eins'), v('1'), g('3'), g('5')]] }),
    ).toBe('family_shape');
  });

  it('recomputes every brick of a number wall and drops a wrong sum', () => {
    const task = built(WALL);
    expect(viewOf(task)).toMatchObject({ layout: 'wall', header: null });
    expect(solutionOf(task)).toBe('20 · 12 · 3');
    const wrong = { ...WALL, rows: [[g('21')], [v('8'), g('12')], [g('3'), v('5'), v('7')]] };
    expect(problemOf(wrong)).toBe('wall_mismatch');
    // A wall is a triangle with no headings.
    expect(problemOf({ ...WALL, rows: [[g('20')], [v('8'), g('12')]] })).toBe('table_shape');
    expect(problemOf({ ...WALL, header: ['a'] })).toBe('table_shape');
    expect(problemOf({ ...WALL, rows: [[g('20')], [v('8'), g('12')], [g('3'), v('5')]] })).toBe(
      'table_shape',
    );
  });

  it('checks the totals of a two-way table and drops one that does not add up', () => {
    expect(problemOf(TOTALS)).toBeNull();
    const wrong = {
      ...TOTALS,
      rows: [TOTALS.rows[0]!, TOTALS.rows[1]!, [v('Summe'), v('30'), v('20'), g('51')]],
    };
    expect(problemOf(wrong)).toBe('totals_mismatch');
    const rowWrong = {
      ...TOTALS,
      rows: [[v('B'), v('12'), g('9'), v('20')], TOTALS.rows[1]!, TOTALS.rows[2]!],
    };
    expect(problemOf(rowWrong)).toBe('totals_mismatch');
  });

  it('checks the structure of every table', () => {
    expect(problemOf(VERBS)).toBeNull();
    // One cell per heading in every row.
    expect(problemOf({ ...VERBS, rows: [[v('ich'), g('ging')]] })).toBe('table_shape');
    // Six columns, ten rows at most.
    const wide = shape({
      header: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      rows: [Array(7).fill(g('1'))],
    });
    expect(tableTaskFrom(wide)).toBeNull();
    const tall = shape({
      header: ['n', 'm'],
      rows: Array.from({ length: 11 }, () => [v('a'), g('b')]),
    });
    expect(tableTaskFrom(tall)).toBeNull();
    // Nothing to fill in; nothing to read.
    expect(problemOf({ ...VERBS, rows: [[v('ich'), v('gehe'), v('ging')]] })).toBe('no_gaps');
    expect(problemOf({ ...VERBS, rows: [[g('ich'), g('gehe'), g('ging')]] })).toBe('all_gaps');
    // A word answer standing in what names its own cell.
    expect(
      problemOf({
        ...VERBS,
        header: ['Person', 'gehen', 'ging'],
        rows: [[v('ich'), g('gehe'), g('ging')]],
      }),
    ).toBe('key_shown');
    expect(
      problemOf({
        ...VERBS,
        header: ['Wort', 'Plural'],
        rows: [[v('Häuser'), g('häuser')]],
      }),
    ).toBe('key_shown');
    // An empty key once markup is set aside.
    expect(problemOf({ ...VERBS, rows: [[v('ich'), g('gehe'), g('$ $')]] })).not.toBeNull();
  });

  it('drops a table whose solution does not fit the answer column', () => {
    const long = 'x'.repeat(40);
    const rows = Array.from({ length: 10 }, (_, r) => [
      v(`${long.slice(0, 38)}${r}`),
      g(`${long}a`.slice(0, 40)),
      g(`${long}b`.slice(0, 40)),
      g(`${long}c`.slice(0, 40)),
    ]);
    expect(problemOf(shape({ header: ['a', 'b', 'c', 'd'], rows }))).toBe('too_long');
  });

  it('never trusts a stored task that no longer holds together', () => {
    const task = built(WALL);
    expect(structuredTaskOf(task, 'table_fill')).toEqual(task);
    expect(structuredTaskOf(task, 'order')).toBeNull();
    const broken = structuredClone(task);
    const top = broken.rows[0]![0]!;
    if ('key' in top) top.key = '99';
    expect(structuredTaskOf(broken, 'table_fill')).toBeNull();
    expect(taskProblem(broken)).toBe('wall_mismatch');
  });

  it('turns a draft into a question, dropping hints that give a cell away', () => {
    const item = structuredItem({
      type: 'table_fill',
      prompt: 'Konjugiere „gehen“.',
      ...VERBS,
      topic: 'Verben',
      difficulty: 2,
      prompt_lang: 'de',
      hints: ['Im Präteritum ändert sich der Stammvokal.', 'Bei „du“ heißt es gingst.'],
      worked_solution: null,
    });
    expect(item?.kind).toBe('table_fill');
    expect(item?.answer).toBe('ich: ging · du: gehst, gingst');
    expect(item?.hints).toEqual(['Im Präteritum ändert sich der Stammvokal.']);
  });
});

describe('table_fill: her answer, cell by cell', () => {
  it('says right when every cell is right, in any spelling the rules accept', () => {
    const task = built(VERBS);
    const check = checkStructured(task, answer({ r0c2: 'ging', r1c1: 'gehst', r1c2: 'gingst' }));
    expect(check).toMatchObject({ type: 'table_fill', correct: true, right: 3, total: 3 });
    expect(answerTextOf(task, answer({ r0c2: 'ging', r1c1: 'gehst', r1c2: 'gingst' }))).toBe(
      'ging · gehst · gingst',
    );
  });

  it('names the one wrong cell and counts the right ones', () => {
    const task = built(VERBS);
    const check = checkStructured(task, answer({ r0c2: 'ging', r1c1: 'gehst', r1c2: 'gehtest' }));
    expect(check?.correct).toBe(false);
    expect(check?.parts).toEqual([
      { id: 'r0c2', ok: true },
      { id: 'r1c1', ok: true },
      { id: 'r1c2', ok: false },
    ]);
    expect(structuredReply('de', check!)).toBe(
      '2 von 3 Feldern stimmen. Schau nochmal bei „du“ / „Präteritum“.',
    );
  });

  it('calls a slip nearly right, not wrong', () => {
    const task = built(VERBS);
    // "giengst": one letter too many, in a word long enough for a slip.
    const check = checkStructured(task, answer({ r0c2: 'ging', r1c1: 'gehst', r1c2: 'giengst' }));
    expect(check?.correct).toBe(false);
    expect(structuredReply('de', check!)).toBe(
      '2 von 3 Feldern stimmen. Bei „du“ / „Präteritum“ fehlt nur noch eine Kleinigkeit.',
    );
  });

  it('checks the numbers of a recomputed table as amounts, and a plain table by form', () => {
    const values = built(VALUES);
    // -1, 3 and 5 — the 3 written as 6/2 is the same amount in a value table.
    expect(checkStructured(values, answer({ r0c1: '-1', r0c3: '6/2', r0c4: '5' }))?.correct).toBe(
      true,
    );
    const plain = built(
      shape({ header: ['Bruch', 'Dezimalzahl'], rows: [[v('$\\frac{1}{2}$'), g('0,5')]] }),
    );
    const gap = plain.rows[0]![1]!;
    if (!('key' in gap)) throw new Error('gap expected');
    expect(cellVerdict(gap, '0,5', CTX, false)).toBe('right');
    // The same value as a fraction is not what the column asks for: nearly right.
    expect(cellVerdict(gap, '1/2', CTX, false)).toBe('near');
    expect(cellVerdict(gap, '0,6', CTX, false)).toBe('wrong');
    expect(cellVerdict(gap, 'halb', CTX, false)).toBe('wrong');
  });

  it('compares terms by value where the text differs', () => {
    const terms = built(
      shape({ header: ['Term', 'ausmultipliziert'], rows: [[v('2(x+3)'), g('2x+6')]] }),
    );
    const gap = terms.rows[0]![1]!;
    if (!('key' in gap)) throw new Error('gap expected');
    expect(cellVerdict(gap, '2x+6', CTX, false)).toBe('right');
    // The same summands in another order are the same form (#235, form.ts): right.
    expect(cellVerdict(gap, '6+2x', CTX, false)).toBe('right');
    // The same value in another form: the column asks for the expanded one, so nearly.
    expect(cellVerdict(gap, 'x+x+6', CTX, false)).toBe('near');
    expect(cellVerdict(gap, '2x+3', CTX, false)).toBe('wrong');
  });

  it('follows the subject on case: gentle in maths, strict in a language', () => {
    const task = built(VERBS);
    const gap = task.rows[0]![2]!;
    if (!('key' in gap)) throw new Error('gap expected');
    expect(cellVerdict(gap, 'Ging', { spelling: null, subject_kind: 'math' }, false)).toBe('right');
    expect(cellVerdict(gap, 'Ging', { spelling: null, subject_kind: 'german' }, false)).toBe(
      'near',
    );
  });

  it('refuses an answer that does not fit the table', () => {
    const task = built(VERBS);
    const all = { r0c2: 'ging', r1c1: 'gehst', r1c2: 'gingst' };
    expect(checkTable(task, answer({ r0c2: 'ging', r1c1: 'gehst' }), CTX)).toBeNull();
    expect(checkTable(task, answer({ ...all, r9c9: 'x' }), CTX)).toBeNull();
    expect(checkTable(task, answer({ ...all, r1c2: '  ' }), CTX)).toBeNull();
    expect(
      checkTable(
        task,
        { type: 'table_fill', cells: [...answer(all).cells, { id: 'r0c2', text: 'ging' }] },
        CTX,
      ),
    ).toBeNull();
    expect(checkStructured(task, { type: 'order', order: ['a', 'b', 'c'] })).toBeNull();
  });

  it('names bricks of a wall, and counts when more than three cells are off', () => {
    const wall = built(WALL);
    const check = checkStructured(wall, answer({ r0c0: '20', r1c1: '12', r2c0: '4' }));
    expect(structuredReply('de', check!)).toBe(
      '2 von 3 Feldern stimmen. Schau nochmal bei Reihe 3, Stein 1.',
    );
    const none = checkStructured(wall, answer({ r0c0: '1', r1c1: '2', r2c0: '4' }));
    expect(structuredReply('de', none!)).toBe(
      'Noch stimmt keins der Felder – fang am besten bei Reihe 1, Stein 1 an.',
    );
    const many: TableCheck = {
      type: 'table_fill',
      correct: false,
      parts: [],
      right: 1,
      total: 5,
      wall: false,
      misses: [1, 2, 3, 4].map((n) => ({
        id: `r${n}c1`,
        row: n,
        col: 2,
        row_label: null,
        col_label: 'y',
        near: false,
      })),
    };
    expect(tableReply('de', many)).toBe(
      '1 von 5 Feldern stimmt. Schau nochmal bei Zeile 1, Spalte „y“, Zeile 2, Spalte „y“ und 2 weiteren.',
    );
    expect(tableReply('de', { ...many, misses: many.misses.slice(0, 2), right: 3 })).toBe(
      '3 von 5 Feldern stimmen. Schau nochmal bei Zeile 1, Spalte „y“ und Zeile 2, Spalte „y“.',
    );
    expect(tableReply('en', { ...many, misses: many.misses.slice(0, 1), right: 4 })).toBe(
      '4 of 5 cells are right. Have another look at row 1, column “y”.',
    );
  });

  // The review of #230 (#224): two of three cells nearly right and none right was answered with
  // "Noch stimmt keins der Felder" — true to the letter, wrong about her work.
  it('never says "none is right" when every cell that is off is only nearly right', () => {
    const near: TableCheck = {
      type: 'table_fill',
      correct: false,
      parts: [],
      right: 0,
      total: 2,
      wall: false,
      misses: [1, 2].map((n) => ({
        id: `r${n}c1`,
        row: n,
        col: 2,
        row_label: null,
        col_label: 'y',
        near: true,
      })),
    };
    for (const locale of ['de', 'en', 'es', 'fr', 'it']) {
      expect(tableReply(locale, near)).not.toBe(
        tableReply(locale, { ...near, misses: near.misses.map((m) => ({ ...m, near: false })) }),
      );
    }
    expect(tableReply('de', near)).toBe(
      'Fast geschafft! Bei Zeile 1, Spalte „y“ und Zeile 2, Spalte „y“ fehlt jeweils nur noch eine Kleinigkeit.',
    );
    expect(tableReply('de', { ...near, total: 1, misses: near.misses.slice(0, 1) })).toBe(
      'Fast geschafft! Bei Zeile 1, Spalte „y“ fehlt nur noch eine Kleinigkeit.',
    );
    // With some cells right, the count stays, and the near ones are named as near.
    expect(tableReply('en', { ...near, right: 3, total: 5 })).toBe(
      '3 of 5 cells are right. Only a tiny detail is missing at row 1, column “y” and row 2, column “y”.',
    );
    const five = [1, 2, 3, 4].map((n) => ({ ...near.misses[0]!, id: `r${n}c1`, row: n }));
    expect(tableReply('de', { ...near, total: 4, misses: five })).toBe(
      'Fast geschafft! Bei Zeile 1, Spalte „y“, Zeile 2, Spalte „y“ und 2 weiteren fehlt jeweils nur noch eine Kleinigkeit.',
    );
    // A real miss among them: then nothing is right and it may say so, kindly.
    const mixed = { ...near, misses: [near.misses[0]!, { ...near.misses[1]!, near: false }] };
    expect(tableReply('de', mixed)).toBe(
      'Noch stimmt keins der Felder – fang am besten bei Zeile 1, Spalte „y“ an.',
    );
  });
});

describe('a gap with a whole number says so (issue #239, #286 finding 5)', () => {
  it('marks a gap whole only when every form of its key is a whole number', () => {
    const task = built(
      shape({
        header: ['', 'a', 'b', 'c', 'd', 'e'],
        rows: [[v('Wert'), g('12'), g('-3'), g('2.5'), g('4', ['$\\frac{8}{2}$']), g('zwei')]],
      }),
    );
    const cells = tableView(task).rows[0]!;
    expect(cells.map((c) => ('id' in c ? c.whole : null))).toEqual([
      null,
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});
