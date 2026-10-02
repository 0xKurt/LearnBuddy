// What "reduce motion" means here, as pure decisions (issue #126).
//
// Reduce motion means REPLACE movement with a cross-fade, not "show no transition at all" —
// WCAG 2.3.3 and Apple's own guidance both say so. Handing Reanimated's
// `ReduceMotion.System` to a `FadeIn` does the opposite, and not by a little: in 4.1.7 a
// reduced animation is not shortened, it is skipped. `getReduceMotionFromConfig` resolves
// `System` against the live system value, and `decorateAnimation`'s `onStart` answers a
// reduced animation with `current = toValue; onFrame = () => true` — the first frame is also
// the last (react-native-reanimated/src/animation/util.ts, lines 148 and 495). So on a phone
// with animations disabled system-wide nothing faded. Messages appeared in one frame, cards
// jumped, lists re-ordered with no transition. The owner read exactly that as "hakelig"
// (30.09.) — it does not stutter, it jumps.
//
// No imports: this is the piece the tests can hold on to. `enter.ts` only translates these
// answers into Reanimated builders, so the promise in its header is checked here.

/** Who decides whether a cross-fade plays at all. */
export type FadePolicy = 'always' | 'system';

/** What an element entering the screen does. */
export type EnterPlan = {
  /** `true`: it rises into place. `false`: it fades in place and nothing moves. */
  moves: boolean;
  /** Whether the cross-fade itself survives the system's reduce-motion setting. */
  fade: FadePolicy;
};

/**
 * A cross-fade always plays on a phone — that is the whole point of issue #126. The app has
 * already decided what moves; asking Reanimated the same question a second time can only
 * take the fade away too. The app's reading is also the fresher one: Reanimated captures the
 * system value once, when its native module installs, while `motionIsReduced()` keeps
 * listening for changes.
 *
 * On the web the system setting still decides, because Reanimated's web layout animations
 * are the fragile part here (4.1 pins an element with custom initial values to an absolute
 * position once one ends) and a browser asking for less motion is better served by no
 * animation than by that.
 */
export function fadePolicy(platform: string): FadePolicy {
  return platform === 'web' ? 'system' : 'always';
}

/** How something enters: the fade alone, or the fade with its small rise. */
export function enterPlan(reduced: boolean, platform: string): EnterPlan {
  // The web never rises either — same Reanimated 4.1 web bug as above.
  return { moves: !reduced && platform !== 'web', fade: fadePolicy(platform) };
}
