import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderInApp, styleOf, commonBox } from '../../../testing/render.js';
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

  it('places the status beside a wrapping title without clipping either line or truncating detail', () => {
    const title = 'Brüche mit verschiedenen Nennern vergleichen';
    const label = '3 · Noch nicht beantwortet';
    const detail = 'Lösung: beide Brüche auf Achtel bringen';
    renderInApp(
      <ResultList
        variant="rows"
        title="Rückblick"
        rows={[
          {
            key: 'open',
            status: 'open',
            right: false,
            label,
            text: title,
            detail,
          },
        ]}
      />,
    );
    const heading = commonBox(screen.getByText(title), screen.getByText(label));
    expect(styleOf(heading).flexDirection).toBe('row');
    expect(styleOf(heading).flexWrap).toBe('wrap');
    expect(styleOf(screen.getByText(label)).whiteSpace).not.toBe('nowrap');
    expect(screen.getByText(detail)).toBeDefined();
    // Actual360/390 geometry belongs to the ordered browser integration; jsdom has no layout.
  });
});
