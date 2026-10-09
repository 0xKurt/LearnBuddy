import { Text, View } from 'react-native';
import type { Palette } from '../../lib/theme/palettes.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Icon, type IconName } from './Icon.js';

type Tone = 'gray' | 'primary' | 'success' | 'warning' | 'dark';

// Built from the palette the component is rendering with: a module-scope map froze the
// start palette (issue #84).
const tones = (p: Palette): Record<Tone, { bg: string; color: string; border?: string }> => ({
  gray: { bg: p.canvas, color: p.ink2 },
  primary: { bg: p.primaryLt, color: p.primaryDk },
  success: { bg: 'rgba(107,141,106,0.13)', color: p.successText },
  warning: { bg: 'rgba(181,138,60,0.13)', color: p.warningText },
  dark: { bg: p.ink, color: p.paper },
});

export function Chip({
  children,
  tone = 'gray',
  icon,
  accessibilityLabel,
}: {
  children: string;
  tone?: Tone;
  /** A small sign before the words (the clock of a test with time, issue #241). */
  icon?: IconName;
  /** What a screen reader says when the short label is not enough on its own. */
  accessibilityLabel?: string;
}) {
  const { palette } = useTheme();
  const t = tones(palette)[tone];
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? children}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.xs,
        backgroundColor: t.bg,
        borderColor: t.border ?? 'transparent',
        borderWidth: t.border ? 1 : 0,
        paddingHorizontal: SPACE.md,
        paddingVertical: 5, // token-exempt: chip of 27 pt around its 17 pt line
        borderRadius: RADIUS.round,
        alignSelf: 'flex-start',
        maxWidth: '100%',
      }}
    >
      {icon ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon name={icon} size={14} color={t.color} />
        </View>
      ) : null}
      <Text
        // token-exempt: TYPE.label's size on a line one point tighter, so the chip stays slim
        style={{ color: t.color, fontSize: TYPE.label.fontSize, lineHeight: 17, fontWeight: '600' }}
      >
        {children}
      </Text>
    </View>
  );
}
