// The hand-off from the native splash screen to the app. The native splash
// (app.json, expo-splash-screen) shows Buddy's orb and its moon on the page colour; this
// overlay draws exactly the same picture in the same place, so the native one
// can go without a flicker. Once the app is ready the orb settles (a small
// shrink) while the overlay fades away, and the first screen is there.
// Reduce motion: only the fade. Never catches a touch; hidden from screen readers.
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { DURATION, EASE, fadeTiming } from '../../lib/theme/motion.js';
import { BuddyOrb, FILL } from './BuddyOrb.js';

// Must be called at start-up, before the first render (expo-splash-screen).
if (Platform.OS !== 'web') void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** The native splash's image width (app.json → expo-splash-screen → imageWidth). */
export const SPLASH_IMAGE_WIDTH = 200;

export function SplashHandoff({ ready }: { ready: boolean }) {
  const { palette } = useTheme();
  const reduce = useReducedMotion();
  const [gone, setGone] = useState(false);
  const fade = useSharedValue(1);
  const settle = useSharedValue(0);

  useEffect(() => {
    if (!ready) return;
    const done = () => setGone(true);
    settle.value = withTiming(1, { duration: DURATION.gentle, easing: EASE.standard });
    // The veil cross-fades even under reduce motion — a bare `withTiming` would skip and
    // cut from the splash to the app in one frame (issue #126). The settle is a scale, and
    // is dropped below.
    fade.value = withTiming(0, fadeTiming(DURATION.gentle), (finished) => {
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
      // Inline, not StyleSheet.create at module scope: that froze the start palette's
      // background into the veil (issue #84).
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: palette.bg,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        },
        veil,
      ]}
      // The same picture as the native splash is on screen: that one can go.
      onLayout={() => {
        if (Platform.OS !== 'web') SplashScreen.hide();
      }}
    >
      <Animated.View style={orb}>
        {/* Buddy drawn, not the baked picture (issue #192).
            `assets/splash-icon.png` carries its background baked in, on purpose: Android's
            NATIVE splash renderer composites straight-alpha PNGs wrongly and turns the
            glow into grey fringes (scripts/brand/render-icons.mjs says so). But the baked
            colour is the LIGHT page colour, and this view paints `palette.bg` behind it —
            so on the night palette it was a white square with the orb inside it, which is
            what the owner saw on 01.10.: "die sphere mit weissem hintergrund und nicht
            transparent".
            Here there is no native splash renderer, so there is no reason to carry a
            background: the same orb, from the same geometry, on whatever ground her
            colours give it. The size is matched to the baked picture (the asset draws the
            ball at r = 285/1024 of its canvas, BuddyOrb at 0.48/2 of its box) so the
            hand-off from the native splash does not jump. */}
        <BuddyOrb
          size={Math.round((SPLASH_IMAGE_WIDTH * (285 / 1024)) / (FILL / 2))}
          breathe={false}
        />
      </Animated.View>
    </Animated.View>
  );
}
