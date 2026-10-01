// Layout animations built from the motion tokens (lib/theme/motion.ts): how a message, a
// card or a chip comes in, and how a list makes room.
//
// Calm — a fade with a small rise — and with reduce motion on, ONLY the fade. That is what
// this file always claimed; until issue #126 it did the opposite. `ReduceMotion.System` on
// a `FadeIn` switches the whole animation off, so on a phone with animations disabled
// system-wide nothing faded at all: messages appeared in one frame, cards jumped, lists
// re-ordered with no transition. The owner read exactly that as "hakelig" — it does not
// stutter, it *jumps*.
//
// So the policy is decided here, not handed to Reanimated: what MOVES is dropped when the
// system asks for less motion, and the cross-fade stays. A fade is not motion.

import { Platform } from 'react-native';
import { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import { DURATION, EASE, motionIsReduced, REDUCE, REDUCE_NEVER, RISE, STAGGER } from './motion.js';
import { entersWith } from './reduceMotion.js';

/**
 * Which reduce-motion policy a cross-fade gets.
 *
 * On a phone: always play it — that is the whole point of issue #126. On the web: the
 * system setting still decides, because Reanimated's web layout animations are the
 * fragile part here (4.1 pins an element to an absolute position once one ends) and a
 * browser that asks for less motion is better served by no animation than by that.
 */
function fadePolicy() {
  return Platform.OS === 'web' ? REDUCE : REDUCE_NEVER;
}

/** Fade in with a small rise; `index` staggers things that come together (subtly). */
export function riseIn(index = 0, rise: number = RISE) {
  const delay = Math.min(index, 4) * STAGGER;
  if (entersWith(motionIsReduced(), Platform.OS) === 'fade')
    // The rise is already gone; what is left is a cross-fade, and on a phone that plays.
    return FadeIn.duration(DURATION.base)
      .easing(EASE.standard)
      .delay(delay)
      .reduceMotion(fadePolicy());
  return FadeInDown.duration(DURATION.base)
    .easing(EASE.standard)
    .delay(delay)
    .withInitialValues({ opacity: 0, transform: [{ translateY: rise }] })
    .reduceMotion(REDUCE_NEVER);
}

/** A quiet fade in (no movement): what replaces something in place. */
export function fadeIn(duration: number = DURATION.base) {
  return FadeIn.duration(duration).easing(EASE.standard).reduceMotion(fadePolicy());
}

/** A quiet fade out. */
export function fadeOut(duration: number = DURATION.quick) {
  return FadeOut.duration(duration).easing(EASE.standard).reduceMotion(fadePolicy());
}

/**
 * Neighbours glide to their new place when a list changes. This one really is movement
 * with no still equivalent — there is nothing to cross-fade to — so the system setting
 * decides and the row simply stands in its new place.
 */
export const glide = LinearTransition.duration(DURATION.base)
  .easing(EASE.standard)
  .reduceMotion(REDUCE);
