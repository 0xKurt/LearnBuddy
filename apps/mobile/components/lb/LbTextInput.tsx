// The one text field: a soft white field with a gentle border that turns
// violet, with a soft halo, while it has focus (never colour alone: the
// border also gets thicker). Errors show a red border and the message below.

import { forwardRef, useState } from 'react';
import { TextInput, View, Text, Pressable, type TextInputProps } from 'react-native';

import { LB } from '../../lib/theme/colors.js';
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
  const [focused, setFocused] = useState(false);
  const borderColor = error ? LB.danger : focused ? LB.primary : LB.field;
  return (
    <View>
      <View style={{ position: 'relative' }}>
        <TextInput
          ref={ref}
          placeholderTextColor={LB.ink3}
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
              backgroundColor: LB.paper,
              borderColor,
              borderWidth: focused || error ? 1.5 : 1,
              borderRadius: 16,
              // Keep the text still when the border gets thicker.
              paddingHorizontal: focused || error ? 15.5 : 16,
              paddingRight: showToggle ? 48 : focused || error ? 15.5 : 16,
              height: 52,
              fontSize: 16,
              color: LB.ink,
              // The focus ring (iOS/Android new architecture and the web).
              outlineStyle: 'solid',
              outlineWidth: focused ? 4 : 0,
              outlineColor: LB.ring,
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
            <Icon name={shown ? 'eye-off' : 'eye'} size={20} color={LB.ink2} />
          </Pressable>
        )}
      </View>
      {errorMessage && (
        <Text style={{ color: LB.danger, fontSize: 15, lineHeight: 21, marginTop: 6 }}>
          {errorMessage}
        </Text>
      )}
    </View>
  );
});
