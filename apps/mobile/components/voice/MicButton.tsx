import { BusyIndicator } from '../lb/BusyIndicator.js';
// Shared microphone control: one stop square, timer and permission action for dictation,
// conversation and bounded recordings. Presentations only change the available space.

import { useTranslation } from 'react-i18next';
import { Linking, Platform, Text, View } from 'react-native';
import { TALK } from '../../lib/theme/talk.js';
import { UI } from '../../lib/theme/components.js';
import { VOICE } from '../../lib/theme/voice.js';
export { MIC_RING_ROOM } from '../../lib/theme/voice.js';

import { useAnnounce } from '../../lib/announce.js';
import { formatClock } from '../../lib/speech/voice.js';
import { circle } from '../../lib/theme/radius.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Icon } from '../lb/Icon.js';
import { PressArea } from '../lb/PressArea.js';
import type { VoiceInput } from './useVoiceInput.js';
import { RecordingStatus } from './RecordingStatus.js';

export type MicControl = Pick<
  VoiceInput,
  'elapsedMs' | 'maxMs' | 'denied' | 'hint' | 'live' | 'toggle'
> & { state: VoiceInput['state'] | 'stopping' };

type Props = {
  voice: MicControl;
  /** What tapping does when idle ("Nachricht sprechen", "Antwort sagen"). */
  label: string;
  /** Optional short visible copy; the accessible action keeps its full name. */
  visibleLabel?: string;
  /** lg: the main control of a conversation (`VoiceRow`). */
  size?: 'sm' | 'md' | 'lg';
  /** Filled even when idle (the composer's main control while the field is empty). */
  filled?: boolean;
  /** Explicit secondary tools stay quiet in every state; omitted preserves existing callers. */
  tone?: 'quiet' | 'primary';
  /** Instead of start/stop recording (the conversation screen runs its own loop). */
  onPress?: () => void;
  disabled?: boolean;
  presentation?: 'circle' | 'pill' | 'recorder';
  busy?: boolean;
  busyLabel?: string;
  accessibilityHint?: string;
};

export function MicButton({
  voice,
  label,
  visibleLabel,
  size = 'md',
  filled: filledIdle = false,
  tone,
  disabled = false,
  onPress,
  presentation = 'circle',
  busy = false,
  busyLabel,
  accessibilityHint,
}: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('common');
  const recording = voice.state === 'recording';
  const working =
    busy ||
    voice.state === 'starting' ||
    voice.state === 'stopping' ||
    voice.state === 'transcribing';
  const statusLabel =
    voice.state === 'starting'
      ? t('voice.getting_ready')
      : voice.state === 'stopping'
        ? t('voice.finishing')
        : busy
          ? (busyLabel ?? t('loading'))
          : null;
  const refused = Boolean(voice.denied) && Platform.OS !== 'web';
  const press = refused ? () => void Linking.openSettings() : (onPress ?? voice.toggle);
  const actionLabel = refused
    ? t('voice.open_settings')
    : recording
      ? t('voice.stop')
      : (statusLabel ?? label);
  // A running recording can always be stopped.
  const off = recording || refused ? false : disabled || working;
  // 'sm' is the composer pill, where it stands beside the + and the talk button: one size
  // for the three, or their centres drift apart on the pill's baseline (issue #134).
  const pill = presentation === 'pill';
  const d = pill ? TALK.micHeight : VOICE.face[size];
  const target = Math.max(TOUCH, d);
  const quiet = tone === 'quiet';
  const filled = !quiet && (tone === 'primary' || size === 'lg' || recording || filledIdle);
  // The stop square on the darker fill is the round mic's sign for "recording"; the pill keeps
  // its colour; all presentations use the same stop glyph.
  const square = recording;
  const bg = quiet
    ? palette.canvas
    : square && !pill
      ? palette.primaryDk
      : filled
        ? palette.primary
        : palette.paper;
  const fg = quiet ? palette.ink : filled ? palette.onPrimary : palette.primaryDk;
  const time = formatClock(voice.elapsedMs);

  if (presentation === 'recorder') {
    return (
      <Btn
        size="lg"
        full
        pill
        variant={tone === 'quiet' ? 'secondary' : 'primary'}
        {...(refused ? {} : { icon: recording ? ('stop' as const) : ('mic' as const) })}
        busy={working}
        disabled={off}
        onPress={press}
        accessibilityLabel={actionLabel}
        accessibilityHint={recording || refused ? undefined : accessibilityHint}
      >
        {refused
          ? t('voice.open_settings')
          : recording
            ? t('voice.done')
            : (statusLabel ?? visibleLabel ?? label)}
      </Btn>
    );
  }

  return (
    <View
      style={{
        width: pill ? undefined : target,
        height: target,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <PressArea
        onPress={press}
        disabled={off}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        accessibilityHint={recording ? t('voice.stop_hint') : t('voice.hint')}
        accessibilityState={{ disabled: off, busy: working }}
        aria-busy={working}
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
          width: pill ? undefined : target,
          height: target,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: circle(d),
          // The pill's shadow lies outside its edge.
          overflow: pill ? 'visible' : 'hidden',
          opacity: off && !working ? UI.disabledOpacity : 1,
        }}
      >
        {(pressed) => (
          <View
            collapsable={false}
            style={{
              width: pill ? undefined : d,
              paddingHorizontal: pill ? TALK.micPadding : undefined,
              flexDirection: 'row',
              gap: SPACE.sm,
              height: d,
              borderRadius: circle(d),
              backgroundColor: bg,
              borderWidth: quiet || filled ? 0 : VOICE.border,
              borderColor: palette.hairline,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? VOICE.pressedOpacity : 1,
              ...(pill && filled ? SHADOW.float : null),
            }}
          >
            {working ? (
              <BusyIndicator color={fg} />
            ) : (
              <Icon
                name={square ? 'stop' : 'mic'}
                size={
                  pill
                    ? TALK.micGlyph
                    : size === 'sm' && !recording
                      ? VOICE.slotGlyph
                      : Math.round(d * (square ? VOICE.iconRatio.stop : VOICE.iconRatio.mic))
                }
                color={fg}
              />
            )}
            {pill ? (
              <Text style={[TYPE.action, { color: fg }]}>
                {refused
                  ? t('voice.open_settings')
                  : recording
                    ? t('voice.done')
                    : (visibleLabel ?? label)}
              </Text>
            ) : null}
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
export function MicStatus({ voice, targetMs }: { voice: MicControl; targetMs?: number }) {
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
    return (
      <View style={{ gap: VOICE.statusGap }}>
        <RecordingStatus elapsedMs={voice.elapsedMs} maxMs={voice.maxMs} targetMs={targetMs} />
        {voice.live ? (
          // On-device recognition: what she has said so far, as she says it.
          <Text
            accessibilityLabel={t('voice.live', { text: voice.live })}
            style={TYPE.voiceTranscript}
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
        style={[TYPE.voiceTranscript, { minHeight: VOICE.statusHeight }]}
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
