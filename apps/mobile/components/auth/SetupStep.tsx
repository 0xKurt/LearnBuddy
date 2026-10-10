// One step of the setup that asks or tells one thing (issues #518, #526): Buddy's orb, a headline,
// what the step says, and its answers pinned at the bottom. The hand-over, the notification
// question and the voice step are this one shell, so they stand and breathe alike (Engineering-
// Regel 6: the same thing looks the same).

import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GUTTER, pinnedBar, RHYTHM, SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { BuddyOrb } from '../lb/BuddyOrb.js';
import { Screen } from '../lb/Screen.js';

export function SetupStep({
  title,
  children,
  footer,
  top = null,
  compact = false,
}: {
  title: string;
  /** What the step says or offers, under the headline. */
  children: ReactNode;
  /** Its answers, pinned at the bottom. */
  footer: ReactNode;
  /** Above everything, outside the scroll: a way back. */
  top?: ReactNode;
  /** The tighter rhythm a small phone needs (`formDensity`). */
  compact?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Screen>
      {top}
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingHorizontal: GUTTER,
          paddingVertical: compact ? SPACE.lg : SPACE.xl,
          gap: compact ? RHYTHM.stack : RHYTHM.sections,
        }}
      >
        <View style={{ alignItems: 'center' }}>
          <BuddyOrb size={compact ? 64 : 72} />
        </View>
        <Text accessibilityRole="header" style={[TYPE.display, { textAlign: 'center' }]}>
          {title}
        </Text>
        {children}
      </ScrollView>
      <View style={[pinnedBar(insets.bottom), { gap: SPACE.sm }]}>{footer}</View>
    </Screen>
  );
}
