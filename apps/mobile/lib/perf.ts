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

/** What was measured in this app run (newest last). */
export function measured(): readonly PerfSpan[] {
  return spans;
}

/** The browser walkthrough reads this; on a phone it does nothing. */
function publish(): void {
  const global = globalThis as { __lbPerf?: PerfSpan[] };
  if (typeof document === 'undefined') return;
  global.__lbPerf = [...spans];
}
