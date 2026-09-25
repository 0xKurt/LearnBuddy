// A small insert key (the math keys above the answer field): the same
// structure as <Btn> — Pressable outside, the background on the inner View —
// square, at least 44 × 44 pt.

import { Pressable, Text, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';

type Props = {
  /** What the key shows. */
  children: string;
  /** What a screen reader says ("hoch 2"), never just the glyph. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  onPress: () => void;
  disabled?: boolean;
};

export function KeyCap({
  children,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  disabled = false,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      android_ripple={{ color: 'rgba(0,0,0,0.1)', borderless: false }}
      style={{ borderRadius: 12, overflow: 'hidden', opacity: disabled ? 0.6 : 1 }}
    >
      {({ pressed }) => (
        <View
          style={{
            minWidth: 44,
            height: 44,
            paddingHorizontal: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#fff',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: LB.hairline,
            opacity: pressed ? 0.78 : 1,
          }}
        >
          <Text style={{ color: LB.ink, fontSize: 20, lineHeight: 24, fontWeight: '600' }}>
            {children}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
