// Agent composer — ChatGPT-style input area, polished.
//
// Layout (idle / no text):
//   ┌──────────────────────────────────────────────────────────┐
//   │  Antwort eingeben …               [ mic ] [ waveform ]   │
//   └──────────────────────────────────────────────────────────┘
//
// Layout (text being typed — trailing icons collapse to send):
//   ┌──────────────────────────────────────────────────────────┐
//   │  Hallo, was kommt bei 2+2 raus?                  [ ↑ ]    │
//   │  (grows up to 3 lines, then scrolls)                       │
//   └──────────────────────────────────────────────────────────┘
//
// Recording bar (replaces input):
//   ┌─── [×] ─[●  Hört zu  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒]─ [ ✓ ] ──┐
//
// Behaviour:
//   - mic    → dictation. Audio uploads to /agent/transcribe, the
//              returned text is APPENDED to the input field. The kid
//              reads it, optionally edits, then taps send. Never
//              auto-submits.
//   - wave   → opens the full Conversation modal (parent handles).
//   - send   → submit. Only visible when text is present.

import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Icon } from '../lb/Icon';
import { LB } from '../../lib/theme/colors';
import { useVoiceRecorder } from '../../lib/voice/use-voice-recorder';

const WAVEFORM_BARS = 36;

export type AgentComposerProps = {
  disabled?: boolean;
  busy?: boolean;
  /** Audio → text. Optional so the composer still renders if the parent
   *  hasn't wired it yet (defensive — a stale Metro bundle would
   *  otherwise crash with "transcribe is not a function"). */
  transcribe?: (audio: {
    base64: string;
    mime: 'audio/m4a' | 'audio/mp4' | 'audio/wav' | 'audio/webm';
  }) => Promise<string>;
  onSubmitText: (text: string) => void;
  /** Tap on the waveform icon — parent opens the Conversation modal. */
  onOpenConversation?: () => void;
};

export function AgentComposer({
  disabled = false,
  busy = false,
  transcribe,
  onSubmitText,
  onOpenConversation,
}: AgentComposerProps) {
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  const stopRef = useRef<() => Promise<void>>(async () => {});
  const submitOnSilence = useCallback(async () => {
    await stopRef.current();
  }, []);
  const voice = useVoiceRecorder({ onSilence: submitOnSilence, silenceMs: 1800 });

  const doStop = useCallback(async () => {
    if (uploading) return;
    setUploading(true);
    setTranscribeError(null);
    const result = await voice.stop();
    if (!result || result.durationMs < 250) {
      setUploading(false);
      return;
    }
    if (typeof transcribe !== 'function') {
      // Defensive — the prop is required but a stale bundle (Metro cache)
      // can leave it undefined. Surface a clear error instead of crashing.
      setTranscribeError('Aufnahme noch nicht bereit. Bitte neu laden.');
      setUploading(false);
      return;
    }
    try {
      const recognised = await transcribe({ base64: result.base64, mime: result.mime });
      const cleaned = recognised.trim();
      if (cleaned) {
        setText((prev) => (prev.trim() ? `${prev.trim()} ${cleaned}` : cleaned));
      }
    } catch (err) {
      setTranscribeError(err instanceof Error ? err.message : 'Konnte nicht verstehen');
    } finally {
      setUploading(false);
    }
  }, [voice, uploading, transcribe]);
  stopRef.current = doStop;

  const doCancel = useCallback(async () => {
    setTranscribeError(null);
    await voice.cancel();
  }, [voice]);

  const submitText = useCallback(() => {
    const value = text.trim();
    if (!value || disabled || busy || voice.recording) return;
    onSubmitText(value);
    setText('');
  }, [text, disabled, busy, voice.recording, onSubmitText]);

  const startVoice = useCallback(async () => {
    if (disabled || busy) return;
    setTranscribeError(null);
    await voice.start();
  }, [disabled, busy, voice]);

  const hasText = text.trim().length > 0;
  const isRecording = voice.recording || uploading;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <View style={styles.outer}>
        {transcribeError ? (
          <Text style={styles.errorHint}>{transcribeError}</Text>
        ) : voice.permissionDenied ? (
          <Text style={styles.errorHint}>
            Mikrofon-Zugriff fehlt. Bitte in den Einstellungen erlauben.
          </Text>
        ) : null}

        {isRecording ? (
          <RecordingBar
            level={voice.level}
            uploading={uploading}
            onStop={doStop}
            onCancel={doCancel}
          />
        ) : (
          <View style={styles.inputPill}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Antwort eingeben …"
              placeholderTextColor={LB.ink3}
              editable={!disabled && !busy}
              style={styles.input}
              multiline
              scrollEnabled
              maxLength={4000}
            />
            <View style={styles.trailing}>
              {hasText ? (
                <TrailingButton
                  variant="primary"
                  icon="arrow-up"
                  iconColor={LB.paper}
                  onPress={submitText}
                  disabled={!hasText || disabled || busy}
                  label="Antwort absenden"
                />
              ) : (
                <>
                  <TrailingButton
                    variant="soft"
                    icon="mic"
                    iconColor={LB.ink}
                    onPress={startVoice}
                    disabled={disabled || busy}
                    label="Sprachnachricht aufnehmen"
                  />
                  {onOpenConversation ? (
                    <TrailingButton
                      variant="dark"
                      icon="waveform"
                      iconColor={LB.paper}
                      onPress={onOpenConversation}
                      disabled={disabled || busy}
                      label="Sprachgespräch starten"
                    />
                  ) : null}
                </>
              )}
            </View>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Trailing buttons ──────────────────────────────────────────────────────

type TrailingVariant = 'primary' | 'dark' | 'soft';

function TrailingButton({
  variant,
  icon,
  iconColor,
  onPress,
  disabled,
  label,
}: {
  variant: TrailingVariant;
  icon: 'arrow-up' | 'mic' | 'waveform';
  iconColor: string;
  onPress: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [
        styles.trailingBtn,
        variant === 'primary' && styles.trailingPrimary,
        variant === 'dark' && styles.trailingDark,
        variant === 'soft' && styles.trailingSoft,
        disabled && styles.dim,
        pressed && !disabled && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon name={icon} size={20} color={iconColor} />
    </Pressable>
  );
}

// ── Recording bar (waveform + cancel / stop-and-transcribe) ───────────────

function RecordingBar({
  level,
  uploading,
  onStop,
  onCancel,
}: {
  level: number;
  uploading: boolean;
  onStop: () => void;
  onCancel: () => void;
}) {
  return (
    <View style={styles.recordingBar}>
      <Pressable
        onPress={onCancel}
        disabled={uploading}
        hitSlop={8}
        style={({ pressed }) => [
          styles.recordingSideBtn,
          styles.recordingCancel,
          pressed && !uploading && styles.pressed,
          uploading && styles.dim,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Aufnahme abbrechen"
      >
        <Icon name="close" size={20} color={LB.ink2} />
      </Pressable>
      <View style={styles.waveformPill}>
        <View style={styles.statusRow}>
          <View style={styles.recordingDot} />
          <Text style={styles.statusText}>{uploading ? 'Verstehe …' : 'Hört zu'}</Text>
        </View>
        <Waveform level={level} />
      </View>
      <Pressable
        onPress={onStop}
        disabled={uploading}
        hitSlop={8}
        style={({ pressed }) => [
          styles.recordingSideBtn,
          styles.recordingConfirm,
          pressed && !uploading && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Aufnahme stoppen und übernehmen"
      >
        {uploading ? (
          <ActivityIndicator color={LB.paper} />
        ) : (
          <Icon name="check" size={20} color={LB.paper} />
        )}
      </Pressable>
    </View>
  );
}

function Waveform({ level }: { level: number }) {
  // Stable per-bar random phases so the waveform looks alive but not
  // jittery on every re-render.
  const phasesRef = useRef<number[]>(Array.from({ length: WAVEFORM_BARS }, () => Math.random()));
  return (
    <View style={styles.waveform}>
      {phasesRef.current.map((p, i) => {
        const distanceFromCentre = Math.abs(i - WAVEFORM_BARS / 2) / (WAVEFORM_BARS / 2);
        // Centre bars get a small amplitude boost so the wave looks
        // shaped instead of uniformly noisy.
        const amp = level * (1 - distanceFromCentre * 0.25) + 0.04;
        const height = 4 + Math.min(26, Math.max(2, amp * 70 * (0.65 + p * 0.7)));
        return (
          <View
            key={i}
            style={{
              width: 2,
              height,
              borderRadius: 1,
              backgroundColor: LB.primary,
              opacity: 0.85 + p * 0.15,
            }}
          />
        );
      })}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const TRAILING_SIZE = 44;
const SIDE_SIZE = 46;

const styles = StyleSheet.create({
  outer: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: LB.paper,
    borderTopWidth: 1,
    borderTopColor: LB.hairline,
  },
  errorHint: {
    fontSize: 12,
    color: LB.danger,
    marginBottom: 6,
    paddingHorizontal: 8,
  },

  // ── Idle: rounded pill containing input + trailing buttons ──
  inputPill: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: LB.bg,
    borderRadius: 28,
    paddingLeft: 20,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 56,
    // Subtle hairline so the pill reads even on a light background.
    borderWidth: 1,
    borderColor: LB.hairline,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    paddingRight: 8,
    color: LB.ink,
    fontSize: 16,
    lineHeight: 22,
    // Roughly 3 lines (22 × 3 + slack); after that the input scrolls.
    maxHeight: 88,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 1,
  },
  trailingBtn: {
    width: TRAILING_SIZE,
    height: TRAILING_SIZE,
    borderRadius: TRAILING_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    // Soft floating feel on iOS; elevation handles Android.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  trailingPrimary: {
    backgroundColor: LB.primary,
  },
  trailingDark: {
    backgroundColor: LB.ink,
  },
  // Soft variant — visible neutral pill against the LB.bg input. The
  // mic uses this so it's CLEARLY a tappable circle, not a bare icon
  // floating in the input.
  trailingSoft: {
    backgroundColor: LB.paper,
    borderWidth: 1,
    borderColor: LB.hairline,
  },
  pressed: { opacity: 0.6 },
  dim: { opacity: 0.35 },

  // ── Recording state — three slots, fills the width ──
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordingSideBtn: {
    width: SIDE_SIZE,
    height: SIDE_SIZE,
    borderRadius: SIDE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingCancel: {
    backgroundColor: LB.bg,
    borderWidth: 1,
    borderColor: LB.hairline,
  },
  recordingConfirm: {
    backgroundColor: LB.primary,
  },
  waveformPill: {
    flex: 1,
    height: SIDE_SIZE,
    borderRadius: SIDE_SIZE / 2,
    backgroundColor: LB.bg,
    borderWidth: 1,
    borderColor: LB.hairline,
    paddingHorizontal: 16,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 80,
  },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: LB.danger },
  statusText: { fontSize: 13, color: LB.ink2, fontWeight: '500' },
  waveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 28,
  },
});
