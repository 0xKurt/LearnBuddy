// Tabelle ausfüllen (issue #230): die leeren Felder einer Tabelle, sonst nichts. Was hier
// festgehalten wird:
//
//   · jedes leere Feld ist ein echtes Eingabefeld mit Namen aus Zeile und Spalte;
//   · Enter springt ins nächste leere Feld, im letzten prüft es;
//   · „Prüfen" wartet, bis jedes Feld etwas enthält, und schickt dann `parts` — Ids und
//     Text, geprüft wird auf dem Server;
//   · ein Feld für eine Zahl bringt die Mathe-Tasten mit, ein Wortfeld nicht.
//
// Was diese Schicht nicht sehen kann: ob die Tabelle auf 360×740 passt. Das misst der
// Walkthrough (tests/web/fit.ts).

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { cellsFrom, gapsIn, TableAnswer } from '../TableAnswer.js';

const VERBS = {
  type: 'table_fill' as const,
  header: ['Person', 'Präsens', 'Präteritum'],
  rows: [
    [{ text: 'ich' }, { text: 'gehe' }, { id: 'r0c2', input: 'text' as const, whole: false }],
    [
      { text: 'du' },
      { id: 'r1c1', input: 'text' as const, whole: false },
      { id: 'r1c2', input: 'text' as const, whole: false },
    ],
  ],
  layout: 'grid' as const,
};

const VALUES = {
  type: 'table_fill' as const,
  header: ['x', '1', '2'],
  rows: [[{ text: 'f(x)' }, { id: 'r0c1', input: 'math' as const, whole: false }, { text: '5' }]],
  layout: 'grid' as const,
};

describe('her cells', () => {
  it('walks the gaps row by row', () => {
    expect(gapsIn(VERBS).map((g) => g.id)).toEqual(['r0c2', 'r1c1', 'r1c2']);
  });

  it('reads kept cells back, and nothing that is not one', () => {
    const ids = new Set(['r0c2', 'r1c1']);
    expect(cellsFrom('{"r0c2":"ging","r1c1":"gehst"}', ids)).toEqual({
      r0c2: 'ging',
      r1c1: 'gehst',
    });
    expect(cellsFrom('', ids)).toEqual({});
    expect(cellsFrom('kaputt', ids)).toEqual({});
    expect(cellsFrom('["ging"]', ids)).toEqual({});
    expect(cellsFrom('{"r9c9":"x","r0c2":3}', ids)).toEqual({});
  });
});

describe('a table she fills in', () => {
  it('names every gap by its row and column, and shows what she reads', () => {
    renderInApp(
      <TableAnswer view={VERBS} draftKey="tab1" disabled={false} onSubmit={() => undefined} />,
    );
    expect(screen.getByLabelText('ich, Präteritum')).toBeDefined();
    expect(screen.getByLabelText('du, Präsens')).toBeDefined();
    expect(screen.getByText('gehe')).toBeDefined();
    expect(screen.getByText('Präteritum')).toBeDefined();
  });

  it('waits with "Prüfen" until every gap is filled, Enter walks on, then sends the cells', () => {
    const onSubmit = vi.fn();
    renderInApp(<TableAnswer view={VERBS} draftKey="tab2" disabled={false} onSubmit={onSubmit} />);
    const check = () => screen.getByRole('button', { name: 'Prüfen' });
    expect(check().getAttribute('aria-disabled')).toBe('true');
    const first = screen.getByLabelText('ich, Präteritum');
    fireEvent.change(first, { target: { value: 'ging' } });
    fireEvent.change(screen.getByLabelText('du, Präsens'), { target: { value: 'gehst' } });
    expect(check().getAttribute('aria-disabled')).toBe('true');
    // Enter in a gap moves on to the next one.
    first.focus();
    fireEvent.keyDown(first, { key: 'Enter', code: 'Enter' });
    expect(document.activeElement).toBe(screen.getByLabelText('du, Präsens'));
    fireEvent.change(screen.getByLabelText('du, Präteritum'), { target: { value: ' gingst ' } });
    expect(check().getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(check());
    expect(onSubmit).toHaveBeenCalledWith(
      {
        type: 'table_fill',
        cells: [
          { id: 'r0c2', text: 'ging' },
          { id: 'r1c1', text: 'gehst' },
          { id: 'r1c2', text: 'gingst' },
        ],
      },
      'ging · gehst · gingst',
    );
  });

  it('brings the math keys for a number cell, and they type into it', () => {
    renderInApp(
      <TableAnswer view={VALUES} draftKey="tab3" disabled={false} onSubmit={() => undefined} />,
    );
    expect(screen.queryByRole('toolbar')).toBeNull();
    const cell = screen.getByLabelText('f(x), 1');
    fireEvent.focus(cell);
    expect(screen.getByRole('toolbar')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'minus' }));
    expect((cell as HTMLInputElement).value).toBe('-');
  });

  // A whole number is written with the phone's digits: no row over the table (#286 Befund 5, #239).
  it('brings no math keys for a gap whose key is a whole number', () => {
    const wall = {
      ...VALUES,
      rows: [
        [{ text: 'f(x)' }, { id: 'r0c1', input: 'math' as const, whole: true }, { text: '5' }],
      ],
    };
    renderInApp(
      <TableAnswer view={wall} draftKey="tab-whole" disabled={false} onSubmit={() => undefined} />,
    );
    fireEvent.focus(screen.getByLabelText('f(x), 1'));
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('keeps word cells free of the math keys', () => {
    renderInApp(
      <TableAnswer view={VERBS} draftKey="tab4" disabled={false} onSubmit={() => undefined} />,
    );
    fireEvent.focus(screen.getByLabelText('ich, Präteritum'));
    expect(screen.queryByRole('toolbar')).toBeNull();
  });
});
