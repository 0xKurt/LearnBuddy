// How long the app takes to react to a tap (issue #66). Everything we measured so far was
// server-side; what the learner feels starts earlier — the moment her finger lifts.
//
// One pair per action: `tapped('send')` when the handler runs, `reacted('send')` when the
// screen shows the consequence (her bubble appears, the session opens, the verdict shows).
// The span between them is what she calls "hängt". Kept in memory only, never sent anywhere;
// on the web it is also exposed for the walkthrough to read (tests/web/perf.ts).

import { ENV } from './env.js';

const MAX_SPANS = 100;

export type PerfSpan = {
  action: string;
  ms: number;
  /** For a request (#649): when its headers came, and what the server says it spent. */
  detail?: string;
};

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
  record({ action, ms: Date.now() - at });
}

/**
 * The action led nowhere she could see (the talk loop paused instead of listening again,
 * the turn failed): the mark is forgotten, so a later unrelated `reacted` never counts
 * her thinking time as the app's.
 */
export function dropped(action: string): void {
  open.delete(action);
}

/** Ids in a path stand for one route: `/practice/sessions/<uuid>/answer` → `…/:id/answer`. */
export function routeOf(path: string): string {
  return path
    .split('?')[0]!
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id');
}

/**
 * One API request, split where the app can see it (#649, KI-Audit F2 (2)): fetch start → headers
 * → parsed, with the server's own `Server-Timing` (auth, db, model …). Lined up, the phone's wait
 * falls apart into the way there and back, the server, and the app reading the answer.
 */
export function requested(
  method: string,
  path: string,
  timing: { headersMs: number; totalMs: number; server: string | null },
): void {
  record({
    action: `api ${method} ${routeOf(path)}`,
    ms: timing.totalMs,
    detail: `headers=${timing.headersMs}${timing.server ? ` server=${timing.server}` : ''}`,
  });
}

function record(span: PerfSpan): void {
  spans.push(span);
  if (spans.length > MAX_SPANS) spans.shift();
  publish();
}

/** What was measured in this app run (newest last). */
export function measured(): readonly PerfSpan[] {
  return spans;
}

/**
 * Whether spans go to the phone's log: a development build, a release-mode JS run for a
 * device measurement (`EXPO_PUBLIC_PERF_LOG=1` on Metro, issue #711), or a preview build
 * (`INTERNAL_BUILD`, #649: the owner's measurement runs on a preview build, not the dev client).
 * Babel inlines the variables; in a store build both are unset and the branch is dead code. The spans themselves stay a ring of the last MAX_SPANS, in memory only.
 */
function logsSpans(): boolean {
  return (typeof __DEV__ !== 'undefined' && __DEV__) || ENV.PERF_LOG || ENV.INTERNAL_BUILD;
}

/**
 * The browser walkthrough reads the global; on a phone there is no DOM, so a development
 * build writes the span to the log instead — otherwise the numbers exist and nobody can
 * read them (issue #41: the device measurement was blocked on exactly this).
 * `adb logcat -s ReactNativeJS | grep lb-perf` on Android, the Metro console everywhere.
 * Never in a store build: this is a measuring aid, not telemetry, and nothing leaves
 * the device either way.
 */
function publish(): void {
  const span = spans[spans.length - 1];
  if (typeof document === 'undefined') {
    // `typeof` and not a bare __DEV__: the unit tests run under vitest, where the bundler's
    // global does not exist at all.
    if (span && logsSpans()) {
      console.log(`[lb-perf] ${span.action} ${span.ms}ms${span.detail ? ` ${span.detail}` : ''}`);
    }
    return;
  }
  const global = globalThis as { __lbPerf?: PerfSpan[] };
  global.__lbPerf = [...spans];
}
