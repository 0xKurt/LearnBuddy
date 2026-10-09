// A labelled picture next to a question (issue #252): every drawing of the library draws, the
// numbers stand beside the parts asked for and never their names, and what a screen reader hears
// is the drawing and how many parts are numbered — naming them is the task.
//
// Parts, names and which part a finger means are
// packages/shared-math/src/__tests__/schematics.test.ts; the drawing at 360 and 390 pt, light and
// dark, is tests/web/tap-figures.spec.ts.

import { describe, expect, it } from 'vitest';

import { FIGURE_NAMES } from '../../../../../packages/shared-math/src/figureNames.data.js';
import { SCHEMATIC_IDS } from '../../../../../packages/shared-math/src/schematics.js';
import { useFigureNames } from '../../../lib/math/useFigureNames.js';
import { useSchematicShapes } from '../../../lib/math/useSchematicShapes.js';
import { renderInApp, whenLoaded } from '../../../testing/render.js';
import { describeSchematic, SchematicBody, type SchematicFigure } from '../SchematicFigures.js';

const t = (key: string, values: Record<string, string | number> = {}) =>
  `${key}${Object.keys(values).length ? ` ${JSON.stringify(values)}` : ''}`;

const labelled: SchematicFigure = {
  type: 'schematic',
  d: 'plant_cell',
  n: ['nucleus', 'vacuole', 'chloroplast'],
  ask: 2,
};

describe('SchematicBody', () => {
  it.each(SCHEMATIC_IDS.map((d) => [d] as const))(
    'draws %s once its shapes are loaded',
    async (d) => {
      const { container } = renderInApp(
        <SchematicBody figure={{ type: 'schematic', d, n: [], ask: 0 }} width={300} />,
      );
      await whenLoaded(useSchematicShapes, useFigureNames);
      expect(container.querySelectorAll('path').length).toBeGreaterThan(4);
    },
  );

  it('draws what stands on a part without being one: the white symbols, the walker', async () => {
    const { container } = renderInApp(
      <SchematicBody figure={{ type: 'schematic', d: 'signs', n: [], ask: 0 }} width={300} />,
    );
    // Six signs, each its outline and its fill; then the white marks, then the black ones.
    await whenLoaded(useSchematicShapes, useFigureNames);
    expect(container.querySelectorAll('path')).toHaveLength(6 * 2 + 2);
  });

  it('shrunk by FigureView, a numbered picture keeps its width and gives up only height (#462)', async () => {
    const at = (scale: number) =>
      renderInApp(<SchematicBody figure={labelled} width={300 * scale} scale={scale} />).container;
    const full = at(1);
    const shrunk = at(0.6);
    await whenLoaded(useSchematicShapes, useFigureNames);
    const size = (c: HTMLElement) => {
      const svg = c.querySelector('svg')!;
      return [Number(svg.getAttribute('width')), Number(svg.getAttribute('height'))];
    };
    const [w1, h1] = size(full);
    const [w2, h2] = size(shrunk);
    expect(w2).toBeCloseTo(w1!);
    expect(h2).toBeCloseTo(h1! * 0.6);
  });

  it('writes the numbers 1, 2, 3 beside the parts, never a name', async () => {
    const { container } = renderInApp(<SchematicBody figure={labelled} width={300} />);
    await whenLoaded(useSchematicShapes, useFigureNames);
    expect(container.textContent ?? '').toBe('123');
  });
});

describe('describeSchematic', () => {
  it('says the drawing and how many parts carry numbers, not which', () => {
    expect(describeSchematic(labelled, t, FIGURE_NAMES)).toBe(
      'figure.schematic_numbered {"name":"Pflanzenzelle","count":3}',
    );
    expect(describeSchematic({ ...labelled, n: [], ask: 0 }, t, FIGURE_NAMES)).toBe(
      'figure.schematic {"name":"Pflanzenzelle"}',
    );
  });
});
