// The periodic table next to a question (issue #250): both tables draw every cell, the marked
// ones framed, and a screen reader hears the table and the marked elements' cells — never the
// class or the computed key a question asks for.
//
// Geometry (fit at 360 and 390 px, light and dark) is tests/web/periodic.spec.ts.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { describePeriodic, PeriodicBody } from '../PeriodicTable.js';

type PeriodicFig = Extract<Figure, { type: 'periodic_table' }>;

const main: PeriodicFig = { type: 'periodic_table', v: 'main', hl: ['Si'], ask: 'class', at: 'Si' };
const full: PeriodicFig = { type: 'periodic_table', v: 'full', hl: ['Fe'], ask: 'none', at: '' };

const t = (key: string, values: Record<string, string | number> = {}) =>
  `${key}${Object.keys(values).length ? ` ${JSON.stringify(values)}` : ''}`;

describe('PeriodicBody', () => {
  it.each([
    ['main', main, 42],
    ['full', full, 90],
  ] as const)('draws the %s table, one cell per element', (_, figure, cells) => {
    const { container } = renderInApp(<PeriodicBody figure={figure} width={300} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    // Every cell, a frame per marked element, and the asked element magnified.
    expect(svg?.querySelectorAll('rect')).toHaveLength(
      cells + figure.hl.length + (figure.at ? 1 : 0),
    );
    expect(svg?.textContent).toContain(figure.hl[0]);
  });
});

describe('the asked element, magnified', () => {
  it.each([160, 300])(
    'keeps its number and mass inside its box at %i px (device 17.10.: "11 / 22,99" ran past it)',
    (width) => {
      const na: PeriodicFig = {
        type: 'periodic_table',
        v: 'main',
        hl: ['Na'],
        ask: 'protons',
        at: 'Na',
      };
      const { container } = renderInApp(<PeriodicBody figure={na} width={width} />);
      const box = Array.from(container.querySelectorAll('rect')).find(
        (r) => r.getAttribute('rx') === '4',
      )!;
      const top = Number(box.getAttribute('y'));
      const bottom = top + Number(box.getAttribute('height'));
      const left = Number(box.getAttribute('x'));
      const right = left + Number(box.getAttribute('width'));
      // The magnified cell's own texts: drawn in the box's group.
      const texts = Array.from(box.parentElement?.querySelectorAll('text') ?? []).filter((n) =>
        /11|22,99/.test(n.textContent ?? ''),
      );
      expect(texts.length).toBeGreaterThan(0);
      for (const n of texts) {
        const y = Number(n.getAttribute('y'));
        const size = Number(n.getAttribute('font-size') ?? n.getAttribute('fontSize'));
        const x = Number(n.getAttribute('x'));
        const half = ((n.textContent ?? '').length * size * 0.6) / 2;
        // The glyphs' cap height above the baseline, the baseline itself inside the box.
        expect(y - size * 0.72).toBeGreaterThanOrEqual(top);
        expect(y).toBeLessThanOrEqual(bottom);
        expect(x - half).toBeGreaterThanOrEqual(left);
        expect(x + half).toBeLessThanOrEqual(right);
      }
    },
  );
});

describe('describePeriodic', () => {
  it('reads the table, the staircase and the marked cell, not the class asked for', () => {
    const said = describePeriodic(main, t);
    expect(said).toContain('figure.periodic_main');
    expect(said).toContain('figure.periodic_stair');
    expect(said).toContain('"sym":"Si","z":14');
    expect(said).toContain('"group":"IV","period":3');
    expect(said).not.toMatch(/metalloid|Halbmetall/i);
  });

  it('numbers the groups 1–18 in the full table', () => {
    expect(describePeriodic(full, t)).toContain('"sym":"Fe","z":26');
    expect(describePeriodic(full, t)).toContain('"group":"8","period":4');
  });
});
