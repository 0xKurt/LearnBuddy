// A calm, rounded note across the screen (offline, a system hint). Soft tint,
// no hard box.

import { Text, View } from 'react-native';
import { LB } from '../../lib/theme/colors.js';

type Tone = 'gray' | 'warning' | 'info' | 'danger';

const TONES: Record<Tone, { bg: string; color: string }> = {
  gray: { bg: LB.canvas, color: LB.ink },
  warning: { bg: LB.butter, color: LB.warningText },
  info: { bg: LB.lavender, color: LB.primaryDk },
  danger: { bg: LB.blush, color: LB.ink },
};

export function Banner({ children, tone = 'gray' }: { children: string; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <View
      style={{
        backgroundColor: t.bg,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 18,
      }}
    >
      <Text style={{ color: t.color, fontSize: 15, fontWeight: '500', lineHeight: 21 }}>
        {children}
      </Text>
    </View>
  );
}
