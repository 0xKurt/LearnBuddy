// What "reduce motion" means here, as one pure decision (issue #126).
//
// Reduce motion means REPLACE movement with a cross-fade, not "show no transition at all"
// — WCAG 2.3.3 and Apple's own guidance both say so. Handing Reanimated's
// `ReduceMotion.System` to a `FadeIn` does the opposite: it switches the whole animation
// off, so on a phone with animations disabled system-wide nothing faded. Messages appeared
// in one frame, cards jumped, lists re-ordered with no transition. The owner read exactly
// that as "hakelig" (30.09.) — it does not stutter, it jumps.
//
// No imports: this is the piece the tests can hold on to.

/** Whether an entering element may rise, or only fade in place. */
export function entersWith(reduced: boolean, platform: string): 'fade' | 'rise' {
  // The web only ever fades: Reanimated's web layout animations pin an element with custom
  // initial values to an absolute position once they end (4.1).
  return reduced || platform === 'web' ? 'fade' : 'rise';
}
