// Free text to Buddy, typed or spoken — plus the camera (a photo of a sheet
// or of homework) and, while the field is empty, a row of suggestions to tap
// instead of menus. The send button is a Btn; the field grows to a few lines. The mic writes what she said into the field, so she
// can check it before sending; in voice mode it is sent right away and the
// mic becomes the big main control (the field stays for typing).

import { useRef, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mergeTranscript } from '../../lib/speech/spoken.js';
import { useVoiceMode } from '../../lib/speech/voiceMode.js';
import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { CircleBtn } from '../lb/CircleBtn.js';
import { MicButton, MicStatus } from '../voice/MicButton.js';
import { useVoiceInput } from '../voice/useVoiceInput.js';

/** SendMessageRequest.text allows at most 2000 characters. */
const MAX_MESSAGE_LENGTH = 2000;

export type Suggestion = { key: string; label: string; onPress: () => void };

export function Composer({
  disabled,
  onSend,
  onPhoto,
  suggestions = [],
}: {
  disabled: boolean;
  onSend: (text: string) => void;
  /** The camera: a photo says more than typing a worksheet. */
  onPhoto: () => void;
  suggestions?: Suggestion[];
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
      {suggestions.length > 0 && trimmed.length === 0 && voice.state === 'idle' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 8 }}
          accessibilityLabel={t('buddy:composer.suggestions')}
        >
          {suggestions.map((s) => (
            <Btn key={s.key} size="sm" variant="soft" onPress={s.onPress} disabled={disabled}>
              {s.label}
            </Btn>
          ))}
        </ScrollView>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
        <View style={{ height: 56, justifyContent: 'center' }}>
          <CircleBtn
            icon="camera"
            onPress={onPhoto}
            accessibilityLabel={t('buddy:composer.photo')}
          />
        </View>
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
        {/* Like a messenger: the mic while the field is empty (or she is speaking), send once there is text. */}
        {!voiceMode && (trimmed.length === 0 || voice.state !== 'idle') ? (
          <MicButton voice={voice} label={t('common:voice.message')} disabled={disabled} />
        ) : null}
        {trimmed.length > 0 && voice.state === 'idle' ? (
          <View style={{ height: 56, justifyContent: 'center' }}>
            <Btn onPress={send} disabled={disabled}>
              {t('buddy:composer.send')}
            </Btn>
          </View>
        ) : null}
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
