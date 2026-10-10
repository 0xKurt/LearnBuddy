// A table next to a question (FigureView, `table`): it takes the width its frame gives it. The
// drawing's own box centres what it holds (`FigureView`, #387); a table that sized itself to its
// content stood 120 pt wide in a 294 pt frame on 390×844, and its header "klasse" broke into
// "klass/e". Whether it fits the phones is tests/web/gallery.spec.ts (262f).

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { TableFigure } from '../TableFigure.js';

const SCHUELER: Extract<Figure, { type: 'table' }> = {
  type: 'table',
  header: ['name', 'klasse'],
  rows: [
    ['Ada', '7a'],
    ['Ben', '7b'],
  ],
};

describe('TableFigure', () => {
  it('stands as wide as the drawing it is given, not as its content', () => {
    const { getByTestId } = renderInApp(<TableFigure fig={SCHUELER} width={294} />);
    expect(getComputedStyle(getByTestId('figure-table')).width).toBe('294px');
  });
});
