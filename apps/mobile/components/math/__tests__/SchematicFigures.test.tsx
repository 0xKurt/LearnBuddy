// A labelled picture next to a question (issues #252, #599): every picture of the library shows
// its real image on a light paper card — never a drawing of ours, but for the circuit —, the
// numbers stand on the parts asked for and never their names, the asked number is the filled one,
// and what a screen reader hears is the picture and how many parts are numbered — naming them is
// the task.
//
// Parts, names and which part a finger means are
// packages/shared-math/src/__tests__/schematics.test.ts and schematicAnchors.test.ts; the picture
// at 360 and 390 pt, light and dark, is tests/web/tap-figures.spec.ts.

import { describe, expect, it } from 'vitest';

import { FIGURE_NAMES } from '../../../../../packages/shared-math/src/figureNames.data.js';
import {
  SCHEMATIC_IMAGE_IDS,
  schematicFrame,
} from '../../../../../packages/shared-math/src/schematics.js';
import { useFigureNames } from '../../../lib/math/useFigureNames.js';
import { useSchematicPictures } from '../../../lib/math/useSchematicPictures.js';
import { useSchematicShapes } from '../../../lib/math/useSchematicShapes.js';
import { FIGURE_PICTURE } from '../../../lib/theme/figurePicture.js';
import { PALETTES } from '../../../lib/theme/palettes.js';
import { renderInApp, styleOf, whenLoaded } from '../../../testing/render.js';
import { describeSchematic, SchematicBody, type SchematicFigure } from '../SchematicFigures.js';

const t = (key: string, values: Record<string, string | number> = {}) =>
  `${key}${Object.keys(values).length ? ` ${JSON.stringify(values)}` : ''}`;

const labelled: SchematicFigure = {
  type: 'schematic',
  d: 'plant_cell',
  n: ['nucleus', 'vacuole', 'chloroplast'],
  ask: 2,
};

const loaded = () => whenLoaded(useSchematicPictures, useSchematicShapes, useFigureNames);

describe('SchematicBody', () => {
  it.each(SCHEMATIC_IMAGE_IDS.map((d) => [d] as const))(
    'shows the image of %s, in its frame, and draws no part itself',
    async (d) => {
      const { container, getByTestId } = renderInApp(
        <SchematicBody figure={{ type: 'schematic', d, n: [], ask: 0 }} width={300} />,
      );
      await loaded();
      const card = getByTestId('schematic-picture');
      expect(card.style.height).toBe(`${schematicFrame(d).height}px`);
      expect(card.querySelectorAll('img')).toHaveLength(1);
      // Numbers and leader lines only: no outline of a skeleton, a heart, a cell.
      expect(container.querySelectorAll('path')).toHaveLength(0);
    },
  );

  it('the image lies on a light paper card that is no colour of the look: light in the dark ones too', async () => {
    const { getByTestId } = renderInApp(<SchematicBody figure={labelled} width={300} />);
    await loaded();
    const card = getByTestId('schematic-picture');
    expect(styleOf(card).backgroundColor).toBe('rgb(255, 255, 255)');
    expect(styleOf(card).borderTopLeftRadius).toBe(`${FIGURE_PICTURE.radius}px`);
    // The paper and its ink are constants of the picture, the same under every palette.
    expect(FIGURE_PICTURE).toMatchObject({ paper: '#ffffff', ink: '#1f1b2e', radius: 14 });
  });

  it('writes the numbers 1, 2, 3 on the parts, never a name', async () => {
    const { container } = renderInApp(<SchematicBody figure={labelled} width={300} />);
    await loaded();
    expect(container.textContent ?? '').toBe('123');
    // One leader line and its dot per number.
    expect(container.querySelectorAll('line')).toHaveLength(3);
  });

  it('fills the number that is asked in the accent; the others are rings on paper', async () => {
    const { container } = renderInApp(<SchematicBody figure={labelled} width={300} />);
    await loaded();
    const rings = Array.from(container.querySelectorAll('circle')).filter(
      (c) => Number(c.getAttribute('r')) === FIGURE_PICTURE.badge.radius,
    );
    expect(rings.map((c) => c.getAttribute('fill'))).toEqual([
      FIGURE_PICTURE.paper,
      PALETTES.pastell.primary,
      FIGURE_PICTURE.paper,
    ]);
  });

  it('a row picture’s number stands in its cell’s corner, joined to the middle of its cell', async () => {
    const signs: SchematicFigure = { type: 'schematic', d: 'signs', n: ['stop'], ask: 1 };
    const { container } = renderInApp(<SchematicBody figure={signs} width={300} />);
    await loaded();
    const line = container.querySelector('line')!;
    expect([line.getAttribute('x2'), line.getAttribute('y2')]).toEqual(['12', '12']);
  });

  it('scales the numbers with the image: half the width, half the ring', async () => {
    const { container } = renderInApp(<SchematicBody figure={labelled} width={150} />);
    await loaded();
    const radii = Array.from(container.querySelectorAll('circle'), (c) =>
      Number(c.getAttribute('r')),
    );
    expect(Math.max(...radii)).toBe(FIGURE_PICTURE.badge.radius / 2);
  });

  it('a stored picture that names a part it no longer has shows the image without numbers (#599)', async () => {
    const stored: SchematicFigure = {
      type: 'schematic',
      d: 'bicycle',
      n: ['bell', 'saddle'],
      ask: 2,
    };
    const { container, getByTestId } = renderInApp(<SchematicBody figure={stored} width={300} />);
    await loaded();
    expect(getByTestId('schematic-picture').querySelectorAll('img')).toHaveLength(1);
    expect(container.textContent ?? '').toBe('');
  });

  it('the circuit has no image: it is still our drawing, its numbers beside it', async () => {
    const circuit: SchematicFigure = {
      type: 'schematic',
      d: 'circuit',
      n: ['battery', 'bulb'],
      ask: 1,
    };
    const { container, queryByTestId } = renderInApp(
      <SchematicBody figure={circuit} width={300} />,
    );
    await loaded();
    expect(queryByTestId('schematic-picture')).toBeNull();
    expect(container.querySelectorAll('img')).toHaveLength(0);
    // Five parts, each its outline and its fill; then the white marks, then the black ones.
    expect(container.querySelectorAll('path')).toHaveLength(5 * 2 + 2);
    expect(container.textContent ?? '').toBe('12');
  });

  it('shrunk by FigureView, the drawing keeps its width and gives up only height (#462)', async () => {
    const circuit: SchematicFigure = { type: 'schematic', d: 'circuit', n: ['battery'], ask: 1 };
    const at = (scale: number) =>
      renderInApp(<SchematicBody figure={circuit} width={300 * scale} scale={scale} />).container;
    const full = at(1);
    const shrunk = at(0.6);
    await loaded();
    const size = (c: HTMLElement) => {
      const svg = c.querySelector('svg')!;
      return [Number(svg.getAttribute('width')), Number(svg.getAttribute('height'))];
    };
    const [w1, h1] = size(full);
    const [w2, h2] = size(shrunk);
    expect(w2).toBeCloseTo(w1!);
    expect(h2).toBeCloseTo(h1! * 0.6);
  });
});

describe('describeSchematic', () => {
  it('says the picture and how many parts carry numbers, not which', () => {
    expect(describeSchematic(labelled, t, FIGURE_NAMES)).toBe(
      'figure.schematic_numbered {"name":"Pflanzenzelle","count":3}',
    );
    expect(describeSchematic({ ...labelled, n: [], ask: 0 }, t, FIGURE_NAMES)).toBe(
      'figure.schematic {"name":"Pflanzenzelle"}',
    );
  });

  it('counts no number on a picture that shows none (#599)', () => {
    const stored: SchematicFigure = {
      type: 'schematic',
      d: 'bicycle',
      n: ['bell', 'saddle'],
      ask: 2,
    };
    expect(describeSchematic(stored, t, FIGURE_NAMES)).toBe('figure.schematic {"name":"Fahrrad"}');
  });
});
