// Exact fractions for keys code computes (docs/architecture.md §Practice): the probabilities of a
// tree (#256) and the resistances, currents and voltages of a circuit (#261). A key compared
// against a number the model wrote must not carry a floating-point error of its own, so the
// arithmetic stays in whole numbers until the very end (`ratioValue`).
//
// Dependency-free on purpose: the app imports the figure files that use it by path.

export type Ratio = { n: bigint; d: bigint };

const ZERO = BigInt(0);
const ONE = BigInt(1);
const gcd = (a: bigint, b: bigint): bigint => (b === ZERO ? (a < ZERO ? -a : a) : gcd(b, a % b));

/** n / d in lowest terms. */
export function ratioOf(n: bigint, d: bigint = ONE): Ratio {
  const g = gcd(n, d) || ONE;
  return { n: n / g, d: d / g };
}

export const ratioAdd = (x: Ratio, y: Ratio) => ratioOf(x.n * y.d + y.n * x.d, x.d * y.d);
export const ratioMul = (x: Ratio, y: Ratio) => ratioOf(x.n * y.n, x.d * y.d);
/** x / y; y must not be zero. */
export const ratioDiv = (x: Ratio, y: Ratio) => ratioOf(x.n * y.d, x.d * y.n);
export const ratioIsOne = (x: Ratio) => x.n === x.d;
export const ratioIsZero = (x: Ratio) => x.n === ZERO;
export const ratioValue = (r: Ratio) => Number(r.n) / Number(r.d);

/**
 * A decimal as written by the model (12, 4.5, 0.25) as an exact fraction, to the thousandth —
 * the finest a school value is given in. Null for anything finer, negative or not finite.
 */
export function ratioFromDecimal(x: number): Ratio | null {
  if (!Number.isFinite(x) || x < 0) return null;
  const milli = Math.round(x * 1000);
  if (Math.abs(milli - x * 1000) > 1e-6) return null;
  return ratioOf(BigInt(milli), BigInt(1000));
}
