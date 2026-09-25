// Free text to Buddy, typed or spoken. The send button is a Btn; the field
// grows to a few lines. The mic writes what she said into the field, so she
// can check it before sending; in voice mode it is sent right away and the
// mic becomes the big main control (the field stays for typing).

import { useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mergeTranscript } from '../../lib/speech/spoken.js';
import { useVoiceMode } from '../../lib/speech/voiceMode.js';
import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { MicButton, MicStatus } from '../voice/MicButton.js';
import { useVoiceInput } from '../voice/useVoiceInput.js';

/** SendMessageRequest.text allows at most 2000 characters. */
const MAX_MESSAGE_LENGTH = 2000;

export function Composer({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  const { t } = useTranslation(['buddy', 'common']);
  const insets = useSafeAreaInsets();
  const voiceMode = useVoiceMode((s) => s.on);
  const [text, setText] = useState('');
  const latest = useRef({ text, disabled });
  latest.current = { text, disabled };
  const trimmed = text.trim();
  const send = () => {
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  };

  const voice = useVoiceInput({
    purpose: 'message',
    lang: null,
    onText: (said) => {
      const next = mergeTranscript(latest.current.text, said, 'append', MAX_MESSAGE_LENGTH);
      // Voice mode sends at once; otherwise (or while a message is still on its way) she checks it first.
      if (useVoiceMode.getState().on && !latest.current.disabled) {
        onSend(next.trim());
        setText('');
      } else {
        setText(next);
      }
    },
  });

  return (
    <View
      style={{
        gap: 10,
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: Math.max(insets.bottom, 10),
        backgroundColor: LB.paper,
        borderTopWidth: 1,
        borderTopColor: LB.hairline,
      }}
    >
      <MicStatus voice={voice} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t('buddy:composer.placeholder')}
          placeholderTextColor={LB.ink3}
          accessibilityLabel={t('buddy:composer.placeholder')}
          multiline
          maxLength={MAX_MESSAGE_LENGTH}
          onSubmitEditing={send}
          style={{
            flex: 1,
            minHeight: 56,
            maxHeight: 132,
            backgroundColor: LB.bg,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: LB.hairline,
            paddingHorizontal: 14,
            paddingTop: 17,
            paddingBottom: 17,
            fontSize: 16,
            color: LB.ink,
          }}
        />
        {voiceMode ? null : (
          <MicButton voice={voice} label={t('common:voice.message')} disabled={disabled} />
        )}
        <View style={{ height: 56, justifyContent: 'center' }}>
          <Btn onPress={send} disabled={disabled || trimmed.length === 0}>
            {t('buddy:composer.send')}
          </Btn>
        </View>
      </View>
      {voiceMode ? (
        <View style={{ alignItems: 'center', gap: 6, paddingTop: 2 }}>
          <MicButton
            voice={voice}
            size="lg"
            label={t('common:voice.message')}
            disabled={disabled}
          />
          <Text style={[TYPE.small, { textAlign: 'center' }]}>{t('common:voice.say_it')}</Text>
        </View>
      ) : null}
    </View>
  );
}
