// Free text to Buddy. The send button is a Btn; the field grows to a few lines.

import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LB } from '../../lib/theme/colors.js';
import { Btn } from '../lb/Btn.js';

export function Composer({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  const { t } = useTranslation('buddy');
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const send = () => {
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  };
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 10,
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: Math.max(insets.bottom, 10),
        backgroundColor: LB.paper,
        borderTopWidth: 1,
        borderTopColor: LB.hairline,
      }}
    >
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={t('composer.placeholder')}
        placeholderTextColor={LB.ink3}
        accessibilityLabel={t('composer.placeholder')}
        multiline
        maxLength={2000}
        onSubmitEditing={send}
        style={{
          flex: 1,
          minHeight: 48,
          maxHeight: 132,
          backgroundColor: LB.bg,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: LB.hairline,
          paddingHorizontal: 14,
          paddingTop: 13,
          paddingBottom: 13,
          fontSize: 16,
          color: LB.ink,
        }}
      />
      <Btn onPress={send} disabled={disabled || trimmed.length === 0}>
        {t('composer.send')}
      </Btn>
    </View>
  );
}
