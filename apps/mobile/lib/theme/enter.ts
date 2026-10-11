// Shared layout transitions; reduced motion disables movement and fades.
import { Platform } from 'react-native';
import {
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  type LayoutAnimationFunction,
} from 'react-native-reanimated';

import {
  DURATION,
  EASE,
  motionIsReduced,
  reducedMotionValue,
  onReducedMotionChange,
  RISE,
  STAGGER,
} from './motion.js';
import { enterPlan } from './reduceMotion.js';

/** A calm rise, with no transition or stagger under reduced motion. */
export function riseIn(index = 0, rise: number = RISE) {
  const reduced = motionIsReduced();
  const delay = reduced ? 0 : Math.min(index, 4) * STAGGER;
  const plan = enterPlan(reduced, Platform.OS);
  if (!plan.moves)
    return FadeIn.duration(reduced ? 0 : DURATION.base)
      .easing(EASE.standard)
      .delay(delay)
      .reduceMotion(reduced ? ReduceMotion.Always : ReduceMotion.Never);
  return FadeInDown.duration(DURATION.base)
    .easing(EASE.standard)
    .delay(delay)
    .withInitialValues({ opacity: 0, transform: [{ translateY: rise }] })
    .reduceMotion(reduced ? ReduceMotion.Always : ReduceMotion.Never);
}

/** A quiet fade in (no movement): what replaces something in place. */
export function fadeIn(duration: number = DURATION.base) {
  return FadeIn.duration(motionIsReduced() ? 0 : duration)
    .easing(EASE.standard)
    .reduceMotion(motionIsReduced() ? ReduceMotion.Always : ReduceMotion.Never);
}

/** A quiet fade out. */
export function fadeOut(duration: number = DURATION.quick) {
  return FadeOut.duration(motionIsReduced() ? 0 : duration)
    .easing(EASE.standard)
    .reduceMotion(motionIsReduced() ? ReduceMotion.Always : ReduceMotion.Never);
}

/**
 * Neighbours glide to their new place when a list changes. This one really is movement
 * with no still equivalent — there is nothing to cross-fade to — so the system setting
 * decides and the row simply stands in its new place.
 */
const glideBuilder = LinearTransition.duration(DURATION.base)
  .easing(EASE.standard)
  .reduceMotion(ReduceMotion.Never);
const animatedGlide = glideBuilder.build();

/** Read on the UI thread for every layout change, including after a live OS toggle. */
const liveGlide: LayoutAnimationFunction = (values) => {
  'worklet';
  if (!reducedMotionValue.value) return animatedGlide(values);
  return {
    initialValues: {
      originX: values.targetOriginX,
      originY: values.targetOriginY,
      width: values.targetWidth,
      height: values.targetHeight,
    },
    animations: {},
  };
};

// Web accepts predefined builders only and caches its System preference. Keep the
// same builder identity while updating its explicit policy for the next layout change.
if (Platform.OS === 'web') {
  const syncGlide = () =>
    glideBuilder.reduceMotion(motionIsReduced() ? ReduceMotion.Always : ReduceMotion.Never);
  syncGlide();
  onReducedMotionChange(syncGlide);
}
export const glide = Platform.OS === 'web' ? glideBuilder : liveGlide;
