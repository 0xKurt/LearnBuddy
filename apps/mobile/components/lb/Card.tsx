// A surface for one thing (components/core/Card.jsx). White paper cards float on a soft shadow
// (no hairline box); `selected` (Buddy's state, a choice) and `sunken` (a quiet group) sit flat on
// the page, like the tinted cards from before the redesign.

import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Palette, SubjectTone } from '../../lib/theme/palettes.js';
import { UI } from '../../lib/theme/components.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { CARD_PAD, SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';

/** The design's three, then the names from before the redesign (aliases, owner rule 6). */
type Tone = 'paper' | 'selected' | 'sunken' | 'bg' | 'primary' | 'primaryLt' | SubjectTone;

type Props = {
  children: React.ReactNode;
  tone?: Tone;
  onPress?: () => void;
  padding?: number;
  /**
   * Its parts touch: a bar that unfolds, whose second part brings its own edge and room
   * (components/buddy/SlimBar.tsx). Without it they stand `--space-md` apart.
   */
  joined?: boolean;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

function backgroundFor(tone: Tone, p: Palette, toneBg: Record<SubjectTone, string>): string {
  if (tone === 'paper') return p.paper;
  if (tone === 'selected' || tone === 'primaryLt') return p.primaryLt;
  if (tone === 'sunken') return p.canvas;
  if (tone === 'bg') return p.bg;
  if (tone === 'primary') return p.primary;
  return toneBg[tone];
}

export function Card({
  children,
  tone = 'paper',
  onPress,
  padding = CARD_PAD.card,
  joined = false,
  radius = RADIUS.lg,
  style,
  accessibilityLabel,
  accessibilityHint,
}: Props) {
  const { palette, tones } = useTheme();
  const baseStyle: ViewStyle = {
    backgroundColor: backgroundFor(tone, palette, tones.bg),
    borderRadius: radius,
    padding,
    // Its parts stand `--space-md` apart (Card.jsx:11); a caller's `style` may say otherwise.
    ...(joined ? null : { gap: SPACE.md }),
    ...(tone === 'paper' ? SHADOW.soft : null),
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
          <View
            collapsable={false}
            style={[baseStyle, style, pressed ? { opacity: UI.pressed.surface } : null]}
          >
            {children}
          </View>
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
