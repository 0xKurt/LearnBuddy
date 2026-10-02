// Informatikfragen (issue #262): der Schlüssel kommt aus der Ausführung, ein falscher
// Modellschlüssel kostet die Frage, und ihre Antwort wird durch Ausführen geprüft.

import type { CodeTask } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import {
  buildCodeItem,
  checkCode,
  codeItem,
  codeReply,
  codeSurfaceOf,
  outputLines,
  parseArgs,
  sameResult,
} from '../code.js';

const predict = (program: string, output: string): CodeTask => ({
  task: 'predict_output',
  language: 'python',
  program,
  output,
});

const SUMME: CodeTask = {
  task: 'write_function',
  language: 'python',
  name: 'summe',
  params: ['liste'],
  statement: 'Sie gibt die Summe aller Zahlen der Liste zurück.',
  tests: [
    { args: '[1, 2, 3]', expected: '6' },
    { args: '[]', expected: '0' },
    { args: '[5]', expected: '5' },
    { args: '[-1, 1, 10]', expected: '10' },
  ],
  solution: 'def summe(liste):\n    s = 0\n    for x in liste:\n        s += x\n    return s',
};

describe('what does this program print?', () => {
  const program = 'x = 3\nfor i in range(x):\n    print(i * 2)\nprint("fertig")';

  it('takes the key from running the program', () => {
    const item = codeItem(predict(program, '0\n2\n4\nfertig'), 'de');
    expect(item?.answer).toBe('0\n2\n4\nfertig');
    expect(item?.figure).toMatchObject({ type: 'code', language: 'python' });
    expect(item?.prompt).toBe('Was gibt dieses Programm aus?');
  });

  it('writes no question when the model read its own program wrong', () => {
    expect(buildCodeItem(predict(program, '0\n2\n4\n6\nfertig'), 'de')).toEqual({
      reject: 'output_disagrees',
    });
    // Die klassische Falle: 0.1 + 0.2 ist nicht 0.3.
    expect(buildCodeItem(predict('print(0.1 + 0.2)', '0.3'), 'de')).toEqual({
      reject: 'output_disagrees',
    });
    expect(codeItem(predict('print(0.1 + 0.2)', '0.30000000000000004'), 'de')?.answer).toBe(
      '0.30000000000000004',
    );
  });

  it('writes no question from a program that does not run, runs too long or is not in the subset', () => {
    expect(buildCodeItem(predict('print(x)', 'x'), 'de')).toEqual({ reject: 'did_not_run' });
    expect(buildCodeItem(predict('while True:\n    pass', ''), 'de')).toEqual({
      reject: 'ran_too_long',
    });
    expect(buildCodeItem(predict('import math\nprint(1)', '1'), 'de')).toEqual({
      reject: 'unsupported',
    });
    expect(buildCodeItem(predict('print(1', '1'), 'de')).toEqual({ reject: 'not_python' });
  });

  it('writes no question whose output cannot be typed and compared honestly', () => {
    // Rand-Leerzeichen: weil der Vergleich sie verzeiht, darf es keinen Schlüssel geben, der sie hat.
    expect(buildCodeItem(predict('print("  x")', '  x'), 'de')).toEqual({
      reject: 'output_unusable',
    });
    expect(buildCodeItem(predict('for i in range(9):\n    print(i)', ''), 'de')).toEqual({
      reject: 'output_unusable',
    });
    // `$` öffnet in der App eine Formel; im Programm selbst lehnt schon die Anzeige ab.
    expect(buildCodeItem(predict('print(chr(36))', '$'), 'de')).toEqual({
      reject: 'output_unusable',
    });
    expect(buildCodeItem(predict('print("5 $")', '5 $'), 'de')).toEqual({ reject: 'display' });
  });

  it('refuses a program too wide or too long for the phone', () => {
    const wide = `print("${'x'.repeat(60)}")`;
    expect(buildCodeItem(predict(wide, 'x'.repeat(60)), 'de')).toEqual({ reject: 'display' });
    const long = Array.from({ length: 13 }, (_, i) => `x${i} = ${i}`).join('\n');
    expect(buildCodeItem(predict(`${long}\nprint(x1)`, '1'), 'de')).toEqual({ reject: 'display' });
  });

  it('compares her output line by line and names one place', () => {
    const task = predict(program, '0\n2\n4\nfertig');
    expect(checkCode(task, '0\n2\n4\nfertig')?.verdict).toBe('correct');
    expect(checkCode(task, ' 0 \r\n2\n4\nfertig\n\n')?.verdict).toBe('correct');
    const partly = checkCode(task, '0\n2\n6\nfertig');
    expect(partly).toMatchObject({ verdict: 'partly', held: 2, total: 4 });
    expect(partly?.fault).toEqual({ at: 'output_line', line: 3, hint: null });
    expect(checkCode(task, '1\n2\n4\nfertig')?.verdict).toBe('wrong');
    expect(checkCode(task, '0\n2\n4')?.fault).toEqual({ at: 'output_count', more: true });
    expect(checkCode(task, '0\n2\n4\nFertig')?.fault).toEqual({
      at: 'output_line',
      line: 4,
      hint: 'case',
    });
    expect(checkCode(task, '0\n2\n4\n"fertig"')?.fault).toEqual({
      at: 'output_line',
      line: 4,
      hint: 'quotes',
    });
  });

  it('gives the place only from the second try, the held lines always', () => {
    const check = checkCode(predict(program, '0\n2\n4\nfertig'), '0\n2\n6\nfertig');
    if (check === null) throw new Error('no check');
    expect(codeReply('de', check, 0)).toBe('Die ersten 2 von 4 Zeilen stimmen.');
    expect(codeReply('de', check, 1)).toBe(
      'Die ersten 2 von 4 Zeilen stimmen. Schau dir Zeile 3 der Ausgabe noch einmal an.',
    );
  });

  it('normalises only what does not matter', () => {
    expect(outputLines('a\r\nb  \n\n')).toEqual(['a', 'b']);
    expect(outputLines('a\n\nb')).toEqual(['a', '', 'b']);
  });
});

describe('in which line does it break?', () => {
  const find = (program: string, line: number): CodeTask => ({
    task: 'find_error',
    language: 'python',
    program,
    line,
  });
  const program = 'namen = ["Ada", "Bo"]\nfor i in range(3):\n    print(namen[i])';

  it('takes the key from the line where the run stops', () => {
    const item = codeItem(find(program, 3), 'de');
    expect(item?.answer).toBe('Zeile 3');
    expect(item?.worked_solution).toContain('IndexError');
    expect(codeSurfaceOf(find(program, 3))).toEqual({ mode: 'code_line', lines: 3 });
  });

  it('writes no question when the model names another line, or nothing breaks', () => {
    expect(buildCodeItem(find(program, 2), 'de')).toEqual({ reject: 'line_disagrees' });
    expect(buildCodeItem(find('x = 1\nprint(x)', 2), 'de')).toEqual({ reject: 'no_error' });
  });

  it('takes only an error Python itself reports in one line', () => {
    // Ein Syntaxfehler hat keine eindeutige Zeile; eine Endlosschleife ist keine Fehlerzeile.
    expect(buildCodeItem(find('x = (1,\ny = 2', 1), 'de')).toEqual({
      reject: 'not_a_runtime_error',
    });
    expect(buildCodeItem(find('while True:\n    pass', 1), 'de')).toEqual({
      reject: 'not_a_runtime_error',
    });
  });

  it('accepts exactly the line, and nothing that is not a line of this program', () => {
    const task = find(program, 3);
    expect(checkCode(task, '3')?.verdict).toBe('correct');
    expect(checkCode(task, '2')?.verdict).toBe('wrong');
    expect(checkCode(task, '9')).toBeNull();
    expect(checkCode(task, 'drei')).toBeNull();
  });
});

describe('write a function', () => {
  it('takes the expected values from running the solution', () => {
    const item = codeItem(SUMME, 'de');
    expect(item?.prompt).toBe(
      'Schreibe die Funktion summe(liste). Sie gibt die Summe aller Zahlen der Liste zurück.',
    );
    // Die Beispiele stehen als Code darunter, mit dem, was die MUSTERLÖSUNG ergab.
    const shown =
      item?.figure?.type === 'code'
        ? item.figure.lines.map((l) => l.map((x) => x.text).join(''))
        : [];
    expect(shown).toEqual(['summe([1, 2, 3])  # → 6', 'summe([])         # → 0']);
    expect(item?.answer).toBe(SUMME.task === 'write_function' ? SUMME.solution : '');
    expect(codeSurfaceOf(SUMME)).toEqual({
      mode: 'code_type',
      purpose: 'program',
      starter: 'def summe(liste):\n    ',
    });
  });

  it('writes no question when an expected value disagrees with the solution', () => {
    if (SUMME.task !== 'write_function') throw new Error('shape');
    const wrong = {
      ...SUMME,
      tests: [...SUMME.tests.slice(0, 3), { args: '[2, 2]', expected: '5' }],
    };
    expect(buildCodeItem(wrong, 'de')).toEqual({ reject: 'expected_disagrees' });
    // `2` ist nicht `2.0`: die Probe ist streng, der Test später nicht.
    const float = {
      ...SUMME,
      tests: [...SUMME.tests.slice(0, 3), { args: '[1, 1]', expected: '2.0' }],
    };
    expect(buildCodeItem(float, 'de')).toEqual({ reject: 'expected_disagrees' });
  });

  it('writes no question from a broken solution, a bad signature or bad tests', () => {
    if (SUMME.task !== 'write_function') throw new Error('shape');
    expect(
      buildCodeItem({ ...SUMME, solution: 'def summe(liste):\n    return liste[10]' }, 'de'),
    ).toEqual({
      reject: 'did_not_run',
    });
    expect(buildCodeItem({ ...SUMME, params: ['a', 'b'] }, 'de')).toEqual({
      reject: 'bad_signature',
    });
    expect(
      buildCodeItem(
        { ...SUMME, name: 'sum', solution: SUMME.solution.replace('summe', 'sum') },
        'de',
      ),
    ).toEqual({
      reject: 'bad_signature',
    });
    const call = {
      ...SUMME,
      tests: [{ args: 'len([1])', expected: '1' }, ...SUMME.tests.slice(1)],
    };
    expect(buildCodeItem(call, 'de')).toEqual({ reject: 'bad_test' });
    const same = { ...SUMME, tests: [SUMME.tests[0]!, SUMME.tests[0]!, SUMME.tests[1]!] };
    expect(buildCodeItem(same, 'de')).toEqual({ reject: 'tests_not_distinct' });
    const printer = { ...SUMME, solution: 'def summe(liste):\n    print(sum(liste))' };
    expect(buildCodeItem(printer, 'de')).toEqual({ reject: 'did_not_run' });
  });

  it('runs her function against every test: x of y, no model', () => {
    expect(checkCode(SUMME, 'def summe(liste):\n    return sum(liste)')).toMatchObject({
      verdict: 'correct',
      held: 4,
      total: 4,
    });
    const offByOne = checkCode(
      SUMME,
      'def summe(liste):\n    s = 0\n    for i in range(1, len(liste)):\n        s += liste[i]\n    return s',
    );
    expect(offByOne).toMatchObject({ verdict: 'partly', held: 1, total: 4 });
    if (offByOne === null) throw new Error('no check');
    expect(codeReply('de', offByOne, 0)).toBe(
      '1 von 4 Tests bestanden. summe([1, 2, 3]) soll 6 ergeben, deine Funktion gibt 5 zurück.',
    );
  });

  it('tells print from return, and a missing function from a broken one', () => {
    const printed = checkCode(SUMME, 'def summe(liste):\n    print(sum(liste))');
    expect(printed?.verdict).toBe('wrong');
    expect(codeReply('de', printed!, 0)).toContain('print');
    expect(checkCode(SUMME, 'def total(liste):\n    return 0')?.fault).toEqual({
      at: 'missing',
      name: 'summe',
    });
    const broken = checkCode(SUMME, 'def summe(liste)\n    return 0');
    expect(broken?.fault).toMatchObject({ at: 'program' });
    expect(codeReply('de', broken!, 0)).toMatch(/^Dein Programm bricht in Zeile 1 ab: Python kann/);
  });

  it('stops her endless loop at the step limit and says so', () => {
    const check = checkCode(SUMME, 'def summe(liste):\n    while True:\n        pass');
    expect(check?.verdict).toBe('wrong');
    expect(codeReply('de', check!, 0)).toContain('Endlosschleife');
  });

  it('runs every test on a fresh machine, so one test cannot prepare the next', () => {
    const sneaky =
      'gesehen = []\ndef summe(liste):\n    gesehen.append(1)\n    return sum(liste) + len(gesehen) - 1';
    expect(checkCode(SUMME, sneaky)?.verdict).toBe('correct');
  });

  it('accepts the quotation marks a phone keyboard types', () => {
    const task: CodeTask = {
      task: 'write_function',
      language: 'python',
      name: 'gruss',
      params: ['name'],
      statement: 'Sie gibt Hallo und den Namen zurück.',
      tests: [
        { args: '"Ada"', expected: '"Hallo Ada"' },
        { args: '"Bo"', expected: '"Hallo Bo"' },
        { args: '""', expected: '"Hallo "' },
      ],
      solution: 'def gruss(name):\n    return "Hallo " + name',
    };
    expect(codeItem(task, 'de')).not.toBeNull();
    expect(checkCode(task, 'def gruss(name):\n    return „Hallo “ + name')?.verdict).toBe(
      'correct',
    );
  });

  it('compares results like a test would: 2 == 2.0, floats close enough', () => {
    expect(sameResult(2n, 2)).toBe(true);
    expect(sameResult(0.3, 0.1 + 0.2)).toBe(true);
    expect(sameResult(0.3, 0.31)).toBe(false);
    expect(parseArgs('[1, 2], 3')).toHaveLength(2);
    expect(parseArgs('[1, 2]')).toHaveLength(1);
    expect(parseArgs('x')).toBeNull();
  });
});

describe('the texts exist in every language', () => {
  it.each(['de', 'en', 'fr', 'es', 'it'])('%s', (locale) => {
    const item = codeItem(SUMME, locale);
    expect(item?.prompt).not.toContain('practice.code');
    expect(item?.hints.join(' ')).not.toContain('practice.code');
    const check = checkCode(SUMME, 'def summe(liste):\n    return 0');
    expect(codeReply(locale, check!, 1)).not.toContain('practice.code');
  });
});
