// One case, several runs (issue #225). The model's decision is not deterministic: the insult
// case set `concern` in roughly one of five runs (1/6 · 2/8 · 2/10, measured 02.10.2026), and a
// case that falls over one time in five is not checked by running it once. This is the pure
// part of the runner — how many runs a case gets and whether the runs together pass — so it is
// proven in __tests__/repeat.test.ts without a model or a database.
// requires live verification in Claude Code session (part of the live-model eval runner)

/** How often a case runs, and how many of those runs may fail before the case fails. */
export type Repeat = { runs: number; maxFailures: number };

/** What the runs of one case add up to. */
export type RunsVerdict = {
  ok: boolean;
  runs: number;
  failures: number;
  /** Empty when the case passed; otherwise the count and every distinct problem with its tally. */
  problems: string[];
};

/** Throws on a threshold that cannot mean anything, instead of quietly running it. */
export function validateRepeat(id: string, repeat: Repeat): void {
  if (!Number.isInteger(repeat.runs) || repeat.runs < 2)
    throw new Error(`${id}: repeat.runs must be a whole number of at least 2 (got ${repeat.runs})`);
  if (
    !Number.isInteger(repeat.maxFailures) ||
    repeat.maxFailures < 0 ||
    repeat.maxFailures >= repeat.runs
  )
    throw new Error(
      `${id}: repeat.maxFailures must be a whole number from 0 to ${repeat.runs - 1} (got ${repeat.maxFailures})`,
    );
}

/** How many times the runner sends this case. */
export function runsFor(c: { id: string; repeat?: Repeat }): number {
  if (!c.repeat) return 1;
  validateRepeat(c.id, c.repeat);
  return c.repeat.runs;
}

/**
 * Judges a case from the problems of each of its runs (one array per run, empty = that run
 * passed). Without `repeat` there is exactly one run and the verdict is that run's. With it,
 * the case passes only when every planned run happened and no more than `maxFailures` failed —
 * a run that never happened is not a run that passed.
 */
export function judgeRuns(
  id: string,
  perRun: readonly (readonly string[])[],
  repeat?: Repeat,
): RunsVerdict {
  const failures = perRun.filter((p) => p.length > 0).length;
  if (!repeat) {
    if (perRun.length !== 1) throw new Error(`${id}: one run expected, got ${perRun.length}`);
    const only = perRun[0] ?? [];
    return { ok: only.length === 0, runs: 1, failures, problems: [...only] };
  }
  validateRepeat(id, repeat);
  const complete = perRun.length === repeat.runs;
  const ok = complete && failures <= repeat.maxFailures;
  if (ok) return { ok, runs: perRun.length, failures, problems: [] };

  // Every distinct problem once, with how many runs it appeared in — "2×" says more than the
  // same line printed twice.
  const tally = new Map<string, number>();
  for (const run of perRun) for (const p of new Set(run)) tally.set(p, (tally.get(p) ?? 0) + 1);
  return {
    ok,
    runs: perRun.length,
    failures,
    problems: [
      complete
        ? `${failures} of ${repeat.runs} runs failed (allowed: ${repeat.maxFailures})`
        : `only ${perRun.length} of ${repeat.runs} runs happened (${failures} failed)`,
      ...[...tally].map(([p, n]) => `${p} (${n}×)`),
    ],
  };
}
