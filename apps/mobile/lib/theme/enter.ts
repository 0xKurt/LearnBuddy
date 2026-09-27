// Layout animations built from the motion tokens (lib/theme/motion.ts): how a
// message, a card or a chip comes in, and how a list makes room. Calm — a fade
// with a small rise — and with reduce motion on, only the fade (never movement).
import { Platform } from 'react-native';
import { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import { DURATION, EASE, REDUCE, RISE, STAGGER } from './motion.js';

/**
 * Fade in with a small rise; `index` staggers things that come together (subtly).
 * The web build only fades: Reanimated's web layout animations pin an element with custom
 * initial values to an absolute position once they end (4.1), so no rise there.
 */
export function riseIn(index = 0, rise: number = RISE) {
  if (Platform.OS === 'web')
    return FadeIn.duration(DURATION.base)
      .easing(EASE.standard)
      .delay(Math.min(index, 4) * STAGGER)
      .reduceMotion(REDUCE);
  return FadeInDown.duration(DURATION.base)
    .easing(EASE.standard)
    .delay(Math.min(index, 4) * STAGGER)
    .withInitialValues({ opacity: 0, transform: [{ translateY: rise }] })
    .reduceMotion(REDUCE);
}

/** A quiet fade in (no movement): what replaces something in place. */
export function fadeIn(duration: number = DURATION.base) {
  return FadeIn.duration(duration).easing(EASE.standard).reduceMotion(REDUCE);
}

/** A quiet fade out. */
export function fadeOut(duration: number = DURATION.quick) {
  return FadeOut.duration(duration).easing(EASE.standard).reduceMotion(REDUCE);
}

/** Neighbours glide to their new place when a list changes. */
export const glide = LinearTransition.duration(DURATION.base)
  .easing(EASE.standard)
  .reduceMotion(REDUCE);
