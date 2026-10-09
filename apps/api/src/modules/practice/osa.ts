// Optimal string alignment: insert, delete, replace, and two neighbours swapped — a swapped pair
// is never edited again. One table for both callers (issue #311): how far a written answer is from
// its key (`editDistance`, the near-miss check in evaluate.ts) and where a Diktat answer first
// leaves its key (`align`, dictation.ts), which reads its edit script back out of the same table.

/**
 * `d[i][j]`: the distance between the first `i` elements of `a` and the first `j` of `b`. A string
 * is compared by its UTF-16 code units, like indexing it.
 */
export function osaTable<T>(
  a: ArrayLike<T>,
  b: ArrayLike<T>,
  eq: (x: T, y: T) => boolean,
): number[][] {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = eq(a[i - 1]!, b[j - 1]!) ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && eq(a[i - 1]!, b[j - 2]!) && eq(a[i - 2]!, b[j - 1]!)) {
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
      }
    }
  }
  return d;
}

/** The distance between two strings. */
export function editDistance(a: string, b: string): number {
  return osaTable(a, b, (x, y) => x === y)[a.length]![b.length]!;
}
