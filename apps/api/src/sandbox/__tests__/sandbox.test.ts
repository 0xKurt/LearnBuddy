// The sandbox the Informatik questions run in (issue #262): Python (Skulpt) inside QuickJS-WASM,
// SQL inside SQLite-WASM. What is proven here is the WALL, not the language: the time, memory and
// output limits end a run as a limit; nothing of the server is reachable from inside; a query can
// read and nothing else. The language itself is Skulpt's and SQLite's.

import { describe, expect, it } from 'vitest';

import {
  runFunction,
  runProgram,
  isLiteral,
  type FunctionRun,
  type ProgramRun,
} from '../python.js';
import { runIsolated } from '../quickjs.js';
import { runQuery, type SqlTable } from '../sql.js';

const ran = (r: ProgramRun) => {
  if (r.kind !== 'ran') throw new Error(`expected a run, got ${JSON.stringify(r)}`);
  return r;
};

describe('python: what a program prints and where it stops', () => {
  it('prints exactly what CPython prints for ordinary school programs', async () => {
    const r = ran(
      await runProgram(
        'x = 3\nfor i in range(x):\n    print(i * 2, end=" ")\nprint()\nprint(7 // 2, -7 // 2, 2 ** 64)\nprint([1, "a", None, True, 2.0], f"{3.14159:.2f}")',
      ),
    );
    expect(r.error).toBeNull();
    expect(r.output).toBe("0 2 4 \n3 -4 18446744073709551616\n[1, 'a', None, True, 2.0] 3.14\n");
  });

  it('names the error and the innermost line Python stops at', async () => {
    const r = ran(
      await runProgram('def f(a):\n    return a / 0\n\nprint("vor")\nf(2)\nprint("nach")'),
    );
    expect(r.output).toBe('vor\n');
    expect(r.error).toMatchObject({ type: 'ZeroDivisionError', line: 2 });
    expect(ran(await runProgram('d = {"a": 1}\nprint(d["b"])')).error).toMatchObject({
      type: 'KeyError',
      line: 2,
    });
    expect(ran(await runProgram('if True\n    print(1)')).error?.type).toBe('SyntaxError');
  });

  it('ends an endless loop at its deadline, as a limit', async () => {
    const t0 = Date.now();
    expect(await runProgram('while True:\n    pass', { ms: 300, memory: 32 << 20 })).toEqual({
      kind: 'limit',
      limit: 'time',
    });
    expect(Date.now() - t0).toBeLessThan(3_000);
  });

  it('ends a program that eats memory at its limit', async () => {
    const r = await runProgram('s = "ab"\nwhile True:\n    s = s + s', {
      ms: 5_000,
      memory: 24 << 20,
    });
    expect(r).toEqual({ kind: 'limit', limit: 'memory' });
  });

  it('ends a program that prints without end, as a limit', async () => {
    expect(await runProgram('while True:\n    print("spam")')).toEqual({
      kind: 'limit',
      limit: 'output',
    });
  });

  it('survives a recursion without end: an error inside the run, and the next run works', async () => {
    const r = ran(await runProgram('def r(n):\n    return r(n + 1)\nr(0)'));
    expect(r.error).not.toBeNull();
    expect(ran(await runProgram('print(1)')).output).toBe('1\n');
  });

  it('reaches nothing of the server: no module but math, no input, no host objects', async () => {
    expect(ran(await runProgram('import os')).error?.type).toBe('ImportError');
    expect(ran(await runProgram('x = input()')).error?.message).toMatch(/input/);
    // Skulpt's own bridges into JavaScript are gone: from inside, the JavaScript that checks her
    // function (and builds the JSON of the result) could be rewritten (PR #536 review).
    expect(ran(await runProgram('jseval("1")')).error?.type).toBe('NameError');
    expect(ran(await runProgram('jsmillis()')).error?.type).toBe('NameError');
  });

  it('runs a function on test cases: values, Python equality, print instead of return, errors', async () => {
    const r = await runFunction(
      'def summe(a, b):\n    if a == 9:\n        print(a + b)\n        return None\n    return a + b\n',
      'summe',
      [
        { args: '2, 3', expected: '5' },
        { args: '0.1, 0.2', expected: '0.3' },
        { args: '[1], [2]', expected: '[1, 2]' },
        { args: '1, "x"', expected: '1' },
        { args: '9, 1', expected: '10' },
        { args: '2, 2', expected: '5' },
      ],
    );
    if (r.kind !== 'ran') throw new Error(JSON.stringify(r));
    expect(r.params).toBe(2);
    expect(r.results.map((x) => (x.kind === 'value' ? x.same : x.kind))).toEqual([
      true,
      true,
      true,
      'error',
      'none',
      false,
    ]);
    expect(r.results[4]).toEqual({ kind: 'none', printed: true });
  });

  it('tells a missing function and a program that does not load apart', async () => {
    expect(await runFunction('def g():\n    pass', 'f', [{ args: '1', expected: '1' }])).toEqual({
      kind: 'missing',
    });
    expect((await runFunction('def f(:', 'f', [{ args: '1', expected: '1' }])).kind).toBe(
      'module_error',
    );
  });

  it('builds only literals into the harness', () => {
    for (const ok of ['1, 2', '[1, (2, 3)], {"a": None}', '"x\\"y"', '-3.5e2', 'True, False']) {
      expect(isLiteral(ok)).toBe(true);
    }
    for (const bad of ['print(1)', '__import__("os")', '(1', '1)', 'x', '']) {
      expect(isLiteral(bad)).toBe(false);
    }
    // Two strings side by side are one to Python — and `''' ' '''` is ONE triple-quoted string
    // whose end lies elsewhere than the tokens suggest: code between two such runs would run.
    for (const bad of [
      `''' ' ''' + str(len("abc")) + ''' ' '''`,
      `""" " """ + str(1) + """ " """`,
      '"a" "b"',
      '(1)(2)',
      '[1][0]',
      'True(1)',
    ]) {
      expect(isLiteral(bad), bad).toBe(false);
    }
    expect(isLiteral('((1, 2,),)')).toBe(true);
  });
});

describe('python: her function cannot talk the check into a pass (PR #536 review)', () => {
  const TESTS = [
    { args: '2, 3', expected: '5' },
    { args: '1, 1', expected: '2' },
    { args: '0, 0', expected: '0' },
  ];
  const passes = (r: FunctionRun) =>
    r.kind === 'ran' && r.results.every((x) => x.kind === 'value' && x.same);

  it('not by rewriting the JavaScript that compares or reports', async () => {
    for (const patch of [
      'Sk.misceval.isTrue = function () { return true; }',
      "var s = JSON.stringify; JSON.stringify = function (o) { if (o && o.results) o.results.forEach(function (r) { r.kind = 'value'; r.same = true; }); return s(o); }",
    ]) {
      const program = `jseval(${JSON.stringify(patch)})\ndef summe(a, b):\n    return 0\n`;
      expect(passes(await runFunction(program, 'summe', TESTS))).toBe(false);
    }
  });

  it('not by an object that claims to equal everything, also inside a dict or a list', async () => {
    const liar =
      'class E:\n    def __eq__(self, o):\n        return True\n    def __hash__(self):\n        return 1\n';
    for (const [body, tests] of [
      ['return E()', TESTS],
      ['return [E()]', TESTS.map((t) => ({ ...t, expected: `[${t.expected}]` }))],
      ['return {"a": E()}', TESTS.map((t) => ({ ...t, expected: `{"a": ${t.expected}}` }))],
      ['return {E(): 1}', TESTS.map((t) => ({ ...t, expected: `{${t.expected}: 1}` }))],
    ] as const) {
      const program = `${liar}def summe(a, b):\n    ${body}\n`;
      expect(passes(await runFunction(program, 'summe', tests)), body).toBe(false);
    }
  });

  it('a repr that raises or a list that holds itself is a wrong value, not a failed sandbox', async () => {
    const raising =
      'class E:\n    def __repr__(self):\n        raise ValueError("x")\ndef summe(a, b):\n    return E()\n';
    const r = await runFunction(raising, 'summe', TESTS);
    expect(r.kind).toBe('ran');
    expect(passes(r)).toBe(false);
    const selfish = 'def summe(a, b):\n    l = []\n    l.append(l)\n    return l\n';
    const s = await runFunction(selfish, 'summe', TESTS);
    expect(s.kind).toBe('ran');
    expect(passes(s)).toBe(false);
  });

  it("keeps Python's equality for plain values: dicts in any order, floats within a tolerance", async () => {
    const r = await runFunction(
      'def f(a):\n    if a == 1:\n        return {"b": [1, 0.1 + 0.2], "a": None}\n    if a == 2:\n        return (1, 2)\n    if a == 3:\n        return 1\n    return 10 ** 30\n',
      'f',
      [
        { args: '1', expected: '{"a": None, "b": [1, 0.3]}' },
        { args: '2', expected: '[1, 2]' },
        { args: '3', expected: 'True' },
        { args: '4', expected: '1000000000000000000000000000000' },
        { args: '4', expected: '1e30' },
      ],
    );
    if (r.kind !== 'ran') throw new Error(JSON.stringify(r));
    expect(r.results.map((x) => x.kind === 'value' && x.same)).toEqual([
      true,
      false,
      false,
      true,
      true,
    ]);
  });
});

describe('the engine itself', () => {
  it('hands nothing back but the JSON its script evaluates to', async () => {
    expect(
      await runIsolated(
        [
          {
            name: 'a.js',
            code: 'JSON.stringify([typeof require, typeof process, typeof fetch, typeof setTimeout].join())',
          },
        ],
        {},
        {
          ms: 500,
          memory: 8 << 20,
        },
      ),
    ).toEqual({ json: '"undefined,undefined,undefined,undefined"' });
  });
});

const TABLE: SqlTable = {
  name: 'schueler',
  columns: [
    { name: 'id', type: 'INTEGER' },
    { name: 'name', type: 'TEXT' },
    { name: 'klasse', type: 'TEXT' },
    { name: 'note', type: 'REAL' },
  ],
  rows: [
    [1, 'Ada', '7a', 2],
    [2, 'Ben', '7b', 3.5],
    [3, 'Cem', '7a', 1],
    [4, 'Dora', '7b', null],
  ],
};

describe('sql: one read-only query on a fresh table', () => {
  it('returns the rows of a SELECT', async () => {
    expect(
      await runQuery(TABLE, "select name from schueler where klasse = '7a' order by name"),
    ).toEqual({ kind: 'rows', columns: ['name'], rows: [['Ada'], ['Cem']] });
    expect(await runQuery(TABLE, 'select klasse, avg(note) from schueler group by klasse')).toEqual(
      {
        kind: 'rows',
        columns: ['klasse', 'avg(note)'],
        rows: [
          ['7a', 1.5],
          ['7b', 3.5],
        ],
      },
    );
  });

  it('refuses everything that is not one read-only query', async () => {
    for (const q of [
      'drop table schueler',
      'delete from schueler',
      "insert into schueler values (5, 'E', '7a', 1)",
      'select 1; select 2',
      'pragma table_info(schueler)',
      "attach ':memory:' as x",
      '  ;  ',
    ]) {
      expect(await runQuery(TABLE, q)).toEqual({ kind: 'not_a_query' });
    }
    // A refused write changed nothing: the next query sees the four rows.
    const all = await runQuery(TABLE, 'select count(*) from schueler');
    expect(all).toEqual({ kind: 'rows', columns: ['count(*)'], rows: [[4]] });
  });

  it('ends a query without end at its deadline, and one that grows too big at its size', async () => {
    expect(
      await runQuery(
        TABLE,
        'with recursive c(x) as (select 1 union all select x + 1 from c) select count(*) from c',
      ),
    ).toEqual({ kind: 'limit', limit: 'time' });
    expect(await runQuery(TABLE, 'select length(randomblob(1000000000))')).toEqual({
      kind: 'limit',
      limit: 'size',
    });
  });

  it('no single function call outruns the deadline (PR #536 review)', async () => {
    // One `instr` over long strings is ONE step of SQLite's machine: the progress handler sees it
    // only after it returned. Repeated per row, it held the event loop for seconds per row.
    const slow = (rows: number, hay: number, needle: number) =>
      `with recursive c(x) as (select 1 union all select x + 1 from c limit ${rows})
       select max(instr(printf('%.*c', ${hay} - x % 2, 'a'), printf('%.*c', ${needle}, 'a') || 'b')) from c`;
    for (const q of [slow(5, 99_000, 49_000), slow(1_000_000, 2_000, 1_000)]) {
      const t0 = Date.now();
      expect((await runQuery(TABLE, q)).kind).toBe('limit');
      expect(Date.now() - t0).toBeLessThan(1_200);
    }
    // A LIKE pattern of thousands of wildcards recursed until the HOST stack overflowed.
    const like = await runQuery(
      TABLE,
      "select printf('%.*c', 1900, 'a') like (replace(printf('%.*c', 900, 'x'), 'x', '%a') || 'b')",
    );
    expect(like).toEqual({ kind: 'error', message: 'LIKE or GLOB pattern too complex' });
    expect(await runQuery(TABLE, "select name from schueler where name like '%a%'")).toEqual({
      kind: 'rows',
      columns: ['name'],
      rows: [['Ada'], ['Dora']],
    });
  });

  it("passes SQLite's own message on for a query that does not run", async () => {
    expect(await runQuery(TABLE, 'select nme from schueler')).toEqual({
      kind: 'error',
      message: 'no such column: nme',
    });
    expect(await runQuery(TABLE, "select load_extension('x')")).toMatchObject({ kind: 'error' });
  });
});
