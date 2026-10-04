// The bar pinned to the bottom of a screen: the chat's input bar, a practice answer's input bar
// and "Prüfen", "Weiter" (issue #365: one bar for both, before this the chat built its own frame
// with other paddings). It sits outside the ScrollView and inside the screen's `KeyboardSafe`, so
// the keyboard never covers it. No hard edge: it shares the screen's calm background, and what
// sits in it floats (the input bar's pill, round buttons).

import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE, bottomRoom } from '../../lib/theme/space.js';
import { useToastBar } from './Toast.js';

export function BottomBar({
  children,
  testID = 'bottom-bar',
}: {
  children: ReactNode;
  /**
   * What the walkthrough measures it by: what it takes is what the question or the conversation
   * loses on a small phone with the keyboard open (issue #16).
   */
  testID?: string;
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  // A toast stands above this bar, not on the question or the conversation (issue #91).
  const onToastBar = useToastBar();
  return (
    <View
      testID={testID}
      onLayout={onToastBar}
      style={{
        gap: SPACE.sm,
        paddingHorizontal: SPACE.lg,
        paddingTop: SPACE.sm,
        paddingBottom: bottomRoom(insets.bottom, SPACE.md),
        backgroundColor: palette.bg,
      }}
    >
      {children}
    </View>
  );
}
