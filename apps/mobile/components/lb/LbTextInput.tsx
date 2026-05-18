import { forwardRef } from 'react';
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
  { showToggle, shown, onToggle, error, errorMessage, style, toggleAccessibilityLabel, ...rest },
  ref,
) {
  return (
    <View>
      <View style={{ position: 'relative' }}>
        <TextInput
          ref={ref}
          placeholderTextColor={LB.ink3}
          {...rest}
          style={[
            {
              backgroundColor: LB.bg,
              borderColor: error ? LB.danger : LB.hairline,
              borderWidth: 1,
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingRight: showToggle ? 48 : 16,
              height: 52,
              fontSize: 15,
              color: LB.ink,
            },
            style,
          ]}
        />
        {showToggle && onToggle && (
          <Pressable
            onPress={onToggle}
            hitSlop={8}
            accessibilityLabel={toggleAccessibilityLabel}
            style={{
              position: 'absolute',
              right: 14,
              top: 0,
              bottom: 0,
              justifyContent: 'center',
            }}
          >
            <Icon name={shown ? 'eye-off' : 'eye'} size={20} color={LB.ink3} />
          </Pressable>
        )}
      </View>
      {errorMessage && (
        <Text style={{ color: LB.danger, fontSize: 12, marginTop: 4 }}>{errorMessage}</Text>
      )}
    </View>
  );
});
