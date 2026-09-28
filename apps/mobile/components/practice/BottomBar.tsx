// The bar pinned to the bottom of the practice screen (the answer field or
// the next step). It sits outside the ScrollView and inside the screen's
// KeyboardAvoidingView, so the keyboard never covers it. No hard edge: it
// shares the screen's calm background, and what sits in it floats (the answer
// pill, round buttons), like the composer on Buddy's home.

import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LB } from '../../lib/theme/colors.js';
import { SPACE } from '../../lib/theme/space.js';

export function BottomBar({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        gap: SPACE.sm,
        paddingHorizontal: SPACE.lg,
        paddingTop: SPACE.sm,
        paddingBottom: Math.max(insets.bottom, SPACE.sm),
        backgroundColor: LB.bg,
      }}
    >
      {children}
    </View>
  );
}
