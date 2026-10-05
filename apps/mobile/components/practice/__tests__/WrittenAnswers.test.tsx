// Fehlerdetektiv und schriftliches Rechnen in der App (issue #260). Was hier festgehalten wird:
//
//   · Fehlerdetektiv: die Aufgabe steht oben, nummeriert, aber kein Knopf; jede weitere Zeile ist
//     eine Kachel zum Auswählen (eine Radiogruppe, nie Häkchen). Ein Tipp übernimmt die Zeile in
//     die eine Eingabeleiste, „Prüfen“ wartet bis dahin und schickt dann Zeile und Verbesserung —
//     geurteilt wird auf dem Server.
//   · Schriftlich: jede Ziffer ein Feld mit Namen („Übertrag, Zehner“), eine Ziffer springt zum
//     nächsten Feld in Schreibreihenfolge, eine neue Ziffer ersetzt die alte, „Prüfen“ wartet auf
//     die erste Ziffer und schickt jedes Feld, leer oder nicht.
//   · Schriftlich teilen (#413): die Treppe zeigt den Schritt, an dem sie ist, und darüber die
//     bearbeiteten, auf halbe Zeilen geschrumpft und nicht mehr beschreibbar; die Ziffer des
//     Ergebnisses öffnet ihren Schritt wieder. Geschickt wird trotzdem jedes Feld.
//
// Ob das Größte samt Buddys Antwort auf 360×740 passt, misst der Walkthrough
// (tests/web/written.spec.ts), nicht diese Schicht.

import type { ColumnCalcTaskView, FindErrorTaskView } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { ColumnAnswer, digitOf } from '../ColumnAnswer.js';
import { FindErrorAnswer } from '../FindErrorAnswer.js';

const PATH: FindErrorTaskView = {
  type: 'find_error',
  lines: [
    { id: 'l1', text: '3(x+2) = 21' },
    { id: 'l2', text: '3x+2 = 21' },
    { id: 'l3', text: '3x = 15' },
    { id: 'l4', text: 'x = 5' },
  ],
};

// 96 : 4: the first row, then two steps of the staircase (as columnCalc.ts lays it out).
const gap = (id: string, part: 'product' | 'difference', place: number, step: number) => ({
  id,
  part,
  place,
  step,
});
/** The empty cells to the right of a step, so every row is as wide as the grid. */
const air = Array.from({ length: 5 }, () => ({ text: '' }));
const DIV: ColumnCalcTaskView = {
  type: 'column_calc',
  op: 'div',
  rows: [
    {
      rule: false,
      cells: [
        { text: '9' },
        { text: '6' },
        { text: ':' },
        { text: '4' },
        { text: '=' },
        { id: 'r0c5', part: 'quotient', place: 1, step: 0 },
        { id: 'r0c6', part: 'quotient', place: 0, step: 0 },
      ],
    },
    { rule: false, cells: [gap('r1c0', 'product', 0, 1), { text: '' }, ...air] },
    {
      rule: true,
      cells: [gap('r2c0', 'difference', 1, 1), gap('r2c1', 'difference', 0, 1), ...air],
    },
    { rule: false, cells: [gap('r3c0', 'product', 1, 2), gap('r3c1', 'product', 0, 2), ...air] },
    { rule: true, cells: [{ text: '' }, gap('r4c1', 'difference', 0, 2), ...air] },
  ],
  order: ['r0c5', 'r1c0', 'r2c0', 'r2c1', 'r0c6', 'r3c0', 'r3c1', 'r4c1'],
};

// 47 + 38: the numbers, the carry row and the sum under the line (as columnCalc.ts lays it out).
const SUM: ColumnCalcTaskView = {
  type: 'column_calc',
  op: 'add',
  rows: [
    { rule: false, cells: [{ text: '' }, { text: '' }, { text: '4' }, { text: '7' }] },
    { rule: false, cells: [{ text: '+' }, { text: '' }, { text: '3' }, { text: '8' }] },
    {
      rule: false,
      cells: [
        { text: '' },
        { text: '' },
        { id: 'r2c2', part: 'carry', place: 1, step: 0 },
        { text: '' },
      ],
    },
    {
      rule: true,
      cells: [
        { text: '' },
        { id: 'r3c1', part: 'result', place: 2, step: 0 },
        { id: 'r3c2', part: 'result', place: 1, step: 0 },
        { id: 'r3c3', part: 'result', place: 0, step: 0 },
      ],
    },
  ],
  order: ['r3c3', 'r2c2', 'r3c2', 'r3c1'],
};

describe('Fehlerdetektiv', () => {
  function show(onSubmit = vi.fn()) {
    renderInApp(
      <FindErrorAnswer
        view={PATH}
        draftKey={`find.${Math.random()}`}
        disabled={false}
        onSubmit={onSubmit}
      />,
    );
    return onSubmit;
  }

  it('shows the task on top, not to pick, and every other line as one of a radio group', () => {
    show();
    expect(screen.getByTestId('choice-lead')).toBeDefined();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    for (const r of radios) expect(r.getAttribute('aria-checked')).toBe('false');
    expect(screen.getAllByTestId('choice-letter').map((m) => m.textContent)).toEqual([
      '①',
      '②',
      '③',
      '④',
    ]);
  });

  it('waits with "Prüfen" until a line is picked, copies it into the bar and sends line and fix', () => {
    const onSubmit = show();
    const check = () => screen.getByRole('button', { name: 'Prüfen' });
    expect(check().getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByPlaceholderText('Tippe erst die falsche Zeile an.')).toBeDefined();
    const line = screen.getByRole('radio', { name: /^Zeile 2:/ });
    fireEvent.click(line);
    expect(line.getAttribute('aria-checked')).toBe('true');
    const field = screen.getByTestId('answer-field') as HTMLInputElement;
    expect(field.value).toBe('3x+2 = 21');
    fireEvent.change(field, { target: { value: '3x + 6 = 21' } });
    expect(check().getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(check());
    expect(onSubmit).toHaveBeenCalledWith(
      { type: 'find_error', line: 'l2', fix: '3x + 6 = 21' },
      '② 3x + 6 = 21',
    );
  });

  it('keeps what she wrote herself when she picks another line', () => {
    show();
    fireEvent.click(screen.getByRole('radio', { name: /^Zeile 3:/ }));
    const field = screen.getByTestId('answer-field') as HTMLInputElement;
    fireEvent.change(field, { target: { value: '3x = 19' } });
    fireEvent.click(screen.getByRole('radio', { name: /^Zeile 2:/ }));
    expect(field.value).toBe('3x = 19');
  });
});

describe('schriftlich rechnen', () => {
  function show(onSubmit = vi.fn(), view = SUM) {
    renderInApp(
      <ColumnAnswer
        view={view}
        draftKey={`col.${Math.random()}`}
        disabled={false}
        onSubmit={onSubmit}
      />,
    );
    return onSubmit;
  }

  it('keeps one digit per cell: the last one typed', () => {
    expect(digitOf('5')).toBe('5');
    expect(digitOf('58')).toBe('8');
    expect(digitOf('a')).toBe('');
    expect(digitOf('')).toBe('');
  });

  it('names every cell by what it is and its place, and reads a printed row as one number', () => {
    show();
    expect(screen.getByLabelText('Übertrag, Zehner')).toBeDefined();
    expect(screen.getByLabelText('Ergebnis, Einer')).toBeDefined();
    expect(screen.getByLabelText('Ergebnis, Hunderter')).toBeDefined();
    expect(screen.getByLabelText('+38')).toBeDefined();
    expect(screen.getAllByTestId('column-rule')).toHaveLength(1);
  });

  it('waits for the first digit, then sends every cell in her order, empty ones too', () => {
    const onSubmit = show();
    const check = () => screen.getByRole('button', { name: 'Prüfen' });
    expect(check().getAttribute('aria-disabled')).toBe('true');
    fireEvent.change(screen.getByLabelText('Ergebnis, Einer'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Übertrag, Zehner'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Ergebnis, Zehner'), { target: { value: '7' } });
    // A digit over a digit replaces it.
    fireEvent.change(screen.getByLabelText('Ergebnis, Zehner'), { target: { value: '78' } });
    fireEvent.click(check());
    expect(onSubmit).toHaveBeenCalledWith(
      {
        type: 'column_calc',
        cells: [
          { id: 'r3c3', digit: '5' },
          { id: 'r2c2', digit: '1' },
          { id: 'r3c2', digit: '8' },
          { id: 'r3c1', digit: '' },
        ],
      },
      '85',
    );
  });

  it('shows a division step by step: the finished steps shrunk, the next ones not yet (#413)', () => {
    const onSubmit = show(vi.fn(), DIV);
    const typeIn = (id: string, digit: string) =>
      fireEvent.change(screen.getByTestId(`column-${id}`), { target: { value: digit } });
    // A cell she can still write in, or (a finished step) only read.
    const writable = (id: string) => screen.getByTestId(`column-${id}`).tagName === 'INPUT';
    // At the start only the first step is there to write in.
    expect(screen.queryByTestId('column-r3c1')).toBeNull();
    typeIn('r0c5', '2');
    typeIn('r1c0', '8');
    typeIn('r2c0', '1');
    typeIn('r2c1', '6');
    // On to the next digit of the quotient: it opens the second step, the first shrinks to what
    // she wrote.
    fireEvent.focus(screen.getByTestId('column-r0c6'));
    expect(writable('r1c0')).toBe(false);
    expect(screen.getAllByTestId('column-done')).toHaveLength(2);
    expect(screen.getByLabelText('16')).toBeDefined();
    typeIn('r0c6', '4');
    typeIn('r3c1', '6');
    // Its quotient digit opens the first step again; the second, worked on, shrinks.
    fireEvent.focus(screen.getByTestId('column-r0c5'));
    expect(writable('r1c0')).toBe(true);
    expect(writable('r3c1')).toBe(false);
    expect(screen.getAllByTestId('column-done')).toHaveLength(2);
    // Every cell goes to the check, shrunk or not.
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    expect(onSubmit).toHaveBeenCalledWith(
      {
        type: 'column_calc',
        cells: [
          { id: 'r0c5', digit: '2' },
          { id: 'r1c0', digit: '8' },
          { id: 'r2c0', digit: '1' },
          { id: 'r2c1', digit: '6' },
          { id: 'r0c6', digit: '4' },
          { id: 'r3c0', digit: '' },
          { id: 'r3c1', digit: '6' },
          { id: 'r4c1', digit: '' },
        ],
      },
      '24',
    );
  });
});
