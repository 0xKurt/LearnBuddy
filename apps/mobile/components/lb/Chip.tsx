import { Text, View } from 'react-native';
import type { Palette } from '../../lib/theme/palettes.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Icon, type IconName } from './Icon.js';

/** `mint`: a state that is reached and stays (prepared, ready) — calm on the lilac cards. */
type Tone = 'gray' | 'primary' | 'success' | 'warning' | 'dark' | 'mint';

// Built from the palette the component is rendering with: a module-scope map froze the
// start palette (issue #84).
const tones = (p: Palette): Record<Tone, { bg: string; color: string; border?: string }> => ({
  gray: { bg: p.canvas, color: p.ink2 },
  primary: { bg: p.primaryLt, color: p.primaryDk },
  success: { bg: 'rgba(107,141,106,0.13)', color: p.successText },
  warning: { bg: 'rgba(181,138,60,0.13)', color: p.warningText },
  dark: { bg: p.ink, color: p.paper },
  mint: { bg: p.mint, color: p.successText },
});

export function Chip({
  children,
  tone = 'gray',
  icon,
}: {
  children: string;
  tone?: Tone;
  /** A sign in front of the words — never instead of them (color is never the only signal). */
  icon?: IconName;
}) {
  const { palette } = useTheme();
  const t = tones(palette)[tone];
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
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.xs,
      }}
    >
      {icon ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon name={icon} size={13} color={t.color} />
        </View>
      ) : null}
      <Text style={{ color: t.color, fontSize: 13, lineHeight: 17, fontWeight: '600' }}>
        {children}
      </Text>
    </View>
  );
}
