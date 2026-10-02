// Der Interpreter der Lehr-Teilmenge (issue #262): rechnet er wie CPython, hält er seine
// Grenzen, und kommt aus ihm nichts heraus?

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { PyError, type PyErrorKind } from '../python/errors.js';
import { parseProgram } from '../python/parse.js';
import { DEFAULT_LIMITS, Machine, runParsed } from '../python/run.js';
import { floatRepr, formatFixed, roundFloat } from '../python/values.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Läuft ein Programm und gibt Ausgabe und Fehler zurück, wie der Vergleich sie braucht. */
function run(source: string): { out: string; err: PyErrorKind | null; line: number | null } {
  try {
    const r = runParsed(parseProgram(source));
    return r.ok
      ? { out: r.output, err: null, line: null }
      : { out: r.output, err: r.error.kind, line: r.error.line };
  } catch (e) {
    if (e instanceof PyError) return { out: '', err: e.kind, line: e.line };
    throw e;
  }
}

type Recorded = {
  recorded_with: string;
  programs: Array<{ src: string; out: string; err: PyErrorKind | null; line: number | null }>;
  unsupported: Array<{ src: string }>;
};

/**
 * Aufgenommen mit echtem CPython 3.11: jedes Programm lief dort (`exec`, stdout umgeleitet, stdin
 * leer), und Ausgabe, Fehlerart und Fehlerzeile stehen in der Datei. Etwa 160 sind geschrieben
 * wie Schulaufgaben (Schleifen, Funktionen, Listen, Dicts, f-Strings, typische Fehler), der Rest
 * sind zufällige Ausdrücke über ganzen Zahlen, Gleitkommazahlen und Wahrheitswerten — genau dort,
 * wo eine selbstgebaute Arithmetik am ehesten in der letzten Stelle abweicht.
 */
const recorded = JSON.parse(
  readFileSync(join(here, 'fixtures', 'cpython.json'), 'utf8'),
) as Recorded;

describe('the teaching subset computes exactly what CPython computes', () => {
  it('has a meaningful corpus', () => {
    expect(recorded.recorded_with).toMatch(/^CPython 3\./);
    expect(recorded.programs.length).toBeGreaterThan(400);
    // Fehler gehören dazu: ein Schlüssel für „In welcher Zeile ist der Fehler?" kommt von hier.
    expect(recorded.programs.filter((p) => p.err !== null).length).toBeGreaterThan(40);
  });

  it.each(recorded.programs.map((p, i) => [i, p] as const))('program %i', (_i, p) => {
    expect(run(p.src)).toEqual({ out: p.out, err: p.err, line: p.line });
  });

  it('refuses what it does not model, instead of approximating it', () => {
    for (const p of recorded.unsupported) expect(run(p.src).err).toBe('unsupported');
  });
});

describe('numbers are printed and rounded like CPython', () => {
  it('switches to exponent notation where Python does', () => {
    expect(floatRepr(1e16)).toBe('1e+16');
    expect(floatRepr(1e15)).toBe('1000000000000000.0');
    expect(floatRepr(0.0001)).toBe('0.0001');
    expect(floatRepr(0.00001)).toBe('1e-05');
    expect(floatRepr(1.5e-7)).toBe('1.5e-07');
    expect(floatRepr(-0)).toBe('-0.0');
    expect(floatRepr(0.1 + 0.2)).toBe('0.30000000000000004');
  });

  it('rounds the exact binary value, half to even', () => {
    // 2.675 liegt binär knapp UNTER 2.675 — CPython rundet deshalb ab.
    expect(roundFloat(2.675, 2)).toBe(2.67);
    expect(formatFixed(2.675, 2)).toBe('2.67');
    expect(formatFixed(0.125, 2)).toBe('0.12');
    expect(formatFixed(0.375, 2)).toBe('0.38');
    expect(formatFixed(2.5, 0)).toBe('2');
    expect(formatFixed(-0.0001, 2)).toBe('-0.00');
  });
});

describe('every run ends after a fixed, small amount of work', () => {
  const cases: Array<[string, string, PyErrorKind]> = [
    ['an endless loop', 'while True:\n    pass', 'steps'],
    ['an endless loop with work', 'x = 0\nwhile True:\n    x = (x * 31 + 7) % 1000003', 'steps'],
    ['a list that grows while it is walked', 'l = [1]\nfor x in l:\n    l.append(x)', 'memory'],
    ['a doubling string', 's = "a"\nwhile True:\n    s = s + s', 'memory'],
    ['a doubling list', 'l = [1]\nwhile True:\n    l = l + l', 'memory'],
    ['a huge repetition', 'print("a" * 10**9)', 'memory'],
    ['a huge list repetition', 'x = [0] * 10**12', 'memory'],
    ['a tower of powers', 'print(9 ** 9 ** 9)', 'number_too_big'],
    ['a growing integer', 'x = 2\nwhile True:\n    x = x * x', 'number_too_big'],
    ['a recursion without end', 'def f(n):\n    return f(n + 1)\nf(0)', 'recursion'],
    ['an endless print', 'while True:\n    print("x" * 100)', 'output'],
    ['a dict that grows', 'd = {}\ni = 0\nwhile True:\n    d[i] = i\n    i += 1', 'steps'],
    ['a huge range in a list', 'l = list(range(10**9))', 'memory'],
    [
      'a sort that never ends',
      'l = list(range(5000))\nwhile True:\n    l = sorted(l, reverse=True)',
      'steps',
    ],
    ['a float that overflows', 'x = 1.5\nwhile True:\n    x = x * x', 'number_too_big'],
  ];
  it.each(cases)('%s', (_name, source, kind) => {
    expect(run(source).err).toBe(kind);
  });

  it('refuses sources that are too long or too deeply nested before running them', () => {
    expect(run('x = 1\n'.repeat(61)).err).toBe('too_long');
    expect(run(`x = ${'1 + '.repeat(800)}1`).err).toBe('too_long');
    expect(run(`x = ${'['.repeat(200)}${']'.repeat(200)}`).err).toBe('too_long');
    expect(run(`x = ${'-'.repeat(100)}1`).err).toBe('too_long');
  });

  it('counts steps per test case, but memory and output across the whole run', () => {
    const m = new Machine({ ...DEFAULT_LIMITS, steps: 1500 }); // one call costs about 900
    m.run(
      parseProgram('def f(n):\n    s = 0\n    for i in range(n):\n        s += i\n    return s'),
    );
    m.resetSteps();
    expect(m.call('f', [300n])).toBe(44850n);
    m.resetSteps();
    expect(m.call('f', [300n])).toBe(44850n);
    expect(() => m.call('f', [300n])).toThrow(PyError);
  });
});

describe('nothing leads out of the interpreter', () => {
  const escapes = [
    "__import__('os').system('ls')",
    "open('/etc/passwd').read()",
    "eval('1 + 1')",
    "exec('x = 1')",
    'globals()',
    'locals()',
    "getattr(print, '__self__')",
    'print.__self__',
    '().__class__.__bases__[0].__subclasses__()',
    '[].__class__',
    "''.__class__.__mro__",
    'x = 1\nx.constructor',
    'x = []\nx.__proto__',
    'compile("1", "", "eval")',
    'import os',
    'from os import system',
    'input()',
    'breakpoint()',
    'help()',
    'type(1)',
    'vars()',
    'dir()',
    '(lambda: 1)()',
  ];
  it.each(escapes)('%s', (source) => {
    const r = run(`${source}\n`);
    expect(r.out).toBe('');
    expect(['unsupported', 'attribute', 'name']).toContain(r.err);
  });

  it('keeps an object key an ordinary key', () => {
    const r = run(
      "d = {}\nd['__proto__'] = 1\nd['constructor'] = 2\nd['toString'] = 3\nprint(d, len(d), d['__proto__'])",
    );
    expect(r).toEqual({
      out: "{'__proto__': 1, 'constructor': 2, 'toString': 3} 3 1\n",
      err: null,
      line: null,
    });
  });

  it('has no door out in its own source: no eval, no Function, no import(), no require, no process', () => {
    const dir = join(here, '..', 'python');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const code = readFileSync(join(dir, file), 'utf8')
        .split('\n')
        .map((l) => l.replace(/\/\/.*$/, ''))
        .join('\n');
      expect(code, file).not.toMatch(/\beval\s*\(/);
      expect(code, file).not.toMatch(/\bFunction\s*\(/);
      expect(code, file).not.toMatch(/\bimport\s*\(/);
      expect(code, file).not.toMatch(/\brequire\s*\(/);
      expect(code, file).not.toMatch(/\bprocess\b|\bglobalThis\b|node:/);
      // Ein Attribut wird nie per Namen auf einem JS-Objekt gelesen: kein `obj[name]`.
      expect(code, file).not.toMatch(/\[\s*(name|x\.name|attr)\s*\]/);
    }
  });

  it('never throws anything but its own error, whatever it is given', () => {
    const atoms = [
      'x',
      '1',
      '2.5',
      "'s'",
      '[',
      ']',
      '(',
      ')',
      '{',
      '}',
      ':',
      ',',
      '.',
      '+',
      '-',
      '*',
      '/',
      '//',
      '%',
      '**',
      '=',
      '==',
      '<',
      'if',
      'else',
      'elif',
      'for',
      'in',
      'while',
      'def',
      'return',
      'print',
      'range',
      'len',
      'and',
      'not',
      'None',
      'True',
      '\n',
      '\n    ',
      'f"{x}"',
      'append',
      'break',
      'lambda',
      '#',
      '\\',
      '"',
      '__class__',
      'sorted',
      'pass',
    ];
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...atoms), { maxLength: 40 }), (parts) => {
        const source = parts.join(' ');
        try {
          runParsed(parseProgram(source), { ...DEFAULT_LIMITS, steps: 20_000 });
        } catch (e) {
          if (!(e instanceof PyError)) throw e;
        }
      }),
      { numRuns: 3000 },
    );
  });
});

describe('the error is in the line where Python would report it', () => {
  it('names the line inside a function, not the call', () => {
    expect(run('def f(l):\n    return l[5]\n\nprint(f([1]))').line).toBe(2);
  });
  it('reports an unclosed bracket at its own line', () => {
    expect(run('x = (1,\n2\ny = 3')).toMatchObject({ err: 'syntax', line: 1 });
  });
  it('tells an unknown name from a name Python has and this subset does not', () => {
    expect(run('print(laenge)').err).toBe('name');
    expect(run('print(input)').err).toBe('unsupported');
  });
});
