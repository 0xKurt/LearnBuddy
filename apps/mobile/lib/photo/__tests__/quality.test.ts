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

describe('photo quality', () => {
  it('passes photos that can be read: in focus, noisy, with a shadow, slightly soft', () => {
    for (const f of ['sharp.jpg', 'noisy.jpg', 'shadow.jpg', 'blur_mild.jpg', 'sparse.jpg'])
      expect(photo(f).problems, f).toEqual([]);
  });

  it('names what is wrong', () => {
    expect(photo('blur.jpg').problems).toEqual(['blurry']);
    expect(photo('blur_strong.jpg').problems).toEqual(['blurry']);
    expect(photo('sparse_blur.jpg').problems).toEqual(['blurry']);
    expect(photo('dark.jpg').problems).toEqual(['dark']);
    expect(photo('washed.jpg').problems).toEqual(['washed_out']);
    expect(photo('sharp_420.jpg').problems).toEqual(['small']);
  });

  it('does not call a dark or empty picture blurry as well', () => {
    expect(problemsOf({ mean: 40, contrast: 10, sharpness: 0.1 }, 3000)).toEqual(['dark']);
    expect(problemsOf({ mean: 230, contrast: 20, sharpness: 1 }, 3000)).toEqual(['washed_out']);
  });
});
