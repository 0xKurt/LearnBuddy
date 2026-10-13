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

import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { paletteOf } from '../../../lib/theme/palettes.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
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
  it('brings only the minus for a gap whose key is a whole number', () => {
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
    expect(screen.getByRole('toolbar')).toBeDefined();
    expect(screen.getByRole('button', { name: 'minus' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Bruchstrich' })).toBeNull();
  });

  // Owner rule 8 (#599): digits come from the phone's number pad wherever the answer is digits.
  it('opens the number pad for a whole number, and the full keyboard for any other cell', () => {
    const wall = {
      ...VALUES,
      rows: [
        [
          { text: 'f(x)' },
          { id: 'r0c1', input: 'math' as const, whole: true },
          { id: 'r0c2', input: 'math' as const, whole: false },
        ],
      ],
    };
    renderInApp(
      <TableAnswer view={wall} draftKey="tab-pad" disabled={false} onSubmit={() => undefined} />,
    );
    expect(screen.getByLabelText('f(x), 1').getAttribute('inputmode')).toBe('numeric');
    // A decimal, a fraction or a term needs signs and letters no number pad has.
    expect(screen.getByLabelText('f(x), 2').getAttribute('inputmode')).not.toBe('numeric');
    // The pad has no minus: the one key over the table writes it.
    const cell = screen.getByLabelText('f(x), 1');
    fireEvent.focus(cell);
    fireEvent.click(screen.getByRole('button', { name: 'minus' }));
    expect((cell as HTMLInputElement).value).toBe('-');
  });

  it('keeps word cells free of the math keys', () => {
    renderInApp(
      <TableAnswer view={VERBS} draftKey="tab4" disabled={false} onSubmit={() => undefined} />,
    );
    fireEvent.focus(screen.getByLabelText('ich, Präteritum'));
    expect(screen.queryByRole('toolbar')).toBeNull();
  });
});

it('keeps a refocused earlier cell active after Enter submits without blur', () => {
  vi.useFakeTimers();
  const app = renderInApp(
    <TableAnswer
      view={VERBS}
      draftKey="enter-refocus"
      disabled={false}
      onSubmit={() => undefined}
    />,
  );
  try {
    const first = screen.getByLabelText('ich, Präteritum');
    act(() => first.focus());
    fireEvent.keyDown(first, { key: 'Enter', code: 'Enter' });
    expect(document.activeElement).toBe(screen.getByLabelText('du, Präsens'));
    act(() => first.focus());
    expect(document.activeElement).toBe(first);
    act(() => vi.runOnlyPendingTimers());
    expect(document.activeElement).toBe(first);
  } finally {
    app.unmount();
    vi.useRealTimers();
  }
});

it('still checks once and blurs the final blur-and-submit cell', () => {
  vi.useFakeTimers();
  const submit = vi.fn();
  const app = renderInApp(
    <TableAnswer view={VERBS} draftKey="enter-final" disabled={false} onSubmit={submit} />,
  );
  try {
    fireEvent.change(screen.getByLabelText('ich, Präteritum'), { target: { value: 'ging' } });
    fireEvent.change(screen.getByLabelText('du, Präsens'), { target: { value: 'gehst' } });
    const last = screen.getByLabelText('du, Präteritum');
    fireEvent.change(last, { target: { value: 'gingst' } });
    act(() => last.focus());
    fireEvent.keyDown(last, { key: 'Enter', code: 'Enter' });
    expect(submit).toHaveBeenCalledOnce();
    act(() => vi.runOnlyPendingTimers());
    expect(document.activeElement).not.toBe(last);
  } finally {
    app.unmount();
    vi.useRealTimers();
  }
});

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};

describe('the look of a table (design components/practice/Tasks.jsx `FillTable`, #599)', () => {
  const p = paletteOf('pastell');
  const HOW = 'Tippe ein leeres Feld an und schreib hinein, was fehlt.';
  /** The cell a text or a field stands in, and the row that cell stands in. */
  const cellOf = (el: Element) => el.closest('[style*="min-width"]')!;

  it('sets the head on canvas, without a tint of its own and without a line between columns', () => {
    renderInApp(
      <TableAnswer view={VERBS} draftKey="look-t1" disabled={false} onSubmit={() => undefined} />,
    );
    const head = cellOf(screen.getByText('Präsens'));
    expect(styleOf(head.parentElement!).backgroundColor).toBe(rgb(p.canvas));
    expect(styleOf(head).borderRightWidth).toBe('0px');
    expect([styleOf(head).paddingTop, styleOf(head).paddingLeft]).toEqual(['10px', '8px']);
    const text = (screen.getByText('Präsens') as HTMLElement).style;
    expect([text.fontSize, text.fontWeight, text.lineHeight]).toEqual(['14px', '700', '18px']);
  });

  it('parts two rows by a hairline and no two columns by anything', () => {
    renderInApp(
      <TableAnswer view={VERBS} draftKey="look-t2" disabled={false} onSubmit={() => undefined} />,
    );
    const given = cellOf(screen.getByText('gehe'));
    expect(styleOf(given).borderRightWidth).toBe('0px');
    expect(styleOf(given).borderLeftWidth).toBe('0px');
    expect([styleOf(given).minHeight, styleOf(given).paddingTop]).toEqual(['52px', '6px']);
    const row = styleOf(given.parentElement!);
    expect(row.borderTopWidth).toBe('1px');
    expect(row.borderTopColor.replace(/\s/g, '')).toBe(p.hairline.replace(/\s/g, ''));
  });

  it('names a row in its first column a step bolder than the cells it reads', () => {
    renderInApp(
      <TableAnswer view={VERBS} draftKey="look-t3" disabled={false} onSubmit={() => undefined} />,
    );
    const lead = (screen.getByText('ich') as HTMLElement).style;
    expect([lead.fontSize, lead.fontWeight]).toEqual(['15px', '600']);
    const cell = (screen.getByText('gehe') as HTMLElement).style;
    expect([cell.fontSize, cell.fontWeight]).toEqual(['17px', '400']);
  });

  it('says how under the table until she taps or fills a field', () => {
    renderInApp(
      <TableAnswer view={VERBS} draftKey="look-t4" disabled={false} onSubmit={() => undefined} />,
    );
    expect(screen.getByText(HOW)).toBeTruthy();
    const field = screen.getByLabelText('ich, Präteritum');
    expect(
      field.compareDocumentPosition(screen.getByText(HOW)) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.focus(field);
    expect(screen.queryByText(HOW)).toBeNull();
    fireEvent.change(field, { target: { value: 'ging' } });
    fireEvent.blur(field);
    expect(screen.queryByText(HOW)).toBeNull();
  });
});
