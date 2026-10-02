// The statistics of the overall-impression comparison (issue #127). Pure and deterministic:
// every random step takes a seeded generator, so a test can pin each number down.
//
// Why these and not a t-test on "scores": the judge's answer is a preference, not a
// measurement on a scale, and the honest test for paired preferences is the sign test. The
// secondary numbers (ask-backs, tokens, latency) are paired per scenario, with no
// assumption about their distribution: a sign-flip permutation test and a bootstrap
// interval over scenarios.
//
// The unit of evidence is the SCENARIO, not the conversation. Three runs of the same
// scenario are not three independent observations — they share the opening, the setup and
// whatever in the prompt that scenario happens to poke. Counting them as independent would
// inflate the evidence threefold. Conversations are shown, scenarios are tested.
// requires live verification in Claude Code session (part of the live-model eval; proven offline in __tests__/stats.test.ts)

/** Significance level of every test here. Fixed, never tuned after the fact. */
export const ALPHA = 0.05;

/** ln(n!) by summation; exact enough for the n of an eval (tens, not millions). */
function logFactorial(n: number): number {
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}

function binomPmfHalf(k: number, n: number): number {
  return Math.exp(logFactorial(n) - logFactorial(k) - logFactorial(n - k) - n * Math.LN2);
}

/**
 * Exact two-sided sign test: how likely a split at least this uneven is when neither side is
 * really preferred. Ties are not passed in — they carry no direction (the classic sign test
 * drops them, and says so in the report).
 */
export function signTest(wins: number, losses: number): number {
  const n = wins + losses;
  if (n === 0) return 1;
  const k = Math.min(wins, losses);
  let tail = 0;
  for (let i = 0; i <= k; i++) tail += binomPmfHalf(i, n);
  return Math.min(1, 2 * tail);
}

/**
 * The fewest wins out of `n` decisive units that the sign test calls significant — and null
 * when even n of n is not enough. Shown next to every "no difference", because with five
 * scenarios no result at all could have been significant, and the report must say that
 * instead of implying the versions are equal.
 */
export function winsNeeded(n: number, alpha = ALPHA): number | null {
  for (let w = Math.ceil(n / 2); w <= n; w++) if (signTest(w, n - w) < alpha) return w;
  return null;
}

/** Wilson score interval for a share k/n (95 %). Sound at small n and at 0 or n, unlike k/n ± 2σ. */
export function wilson(k: number, n: number): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 1 };
  const z = 1.959963984540054;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

/** A small, seedable generator (mulberry32): the same seed gives the same report. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mean = (xs: readonly number[]): number =>
  xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;

/** Where the empirical quantile q of sorted values lies (linear interpolation). */
function quantile(sorted: readonly number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Up to this many units, the permutation test enumerates every sign pattern exactly. */
export const EXACT_PERMUTATION_MAX = 16;
const MONTE_CARLO_DRAWS = 20_000;
const BOOTSTRAP_DRAWS = 10_000;

/**
 * Two-sided paired sign-flip permutation test on the mean difference. Under "no difference"
 * each scenario's B−A difference is as likely negative as positive, so every sign pattern
 * is equally likely; p is the share of patterns with a mean at least as far from zero.
 */
export function permutationTest(diffs: readonly number[], random: () => number): number {
  const n = diffs.length;
  if (n === 0) return 1;
  const observed = Math.abs(mean(diffs));
  // A float-sum tolerance, so a pattern with exactly the observed mean counts as "as extreme".
  const eps = 1e-9 * Math.max(1, observed);
  let extreme = 0;
  let total = 0;
  if (n <= EXACT_PERMUTATION_MAX) {
    for (let mask = 0; mask < 1 << n; mask++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += mask & (1 << i) ? -diffs[i]! : diffs[i]!;
      if (Math.abs(s / n) >= observed - eps) extreme++;
      total++;
    }
    return extreme / total;
  }
  for (let d = 0; d < MONTE_CARLO_DRAWS; d++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += random() < 0.5 ? -diffs[i]! : diffs[i]!;
    if (Math.abs(s / n) >= observed - eps) extreme++;
    total++;
  }
  // The observed pattern itself is one of the possible ones (never report p = 0).
  return (extreme + 1) / (total + 1);
}

/** Percentile bootstrap 95 % interval of the mean, resampling scenarios. */
export function bootstrapMean(
  values: readonly number[],
  random: () => number,
): { low: number; high: number } {
  const n = values.length;
  if (n === 0) return { low: 0, high: 0 };
  const means: number[] = [];
  for (let d = 0; d < BOOTSTRAP_DRAWS; d++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += values[Math.floor(random() * n)]!;
    means.push(s / n);
  }
  means.sort((a, b) => a - b);
  return { low: quantile(means, 0.025), high: quantile(means, 0.975) };
}

/** One secondary measure, paired per scenario (B − A; lower is better for every measure here). */
export type PairedMetric = {
  scenarios: number;
  meanA: number;
  meanB: number;
  /** Mean of the per-scenario differences B − A. */
  meanDiff: number;
  ci: { low: number; high: number };
  p: number;
};

export function pairedMetric(
  pairs: ReadonlyArray<{ a: number; b: number }>,
  seed: number,
): PairedMetric {
  const diffs = pairs.map((x) => x.b - x.a);
  return {
    scenarios: pairs.length,
    meanA: mean(pairs.map((x) => x.a)),
    meanB: mean(pairs.map((x) => x.b)),
    meanDiff: mean(diffs),
    ci: bootstrapMean(diffs, seeded(seed)),
    p: permutationTest(diffs, seeded(seed + 1)),
  };
}

/** What one scenario's runs add up to: its own preference, decided by majority of its pairs. */
export type ScenarioPreference = 'A' | 'B' | 'even';

export function scenarioPreference(winsA: number, winsB: number): ScenarioPreference {
  return winsB > winsA ? 'B' : winsA > winsB ? 'A' : 'even';
}

/** The primary result, in words that never claim more than the numbers carry. */
export type Verdict =
  | { kind: 'B_better' | 'A_better'; p: number }
  | { kind: 'undetectable'; p: number; decisive: number; needed: number | null };

export function verdict(scenarioWinsA: number, scenarioWinsB: number): Verdict {
  const decisive = scenarioWinsA + scenarioWinsB;
  const p = signTest(scenarioWinsB, scenarioWinsA);
  if (p < ALPHA) return { kind: scenarioWinsB > scenarioWinsA ? 'B_better' : 'A_better', p };
  return { kind: 'undetectable', p, decisive, needed: winsNeeded(decisive) };
}
