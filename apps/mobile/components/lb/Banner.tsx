import { Text, View } from 'react-native';
import { LB } from '../../lib/theme/colors.js';

type Tone = 'gray' | 'warning' | 'info' | 'danger';

const TONES: Record<Tone, { bg: string; color: string; border: string }> = {
  gray: { bg: LB.bg, color: LB.ink, border: LB.hairline },
  warning: { bg: 'rgba(181,138,60,0.10)', color: LB.warning, border: 'rgba(181,138,60,0.25)' },
  info: { bg: LB.primaryLt, color: LB.primaryDk, border: 'rgba(177,113,92,0.20)' },
  danger: { bg: 'rgba(177,73,60,0.08)', color: LB.danger, border: 'rgba(177,73,60,0.20)' },
};

export function Banner({ children, tone = 'gray' }: { children: string; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <View
      style={{
        backgroundColor: t.bg,
        borderColor: t.border,
        borderWidth: 1,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 12,
      }}
    >
      <Text style={{ color: t.color, fontSize: 12, fontWeight: '500', lineHeight: 17 }}>
        {children}
      </Text>
    </View>
  );
}
