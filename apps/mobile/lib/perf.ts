// How long the app takes to react to a tap (issue #66). Everything we measured so far was
// server-side; what the learner feels starts earlier — the moment her finger lifts.
//
// One pair per action: `tapped('send')` when the handler runs, `reacted('send')` when the
// screen shows the consequence (her bubble appears, the session opens, the verdict shows).
// The span between them is what she calls "hängt". Kept in memory only, never sent anywhere;
// on the web it is also exposed for the walkthrough to read (tests/web/perf.ts).

const MAX_SPANS = 100;

export type PerfSpan = { action: string; ms: number };

const open = new Map<string, number>();
const spans: PerfSpan[] = [];

/** The moment the tap is handled. A second tap of the same action replaces the first. */
export function tapped(action: string): void {
  open.set(action, Date.now());
}

/** The moment she can see the result of that tap. Unknown actions are ignored. */
export function reacted(action: string): void {
  const at = open.get(action);
  if (at === undefined) return;
  open.delete(action);
  spans.push({ action, ms: Date.now() - at });
  if (spans.length > MAX_SPANS) spans.shift();
  publish();
}

/**
 * The action led nowhere she could see (the talk loop paused instead of listening again,
 * the turn failed): the mark is forgotten, so a later unrelated `reacted` never counts
 * her thinking time as the app's.
 */
export function dropped(action: string): void {
  open.delete(action);
}

/** What was measured in this app run (newest last). */
export function measured(): readonly PerfSpan[] {
  return spans;
}

/**
 * The browser walkthrough reads the global; on a phone there is no DOM, so a development
 * build writes the span to the log instead — otherwise the numbers exist and nobody can
 * read them (issue #41: the device measurement was blocked on exactly this).
 * `adb logcat -s ReactNativeJS | grep lb-perf` on Android, the Metro console everywhere.
 * Never in a release build: this is a measuring aid, not telemetry, and nothing leaves
 * the device either way.
 */
function publish(): void {
  const span = spans[spans.length - 1];
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
