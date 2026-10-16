// The skeleton's image and its anchors belong together (#820): every part's anchor stands on a
// bone of `apps/mobile/assets/figures/skeleton.png`, never on the empty paper beside it, and every
// part is still asked and checked by the server. The image and the anchors are written together
// by packages/shared-math/scripts/figures.mjs; an image swapped without them is red here.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  FIGURE_NAMES,
  SCHEMATIC_ANCHORS,
  SCHEMATIC_IMAGE_WIDTH,
  schematic,
} from '@learnbuddy/shared-math';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { stalePicture } from '../schematicCheck.js';

const IMAGE = join(__dirname, '../../../../../mobile/assets/figures/skeleton.png');
const image = await sharp(readFileSync(IMAGE)).ensureAlpha().raw().toBuffer({
  resolveWithObject: true,
});

/** Whether the image draws something solid at the frame point, or in the pixels around it. */
function onTheMotif([x, y]: readonly [number, number]): boolean {
  const { data, info } = image;
  const k = info.width / SCHEMATIC_IMAGE_WIDTH;
  const [px, py] = [Math.round(x * k), Math.round(y * k)];
  for (let dy = -1; dy <= 1; dy += 1)
    for (let dx = -1; dx <= 1; dx += 1) {
      const i = ((py + dy) * info.width + (px + dx)) * 4;
      if ((data[i + 3] ?? 0) >= 200) return true;
    }
  return false;
}

const parts = schematic(FIGURE_NAMES, 'skeleton').parts;

describe('the skeleton: each part on its bone, each asked and checked (#820)', () => {
  it('has an anchor for every part, in the order of the names', () => {
    expect(SCHEMATIC_ANCHORS.skeleton.map((a) => a.id)).toEqual(parts.map((p) => p.id));
  });

  for (const [i, part] of parts.entries()) {
    it(`${part.id} (${part.de}): its anchor stands on the bone; asked by its number it holds`, () => {
      const anchor = SCHEMATIC_ANCHORS.skeleton[i]!;
      expect(onTheMotif(anchor.at), `${part.id} at ${anchor.at.join(', ')}`).toBe(true);
      const figure = { type: 'schematic', d: 'skeleton', n: [part.id], ask: 1 };
      expect(stalePicture({ kind: 'short', answer: part.de, figure })).toBe(false);
      // Tapped only where one area covers it: the skull, as before.
      const tap = { type: 'schematic', d: 'skeleton', n: [], ask: 0 };
      expect(stalePicture({ kind: 'short', answer: part.de, figure: tap, tap: true })).toBe(
        part.id !== 'skull',
      );
    });
  }
});
