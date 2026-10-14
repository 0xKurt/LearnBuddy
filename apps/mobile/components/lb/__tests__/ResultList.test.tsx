import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { paletteOf } from '../../../lib/theme/palettes.js';
import { UI } from '../../../lib/theme/components.js';
import { ResultList, type ResultRow } from '../ResultList.js';

function rowBox(prompt: string): HTMLElement {
  let node = screen.getByText(prompt).parentElement;
  while (node && !node.querySelector('svg')) node = node.parentElement;
  if (!node) throw new Error(`missing result row: ${prompt}`);
  return node;
}
function rgb(hex: string): string {
  return `rgb(${[1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(', ')})`;
}

describe('factual grouped result rows', () => {
  it('uses actual status for its glyph and colour, irrespective of a translated label or legacy right flag', () => {
    const p = paletteOf('pastell');
    const states: NonNullable<ResultRow['status']>[] = [
      'correct',
      'missed',
      'skipped',
      'open',
      'revealed',
    ];
    renderInApp(
      <ResultList
        variant="rows"
        title="Rückblick"
        rows={states.map((status) => ({
          key: status,
          status,
          right: status !== 'correct',
          label: 'Geschafft',
          text: status,
          detail: null,
        }))}
      />,
    );
    const expected = [
      ['M5 12l5 5 9-10', p.mint, p.successText],
      ['M6 6l12 12M18 6L6 18', p.blush, p.danger],
      ['M5 12h14M13 6l6 6-6 6', p.canvas, p.ink2],
      ['M12 7v5l3 2', p.canvas, p.ink2],
      ['M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z', p.canvas, p.ink2],
    ];
    states.forEach((status, index) => {
      const row = rowBox(status);
      const badge = row.firstElementChild!;
      const path = badge.querySelector('path')!;
      expect(path.getAttribute('d')).toBe(expected[index]![0]);
      expect(styleOf(badge).backgroundColor).toBe(rgb(expected[index]![1]!));
      expect(path.getAttribute('stroke')).toBe(expected[index]![2]);
      expect(parseFloat(styleOf(row).borderTopWidth)).toBe(index ? UI.border : 0);
    });
  });

  it('puts the state at the row’s right end and the notes under the title (Done.jsx:30–36)', () => {
    const title = 'Brüche mit verschiedenen Nennern vergleichen';
    const label = 'Noch nicht beantwortet';
    const detail = 'Lösung: beide Brüche auf Achtel bringen';
    const note = 'Erst erweitern, dann vergleichen.';
    renderInApp(
      <ResultList
        variant="rows"
        title="Rückblick"
        rows={[{ key: 'open', status: 'open', right: false, label, text: title, detail, note }]}
      />,
    );
    const row = rowBox(title);
    expect(styleOf(row).flexDirection).toBe('row');
    expect(styleOf(row).alignItems).toBe('flex-start');
    // Sign · title column · state: the state is the row's last child, not a line of the column.
    const [, column, state] = Array.from(row.children) as HTMLElement[];
    expect(state).toBe(screen.getByText(label));
    expect(styleOf(state!).textAlign).toBe('right');
    // The title keeps its own width up to its share; the state gives way and wraps in the rest
    // (`ROW_SPLIT`, as a list row's value): unshrinkable, it left the title a word per line.
    expect(styleOf(state!).flexShrink).toBe('1');
    expect(styleOf(state!).flexGrow).toBe('1');
    expect(column!.style.maxWidth).toBe(UI.list.titleShare);
    // But the state never stands narrower than the states' widest word, measured as drawn: there
    // the title gives way (#599: "Übersprungen" ran past the card at 360). Each word is measured
    // out of sight and out of the reading order.
    expect(styleOf(column!).flexShrink).toBe('1');
    expect(state!.style.minWidth).not.toBe('');
    for (const word of ['Noch', 'nicht', 'beantwortet'])
      expect(
        screen.getAllByText(word, { exact: true }).some((el) => el.closest('[aria-hidden="true"]')),
      ).toBe(true);
    expect(column!.contains(screen.getByText(label))).toBe(false);
    expect(Array.from(column!.children).map((line) => line.textContent)).toEqual([
      title,
      detail,
      note,
    ]);
    // The title is the design's 600 16/22; the state's line is as tall, so both start level.
    expect(screen.getByText(title).style.lineHeight).toBe('22px');
    expect(state!.style.lineHeight).toBe('22px');
    // Actual 360/390 geometry belongs to the ordered browser integration; jsdom has no layout.
  });

  it('keeps the word before a closing fraction on its line, so the fraction is no orphan', () => {
    renderInApp(
      <ResultList
        variant="rows"
        title="Rückblick"
        rows={[
          {
            key: 'a',
            status: 'correct',
            right: true,
            label: 'Richtig',
            text: 'Welcher Bruch ist größer: $\\frac{2}{3}$ oder $\\frac{3}{5}$?',
            detail: null,
          },
          {
            key: 'b',
            status: 'correct',
            right: true,
            label: 'Richtig',
            text: 'Was ist 6 · 7?',
            detail: null,
          },
        ]}
      />,
    );
    const rows = document.body.textContent ?? '';
    expect(rows).toContain('oder\u00A0');
    expect(rows).toContain('größer: ');
    expect(rows).toContain('Was ist 6 · 7?');
  });
});
