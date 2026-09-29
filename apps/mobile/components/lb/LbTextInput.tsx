// The one text field: a soft white field with a gentle border that turns
// violet, with a soft halo, while it has focus (never colour alone: the
// border also gets thicker). Errors show a red border and the message below.

import { forwardRef, useState } from 'react';
import { TextInput, View, Text, Pressable, type TextInputProps } from 'react-native';

import { useAnnounce } from '../../lib/announce.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Icon } from './Icon.js';

type Props = TextInputProps & {
  showToggle?: boolean;
  shown?: boolean;
  onToggle?: () => void;
  error?: boolean;
  errorMessage?: string;
  toggleAccessibilityLabel?: string;
};

export const LbTextInput = forwardRef<TextInput, Props>(function LbTextInput(
  {
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
  const [focused, setFocused] = useState(false);
  const borderColor = error ? palette.danger : focused ? palette.primary : palette.field;
  // iOS has no live regions — the field says its error itself (lib/announcePlan.ts).
  useAnnounce(errorMessage);
  return (
    <View>
      <View style={{ position: 'relative' }}>
        <TextInput
          ref={ref}
          placeholderTextColor={palette.placeholder}
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
              paddingRight: showToggle ? 48 : focused || error ? 15.5 : 16,
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
