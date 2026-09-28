// Free text to Buddy, typed or spoken, plus the camera (a photo of a sheet or
// of homework). One floating bar: camera, the field, the mic — "Senden" once
// there is text. The mic writes what she said into the field so she can check
// it. In voice mode the bar becomes voice-first: keyboard · big mic · camera,
// and what she says is sent right away (the "Ich höre zu." look).
// While Buddy writes his answer, the send button (or the big mic) is "Stopp".

import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Animated from 'react-native-reanimated';

import { composerAfterSend } from '../../lib/buddy/unsent.js';
import { useDraft } from '../../lib/drafts.js';
import { haptic } from '../../lib/haptics.js';
import { fadeIn } from '../../lib/theme/enter.js';
import { DURATION } from '../../lib/theme/motion.js';
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
  writing = false,
  onStop,
  onSend,
  onPhoto,
  onTalk,
}: {
  disabled: boolean;
  /** Buddy is answering what she sent: the send button becomes "Stopp". */
  writing?: boolean;
  /** Ends Buddy's answer (the turn ends stopped; see app/buddy.tsx). */
  onStop?: () => void;
  /** Resolves false when the message never reached Buddy: her text comes back (audit M-76). */
  onSend: (text: string) => Promise<boolean>;
  /** The camera: a photo says more than typing a worksheet. */
  onPhoto: () => void;
  /** Conversation mode (talk screen): bottom right, next to the mic. */
  onTalk: () => void;
}) {
  const { t } = useTranslation(['buddy', 'common']);
  const insets = useSafeAreaInsets();
  const voiceMode = useVoiceMode((s) => s.on);
  const setVoiceMode = useVoiceMode((s) => s.setOn);
  // Kept on the device: a half-typed question survives Android killing the app.
  const { text, setText, clear } = useDraft('chat');
  const [focused, setFocused] = useState(false);
  const latest = useRef({ text, disabled });
  latest.current = { text, disabled };
  const trimmed = text.trim();
  /** Sends and empties the field; a message that never arrived comes back into it. */
  const deliver = (message: string) => {
    haptic.tap();
    clear();
    void onSend(message).then((delivered) =>
      setText((current) => composerAfterSend(current, message, delivered)),
    );
  };
  const send = () => {
    if (!trimmed || disabled) return;
    deliver(trimmed);
  };

  const voice = useVoiceInput({
    purpose: 'message',
    lang: null,
    onText: (said) => {
      const next = mergeTranscript(latest.current.text, said, 'append', MAX_MESSAGE_LENGTH);
      // Voice mode sends at once; otherwise (or while a message is still on its way) she checks it first.
      if (useVoiceMode.getState().on && !latest.current.disabled) {
        deliver(next.trim());
      } else {
        setText(next);
      }
    },
  });

  // Leaving the home (practice, capture, settings …) ends a dictation still listening: it
  // would otherwise go on and send its text later (p2-lc-chat-mic-survives-leaving-home).
  const cancelVoice = useRef(voice.cancel);
  cancelVoice.current = voice.cancel;
  useFocusEffect(
    useCallback(
      () => () => {
        cancelVoice.current();
      },
      [],
    ),
  );

  const frame = {
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: Math.max(insets.bottom, 12),
  };

  const stopBtn = (size: 'sm' | 'lg') => (
    <Animated.View key="stop" entering={fadeIn(DURATION.quick)}>
      <Btn
        pill
        size={size}
        variant="soft"
        icon="stop"
        onPress={onStop}
        accessibilityLabel={t('buddy:thread.stop_label')}
      >
        {t('buddy:thread.stop')}
      </Btn>
    </Animated.View>
  );
  const stoppable = writing && onStop !== undefined && voice.state === 'idle';

  if (voiceMode) {
    // Voice first: keyboard · big mic · camera.
    return (
      <View style={frame}>
        <MicStatus voice={voice} />
        {/* Heard while a message was still on its way: shown with its own "Senden", never
            hidden in a field voice mode does not show (composer-parked-transcript). */}
        {trimmed ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[TYPE.body, { flex: 1, color: LB.ink }]} numberOfLines={3}>
              {trimmed}
            </Text>
            <Btn onPress={send} disabled={disabled} pill size="sm">
              {t('buddy:composer.send')}
            </Btn>
          </View>
        ) : null}
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
          {stoppable ? (
            stopBtn('lg')
          ) : (
            <MicButton
              voice={voice}
              size="lg"
              label={t('common:voice.message')}
              disabled={disabled}
            />
          )}
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
            backgroundColor: LB.paper,
            borderRadius: 32,
            paddingVertical: 6,
            paddingLeft: 4,
            paddingRight: 6,
            minHeight: 60,
            // The focus ring sits on the pill, not on the bare field inside (the web drew a black box).
            outlineStyle: 'solid',
            outlineWidth: focused ? 4 : 0,
            outlineColor: LB.ring,
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
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
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
            outlineWidth: 0,
          }}
        />
        {/* Like a messenger: the mic while the field is empty (or she is speaking), send once there is text. */}
        {stoppable ? (
          stopBtn('sm')
        ) : trimmed.length === 0 || voice.state !== 'idle' ? (
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
        {/* Conversation mode sits where she knows it from other chat apps:
            bottom right, next to the mic (user feedback 2026-09-28). */}
        <CircleBtn
          icon="headphones"
          plain
          onPress={onTalk}
          accessibilityLabel={t('buddy:talk.open')}
        />
      </View>
    </View>
  );
}
