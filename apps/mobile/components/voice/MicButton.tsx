import { BusyIndicator } from '../lb/BusyIndicator.js';
// The round mic button (56 pt; 72 pt when it is the main control of a conversation,
// `VoiceRow`; 40 pt in the input bar) and the one status line that goes with it. Built like
// CircleBtn: the press target outside (PressArea), the background on the inner View. Tap to
// start, tap to stop. While recording, a ring pulses (still for reduced motion), the icon turns
// into a stop square and the timer runs; while the words are being written down, a small
// spinner sits in the button.

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, Linking, Platform, Text, View } from 'react-native';
import { DURATION, useMotionReduced } from '../../lib/theme/motion.js';
import { VOICE } from '../../lib/theme/voice.js';
export { MIC_RING_ROOM } from '../../lib/theme/voice.js';

import { useAnnounce } from '../../lib/announce.js';
import { formatClock } from '../../lib/speech/voice.js';
import { circle } from '../../lib/theme/radius.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Icon } from '../lb/Icon.js';
import { PressArea } from '../lb/PressArea.js';
import type { VoiceInput } from './useVoiceInput.js';

function PulseRing({ size }: { size: number }) {
  const { palette } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;
  // Reactive: toggling "reduce motion" while the app runs stops the pulse too.
  const still = useMotionReduced();

  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: DURATION.voicePulse,
        easing: Easing.out(Easing.ease),
        useNativeDriver: Platform.OS !== 'web',
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, still]);

  const scale = still
    ? VOICE.ring.stillScale
    : progress.interpolate({ inputRange: [0, 1], outputRange: [1, VOICE.ring.scale] });
  const opacity = still
    ? VOICE.ring.stillOpacity
    : progress.interpolate({ inputRange: [0, 1], outputRange: [VOICE.ring.opacity, 0] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: circle(size),
        borderWidth: VOICE.ring.border,
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
  /** lg: the main control of a conversation (`VoiceRow`). */
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
  // 'sm' is the composer pill, where it stands beside the + and the talk button: one size
  // for the three, or their centres drift apart on the pill's baseline (issue #134).
  const d = VOICE.face[size];
  const target = Math.max(TOUCH, d);
  const filled = size === 'lg' || recording || filledIdle;
  const bg = recording ? palette.primaryDk : filled ? palette.primary : palette.paper;
  const fg = filled ? palette.onPrimary : palette.primaryDk;
  const time = formatClock(voice.elapsedMs);

  return (
    <View style={{ width: target, height: target, alignItems: 'center', justifyContent: 'center' }}>
      {recording ? <PulseRing size={d} /> : null}
      <PressArea
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
        android_ripple={{ color: palette.hairline, borderless: false }}
        style={{
          width: target,
          height: target,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: circle(d),
          overflow: 'hidden',
          opacity: off && !working ? VOICE.disabledOpacity : 1,
        }}
      >
        {(pressed) => (
          <View
            style={{
              width: d,
              height: d,
              borderRadius: circle(d),
              backgroundColor: bg,
              borderWidth: filled ? 0 : VOICE.border,
              borderColor: palette.hairline,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? VOICE.pressedOpacity : 1,
            }}
          >
            {working ? (
              <BusyIndicator color={fg} />
            ) : (
              <Icon
                name={recording ? 'stop' : 'mic'}
                size={Math.round(d * (recording ? VOICE.iconRatio.stop : VOICE.iconRatio.mic))}
                color={fg}
              />
            )}
          </View>
        )}
      </PressArea>
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
      : // Getting ready is its own state and says so (issue #158): nothing here may read
        // as "go ahead, talk" while the recorder is still being prepared.
        voice.state === 'starting'
        ? t('voice.getting_ready')
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
      <View style={{ gap: VOICE.statusGap }}>
        <View
          accessible
          accessibilityLabel={
            open
              ? t('voice.recording_open_value', { time })
              : t('voice.recording_value', { time, max })
          }
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACE.sm,
            minHeight: VOICE.statusHeight,
          }}
        >
          <View
            style={{
              width: VOICE.statusDot,
              height: VOICE.statusDot,
              borderRadius: circle(VOICE.statusDot),
              backgroundColor: palette.primary,
            }}
            importantForAccessibility="no"
          />
          <Text style={TYPE.voiceStatus}>
            {open ? t('voice.recording_open', { time }) : t('voice.recording', { time, max })}
          </Text>
        </View>
        {voice.live ? (
          // On-device recognition: what she has said so far, as she says it.
          <Text
            accessibilityLabel={t('voice.live', { text: voice.live })}
            style={[TYPE.body, { color: palette.ink2, fontStyle: 'italic' }]}
            numberOfLines={VOICE.liveLines}
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
        style={[
          TYPE.body,
          { color: palette.ink2, fontStyle: 'italic', minHeight: VOICE.statusHeight },
        ]}
        numberOfLines={VOICE.liveLines}
      >
        „{voice.live}“
      </Text>
    ) : (
      <Text
        accessibilityLiveRegion="polite"
        style={[TYPE.body, { color: palette.ink2, minHeight: VOICE.statusHeight }]}
      >
        {t('voice.transcribing')}
      </Text>
    );
  }

  if (voice.denied) {
    return (
      <View style={{ gap: SPACE.sm }}>
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
