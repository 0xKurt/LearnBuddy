import { Text, View } from 'react-native';
import { LB } from '../../lib/theme/colors.js';

type Tone = 'gray' | 'primary' | 'success' | 'warning' | 'dark';

const TONES: Record<Tone, { bg: string; color: string; border?: string }> = {
  gray: { bg: LB.canvas, color: LB.ink2 },
  primary: { bg: LB.primaryLt, color: LB.primaryDk },
  success: { bg: 'rgba(107,141,106,0.13)', color: LB.successText },
  warning: { bg: 'rgba(181,138,60,0.13)', color: LB.warningText },
  dark: { bg: LB.ink, color: '#fff' },
};

export function Chip({ children, tone = 'gray' }: { children: string; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={children}
      style={{
        backgroundColor: t.bg,
        borderColor: t.border ?? 'transparent',
        borderWidth: t.border ? 1 : 0,
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 999,
        alignSelf: 'flex-start',
        maxWidth: '100%',
      }}
    >
      <Text style={{ color: t.color, fontSize: 13, lineHeight: 17, fontWeight: '600' }}>
        {children}
      </Text>
    </View>
  );
}
