import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { chipSkin, UI, type ChipTone } from '../../lib/theme/components.js';
import { useA11ySettings } from '../../lib/a11ySettings.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Icon, type IconName } from './Icon.js';

export function Chip({
  children,
  tone = 'default',
  icon,
  endIcon,
  accessibilityLabel,
  accessibilityHint,
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
  tone?: ChipTone;
  /** A small sign before the words (the clock of a test with time, issue #241). */
  icon?: IconName;
  /**
   * A small sign after the words, inside the chip: what a tap on a receipt does (the undo arrow,
   * components/core/Chip.jsx `tone="receipt"`). It only shows; a control of its own is `trailing`.
   */
  endIcon?: IconName;
  /** What a screen reader says when the short label is not enough on its own. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const { palette } = useTheme();
  const { reduceTransparency } = useA11ySettings();
  const t = chipSkin(palette, tone, selected, reduceTransparency);
  const content = (
    <View
      accessibilityRole={trailing == null ? 'text' : undefined}
      accessibilityLabel={trailing == null ? (accessibilityLabel ?? children) : undefined}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: UI.chip.gap,
        backgroundColor: t.bg,
        minHeight: UI.chip.height,
        // Always one point of edge, clear where the tone has none (components/core/Chip.jsx:10):
        // choosing a chip must not change its size.
        borderColor: t.border ?? 'transparent',
        borderWidth: UI.border,
        paddingLeft: icon ? UI.chip.iconPad : UI.chip.pad,
        paddingRight: UI.chip.pad,
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
      <Text style={[TYPE.chip, { color: t.color }]}>{children}</Text>
      {endIcon ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon name={endIcon} size={UI.chip.endIcon} color={t.color} />
        </View>
      ) : null}
      {onPress ? null : trailing}
    </View>
  );
  const control = onPress ? (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityState={{ selected, disabled }}
      // The target stays 44 pt; what it reaches beyond the 34 pt chip is handed back as margin,
      // so a row of chips is as tall as the chips (components/core/Chip.jsx `--chip-h`) — on the
      // web too, where `hitSlop` does not exist (the way Btn's icon-only button does it, #295).
      style={{
        minWidth: TOUCH,
        minHeight: TOUCH,
        marginVertical: -UI.chip.reach,
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
