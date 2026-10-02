// Antworten mit mehreren Teilen: was angelegt wird, was gezeigt wird, was gilt
// (issues #228, #229, #230).
//
// Drei Dinge werden hier gemessen und nicht behauptet:
//   1. eine Aufgabe, deren Lösung nicht eindeutig ist, wird GAR NICHT angelegt;
//   2. das Brett verrät die Lösung nicht — auch nicht dadurch, dass es sie in der
//      Ausgangsreihenfolge hinlegt — und sieht zweimal gleich aus;
//   3. eine teilweise richtige Antwort bleibt teilweise richtig: sie nennt, wie viel hält, und
//      genau eine Stelle.

import type {
  MatchGroupsTask,
  MatchPairsTask,
  OrderTask,
  PartsTask,
  TableFillTask,
} from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import {
  boardOf,
  checkParts,
  kindOfForm,
  readParts,
  solutionOfParts,
  usablePartsTask,
  writtenParts,
  type FilledParts,
} from '../parts.js';
import { seedOf, shuffledAway, stableShuffle } from '../shuffle.js';

const BASE = { subject_kind: null };
const ID = '7f1c2b2e-0000-4000-8000-000000000001';

const KEIMUNG: OrderTask = {
  form: 'order',
  elements: ['Samen quillt auf', 'Wurzel wächst', 'Keimblätter öffnen sich', 'Blatt wächst'],
};

const ORGANE: MatchPairsTask = {
  form: 'match_pairs',
  pairs: [
    { left: 'Lunge', right: 'Gasaustausch' },
    { left: 'Herz', right: 'Blut pumpen' },
    { left: 'Niere', right: 'Blut filtern' },
    { left: 'Magen', right: 'Nahrung zersetzen' },
  ],
};

const WORTARTEN: MatchGroupsTask = {
  form: 'match_groups',
  groups: [
    { name: 'Nomen', members: ['Hund', 'Haus', 'Freude'] },
    { name: 'Verb', members: ['laufen', 'denken'] },
    { name: 'Adjektiv', members: ['schnell', 'leise'] },
  ],
};

const STELLENWERT: TableFillTask = {
  form: 'table_fill',
  computed: null,
  header: ['Zahl', 'H', 'Z', 'E'],
  rows: [
    [
      { cell: 'given', text: '342' },
      { cell: 'gap', expect: 'number', answer: '3', accepted: [] },
      { cell: 'gap', expect: 'number', answer: '4', accepted: [] },
      { cell: 'gap', expect: 'number', answer: '2', accepted: [] },
    ],
    [
      { cell: 'given', text: '905' },
      { cell: 'gap', expect: 'number', answer: '9', accepted: [] },
      { cell: 'gap', expect: 'number', answer: '0', accepted: [] },
      { cell: 'gap', expect: 'number', answer: '5', accepted: [] },
    ],
  ],
};

const KONJUGATION: TableFillTask = {
  form: 'table_fill',
  computed: null,
  header: ['Person', 'Präsens'],
  rows: [
    [
      { cell: 'given', text: 'ich' },
      { cell: 'gap', expect: 'word', answer: 'gehe', accepted: [] },
    ],
    [
      { cell: 'given', text: 'du' },
      { cell: 'gap', expect: 'word', answer: 'gehst', accepted: [] },
    ],
  ],
};

/** The answer that is right, built from the task itself. */
function rightAnswer(task: PartsTask): Map<string, string> {
  const filled = new Map<string, string>();
  switch (task.form) {
    case 'order':
      task.elements.forEach((_, i) => filled.set(`p${i + 1}`, `e${i + 1}`));
      return filled;
    case 'match_pairs':
      task.pairs.forEach((_, i) => filled.set(`l${i + 1}`, `r${i + 1}`));
      return filled;
    case 'match_groups': {
      let n = 0;
      task.groups.forEach((g, gi) => g.members.forEach(() => filled.set(`e${++n}`, `g${gi + 1}`)));
      return filled;
    }
    case 'table_fill': {
      let n = 0;
      for (const row of task.rows) {
        for (const cell of row) {
          if (cell.cell === 'gap') filled.set(`c${++n}`, cell.answer);
        }
      }
      return filled;
    }
  }
}

describe('a task is only created when its solution is the only one', () => {
  it('keeps a clean order and refuses duplicates', () => {
    expect(usablePartsTask(KEIMUNG)).toEqual(KEIMUNG);
    // Two elements that read the same make two orders right at once.
    expect(
      usablePartsTask({ ...KEIMUNG, elements: ['Wurzel wächst', 'Blatt', 'wurzel wächst'] }),
    ).toBeNull();
  });

  it('refuses numbers that are not in order, and keeps them descending', () => {
    expect(usablePartsTask({ form: 'order', elements: ['3', '7', '12', '40'] })).not.toBeNull();
    expect(usablePartsTask({ form: 'order', elements: ['40', '12', '7', '3'] })).not.toBeNull();
    // A numeric key the model wrote in no particular order would reject her right answer with
    // full authority (the mistake of issue #157), so no question is created.
    expect(usablePartsTask({ form: 'order', elements: ['7', '3', '40', '12'] })).toBeNull();
    // Equal numbers have no order between them.
    expect(usablePartsTask({ form: 'order', elements: ['3', '3,0', '7'] })).toBeNull();
    // A date and a year are numbers; a word next to them is not, so the check does not apply.
    expect(
      usablePartsTask({ form: 'order', elements: ['Mittelalter', '1492', 'Antike'] }),
    ).not.toBeNull();
  });

  it('refuses a pairing that has two right answers', () => {
    expect(usablePartsTask(ORGANE)).toEqual(ORGANE);
    const twoRights: MatchPairsTask = {
      form: 'match_pairs',
      pairs: [
        { left: 'Lunge', right: 'Gasaustausch' },
        { left: 'Herz', right: 'Gasaustausch' },
        { left: 'Niere', right: 'Blut filtern' },
      ],
    };
    expect(usablePartsTask(twoRights)).toBeNull();
    const twoLefts: MatchPairsTask = {
      form: 'match_pairs',
      pairs: [
        { left: 'Lunge', right: 'Gasaustausch' },
        { left: 'lunge', right: 'Blut pumpen' },
        { left: 'Niere', right: 'Blut filtern' },
      ],
    };
    expect(usablePartsTask(twoLefts)).toBeNull();
  });

  it('refuses a grouping whose element fits two groups, or that is too small', () => {
    expect(usablePartsTask(WORTARTEN)).toEqual(WORTARTEN);
    expect(
      usablePartsTask({
        form: 'match_groups',
        groups: [
          { name: 'Nomen', members: ['Hund', 'Haus'] },
          { name: 'Verb', members: ['laufen', 'Hund'] },
        ],
      }),
    ).toBeNull();
    // Three elements over two groups is not a sorting task (GROUP_MEMBERS_MIN).
    expect(
      usablePartsTask({
        form: 'match_groups',
        groups: [
          { name: 'Nomen', members: ['Hund', 'Haus'] },
          { name: 'Verb', members: ['laufen'] },
        ],
      }),
    ).toBeNull();
  });

  it('refuses a table that does not hold together', () => {
    expect(usablePartsTask(STELLENWERT)).toEqual(STELLENWERT);
    // A row narrower than the header: nothing says which column the gap belongs to.
    expect(
      usablePartsTask({
        ...STELLENWERT,
        rows: [
          [
            { cell: 'given', text: '342' },
            { cell: 'gap', expect: 'number', answer: '3', accepted: [] },
          ],
        ],
      }),
    ).toBeNull();
    // A number gap whose key is a word would be compared with the number rules and come back
    // "cannot tell" for an answer that is plainly right or wrong.
    expect(
      usablePartsTask({
        form: 'table_fill',
        computed: null,
        header: ['Person', 'Präsens'],
        rows: [
          [
            { cell: 'given', text: 'ich' },
            { cell: 'gap', expect: 'number', answer: 'gehe', accepted: [] },
          ],
        ],
      }),
    ).toBeNull();
    // A table with no gap is a figure, not a question.
    expect(
      usablePartsTask({
        form: 'table_fill',
        computed: null,
        header: ['a', 'b'],
        rows: [
          [
            { cell: 'given', text: '1' },
            { cell: 'given', text: '2' },
          ],
        ],
      }),
    ).toBeNull();
  });

  // The one table-content check issue #230 names with its own acceptance criterion
  // ("Wertetabelle mit falschem Schlüssel wird verworfen"): where arithmetic makes the key
  // decidable, it is decided before the question is asked, not by rejecting her right answer
  // afterwards (issue #157, one table wide).
  it('recomputes a table of values and refuses one whose key does not add up', () => {
    const values = (
      y: string[],
      computed: unknown = { expr: '2*x+1', input_column: 0, output_column: 1 },
    ) => ({
      form: 'table_fill' as const,
      header: ['x', 'f(x)'],
      rows: y.map((value, i) => [
        { cell: 'given' as const, text: String(i + 1) },
        { cell: 'gap' as const, expect: 'number' as const, answer: value, accepted: [] },
      ]),
      computed,
    });
    expect(usablePartsTask(values(['3', '5', '7']) as TableFillTask)).not.toBeNull();
    // One value wrong: no question at all, rather than a sure-sounding "falsch" later.
    expect(usablePartsTask(values(['3', '6', '7']) as TableFillTask)).toBeNull();
    // An expression outside the parser's grammar, or a column that is not a number, decides
    // nothing — so it is refused rather than waved through as "checked".
    expect(
      usablePartsTask(
        values(['3', '5', '7'], {
          expr: 'f(x)=??',
          input_column: 0,
          output_column: 1,
        }) as TableFillTask,
      ),
    ).toBeNull();
    expect(
      usablePartsTask(
        values(['3', '5', '7'], {
          expr: '2*x+1',
          input_column: 1,
          output_column: 1,
        }) as TableFillTask,
      ),
    ).toBeNull();
    // Without the declaration the same table is an ordinary table, and nothing is claimed.
    expect(usablePartsTask(values(['3', '6', '7'], null) as TableFillTask)).not.toBeNull();
  });

  it('puts both match forms into one kind', () => {
    expect(kindOfForm('order')).toBe('order');
    expect(kindOfForm('match_pairs')).toBe('match');
    expect(kindOfForm('match_groups')).toBe('match');
    expect(kindOfForm('table_fill')).toBe('table_fill');
  });
});

describe('the board shows the pieces without the solution', () => {
  it('is the same twice and never lays the order out as it is', () => {
    const a = boardOf(KEIMUNG, ID);
    const b = boardOf(KEIMUNG, ID);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).not.toContain('answer');
    if (a.form !== 'order') throw new Error('wrong form');
    expect(a.elements.map((e) => e.text).sort()).toEqual([...KEIMUNG.elements].sort());
    expect(a.elements.map((e) => e.ref)).not.toEqual(['e1', 'e2', 'e3', 'e4']);
    // Another question of the same task gets its own order: the seed is the item id.
    const other = boardOf(KEIMUNG, '7f1c2b2e-0000-4000-8000-000000000002');
    expect(other).not.toEqual(a);
  });

  it('never puts a pair in one row of the two columns', () => {
    for (let n = 0; n < 40; n++) {
      const board = boardOf(ORGANE, `7f1c2b2e-0000-4000-8000-0000000${String(100 + n)}`);
      if (board.form !== 'match_pairs') throw new Error('wrong form');
      const aligned = board.left.every((p, i) => p.ref.slice(1) === board.right[i]?.ref.slice(1));
      expect(aligned).toBe(false);
    }
  });

  it('numbers the gaps of a table in reading order and says which keyboard each needs', () => {
    const board = boardOf(KONJUGATION, ID);
    if (board.form !== 'table_fill') throw new Error('wrong form');
    const gaps = board.rows.flat().filter((c) => c.cell === 'gap');
    expect(gaps).toEqual([
      { cell: 'gap', ref: 'c1', expect: 'word', whole: false },
      { cell: 'gap', ref: 'c2', expect: 'word', whole: false },
    ]);
    expect(JSON.stringify(board)).not.toContain('gehe');
  });

  it('shuffles the same way on every run, and shuffledAway never returns the input order', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    expect(stableShuffle(items, 12345)).toEqual(stableShuffle(items, 12345));
    expect(seedOf('abc')).toBe(seedOf('abc'));
    for (let seed = 0; seed < 200; seed++) {
      expect(shuffledAway(items, seed)).not.toEqual(items);
      expect([...shuffledAway(items, seed)].sort()).toEqual([...items].sort());
    }
  });
});

describe('the server takes only the shape the question offers', () => {
  it('needs exactly the slots of this question, each once', () => {
    const right = rightAnswer(KEIMUNG);
    expect(
      readParts(
        KEIMUNG,
        [...right].map(([slot, value]) => ({ slot, value })),
      ),
    ).not.toBeNull();
    // A slot missing: the board is not finished, which is not a weaker answer.
    expect(
      readParts(KEIMUNG, [
        { slot: 'p1', value: 'e1' },
        { slot: 'p2', value: 'e2' },
      ]),
    ).toBeNull();
    // A slot this question does not have.
    expect(
      readParts(KEIMUNG, [
        { slot: 'p1', value: 'e1' },
        { slot: 'p2', value: 'e2' },
        { slot: 'p3', value: 'e3' },
        { slot: 'p9', value: 'e4' },
      ]),
    ).toBeNull();
    // One element in two positions.
    expect(
      readParts(KEIMUNG, [
        { slot: 'p1', value: 'e1' },
        { slot: 'p2', value: 'e1' },
        { slot: 'p3', value: 'e3' },
        { slot: 'p4', value: 'e4' },
      ]),
    ).toBeNull();
    // A value out of another question's vocabulary.
    expect(
      readParts(KEIMUNG, [
        { slot: 'p1', value: 'r1' },
        { slot: 'p2', value: 'e2' },
        { slot: 'p3', value: 'e3' },
        { slot: 'p4', value: 'e4' },
      ]),
    ).toBeNull();
  });

  it('needs every right side used exactly once for a pairing, and allows a group twice', () => {
    expect(
      readParts(ORGANE, [
        { slot: 'l1', value: 'r1' },
        { slot: 'l2', value: 'r1' },
        { slot: 'l3', value: 'r3' },
        { slot: 'l4', value: 'r4' },
      ]),
    ).toBeNull();
    const groups = readParts(WORTARTEN, [
      { slot: 'e1', value: 'g1' },
      { slot: 'e2', value: 'g1' },
      { slot: 'e3', value: 'g1' },
      { slot: 'e4', value: 'g2' },
      { slot: 'e5', value: 'g2' },
      { slot: 'e6', value: 'g3' },
      { slot: 'e7', value: 'g3' },
    ]);
    expect(groups).not.toBeNull();
  });

  it('refuses an empty cell', () => {
    expect(
      readParts(KONJUGATION, [
        { slot: 'c1', value: 'gehe' },
        { slot: 'c2', value: '   ' },
      ]),
    ).toBeNull();
  });
});

describe('what a partly right answer means', () => {
  const check = (task: PartsTask, filled: FilledParts) => checkParts(task, filled, ID, BASE);

  it('is correct only when every part holds', () => {
    for (const task of [KEIMUNG, ORGANE, WORTARTEN, STELLENWERT, KONJUGATION] as PartsTask[]) {
      const r = check(task, rightAnswer(task));
      expect({ form: task.form, verdict: r.verdict, place: r.place }).toEqual({
        form: task.form,
        verdict: 'correct',
        place: null,
      });
      expect(r.held).toBe(r.total);
    }
  });

  it('measures an order as its correct prefix and names the first step that breaks', () => {
    // The first two steps hold, then the last two are swapped.
    const r = check(
      KEIMUNG,
      new Map([
        ['p1', 'e1'],
        ['p2', 'e2'],
        ['p3', 'e4'],
        ['p4', 'e3'],
      ]),
    );
    expect(r).toEqual({
      form: 'order',
      held: 2,
      total: 4,
      verdict: 'partly',
      place: { at: 'step', step: 3 },
    });
    // Nothing holds: there is no right work to throw away, so it is simply wrong.
    const none = check(
      KEIMUNG,
      new Map([
        ['p1', 'e4'],
        ['p2', 'e3'],
        ['p3', 'e2'],
        ['p4', 'e1'],
      ]),
    );
    expect(none.verdict).toBe('wrong');
    expect(none.held).toBe(0);
  });

  it('counts pairs and names one of the ones that do not fit', () => {
    const r = check(
      ORGANE,
      new Map([
        ['l1', 'r1'],
        ['l2', 'r2'],
        ['l3', 'r4'],
        ['l4', 'r3'],
      ]),
    );
    expect(r.verdict).toBe('partly');
    expect({ held: r.held, total: r.total }).toEqual({ held: 2, total: 4 });
    // Exactly one place, and it is one of the two that are wrong — never the list of both.
    expect(r.place?.at).toBe('piece');
    expect(['Niere', 'Magen']).toContain(r.place?.at === 'piece' ? r.place.piece : '');
  });

  it('counts elements of a grouping, down to the last one', () => {
    const filled = new Map(rightAnswer(WORTARTEN));
    filled.set('e7', 'g1');
    const r = check(WORTARTEN, filled);
    expect({ held: r.held, total: r.total, verdict: r.verdict }).toEqual({
      held: 6,
      total: 7,
      verdict: 'partly',
    });
    expect(r.place?.at === 'piece' ? r.place.piece : '').toBe('leise');
  });

  it('checks every cell on its own and names the first one that is not right', () => {
    const filled = new Map(rightAnswer(STELLENWERT));
    filled.set('c3', '7');
    const r = check(STELLENWERT, filled);
    expect({ held: r.held, total: r.total, verdict: r.verdict }).toEqual({
      held: 5,
      total: 6,
      verdict: 'partly',
    });
    expect(r.place).toEqual({
      at: 'cell',
      column: 'E',
      columnNumber: 4,
      row: '342',
      rowNumber: 1,
      rule: 'incorrect',
      typo: null,
    });
  });

  it('calls a slip in a cell a slip, with what slipped', () => {
    const r = check(
      KONJUGATION,
      new Map([
        ['c1', 'gehe'],
        ['c2', 'gehts'],
      ]),
    );
    expect(r.verdict).toBe('partly');
    // "gehts" for "gehst": two neighbours the wrong way round — the one slip a learner
    // recognises instantly once it is named (issue #207).
    expect(r.place?.at === 'cell' ? [r.place.rule, r.place.typo] : null).toEqual([
      'typo',
      'swapped',
    ]);
    // A cell holds one form of a word: capitals alone do not make it wrong, because for a
    // single field that is the gentle judgement the tutor would give.
    const folded = check(
      KONJUGATION,
      new Map([
        ['c1', 'Gehe'],
        ['c2', 'gehst'],
      ]),
    );
    expect(folded.verdict).toBe('correct');
  });

  it('reads a number cell by its value, not by how it is written', () => {
    const values: TableFillTask = {
      form: 'table_fill',
      computed: null,
      header: ['x', 'f(x)'],
      rows: [
        [
          { cell: 'given', text: '1' },
          { cell: 'gap', expect: 'number', answer: '0.5', accepted: [] },
        ],
      ],
    };
    expect(checkParts(values, new Map([['c1', '1/2']]), ID, BASE).verdict).toBe('correct');
    expect(checkParts(values, new Map([['c1', '0,5']]), ID, BASE).verdict).toBe('correct');
    expect(checkParts(values, new Map([['c1', '0,6']]), ID, BASE).verdict).toBe('wrong');
  });
});

describe('the solution and her answer, in one line each', () => {
  it('renders both the same way, so they can be compared by eye', () => {
    expect(solutionOfParts(KEIMUNG)).toBe(
      'Samen quillt auf → Wurzel wächst → Keimblätter öffnen sich → Blatt wächst',
    );
    expect(
      writtenParts(
        KEIMUNG,
        new Map([
          ['p1', 'e2'],
          ['p2', 'e1'],
          ['p3', 'e3'],
          ['p4', 'e4'],
        ]),
      ),
    ).toBe('Wurzel wächst → Samen quillt auf → Keimblätter öffnen sich → Blatt wächst');
    expect(solutionOfParts(ORGANE)).toContain('Lunge – Gasaustausch');
    expect(solutionOfParts(WORTARTEN)).toBe(
      'Nomen: Hund, Haus, Freude · Verb: laufen, denken · Adjektiv: schnell, leise',
    );
    expect(solutionOfParts(STELLENWERT)).toBe('3; 4; 2; 9; 0; 5');
  });

  it('fits the answer column of the biggest task every form allows', () => {
    const long = (n: number, c: string) => c.repeat(n);
    const biggest: PartsTask[] = [
      { form: 'order', elements: Array.from({ length: 8 }, (_, i) => long(48, String(i))) },
      {
        form: 'match_pairs',
        pairs: Array.from({ length: 6 }, (_, i) => ({
          left: long(40, String(i)),
          right: long(40, String.fromCharCode(97 + i)),
        })),
      },
      {
        form: 'match_groups',
        groups: Array.from({ length: 4 }, (_, g) => ({
          name: long(24, String(g)),
          members: Array.from({ length: 3 }, (_, m) =>
            long(32, String.fromCharCode(97 + g * 3 + m)),
          ),
        })),
      },
      {
        form: 'table_fill',
        computed: null,
        header: ['a'],
        rows: Array.from({ length: 10 }, (_, r) =>
          r === 0
            ? [{ cell: 'given' as const, text: 'x' }]
            : [
                {
                  cell: 'gap' as const,
                  expect: 'word' as const,
                  answer: long(40, 'y'),
                  accepted: [],
                },
              ],
        ),
      },
    ];
    for (const task of biggest) {
      expect({ form: task.form, fits: solutionOfParts(task).length <= 600 }).toEqual({
        form: task.form,
        fits: true,
      });
    }
  });
});

describe('a gap with a whole number says so (issue #239, #286 finding 5)', () => {
  it('marks a gap whole only when every form of its key is a whole number', () => {
    const task: TableFillTask = {
      form: 'table_fill',
      computed: null,
      header: ['a', 'b', 'c', 'd', 'e'],
      rows: [
        [
          { cell: 'gap', expect: 'number', answer: '12', accepted: [] },
          { cell: 'gap', expect: 'number', answer: '-3', accepted: [] },
          { cell: 'gap', expect: 'number', answer: '2.5', accepted: [] },
          { cell: 'gap', expect: 'number', answer: '4', accepted: ['$\\frac{8}{2}$'] },
          { cell: 'gap', expect: 'word', answer: 'zwei', accepted: [] },
        ],
      ],
    };
    const board = boardOf(task, '00000000-0000-4000-8000-000000000001');
    expect(board.form).toBe('table_fill');
    if (board.form !== 'table_fill') return;
    expect(board.rows[0]!.map((c) => (c.cell === 'gap' ? c.whole : null))).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});
