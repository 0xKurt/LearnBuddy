// A calm, rounded note across the screen (offline, a system hint). Soft tint,
// no hard box.

import { Text, View } from 'react-native';
import type { Palette } from '../../lib/theme/palettes.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';

type Tone = 'gray' | 'warning' | 'info' | 'danger';

// Built from the palette the component is rendering with: a module-scope map froze the
// start palette (issue #84).
const tones = (p: Palette): Record<Tone, { bg: string; color: string }> => ({
  gray: { bg: p.canvas, color: p.ink },
  warning: { bg: p.butter, color: p.warningText },
  info: { bg: p.lavender, color: p.primaryDk },
  danger: { bg: p.blush, color: p.ink },
});

export function Banner({ children, tone = 'gray' }: { children: string; tone?: Tone }) {
  const { palette } = useTheme();
  const t = tones(palette)[tone];
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
