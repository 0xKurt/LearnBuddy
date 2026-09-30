// The one text field: a soft white field with a gentle border that turns
// violet, with a soft halo, while it has focus (never colour alone: the
// border also gets thicker). Errors show a red border and the message below.

import { forwardRef, useState } from 'react';
import { TextInput, View, Text, Pressable, type TextInputProps } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAnnounce } from '../../lib/announce.js';
import { isDarkBackground } from '../../lib/theme/luminance.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Icon } from './Icon.js';

type Props = TextInputProps & {
  /**
   * An × that empties the field, while it has content (#133 position 17). Opt-in, not
   * everywhere: it earns its place where a typo means retyping a whole address, and it
   * would only be one more thing to hit next to a one-word answer. Never together with
   * `showToggle` — both want the same corner, and a password is not a field to wipe by
   * accident.
   */
  clearable?: boolean;
  showToggle?: boolean;
  shown?: boolean;
  onToggle?: () => void;
  error?: boolean;
  errorMessage?: string;
  toggleAccessibilityLabel?: string;
};

export const LbTextInput = forwardRef<TextInput, Props>(function LbTextInput(
  {
    clearable,
    showToggle,
    shown,
    onToggle,
    error,
    errorMessage,
    style,
    toggleAccessibilityLabel,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const { palette } = useTheme();
  const { t } = useTranslation('common');
  const [focused, setFocused] = useState(false);
  const canClear = clearable === true && !showToggle && (rest.value ?? '').length > 0;
  const borderColor = error ? palette.danger : focused ? palette.primary : palette.field;
  // iOS has no live regions — the field says its error itself (lib/announcePlan.ts).
  useAnnounce(errorMessage);
  return (
    <View>
      <View style={{ position: 'relative' }}>
        <TextInput
          ref={ref}
          placeholderTextColor={palette.placeholder}
          // iOS draws a light keyboard over the night palette unless it is told otherwise
          // (audit 30.09., #133 position 7). Derived, not hardcoded: a new dark palette
          // gets it for free, and a light one is unaffected.
          keyboardAppearance={isDarkBackground(palette.bg) ? 'dark' : 'light'}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            {
              backgroundColor: palette.paper,
              borderColor,
              borderWidth: focused || error ? 1.5 : 1,
              borderRadius: 16,
              // Keep the text still when the border gets thicker.
              paddingHorizontal: focused || error ? 15.5 : 16,
              paddingRight: showToggle || canClear ? 48 : focused || error ? 15.5 : 16,
              // minHeight, not height: large system text grows the field instead of clipping.
              minHeight: 52,
              paddingVertical: 12,
              fontSize: 16,
              color: palette.ink,
              // The focus ring (iOS/Android new architecture and the web).
              outlineStyle: 'solid',
              outlineWidth: focused ? 4 : 0,
              outlineColor: palette.ring,
              outlineOffset: 0,
            },
            style,
          ]}
        />
        {canClear && (
          <Pressable
            onPress={() => rest.onChangeText?.('')}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('actions.clear_field')}
            style={{
              position: 'absolute',
              right: 14,
              top: 0,
              bottom: 0,
              justifyContent: 'center',
            }}
          >
            {({ pressed }) => (
              <Icon name="close" size={18} color={pressed ? palette.ink : palette.ink3} />
            )}
          </Pressable>
        )}
        {showToggle && onToggle && (
          <Pressable
            onPress={onToggle}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={toggleAccessibilityLabel}
            style={{
              position: 'absolute',
              right: 14,
              top: 0,
              bottom: 0,
              justifyContent: 'center',
            }}
          >
            <Icon name={shown ? 'eye-off' : 'eye'} size={20} color={palette.ink2} />
          </Pressable>
        )}
      </View>
      {errorMessage && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: palette.danger, fontSize: 15, lineHeight: 21, marginTop: 6 }}
        >
          {errorMessage}
        </Text>
      )}
    </View>
  );
});
