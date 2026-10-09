// A surface for one thing. White paper cards float on a soft shadow (no hairline
// box); tinted cards (a subject pastel, the accent tint) sit flat on the page.

import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Palette, SubjectTone } from '../../lib/theme/palettes.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { CARD_PAD } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';

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

function backgroundFor(
  tone: Tone,
  p: Palette,
  toneBg: Record<SubjectTone, string>,
): { bg: string; color?: string } {
  if (tone === 'paper') return { bg: p.paper };
  if (tone === 'bg') return { bg: p.bg };
  if (tone === 'primary') return { bg: p.primary, color: p.paper };
  if (tone === 'primaryLt') return { bg: p.primaryLt };
  return { bg: toneBg[tone] };
}

export function Card({
  children,
  tone = 'paper',
  onPress,
  padding = CARD_PAD.base,
  radius = RADIUS.card,
  style,
  accessibilityLabel,
  accessibilityHint,
}: Props) {
  const { palette, tones } = useTheme();
  const { bg } = backgroundFor(tone, palette, tones.bg);
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
