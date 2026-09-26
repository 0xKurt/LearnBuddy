// Is this photo of a worksheet good enough to read? Checked on the phone right
// after it was taken (nothing leaves the device), so Lena can take it again at
// once instead of learning minutes later that Buddy could not read it — the
// old app's most common failure (docs/architecture.md §Material).
//
// Pure and unit-tested on rendered sample photos (lib/photo/__tests__): the
// picture is brought to a small grey version, then
// - dark: most of the picture is dark (the paper should be the bright part);
// - washed out: bright and without contrast (overexposed, text faded);
// - blurry: the sharpest edges are soft — text edges in focus jump from paper
//   to ink within a pixel or two; measured relative to the picture's contrast,
//   so a dim but sharp photo is not "blurry";
// - small: too few pixels for small print.
// It only advises: she may keep a photo anyway (the model says later whether it
// could read it).

export type PhotoProblem = 'blurry' | 'dark' | 'washed_out' | 'small';

export type PhotoMetrics = {
  /** Mean brightness 0–255. */
  mean: number;
  /** The paper against the darkest ink (99th − 0.1th percentile). */
  contrast: number;
  /** Strongest edges relative to the contrast; lower = blurrier. */
  sharpness: number;
};

/** The analysis works on a picture this wide (the app scales the photo down first). */
export const ANALYSIS_WIDTH = 640;

export const LIMITS = {
  /** Mean brightness under this: too dark. */
  darkMean: 80,
  /** Ink hardly darker than the paper (with crisp edges): washed out, overexposed or glare. */
  washedContrast: 100,
  washedMean: 120,
  /**
   * Sharpness under this: blurry. Calibrated on the sample photos (lib/photo/__tests__):
   * in focus 0.95–1.1 (also with noise, a shadow or little text), slightly soft but
   * readable 0.56, blurred 0.31, very blurred 0.18.
   */
  blurry: 0.45,
  /** The shorter side of the original photo under this: too small for small print. */
  minSide: 900,
} as const;

/** Grey values (0–255) of an RGBA picture, box-scaled to at most `target` pixels wide. */
export function toGray(
  rgba: Uint8Array,
  width: number,
  height: number,
  target: number = ANALYSIS_WIDTH,
): { gray: Float32Array; width: number; height: number } {
  const step = Math.max(1, Math.round(width / target));
  const w = Math.floor(width / step);
  const h = Math.floor(height / step);
  const gray = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = 0; dy < step; dy++) {
        for (let dx = 0; dx < step; dx++) {
          const i = ((y * step + dy) * width + (x * step + dx)) * 4;
          sum += 0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!;
        }
      }
      gray[y * w + x] = sum / (step * step);
    }
  }
  return { gray, width: w, height: h };
}

function percentile(values: Float32Array | number[], p: number): number {
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
}

export function measure(gray: Float32Array, width: number, height: number): PhotoMetrics {
  let sum = 0;
  for (const v of gray) sum += v;
  const mean = gray.length ? sum / gray.length : 0;
  // Darkest ink against the paper: text may cover only a few percent of a page.
  const contrast = percentile(gray, 0.99) - percentile(gray, 0.001);
  // Gradient over two pixels (less sensitive to sensor noise than neighbours).
  const grads: number[] = [];
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const i = y * width + x;
      const gx = gray[i + 1]! - gray[i - 1]!;
      const gy = gray[i + width]! - gray[i - width]!;
      grads.push(Math.hypot(gx, gy));
    }
  }
  const edge = grads.length ? percentile(grads, 0.998) : 0;
  return { mean, contrast, sharpness: contrast > 0 ? edge / contrast : 0 };
}

export function problemsOf(m: PhotoMetrics, originalMinSide: number): PhotoProblem[] {
  const out: PhotoProblem[] = [];
  if (m.mean < LIMITS.darkMean) out.push('dark');
  // Blur also makes the ink paler: soft edges say "blurry", crisp but faint ones "washed out".
  else if (m.sharpness < LIMITS.blurry) out.push('blurry');
  else if (m.mean >= LIMITS.washedMean && m.contrast < LIMITS.washedContrast)
    out.push('washed_out');
  if (originalMinSide < LIMITS.minSide) out.push('small');
  return out;
}

/** Everything in one go, from decoded RGBA pixels. */
export function assessPixels(
  rgba: Uint8Array,
  width: number,
  height: number,
  originalMinSide: number,
): { problems: PhotoProblem[]; metrics: PhotoMetrics } {
  const g = toGray(rgba, width, height);
  const metrics = measure(g.gray, g.width, g.height);
  return { problems: problemsOf(metrics, originalMinSide), metrics };
}
