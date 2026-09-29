// The round mic button (56 pt; 72 pt when it is the main control in voice
// mode; 48 pt in the composer bar) and the one status line that goes with it. Built like
// CircleBtn: Pressable outside, the background on the inner View. Tap to start,
// tap to stop. While recording, a ring pulses (still for reduced motion), the
// icon turns into a stop square and the timer runs; while the words are being
// written down, a small spinner sits in the button.

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { useAnnounce } from '../../lib/announce.js';
import { formatClock } from '../../lib/speech/voice.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Icon } from '../lb/Icon.js';
import type { VoiceInput } from './useVoiceInput.js';

function PulseRing({ size }: { size: number }) {
  const { palette } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;
  // Reactive: toggling "reduce motion" while the app runs stops the pulse too.
  const still = useReducedMotion();

  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: Platform.OS !== 'web',
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, still]);

  const scale = still ? 1.18 : progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] });
  const opacity = still ? 0.6 : progress.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 3,
        borderColor: palette.primary,
        opacity,
        transform: [{ scale }],
      }}
    />
  );
}

type Props = {
  voice: VoiceInput;
  /** What tapping does when idle ("Nachricht sprechen", "Antwort sagen"). */
  label: string;
  /** lg: the main control in voice mode. */
  size?: 'sm' | 'md' | 'lg';
  /** Filled even when idle (the composer's main control while the field is empty). */
  filled?: boolean;
  /** Instead of start/stop recording (the conversation screen runs its own loop). */
  onPress?: () => void;
  disabled?: boolean;
};

export function MicButton({
  voice,
  label,
  size = 'md',
  filled: filledIdle = false,
  disabled = false,
  onPress,
}: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('common');
  const recording = voice.state === 'recording';
  const working = voice.state === 'starting' || voice.state === 'transcribing';
  // A running recording can always be stopped.
  const off = recording ? false : disabled || working;
  const d = size === 'lg' ? 72 : size === 'sm' ? 48 : 56;
  const filled = size === 'lg' || recording || filledIdle;
  const bg = recording ? palette.primaryDk : filled ? palette.primary : palette.paper;
  const fg = filled ? palette.paper : palette.primaryDk;
  const time = formatClock(voice.elapsedMs);

  return (
    <View style={{ width: d, height: d, alignItems: 'center', justifyContent: 'center' }}>
      {recording ? <PulseRing size={d} /> : null}
      <Pressable
        onPress={onPress ?? voice.toggle}
        disabled={off}
        accessibilityRole="button"
        accessibilityLabel={recording ? t('voice.stop') : label}
        accessibilityHint={recording ? t('voice.stop_hint') : t('voice.hint')}
        accessibilityState={{ disabled: off, busy: working }}
        accessibilityValue={
          recording
            ? {
                // A dictation has no time limit (issue #19): the timer stands alone.
                text:
                  voice.maxMs === null
                    ? t('voice.recording_open_value', { time })
                    : t('voice.recording_value', { time, max: formatClock(voice.maxMs) }),
              }
            : voice.state === 'transcribing'
              ? { text: t('voice.transcribing') }
              : undefined
        }
        android_ripple={{ color: 'rgba(0,0,0,0.1)', borderless: false }}
        style={{
          borderRadius: d / 2,
          overflow: 'hidden',
          opacity: off && !working ? 0.6 : 1,
        }}
      >
        {({ pressed }) => (
          <View
            style={{
              width: d,
              height: d,
              borderRadius: d / 2,
              backgroundColor: bg,
              borderWidth: filled ? 0 : 1,
              borderColor: palette.hairline,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.8 : 1,
            }}
          >
            {working ? (
              <ActivityIndicator color={fg} />
            ) : (
              <Icon
                name={recording ? 'stop' : 'mic'}
                size={Math.round(d * (recording ? 0.36 : 0.44))}
                color={fg}
              />
            )}
          </View>
        )}
      </Pressable>
    </View>
  );
}

/**
 * The line above the field: the timer while recording, "writing it down"
 * afterwards, a calm hint when nothing came out, and what to do without a microphone.
 */
export function MicStatus({ voice }: { voice: VoiceInput }) {
  const { palette } = useTheme();
  const { t } = useTranslation('common');
  // VoiceOver hears the same states (audit M-80): writing down, no mic, nothing understood.
  const status =
    voice.state === 'transcribing'
      ? t('voice.transcribing')
      : voice.denied
        ? Platform.OS === 'web'
          ? t('voice.denied_web')
          : t('voice.denied')
        : voice.hint && voice.state === 'idle'
          ? t(`voice.problem.${voice.hint}`)
          : null;
  useAnnounce(status, { liveRegion: voice.state === 'transcribing' });

  if (voice.state === 'recording') {
    const time = formatClock(voice.elapsedMs);
    // A dictation has no time limit (issue #19): only the running timer is shown.
    const open = voice.maxMs === null;
    const max = open ? '' : formatClock(voice.maxMs ?? 0);
    return (
      <View style={{ gap: 6 }}>
        <View
          accessible
          accessibilityLabel={
            open
              ? t('voice.recording_open_value', { time })
              : t('voice.recording_value', { time, max })
          }
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 22 }}
        >
          <View
            style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: palette.primary }}
            importantForAccessibility="no"
          />
          <Text style={[TYPE.body, { fontWeight: '600' }]}>
            {open ? t('voice.recording_open', { time }) : t('voice.recording', { time, max })}
          </Text>
        </View>
        {voice.live ? (
          // On-device recognition: what she has said so far, as she says it.
          <Text
            accessibilityLabel={t('voice.live', { text: voice.live })}
            style={[TYPE.body, { color: palette.ink2, fontStyle: 'italic' }]}
            numberOfLines={4}
          >
            „{voice.live}“
          </Text>
        ) : null}
      </View>
    );
  }

  if (voice.state === 'transcribing') {
    // The words arrive while the model is still writing them down (issue #9); until the
    // first one is there, it says what is happening.
    return voice.live ? (
      <Text
        accessibilityLiveRegion="polite"
        accessibilityLabel={t('voice.live', { text: voice.live })}
        style={[TYPE.body, { color: palette.ink2, fontStyle: 'italic', minHeight: 22 }]}
        numberOfLines={4}
      >
        „{voice.live}“
      </Text>
    ) : (
      <Text
        accessibilityLiveRegion="polite"
        style={[TYPE.body, { color: palette.ink2, minHeight: 22 }]}
      >
        {t('voice.transcribing')}
      </Text>
    );
  }

  if (voice.denied) {
    return (
      <View style={{ gap: 8 }}>
        <Text accessibilityRole="alert" style={[TYPE.body, { color: palette.ink2 }]}>
          {Platform.OS === 'web' ? t('voice.denied_web') : t('voice.denied')}
        </Text>
        {Platform.OS !== 'web' ? (
          <Btn variant="soft" onPress={() => void Linking.openSettings()}>
            {t('voice.open_settings')}
          </Btn>
        ) : null}
      </View>
    );
  }

  if (voice.hint && voice.state === 'idle') {
    return (
      <Text accessibilityRole="alert" style={[TYPE.body, { color: palette.ink2 }]}>
        {t(`voice.problem.${voice.hint}`)}
      </Text>
    );
  }

  return null;
}
