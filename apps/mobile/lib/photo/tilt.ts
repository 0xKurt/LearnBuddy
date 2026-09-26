// Is the sheet photographed straight? A page turned on the table, or the phone
// held at a slant, makes lines of text run at an angle, converge, or shrink
// towards the top — the model then misreads more. Measured on the small grey
// copy (lib/photo/quality.ts), from the ink alone:
// - angle: the direction in which the ink lines up best (rows of text), found by
//   projecting the ink pixels at trial angles and keeping the sharpest profile;
// - converging: that angle differs between the upper and the lower half (the
//   phone held at a slant to one side).
// A phone tipped forward (lines stay level but get smaller towards the top) is
// not judged: with a few lines of text the spacing was not reliable enough on
// the samples. The model still reports a page it could not read (§Material).
// Pure and unit-tested on rendered sample photos (lib/photo/__tests__).

export type TiltMetrics = {
  /** Angle of the text lines in degrees (0 = straight). */
  angle: number;
  /** Difference of that angle between the upper and the lower half. */
  converge: number;
  /** Ink pixels used; too few (an almost empty page) and nothing is judged. */
  ink: number;
};

const MAX_POINTS = 6_000;

/** The ink: pixels clearly darker than the paper (not the table around it). */
function inkPoints(
  gray: Float32Array,
  width: number,
  height: number,
  dark: number,
  paper: number,
): { xs: Int32Array; ys: Int32Array } {
  const threshold = dark + 0.35 * (paper - dark);
  let n = 0;
  for (let i = 0; i < gray.length; i++) if (gray[i]! < threshold) n++;
  const step = Math.max(1, Math.ceil(n / MAX_POINTS));
  const xs: number[] = [];
  const ys: number[] = [];
  let k = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (gray[y * width + x]! < threshold && k++ % step === 0) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  return { xs: Int32Array.from(xs), ys: Int32Array.from(ys) };
}

/** How sharply the points line up across lines at `deg`: sum of squared 2-px bins. */
function sharpness(xs: Int32Array, ys: Int32Array, deg: number, bins: Int32Array): number {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r) / 2;
  const s = Math.sin(r) / 2;
  const offset = bins.length >> 1;
  bins.fill(0);
  let score = 0;
  for (let i = 0; i < xs.length; i++) {
    const k = offset + Math.floor(ys[i]! * c - xs[i]! * s);
    // (v+1)² − v² = 2v + 1: the score grows as the bins fill.
    score += 2 * bins[k]! + 1;
    bins[k]!++;
  }
  return score;
}

/** Coarse (every 3°, up to ±36°), then to the degree. */
function bestAngle(xs: Int32Array, ys: Int32Array, bins: Int32Array): number {
  let best = 0;
  let bestScore = -1;
  const tryAngle = (deg: number) => {
    const score = sharpness(xs, ys, deg, bins);
    if (score > bestScore) {
      bestScore = score;
      best = deg;
    }
  };
  for (let deg = -36; deg <= 36; deg += 3) tryAngle(deg);
  const coarse = best;
  for (const d of [-2, -1, 1, 2]) tryAngle(coarse + d);
  return best;
}

export function measureTilt(
  gray: Float32Array,
  width: number,
  height: number,
  dark: number,
  paper: number,
): TiltMetrics {
  const { xs, ys } = inkPoints(gray, width, height, dark, paper);
  const ink = xs.length;
  if (ink < 400) return { angle: 0, converge: 0, ink };
  // Room for every projected position of a point in the picture.
  const bins = new Int32Array(2 * (width + height) + 4);
  const angle = bestAngle(xs, ys, bins);
  // Upper and lower half of the ink (not of the picture: the text may sit high).
  const sorted = Int32Array.from(ys).sort();
  const middle = sorted[Math.floor(sorted.length / 2)]!;
  const pick = (upper: boolean) => {
    const ix: number[] = [];
    const iy: number[] = [];
    for (let i = 0; i < ink; i++) {
      if (ys[i]! < middle === upper) {
        ix.push(xs[i]!);
        iy.push(ys[i]!);
      }
    }
    return { xs: Int32Array.from(ix), ys: Int32Array.from(iy) };
  };
  const top = pick(true);
  const bottom = pick(false);
  const converge = Math.abs(
    bestAngle(top.xs, top.ys, bins) - bestAngle(bottom.xs, bottom.ys, bins),
  );
  return { angle, converge, ink };
}
