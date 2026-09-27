import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { decode } from 'jpeg-js';
import { describe, expect, it } from 'vitest';

import { assessPixels, problemsOf } from '../quality.js';

// Sample photos rendered by Chromium (a worksheet on a table, camera noise):
// sharp, with a shadow, blurred three ways, dark, washed out, and small.
const DIR = join(__dirname, 'fixtures');
const photo = (name: string) => {
  const img = decode(readFileSync(join(DIR, name)), { useTArray: true });
  // As taken on a phone: the originals are big; `_420` stands for a tiny one.
  const minSide = name.includes('_420') ? 420 : 3000;
  return assessPixels(img.data, img.width, img.height, minSide);
};

/**
 * The same photo with a dark desk around the sheet: `pad` adds the desk around
 * the picture, otherwise it covers the picture's outer `frac` (a closer shot).
 * Slight noise like a real table.
 */
function onDarkDesk(name: string, frac: number, level: number, pad: boolean) {
  const img = decode(readFileSync(join(DIR, name)), { useTArray: true });
  const bw = pad ? Math.round(img.width * frac) : 0;
  const bh = pad ? Math.round(img.height * frac) : 0;
  const W = img.width + 2 * bw;
  const H = img.height + 2 * bh;
  const out = new Uint8Array(W * H * 4);
  let seed = 7;
  const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 12;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const ix = x - bw;
      const iy = y - bh;
      const inside = ix >= 0 && iy >= 0 && ix < img.width && iy < img.height;
      const desk =
        !pad && (x < W * frac || x >= W * (1 - frac) || y < H * frac || y >= H * (1 - frac));
      out[o + 3] = 255;
      if (!inside || desk) {
        const v = level + noise();
        out[o] = v;
        out[o + 1] = v;
        out[o + 2] = v;
      } else {
        const i = (iy * img.width + ix) * 4;
        out[o] = img.data[i]!;
        out[o + 1] = img.data[i + 1]!;
        out[o + 2] = img.data[i + 2]!;
      }
    }
  }
  return assessPixels(out, W, H, 3000);
}

describe('photo quality', () => {
  it('never calls a straight sheet on a dark desk tilted (M-26)', () => {
    // Before: 12 of these 32 were "schief" (the desk's grid of sample points lined up at 18–27°).
    const flagged: string[] = [];
    for (const f of ['sharp.jpg', 'noisy.jpg', 'shadow.jpg', 'sparse.jpg'])
      for (const frac of [0.1, 0.15])
        for (const level of [20, 45])
          for (const pad of [true, false])
            if (onDarkDesk(f, frac, level, pad).problems.includes('tilted'))
              flagged.push(`${f} ${frac} ${level} ${pad}`);
    expect(flagged).toEqual([]);
  });

  it('passes photos that can be read: in focus, noisy, with a shadow, slightly soft', () => {
    for (const f of [
      'sharp.jpg',
      'noisy.jpg',
      'shadow.jpg',
      'blur_mild.jpg',
      'sparse.jpg',
      // A little turned is normal; a phone tipped forward is not judged (tilt.ts).
      'turned_5.jpg',
      'slanted_forward.jpg',
    ])
      expect(photo(f).problems, f).toEqual([]);
  });

  it('does not call a readable 800 × 1080 sheet "sehr klein" (user feedback #16)', () => {
    // The sample sheet as its own original: a messenger copy or a screenshot is this size.
    const img = decode(readFileSync(join(DIR, 'sharp.jpg')), { useTArray: true });
    expect(Math.min(img.width, img.height)).toBe(800);
    expect(assessPixels(img.data, img.width, img.height, 800).problems).toEqual([]);
  });

  it('names what is wrong', () => {
    expect(photo('blur.jpg').problems).toEqual(['blurry']);
    expect(photo('blur_strong.jpg').problems).toEqual(['blurry']);
    expect(photo('sparse_blur.jpg').problems).toEqual(['blurry']);
    expect(photo('dark.jpg').problems).toEqual(['dark']);
    expect(photo('washed.jpg').problems).toEqual(['washed_out']);
    expect(photo('sharp_420.jpg').problems).toEqual(['small']);
    expect(photo('turned_15.jpg').problems).toEqual(['tilted']);
    expect(photo('turned_neg22.jpg').problems).toEqual(['tilted']);
    expect(photo('slanted_side.jpg').problems).toEqual(['tilted']);
  });

  it('measures the angle of the text lines', () => {
    expect(photo('sharp.jpg').metrics.angle).toBe(0);
    expect(Math.abs(photo('turned_15.jpg').metrics.angle ?? 0)).toBeGreaterThanOrEqual(13);
    expect(Math.abs(photo('turned_neg22.jpg').metrics.angle ?? 0)).toBeGreaterThanOrEqual(20);
  });

  it('does not call a dark or empty picture blurry as well', () => {
    expect(problemsOf({ mean: 40, contrast: 10, sharpness: 0.1 }, 3000)).toEqual(['dark']);
    expect(problemsOf({ mean: 230, contrast: 20, sharpness: 1 }, 3000)).toEqual(['washed_out']);
  });
});
