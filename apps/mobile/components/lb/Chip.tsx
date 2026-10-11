import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Palette } from '../../lib/theme/palettes.js';
import { UI } from '../../lib/theme/components.js';
import { TOUCH } from '../../lib/theme/space.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Icon, type IconName } from './Icon.js';

type Tone = 'default' | 'receipt' | 'gray' | 'primary' | 'success' | 'warning' | 'dark';

// Built from the palette the component is rendering with: a module-scope map froze the
// start palette (issue #84).
const tones = (p: Palette): Record<Tone, { bg: string; color: string; border?: string }> => ({
  default: { bg: p.paper, color: p.ink, border: p.hairlineStrong },
  receipt: { bg: p.paper, color: p.ink2, border: p.hairlineStrong },
  gray: { bg: p.canvas, color: p.ink2 },
  primary: { bg: p.primaryLt, color: p.primaryDk },
  success: { bg: p.canvas, color: p.successText },
  warning: { bg: p.canvas, color: p.warningText },
  dark: { bg: p.ink, color: p.paper },
});

export function Chip({
  children,
  tone = 'gray',
  icon,
  accessibilityLabel,
  selected = false,
  disabled = false,
  onPress,
  trailing,
}: {
  children: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  trailing?: ReactNode;
  tone?: Tone;
  /** A small sign before the words (the clock of a test with time, issue #241). */
  icon?: IconName;
  /** What a screen reader says when the short label is not enough on its own. */
  accessibilityLabel?: string;
}) {
  const { palette } = useTheme();
  const t = selected
    ? { bg: palette.primaryLt, color: palette.primaryDk, border: palette.primary }
    : tones(palette)[tone];
  const content = (
    <View
      accessibilityRole={trailing == null ? 'text' : undefined}
      accessibilityLabel={trailing == null ? (accessibilityLabel ?? children) : undefined}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.xs,
        backgroundColor: t.bg,
        minHeight: UI.chip.height,
        borderColor: t.border ?? 'transparent',
        borderWidth: selected ? UI.selectedBorder : t.border ? UI.border : 0,
        paddingHorizontal: SPACE.md,
        paddingVertical: SPACE.xs,
        borderRadius: RADIUS.round,
        alignSelf: 'flex-start',
        maxWidth: '100%',
      }}
    >
      {icon ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon name={icon} size={UI.chip.icon} color={t.color} />
        </View>
      ) : null}
      <Text style={[TYPE.label, { color: t.color }]}>{children}</Text>
      {onPress ? null : trailing}
    </View>
  );
  const control = onPress ? (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityState={{ selected, disabled }}
      style={{
        minWidth: TOUCH,
        minHeight: TOUCH,
        justifyContent: 'center',
        alignSelf: 'flex-start',
      }}
    >
      {({ pressed }) => (
        <View
          style={{ opacity: disabled ? UI.disabledOpacity : pressed ? UI.pressedOpacity : 1 }}
          accessible={false}
        >
          {content}
        </View>
      )}
    </Pressable>
  ) : (
    content
  );
  return onPress && trailing != null ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>
      {control}
      {trailing}
    </View>
  ) : (
    control
  );
}
