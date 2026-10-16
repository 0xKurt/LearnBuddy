// The images made from free vector files and their anchors belong together (#820): every part's
// anchor stands on its own structure in `apps/mobile/assets/figures/<id>.png` (a bone of the
// skeleton; the heart's chambers, vessels and wall by their colour), never on the paper beside it
// or on a neighbour, and every part is still asked and checked by the server. Image and anchors
// are written together by packages/shared-math/scripts/figures.mjs; an image swapped without them
// is red here.

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

type Tone = 'drawn' | 'blue' | 'red' | 'wall';

/** What the image draws at a pixel: nothing, or its colour's family. */
function toneAt(r: number, g: number, b: number, a: number): Tone | null {
  if (a < 200) return null;
  if (b > r + 30) return 'blue';
  // The heart's wall is a pale tan: red above green above blue, none of them dark.
  if (r > 180 && g > 140 && b > 100 && r - b < 110) return 'wall';
  if (r > g + 60 && r > b + 60) return 'red';
  return 'drawn';
}

/**
 * Per picture: the tone each part's own structure has (the skeleton's bones are simply drawn), and
 * the parts a finger can tap.
 */
const PICTURES = {
  skeleton: { tones: {} as Record<string, Tone>, tapped: ['skull'] },
  heart: {
    tones: {
      myocardium: 'wall',
      septum: 'wall',
      valve: 'wall',
      vena_cava: 'blue',
      pulmonary_artery: 'blue',
      right_atrium: 'blue',
      right_ventricle: 'blue',
      pulmonary_vein: 'red',
      aorta: 'red',
      left_atrium: 'red',
      left_ventricle: 'red',
    } as Record<string, Tone>,
    tapped: ['right_atrium', 'left_atrium'],
  },
} as const;

for (const [d, { tones, tapped }] of Object.entries(PICTURES) as [
  keyof typeof PICTURES,
  (typeof PICTURES)[keyof typeof PICTURES],
][]) {
  const file = join(__dirname, `../../../../../mobile/assets/figures/${d}.png`);
  const { data, info } = await sharp(readFileSync(file)).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  /** The tones the image draws at the frame point and the pixels around it. */
  const tonesAt = ([x, y]: readonly [number, number]): (Tone | null)[] => {
    const k = info.width / SCHEMATIC_IMAGE_WIDTH;
    const [px, py] = [Math.round(x * k), Math.round(y * k)];
    const out: (Tone | null)[] = [];
    for (let dy = -1; dy <= 1; dy += 1)
      for (let dx = -1; dx <= 1; dx += 1) {
        const i = ((py + dy) * info.width + (px + dx)) * 4;
        out.push(toneAt(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0, data[i + 3] ?? 0));
      }
    return out;
  };
  const parts = schematic(FIGURE_NAMES, d).parts;

  describe(`${d}: each part on its own structure, each asked and checked (#820)`, () => {
    it('has an anchor for every part, in the order of the names', () => {
      expect(SCHEMATIC_ANCHORS[d].map((a) => a.id)).toEqual(parts.map((p) => p.id));
    });

    for (const [i, part] of parts.entries()) {
      it(`${part.id} (${part.de}): its anchor stands on it; asked by its number it holds`, () => {
        const anchor = SCHEMATIC_ANCHORS[d][i]!;
        const seen = tonesAt(anchor.at);
        const want = tones[part.id];
        const where = `${part.id} at ${anchor.at.join(', ')}: ${seen.join(' ')}`;
        // On it, and no neighbour's tone around it (the paper may be, at a thin vessel's edge).
        if (want)
          expect(seen[4] === want && seen.every((t) => t === want || t === null), where).toBe(true);
        else
          expect(
            seen.some((t) => t !== null),
            where,
          ).toBe(true);
        const figure = { type: 'schematic', d, n: [part.id], ask: 1 };
        expect(stalePicture({ kind: 'short', answer: part.de, figure })).toBe(false);
        // Tapped only where one area covers it, as before.
        const tap = { type: 'schematic', d, n: [], ask: 0 };
        expect(stalePicture({ kind: 'short', answer: part.de, figure: tap, tap: true })).toBe(
          !(tapped as readonly string[]).includes(part.id),
        );
      });
    }
  });
}
