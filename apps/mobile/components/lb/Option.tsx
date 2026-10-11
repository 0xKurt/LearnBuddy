// Selection is presentation only: the screen's Composer checks the draft.
import type { ReactNode } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { optionLook, PRACTICE, type OptionState } from '../../lib/theme/practice.js';
import { circle } from '../../lib/theme/radius.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Icon } from './Icon.js';
import { PressArea } from './PressArea.js';

export type { OptionState } from '../../lib/theme/practice.js';

type Props = {
  children: ReactNode;
  letter?: string;
  state?: OptionState;
  disabled?: boolean;
  readOnly?: boolean;
  checked?: boolean;
  radio?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** The visual surface sits inside the accessible selection target. */
function OptionSurface({
  children,
  state = 'idle',
  style,
}: Pick<Props, 'children' | 'state' | 'style'>) {
  const { palette } = useTheme();
  return <View style={[optionLook(palette, state), style]}>{children}</View>;
}

export function Option({
  children,
  letter,
  state = 'idle',
  disabled = false,
  readOnly = false,
  checked,
  radio = true,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  onLongPress,
  style,
}: Props) {
  const { palette } = useTheme();
  const blocked = disabled || readOnly || state === 'dim' || !onPress;
  const marked = state === 'correct' ? 'check' : state === 'wrong' ? 'close' : null;
  const badge =
    state === 'selected'
      ? palette.primary
      : state === 'correct'
        ? palette.success
        : state === 'wrong'
          ? palette.danger
          : palette.canvas;
  return (
    <View style={style}>
      <PressArea
        onPress={blocked ? undefined : onPress}
        onLongPress={onLongPress}
        disabled={blocked}
        style={{ minHeight: TOUCH, flexGrow: 1 }}
        accessibilityRole={radio ? 'radio' : 'checkbox'}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: blocked, checked: checked ?? state === 'selected' }}
        aria-checked={checked ?? state === 'selected'}
      >
        {(pressed) => (
          <OptionSurface
            state={state}
            style={{
              flexGrow: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACE.md,
              opacity: disabled ? PRACTICE.disabledOpacity : pressed ? PRACTICE.pressOpacity : 1,
            }}
          >
            {letter ? (
              <View
                style={{
                  width: PRACTICE.badgeSize,
                  height: PRACTICE.badgeSize,
                  borderRadius: circle(PRACTICE.badgeSize),
                  backgroundColor: badge,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {marked ? (
                  <Icon
                    name={marked}
                    size={PRACTICE.badgeIcon}
                    color={state === 'correct' ? palette.onSuccess : palette.onDanger}
                  />
                ) : (
                  <Text
                    accessible={false}
                    style={[
                      TYPE.label,
                      { color: state === 'selected' ? palette.onPrimary : palette.primaryDk },
                    ]}
                  >
                    {letter}
                  </Text>
                )}
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              {typeof children === 'string' ? (
                <Text
                  accessible={false}
                  style={[TYPE.body, { color: state === 'dim' ? palette.ink3 : palette.ink }]}
                >
                  {children}
                </Text>
              ) : (
                children
              )}
            </View>
            {!letter && marked ? (
              <Icon
                name={marked}
                size={PRACTICE.verdictIcon}
                color={state === 'correct' ? palette.successText : palette.danger}
              />
            ) : null}
          </OptionSurface>
        )}
      </PressArea>
    </View>
  );
}
