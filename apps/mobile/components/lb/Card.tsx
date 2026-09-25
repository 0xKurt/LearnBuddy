// A surface for one thing. White paper cards float on a soft shadow (no hairline
// box); tinted cards (a subject pastel, the accent tint) sit flat on the page.

import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { LB, TONE_BG, type SubjectTone } from '../../lib/theme/colors.js';
import { SHADOW } from '../../lib/theme/shadow.js';

type Tone = 'paper' | 'bg' | 'primary' | 'primaryLt' | SubjectTone;

type Props = {
  children: React.ReactNode;
  tone?: Tone;
  onPress?: () => void;
  padding?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

function backgroundFor(tone: Tone): { bg: string; color?: string } {
  if (tone === 'paper') return { bg: LB.paper };
  if (tone === 'bg') return { bg: LB.bg };
  if (tone === 'primary') return { bg: LB.primary, color: '#fff' };
  if (tone === 'primaryLt') return { bg: LB.primaryLt };
  return { bg: TONE_BG[tone] };
}

export function Card({
  children,
  tone = 'paper',
  onPress,
  padding = 18,
  radius = 22,
  style,
  accessibilityLabel,
  accessibilityHint,
}: Props) {
  const { bg } = backgroundFor(tone);
  const isPaper = tone === 'paper';
  const baseStyle: ViewStyle = {
    backgroundColor: bg,
    borderRadius: radius,
    padding,
    ...(isPaper ? SHADOW.soft : null),
  };
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
      >
        {({ pressed }) => (
          <View style={[baseStyle, style, pressed ? { opacity: 0.85 } : null]}>{children}</View>
        )}
      </Pressable>
    );
  }
  return (
    <View
      accessibilityRole={accessibilityLabel ? 'summary' : undefined}
      accessibilityLabel={accessibilityLabel}
      style={[baseStyle, style]}
    >
      {children}
    </View>
  );
}
