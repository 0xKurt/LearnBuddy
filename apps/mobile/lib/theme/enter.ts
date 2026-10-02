// Layout animations built from the motion tokens (lib/theme/motion.ts): how a message, a
// card or a chip comes in, and how a list makes room.
//
// Calm — a fade with a small rise — and with reduce motion on, ONLY the fade. That is what
// this file always claimed; until issue #126 it did the opposite. It handed
// `ReduceMotion.System` to a `FadeIn`, and in Reanimated that does not shorten an animation,
// it skips it: a reduced animation starts with `current = toValue` and `onFrame = () => true`
// (4.1.7, src/animation/util.ts:495). So on a phone with animations disabled system-wide
// nothing faded at all: messages appeared in one frame, cards jumped, lists re-ordered with
// no transition. The owner read exactly that as "hakelig" — it does not stutter, it *jumps*.
//
// So the policy is decided in lib/theme/reduceMotion.ts, not handed to Reanimated: what
// MOVES is dropped when the system asks for less motion, and the cross-fade stays. A fade is
// not motion. This file only translates that answer into a builder — the fade becomes a
// `FadeIn` (opacity only, no transform at all), the rise a `FadeInDown` (opacity plus
// `translateY`), both with the policy the plan asked for.

import { Platform } from 'react-native';
import { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import {
  DURATION,
  EASE,
  fadeReduce,
  motionIsReduced,
  REDUCE,
  REDUCE_NEVER,
  RISE,
  STAGGER,
} from './motion.js';
import { enterPlan, type FadePolicy } from './reduceMotion.js';

/** The plan's fade policy as Reanimated's enum. `always` is what keeps a fade a fade. */
function reduceMotionFor(fade: FadePolicy) {
  return fade === 'always' ? REDUCE_NEVER : REDUCE;
}

/**
 * Fade in with a small rise; `index` staggers things that come together (subtly).
 *
 * With reduce motion on the rise is gone and the fade remains — same `DURATION.base` either
 * way, because the fade *replaces* the rise rather than standing in for nothing: the app
 * keeps one rhythm whether or not the setting is on, long enough to read as a cross-fade and
 * far short of a dissolve. The stagger stays too — a delay is timing, not movement.
 */
export function riseIn(index = 0, rise: number = RISE) {
  const delay = Math.min(index, 4) * STAGGER;
  const plan = enterPlan(motionIsReduced(), Platform.OS);
  if (!plan.moves)
    return FadeIn.duration(DURATION.base)
      .easing(EASE.standard)
      .delay(delay)
      .reduceMotion(reduceMotionFor(plan.fade));
  return FadeInDown.duration(DURATION.base)
    .easing(EASE.standard)
    .delay(delay)
    .withInitialValues({ opacity: 0, transform: [{ translateY: rise }] })
    .reduceMotion(reduceMotionFor(plan.fade));
}

/** A quiet fade in (no movement): what replaces something in place. */
export function fadeIn(duration: number = DURATION.base) {
  return FadeIn.duration(duration).easing(EASE.standard).reduceMotion(fadeReduce());
}

/** A quiet fade out. */
export function fadeOut(duration: number = DURATION.quick) {
  return FadeOut.duration(duration).easing(EASE.standard).reduceMotion(fadeReduce());
}

/**
 * Neighbours glide to their new place when a list changes. This one really is movement
 * with no still equivalent — there is nothing to cross-fade to — so the system setting
 * decides and the row simply stands in its new place.
 */
export const glide = LinearTransition.duration(DURATION.base)
  .easing(EASE.standard)
  .reduceMotion(REDUCE);
