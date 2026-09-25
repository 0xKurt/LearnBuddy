// The bar pinned to the bottom of the practice screen (the answer field or
// the next step). It sits outside the ScrollView and inside the screen's
// KeyboardAvoidingView, so the keyboard never covers it.

import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LB } from '../../lib/theme/colors.js';

export function BottomBar({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        gap: 10,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: Math.max(insets.bottom, 12),
        backgroundColor: LB.paper,
        borderTopWidth: 1,
        borderTopColor: LB.hairline,
      }}
    >
      {children}
    </View>
  );
}
