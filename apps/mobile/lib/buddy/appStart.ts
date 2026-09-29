// The app's own start, claimed once (issue #104). A cold start begins a new session: this
// module is evaluated when the JavaScript process starts, so the flag it holds is true
// exactly once. Coming back from the background runs nothing here — and neither does the
// home being mounted a second time, so the greeting cannot come twice for one start.
//
// This is the one part of the rule that cannot be pure; what a cold start *means* is decided
// in sessionAnchor.ts, and tested there.

let unclaimed = true;

/** True for the first caller in this app process, false ever after. */
export function takeColdStart(): boolean {
  const first = unclaimed;
  unclaimed = false;
  return first;
}
