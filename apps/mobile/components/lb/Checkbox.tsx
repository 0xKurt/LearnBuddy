// A consent-style checkbox row (not a CTA): the whole row toggles.

import { Pressable, Text, View } from 'react-native';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { useMotionReduced } from '../../lib/theme/motion.js';
import { TYPE } from '../../lib/theme/type.js';
import { pressedStyle, UI } from '../../lib/theme/components.js';
import { ONBOARDING } from '../../lib/theme/onboarding.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { Icon } from './Icon.js';

export function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const { palette } = useTheme();
  const reduced = useMotionReduced();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      // An unticked box must say so, not stay silent: on the web `accessibilityState`
      // alone leaves out `aria-checked` (axe: aria-required-attr, issue #73).
      aria-checked={checked}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => onChange(!checked)}
    >
      {/* The row answers the finger (audit 30.09., #133 position 6): a consent row that
          looks the same whether it was hit or missed leaves her tapping again. The box
          takes the press, the way every other control here does (readme.md "States": the dip
          alone); with Reduce Motion the row dims instead. */}
      {({ pressed }) => (
        <View
          collapsable={false}
          style={{
            flexDirection: 'row',
            gap: SPACE.md,
            alignItems: 'flex-start',
            paddingVertical: ONBOARDING.check.pad,
            minHeight: TOUCH,
            ...(disabled
              ? { opacity: UI.disabledOpacity }
              : pressedStyle(pressed && reduced, reduced)),
          }}
        >
          <View
            collapsable={false}
            style={{
              width: ONBOARDING.check.box,
              height: ONBOARDING.check.box,
              borderRadius: ONBOARDING.check.radius,
              borderWidth: checked ? 0 : ONBOARDING.check.border,
              borderColor: palette.hairlineStrong,
              backgroundColor: checked ? palette.primary : palette.paper,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: ONBOARDING.check.opticalTop,
              ...pressedStyle(pressed && !reduced, reduced),
            }}
          >
            {checked ? (
              <Icon name="check" size={ONBOARDING.check.glyph} color={palette.onPrimary} />
            ) : null}
          </View>
          <Text style={[TYPE.paragraph, { flex: 1 }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}
