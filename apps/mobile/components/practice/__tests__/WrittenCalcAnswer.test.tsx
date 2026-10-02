// Schriftlich rechnen (issue #260): Kästchen antippen, Ziffer auf dem Ziffernblock, weiter nach
// links. Was hier festgehalten wird:
//
//   · jedes Kästchen ist ein Button, der Zeile, Stelle und Inhalt in Worten sagt
//     („Ergebnis, Zehner, leer") — die Farbe ist nie das einzige Signal;
//   · eine Ziffer füllt das gewählte Kästchen und wählt das nächste: in der Zeile eins nach
//     links, nach einem Übertrag das Ergebnis derselben Spalte, am Zeilenende die Einer der
//     nächsten Zeile;
//   · ein zweiter Tipp auf das gewählte Kästchen leert es (keine Löschtaste: der Platz gehört
//     „Prüfen", das im Ziffernblock steht);
//   · „Prüfen" wartet auf die erste Ziffer im Ergebnis und schickt nur die gefüllten Kästchen.
//
// Ob das Raster auf 360×740 passt, misst der Walkthrough (tests/web/fit.ts).

import type { WrittenCalcTaskView } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import {
  digitsFrom,
  firstBox,
  nextBox,
  openBox,
  termOf,
  WrittenCalcAnswer,
} from '../WrittenCalcAnswer.js';

const box = (id: string, place: number) => ({ id, place });
const tx = (text: string) => ({ text });

/** 476 + 358, as the server lays it out (apps/api/src/modules/practice/written.ts). */
const ADD: WrittenCalcTaskView = {
  type: 'written_calc',
  op: 'add',
  cols: 4,
  rows: [
    { role: 'given', cells: [null, tx('4'), tx('7'), tx('6')], rule_above: false },
    { role: 'given', cells: [tx('+'), tx('3'), tx('5'), tx('8')], rule_above: false },
    { role: 'carry', cells: [null, box('c2', 2), box('c1', 1), null], rule_above: false },
    {
      role: 'result',
      cells: [null, box('r2', 2), box('r1', 1), box('r0', 0)],
      rule_above: true,
    },
  ],
};

/** 35 · 24: two partial products, then the sum. */
const MUL: WrittenCalcTaskView = {
  type: 'written_calc',
  op: 'mul',
  cols: 5,
  rows: [
    { role: 'given', cells: [tx('3'), tx('5'), tx('·'), tx('2'), tx('4')], rule_above: false },
    {
      role: 'partial',
      cells: [null, box('p1_3', 3), box('p1_2', 2), box('p1_1', 1), null],
      rule_above: true,
    },
    {
      role: 'partial',
      cells: [null, null, box('p2_2', 2), box('p2_1', 1), box('p2_0', 0)],
      rule_above: false,
    },
    {
      role: 'carry',
      cells: [null, box('c3', 3), box('c2', 2), box('c1', 1), null],
      rule_above: false,
    },
    {
      role: 'result',
      cells: [null, box('r3', 3), box('r2', 2), box('r1', 1), box('r0', 0)],
      rule_above: true,
    },
  ],
};

describe('moving through the grid', () => {
  it('starts in the Einer of the first row to fill', () => {
    expect(firstBox(ADD)).toBe('r0');
    expect(firstBox(MUL)).toBe('p1_1');
  });

  it('after a remount goes on at the first empty box, never back to the start', () => {
    expect(openBox(ADD, {})).toBe('r0');
    expect(openBox(ADD, { r0: '4', c1: '1' })).toBe('r1');
    expect(openBox(MUL, { p1_1: '0', p1_2: '4', p1_3: '7' })).toBe('p2_0');
    expect(openBox(ADD, { r0: '4', r1: '3', r2: '8' })).toBe('r0');
  });

  it('goes left in a row, from a carry to the result of its column, and on to the next row', () => {
    expect(nextBox(ADD, 'r0')).toBe('r1');
    expect(nextBox(ADD, 'r1')).toBe('r2');
    expect(nextBox(ADD, 'r2')).toBeNull();
    expect(nextBox(ADD, 'c1')).toBe('r1');
    expect(nextBox(MUL, 'p1_3')).toBe('p2_0');
    expect(nextBox(MUL, 'p2_2')).toBe('r0');
    expect(nextBox(MUL, 'c2')).toBe('r2');
  });

  it('reads kept digits back, and nothing that is not one', () => {
    const ids = new Set(['r0', 'r1']);
    expect(digitsFrom('{"r0":"4","r1":"3"}', ids)).toEqual({ r0: '4', r1: '3' });
    expect(digitsFrom('{"r0":"44","r7":"1","r1":3}', ids)).toEqual({});
    expect(digitsFrom('kaputt', ids)).toEqual({});
  });

  it('writes the calculation in one line', () => {
    expect(termOf(ADD)).toBe('476 + 358');
    expect(termOf(MUL)).toBe('35 · 24');
  });
});

describe('a written addition she fills', () => {
  it('names every box in words and every number of the task', () => {
    renderInApp(
      <WrittenCalcAnswer view={ADD} draftKey="w1" disabled={false} onSubmit={() => undefined} />,
    );
    expect(screen.getByRole('button', { name: 'Ergebnis, Zehner, leer' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Übertrag, Hunderter, leer' })).toBeDefined();
    expect(screen.getByLabelText('plus 358')).toBeDefined();
  });

  it('a digit fills the chosen box and moves left; a second tap empties; "Prüfen" sends what is filled', () => {
    const onSubmit = vi.fn();
    renderInApp(
      <WrittenCalcAnswer view={ADD} draftKey="w2" disabled={false} onSubmit={onSubmit} />,
    );
    const check = () => screen.getByRole('button', { name: 'Prüfen' });
    expect(check().getAttribute('aria-disabled')).toBe('true');
    const key = (d: string) => fireEvent.click(screen.getByRole('button', { name: d }));
    key('4');
    expect(screen.getByRole('button', { name: 'Ergebnis, Einer, 4' })).toBeDefined();
    key('9');
    // Wrong: a tap chooses the box, a second tap empties it, a digit then fills it again.
    fireEvent.click(screen.getByRole('button', { name: 'Ergebnis, Zehner, 9' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ergebnis, Zehner, 9' }));
    expect(screen.getByRole('button', { name: 'Ergebnis, Zehner, leer' })).toBeDefined();
    key('3');
    key('8');
    // The carry, written by tapping its box: then the result of its column is chosen.
    fireEvent.click(screen.getByRole('button', { name: 'Übertrag, Zehner, leer' }));
    key('1');
    expect(screen.getByRole('button', { name: 'Übertrag, Zehner, 1' })).toBeDefined();
    fireEvent.click(check());
    expect(onSubmit).toHaveBeenCalledWith(
      {
        type: 'written_calc',
        boxes: [
          { id: 'c1', digit: '1' },
          { id: 'r2', digit: '8' },
          { id: 'r1', digit: '3' },
          { id: 'r0', digit: '4' },
        ],
      },
      '476 + 358 = 834',
    );
  });
});

/** 846 : 3, short form: the quotient under the dividend, the remainders above it. */
const DIV: WrittenCalcTaskView = {
  type: 'written_calc',
  op: 'div',
  cols: 6,
  rows: [
    {
      role: 'given',
      cells: [null, tx('8'), tx('4'), tx('6'), tx(':'), tx('3')],
      rule_above: false,
    },
    {
      role: 'carry',
      cells: [null, null, box('c1', 1), box('c0', 0), null, null],
      rule_above: false,
    },
    {
      role: 'result',
      cells: [tx('='), box('r2', 2), box('r1', 1), box('r0', 0), null, null],
      rule_above: false,
    },
  ],
};

describe('a written division she fills: from the highest place down', () => {
  it('starts at the highest place of the quotient and goes right', () => {
    expect(firstBox(DIV)).toBe('r2');
    expect(nextBox(DIV, 'r2')).toBe('r1');
    expect(nextBox(DIV, 'r0')).toBeNull();
    expect(nextBox(DIV, 'c1')).toBe('r1');
    expect(openBox(DIV, { r2: '2' })).toBe('r1');
    expect(termOf(DIV)).toBe('846 : 3');
  });

  it('names the remainder row and reads the task as a division', () => {
    const onSubmit = vi.fn();
    renderInApp(
      <WrittenCalcAnswer view={DIV} draftKey="w3" disabled={false} onSubmit={onSubmit} />,
    );
    expect(screen.getByRole('button', { name: 'Rest, Zehner, leer' })).toBeDefined();
    expect(screen.getByLabelText('846 geteilt durch 3')).toBeDefined();
    const key = (d: string) => fireEvent.click(screen.getByRole('button', { name: d }));
    key('2');
    key('8');
    key('2');
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    expect(onSubmit).toHaveBeenCalledWith(
      {
        type: 'written_calc',
        boxes: [
          { id: 'r2', digit: '2' },
          { id: 'r1', digit: '8' },
          { id: 'r0', digit: '2' },
        ],
      },
      '846 : 3 = 282',
    );
  });
});
