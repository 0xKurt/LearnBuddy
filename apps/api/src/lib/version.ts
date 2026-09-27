// App build versions ("1.4.0"): compared numerically, part by part.

function parts(v: string): number[] {
  return v.split('.').map((p) => Number.parseInt(p, 10) || 0);
}

/** True when `version` is older than `minimum` (missing parts count as 0). */
export function olderThan(version: string, minimum: string): boolean {
  const a = parts(version);
  const b = parts(minimum);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}
