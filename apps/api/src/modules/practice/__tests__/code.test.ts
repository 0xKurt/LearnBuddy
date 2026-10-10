// Informatik (issue #262), Regel 0 in both directions: every key comes from RUNNING the task in the
// sandbox, and what the model claimed besides is only a probe — a wrong claim costs the question.
// Her answer is checked by running it too, and the reply names what the run really gave.

import type { CodeTask } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { buildCodeItem, codeSurfaceOf } from '../code.js';
import type { CodeItem } from '../codeParts.js';
import { checkCode, codeReply, type CodeCheck } from '../codeCheck.js';
import { compareRows, sortsResult } from '../codeSql.js';

async function item(task: CodeTask): Promise<CodeItem> {
  const built = await buildCodeItem(task, 'de');
  if (!('item' in built)) throw new Error(`rejected: ${built.reject}`);
  return built.item;
}

async function rejected(task: CodeTask): Promise<string> {
  const built = await buildCodeItem(task, 'de');
  return 'reject' in built ? built.reject : 'built';
}

async function check(task: CodeTask, answer: string): Promise<CodeCheck> {
  const c = await checkCode(task, answer);
  if (!c) throw new Error('no check');
  return c;
}

const LOOP = 'summe = 0\nfor i in range(1, 4):\n    summe = summe + i\n    print(summe)';

describe('what does the program print?', () => {
  it('takes the key from the run', async () => {
    const it = await item({ task: 'predict_output', program: LOOP, output: '1\n3\n6' });
    expect(it.answer).toBe('1\n3\n6');
    expect(it.kind).toBe('short');
    expect(it.figure).toEqual({
      type: 'code',
      language: 'python',
      lines: LOOP.split('\n'),
      numbered: true,
    });
    expect(codeSurfaceOf(it.code_task)).toEqual({
      mode: 'code_type',
      purpose: 'output',
      starter: '',
    });
  });

  it('writes no question when the model misread its own program', async () => {
    expect(await rejected({ task: 'predict_output', program: LOOP, output: '1\n2\n3' })).toBe(
      'output_disagrees',
    );
  });

  it('writes no question for a program that stops, hangs or does not fit the phone', async () => {
    expect(await rejected({ task: 'predict_output', program: 'print(1 / 0)', output: '' })).toBe(
      'did_not_run',
    );
    expect(
      await rejected({ task: 'predict_output', program: 'while True:\n    pass', output: '' }),
    ).toBe('ran_too_long');
    expect(
      await rejected({ task: 'predict_output', program: `print("${'x'.repeat(60)}")`, output: '' }),
    ).toBe('display');
  });

  it('holds her output line by line and says where it departs', async () => {
    const task = (await item({ task: 'predict_output', program: LOOP, output: '1\n3\n6' }))
      .code_task;
    expect((await check(task, '1\n3\n6\n')).verdict).toBe('correct');
    const partly = await check(task, '1\n3\n7');
    expect(partly).toMatchObject({ verdict: 'partly', held: 2, total: 3 });
    expect(codeReply('de', partly, 1)).toBe(
      'Die ersten 2 von 3 Zeilen stimmen. Schau dir Zeile 3 der Ausgabe noch einmal an.',
    );
    expect((await check(task, '2')).verdict).toBe('wrong');
  });
});

describe('in which line does it stop?', () => {
  const PROGRAM = 'werte = [4, 0, 2]\nfor w in werte:\n    print(8 / w)';

  it('takes the line from the run', async () => {
    const it = await item({ task: 'find_error', program: PROGRAM, line: 3 });
    expect(it.answer).toBe('Zeile 3');
    expect(it.worked_solution).toMatch(/Zeile 3/);
    expect(codeSurfaceOf(it.code_task)).toEqual({ mode: 'code_line', lines: 3 });
  });

  it('writes no question for a claimed line, a syntax error or a program that runs through', async () => {
    expect(await rejected({ task: 'find_error', program: PROGRAM, line: 2 })).toBe(
      'line_disagrees',
    );
    expect(await rejected({ task: 'find_error', program: 'if True\n    x = 1', line: 1 })).toBe(
      'not_a_runtime_error',
    );
    expect(await rejected({ task: 'find_error', program: 'print(1)', line: 1 })).toBe('no_error');
  });

  it('takes only a line of the program, and judges it against the run', async () => {
    const task = (await item({ task: 'find_error', program: PROGRAM, line: 3 })).code_task;
    expect((await check(task, '3')).verdict).toBe('correct');
    expect((await check(task, '1')).verdict).toBe('wrong');
    expect(await checkCode(task, '9')).toBeNull();
    expect(await checkCode(task, 'Zeile 3')).toBeNull();
  });
});

const DOUBLE: CodeTask = {
  task: 'write_function',
  name: 'verdoppeln',
  params: ['zahl'],
  statement: 'Die Funktion gibt das Doppelte der Zahl zurück.',
  tests: [
    { args: '2', expected: '4' },
    { args: '0', expected: '0' },
    { args: '-3', expected: '-6' },
    { args: '1.5', expected: '3.0' },
  ],
  solution: 'def verdoppeln(zahl):\n    return zahl * 2',
};

describe('write a function', () => {
  it('takes the expected values from running the solution, and shows two examples as code', async () => {
    const it = await item(DOUBLE);
    expect(it.kind).toBe('long');
    expect(it.prompt).toBe(
      'Schreibe die Funktion verdoppeln(zahl). Die Funktion gibt das Doppelte der Zahl zurück.',
    );
    expect(it.figure).toMatchObject({
      type: 'code',
      numbered: false,
      lines: ['verdoppeln(2)  # → 4', 'verdoppeln(0)  # → 0'],
    });
    expect(codeSurfaceOf(it.code_task)).toEqual({
      mode: 'code_type',
      purpose: 'program',
      starter: 'def verdoppeln(zahl):\n    ',
    });
  });

  it('writes no question when an expected value is not what the solution returns', async () => {
    const wrong = {
      ...DOUBLE,
      tests: [...DOUBLE.tests.slice(0, 3), { args: '5', expected: '11' }],
    };
    expect(await rejected(wrong)).toBe('expected_disagrees');
    expect(
      await rejected({
        ...DOUBLE,
        tests: [...DOUBLE.tests.slice(0, 3), { args: 'print(1)', expected: '1' }],
      }),
    ).toBe('bad_test');
    expect(await rejected({ ...DOUBLE, name: 'len' })).toBe('bad_signature');
  });

  it('runs her function against the tests and counts what passes', async () => {
    const task = (await item(DOUBLE)).code_task;
    const right = await check(task, 'def verdoppeln(zahl):\n    return zahl + zahl');
    expect(right).toMatchObject({ verdict: 'correct', held: 4, total: 4 });

    const partly = await check(task, 'def verdoppeln(zahl):\n    return abs(zahl) * 2');
    expect(partly).toMatchObject({ verdict: 'partly', held: 3, total: 4 });
    expect(codeReply('de', partly, 0)).toBe(
      '3 von 4 Tests bestanden. verdoppeln(-3) soll -6 ergeben, deine Funktion gibt 6 zurück.',
    );

    const printed = await check(task, 'def verdoppeln(zahl):\n    print(zahl * 2)');
    expect(codeReply('de', printed, 0)).toMatch(/print/);

    // The keyboard's typographic quotes are no error of hers.
    const quoted = await check(task, 'def verdoppeln(zahl):\n    return zahl * int(„2“)');
    expect(quoted.verdict).toBe('correct');
  });

  it('says what stops her program before any test can run', async () => {
    const task = (await item(DOUBLE)).code_task;
    expect(codeReply('de', await check(task, 'def verdoppeln(zahl)\n    return 2'), 0)).toMatch(
      /^Dein Programm bricht in Zeile 1 ab/,
    );
    expect(codeReply('de', await check(task, 'def doppelt(zahl):\n    return 2'), 0)).toMatch(
      /keine Funktion verdoppeln/,
    );
    expect(codeReply('de', await check(task, 'def verdoppeln(a, b):\n    return 2'), 0)).toMatch(
      /verdoppeln\(zahl\)/,
    );
    const hangs = await check(task, 'def verdoppeln(zahl):\n    while True:\n        pass');
    expect(hangs.verdict).toBe('wrong');
  });
});

const NOTES: CodeTask = {
  task: 'sql_query',
  table: 'schueler',
  columns: [
    { name: 'name', type: 'TEXT' },
    { name: 'klasse', type: 'TEXT' },
    { name: 'note', type: 'INTEGER' },
  ],
  rows: [
    ['Ada', '7a', '2'],
    ['Ben', '7b', '3'],
    ['Cem', '7a', '1'],
    ['Dora', '7b', ''],
  ],
  statement: 'Finde die Namen aller Schüler der Klasse 7a.',
  query: "SELECT name FROM schueler WHERE klasse = '7a'",
  result: [['Ada'], ['Cem']],
};

describe('write an SQL query', () => {
  it('takes the key rows from running the query on the table, and shows the table', async () => {
    const it = await item(NOTES);
    expect(it.prompt).toBe(
      'Schreibe eine SQL-Abfrage für die Tabelle schueler: Finde die Namen aller Schüler der Klasse 7a.',
    );
    expect(it.figure).toEqual({
      type: 'table',
      header: ['name', 'klasse', 'note'],
      rows: [
        ['Ada', '7a', '2'],
        ['Ben', '7b', '3'],
        ['Cem', '7a', '1'],
        ['Dora', '7b', 'NULL'],
      ],
    });
    expect(codeSurfaceOf(it.code_task)).toEqual({
      mode: 'code_type',
      purpose: 'query',
      starter: '',
    });
  });

  it('writes no question when the claimed rows are not the rows the query returns', async () => {
    expect(await rejected({ ...NOTES, result: [['Ada']] })).toBe('result_disagrees');
    expect(await rejected({ ...NOTES, query: 'DELETE FROM schueler WHERE 1 = 1' })).toBe(
      'not_a_query',
    );
    expect(
      await rejected({ ...NOTES, rows: [['Ada', '7a', 'zwei'], ...NOTES.rows.slice(1)] }),
    ).toBe('bad_table');
  });

  it('takes her rows in any order, unless the key sorts them', async () => {
    const task = (await item(NOTES)).code_task;
    expect(
      (await check(task, "select name from schueler where klasse = '7a' order by name desc"))
        .verdict,
    ).toBe('correct');
    const sorted = (
      await item({
        ...NOTES,
        query: "SELECT name FROM schueler WHERE klasse = '7a' ORDER BY note",
        result: [['Cem'], ['Ada']],
      })
    ).code_task;
    const order = await check(sorted, "select name from schueler where klasse = '7a'");
    expect(order.verdict).toBe('partly');
    expect(codeReply('de', order, 0)).toBe('Die Zeilen stimmen – nur die Reihenfolge noch nicht.');
  });

  it('names what differs, from what her query really returned', async () => {
    const task = (await item(NOTES)).code_task;
    expect(codeReply('de', await check(task, 'select name from schueler'), 0)).toBe(
      'Deine Abfrage liefert 4 Zeilen, gesucht sind 2. Schau dir die Bedingung noch einmal an.',
    );
    expect(
      codeReply('de', await check(task, "select * from schueler where klasse = '7a'"), 0),
    ).toMatch(/3 Spalten, gesucht sind 1/);
    expect(codeReply('de', await check(task, 'select nme from schueler'), 0)).toBe(
      'Die Abfrage läuft so nicht. SQLite meldet: no such column: nme',
    );
    expect(codeReply('de', await check(task, 'delete from schueler'), 0)).toMatch(/SELECT/);
  });

  it('knows a sorted result only by an ORDER BY of the whole query', () => {
    expect(sortsResult('select a from t order by a')).toBe(true);
    expect(sortsResult('select a from (select a from t order by a)')).toBe(false);
    expect(sortsResult("select 'order by' from t")).toBe(false);
    expect(compareRows([[1], [2]], [['2'], ['1']], false)).toEqual({ same: true });
    expect(compareRows([[1.5]], [[1.5000000000001]], true)).toEqual({ same: true });
    expect(compareRows([[null]], [['']], true)).toEqual({ same: true });
  });
});
