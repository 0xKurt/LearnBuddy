// How long the app takes to react to a tap (issue #66). Everything we measured so far was
// server-side; what the learner feels starts earlier — the moment her finger lifts.
//
// One pair per action: `tapped('send')` when the handler runs, `reacted('send')` when the
// screen shows the consequence (her bubble appears, the session opens, the verdict shows).
// The span between them is what she calls "hängt".
//
// Since issue #169 the spans also leave the device — but only summed up: per action, how many
// waits fell into which fixed bucket (`PerfReport`, packages/shared-types/src/contracts/perf.ts).
// No single measurement, no time of day, no content, no name; the actions and buckets are a
// fixed list, so nothing she typed can ride along (docs/privacy.md §Device timing).
// `lib/perfReport.ts` sends them; this file stays free of React Native (unit-tested).

import {
  perfBucket,
  type PerfAction,
  type PerfCounter,
  type PerfReport,
} from '@learnbuddy/shared-types/contracts';

const MAX_SPANS = 100;

export type PerfSpan = { action: PerfAction; ms: number };

const open = new Map<PerfAction, number>();
const spans: PerfSpan[] = [];
/** Counts per action and bucket since the last report (`action|bucket` → n). */
let buckets = new Map<string, number>();
let counts = new Map<PerfCounter, number>();
const listeners = new Set<(pending: number) => void>();

/** The moment the tap is handled. A second tap of the same action replaces the first. */
export function tapped(action: PerfAction): void {
  open.set(action, Date.now());
}

/** The moment she can see the result of that tap. Unknown actions are ignored. */
export function reacted(action: PerfAction): void {
  const at = open.get(action);
  if (at === undefined) return;
  open.delete(action);
  const ms = Date.now() - at;
  spans.push({ action, ms });
  if (spans.length > MAX_SPANS) spans.shift();
  const key = `${action}|${perfBucket(ms)}`;
  buckets.set(key, (buckets.get(key) ?? 0) + 1);
  publish();
}

/**
 * The action led nowhere she could see (the talk loop paused instead of listening again,
 * the turn failed): the mark is forgotten, so a later unrelated `reacted` never counts
 * her thinking time as the app's.
 */
export function dropped(action: PerfAction): void {
  open.delete(action);
}

/** Whether a mark is open — what was prepared ahead may say whether it was in time. */
export function waiting(action: PerfAction): boolean {
  return open.has(action);
}

/** Something happened that has no duration (what was prepared ahead was used, or not). */
export function counted(counter: PerfCounter): void {
  counts.set(counter, (counts.get(counter) ?? 0) + 1);
  for (const l of [...listeners]) l(pendingCount());
}

/** What was measured in this app run (newest last). */
export function measured(): readonly PerfSpan[] {
  return spans;
}

function pendingCount(): number {
  let n = 0;
  for (const v of buckets.values()) n += v;
  for (const v of counts.values()) n += v;
  return n;
}

/** Called after every new measurement with how many are waiting to be reported. */
export function onMeasured(listener: (pending: number) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Everything measured since the last report, summed up, and forgotten here. Null when there is
 * nothing. `giveBack` puts a report that could not be sent back (bounded by the buckets: a phone
 * offline for a week still holds a few dozen numbers, never a growing list).
 */
export function takeReport(
  platform: PerfReport['platform'],
  build: PerfReport['build'],
): PerfReport | null {
  if (buckets.size === 0 && counts.size === 0) return null;
  const report: PerfReport = {
    platform,
    build,
    spans: [...buckets].map(([key, count]) => {
      const [action, bucket] = key.split('|') as [PerfAction, string];
      return { action, bucket_ms: Number(bucket), count: Math.min(count, 500) };
    }),
    counters: [...counts].map(([counter, count]) => ({ counter, count: Math.min(count, 500) })),
  };
  buckets = new Map();
  counts = new Map();
  return report;
}

export function giveBack(report: PerfReport): void {
  for (const s of report.spans) {
    const key = `${s.action}|${s.bucket_ms}`;
    buckets.set(key, Math.min(500, (buckets.get(key) ?? 0) + s.count));
  }
  for (const c of report.counters) {
    counts.set(c.counter, Math.min(500, (counts.get(c.counter) ?? 0) + c.count));
  }
}

/**
 * The browser walkthrough reads the global; on a phone there is no DOM, so a development
 * build writes the span to the log instead — `adb logcat -s ReactNativeJS | grep lb-perf` on
 * Android, the Metro console everywhere. What leaves the device is only the summed-up report
 * above.
 */
function publish(): void {
  const span = spans[spans.length - 1];
  for (const l of [...listeners]) l(pendingCount());
  if (typeof document === 'undefined') {
    // `typeof` and not a bare __DEV__: the unit tests run under vitest, where the bundler's
    // global does not exist at all.
    if (span && typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log(`[lb-perf] ${span.action} ${span.ms}ms`);
    }
    return;
  }
  const global = globalThis as { __lbPerf?: PerfSpan[] };
  global.__lbPerf = [...spans];
}
