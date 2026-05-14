import { Text, View } from 'react-native';
import { LB } from '../../lib/theme/colors.js';

type Tone = 'gray' | 'primary' | 'success' | 'warning' | 'dark';

const TONES: Record<Tone, { bg: string; color: string; border?: string }> = {
  gray: { bg: LB.bg, color: LB.ink, border: LB.hairline },
  primary: { bg: LB.primaryLt, color: LB.primaryDk },
  success: { bg: 'rgba(107,141,106,0.13)', color: LB.success },
  warning: { bg: 'rgba(181,138,60,0.13)', color: LB.warning },
  dark: { bg: LB.ink, color: '#fff' },
};

export function Chip({ children, tone = 'gray' }: { children: string; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <View
      style={{
        backgroundColor: t.bg,
        borderColor: t.border ?? 'transparent',
        borderWidth: t.border ? 1 : 0,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ color: t.color, fontSize: 11, fontWeight: '500' }}>{children}</Text>
    </View>
  );
}
