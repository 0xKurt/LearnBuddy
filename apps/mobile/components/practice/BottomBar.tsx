// The bar pinned to the bottom of the practice screen (the answer field or
// the next step). It sits outside the ScrollView and inside the screen's
// KeyboardAvoidingView, so the keyboard never covers it. No hard edge: it
// shares the screen's calm background, and what sits in it floats (the answer
// pill, round buttons), like the composer on Buddy's home.

import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE } from '../../lib/theme/space.js';
import { useToastBar } from '../lb/Toast.js';

export function BottomBar({ children }: { children: ReactNode }) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  // A toast stands above this bar, not on the question (issue #91).
  const onToastBar = useToastBar();
  return (
    <View
      // The walkthrough measures this bar: what it takes is what the question loses
      // on a small phone with the keyboard open (issue #16).
      testID="bottom-bar"
      onLayout={onToastBar}
      style={{
        gap: SPACE.sm,
        paddingHorizontal: SPACE.lg,
        paddingTop: SPACE.sm,
        paddingBottom: Math.max(insets.bottom, SPACE.sm),
        backgroundColor: palette.bg,
      }}
    >
      {children}
    </View>
  );
}
