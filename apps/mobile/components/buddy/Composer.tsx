// Free text to Buddy, typed or spoken, plus the camera (a photo of a sheet or
// of homework). One floating bar: camera, the field, the mic — "Senden" once
// there is text. The mic writes what she said into the field so she can check
// it. In voice mode the bar becomes voice-first: keyboard · big mic · camera,
// and what she says is sent right away (the "Ich höre zu." look).

import { useRef, useState } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mergeTranscript } from '../../lib/speech/spoken.js';
import { useVoiceMode } from '../../lib/speech/voiceMode.js';
import { LB } from '../../lib/theme/colors.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { CircleBtn } from '../lb/CircleBtn.js';
import { MicButton, MicStatus } from '../voice/MicButton.js';
import { useVoiceInput } from '../voice/useVoiceInput.js';

/** SendMessageRequest.text allows at most 2000 characters. */
const MAX_MESSAGE_LENGTH = 2000;

export function Composer({
  disabled,
  onSend,
  onPhoto,
}: {
  disabled: boolean;
  onSend: (text: string) => void;
  /** The camera: a photo says more than typing a worksheet. */
  onPhoto: () => void;
}) {
  const { t } = useTranslation(['buddy', 'common']);
  const insets = useSafeAreaInsets();
  const voiceMode = useVoiceMode((s) => s.on);
  const setVoiceMode = useVoiceMode((s) => s.setOn);
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

  const frame = {
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: Math.max(insets.bottom, 12),
  };

  if (voiceMode) {
    // Voice first: keyboard · big mic · camera.
    return (
      <View style={frame}>
        <MicStatus voice={voice} />
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }}
        >
          <View style={{ alignItems: 'center', gap: 4, width: 90 }}>
            <CircleBtn
              icon="keyboard"
              onPress={() => setVoiceMode(false)}
              accessibilityLabel={t('buddy:composer.keyboard')}
            />
            <Text style={[TYPE.label, { color: LB.ink2 }]}>{t('buddy:composer.keyboard')}</Text>
          </View>
          <MicButton
            voice={voice}
            size="lg"
            label={t('common:voice.message')}
            disabled={disabled}
          />
          <View style={{ alignItems: 'center', gap: 4, width: 90 }}>
            <CircleBtn
              icon="camera"
              onPress={onPhoto}
              accessibilityLabel={t('buddy:composer.photo')}
            />
            <Text style={[TYPE.label, { color: LB.ink2 }]}>{t('buddy:composer.photo_short')}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={frame}>
      <MicStatus voice={voice} />
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 2,
            backgroundColor: '#fff',
            borderRadius: 32,
            paddingVertical: 6,
            paddingLeft: 4,
            paddingRight: 6,
            minHeight: 60,
          },
          SHADOW.float,
        ]}
      >
        <CircleBtn
          icon="camera"
          plain
          onPress={onPhoto}
          accessibilityLabel={t('buddy:composer.photo')}
        />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t('buddy:composer.placeholder')}
          placeholderTextColor={LB.ink3}
          accessibilityLabel={t('buddy:composer.placeholder')}
          multiline
          // The web's textarea starts two rows tall; one row, growing with the text.
          {...(Platform.OS === 'web' ? { numberOfLines: 1 } : {})}
          maxLength={MAX_MESSAGE_LENGTH}
          onSubmitEditing={send}
          textAlignVertical="center"
          style={{
            flex: 1,
            minHeight: 44,
            maxHeight: 120,
            backgroundColor: 'transparent',
            paddingHorizontal: 4,
            paddingTop: 11,
            paddingBottom: 11,
            fontSize: 16,
            lineHeight: 22,
            color: LB.ink,
          }}
        />
        {/* Like a messenger: the mic while the field is empty (or she is speaking), send once there is text. */}
        {trimmed.length === 0 || voice.state !== 'idle' ? (
          <MicButton
            voice={voice}
            size="sm"
            label={t('common:voice.message')}
            filled
            disabled={disabled}
          />
        ) : (
          <Btn onPress={send} disabled={disabled} pill size="sm">
            {t('buddy:composer.send')}
          </Btn>
        )}
      </View>
    </View>
  );
}
