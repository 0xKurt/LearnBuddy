// The hand-off from the native splash screen to the app. The native splash
// (app.json, expo-splash-screen) shows Buddy's orb and its moon on the page colour; this
// overlay draws exactly the same picture in the same place, so the native one
// can go without a flicker. Once the app is ready the orb settles (a small
// shrink) while the overlay fades away, and the first screen is there.
// Reduce motion: only the fade. Never catches a touch; hidden from screen readers.
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Image, Platform, StyleSheet } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import SPLASH_IMAGE from '../../assets/splash-icon.png';
import { LB } from '../../lib/theme/colors.js';
import { DURATION, EASE } from '../../lib/theme/motion.js';

// Must be called at start-up, before the first render (expo-splash-screen).
if (Platform.OS !== 'web') void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** The native splash's image width (app.json → expo-splash-screen → imageWidth). */
export const SPLASH_IMAGE_WIDTH = 200;

export function SplashHandoff({ ready }: { ready: boolean }) {
  const reduce = useReducedMotion();
  const [gone, setGone] = useState(false);
  const fade = useSharedValue(1);
  const settle = useSharedValue(0);

  useEffect(() => {
    if (!ready) return;
    const done = () => setGone(true);
    settle.value = withTiming(1, { duration: DURATION.gentle, easing: EASE.standard });
    fade.value = withTiming(0, { duration: DURATION.gentle, easing: EASE.standard }, (finished) => {
      if (finished) runOnJS(done)();
    });
  }, [ready, fade, settle]);

  const veil = useAnimatedStyle(() => ({ opacity: fade.value }));
  const orb = useAnimatedStyle(() => ({
    transform: [{ scale: reduce ? 1 : 1 - 0.14 * settle.value }],
  }));

  if (gone) return null;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.veil, veil]}
      // The same picture as the native splash is on screen: that one can go.
      onLayout={() => {
        if (Platform.OS !== 'web') SplashScreen.hide();
      }}
    >
      <Animated.View style={orb}>
        <Image
          source={SPLASH_IMAGE}
          style={{ width: SPLASH_IMAGE_WIDTH, height: SPLASH_IMAGE_WIDTH }}
          resizeMode="contain"
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  veil: {
    backgroundColor: LB.bg,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});
