// Agent composer — ChatGPT-style input area.
//
// Layout (idle / no text):
//   ┌────────────────────────────────────────────────┐
//   │  Antwort eingeben …                  [mic] [⌇]  │
//   └────────────────────────────────────────────────┘
//
// Layout (text being typed — mic/waveform fade out, send arrow appears):
//   ┌────────────────────────────────────────────────┐
//   │  Hallo, was kommt bei 2+2 raus?           [ ↑ ]  │
//   │  (grows to 3 lines max)                          │
//   └────────────────────────────────────────────────┘
//
// Layout (mic recording — transcript-to-field flow):
//   ┌──── [×] [────▒▒▒▒▒ Hört zu] [ ↓ stop] ────────┐
//
// Behaviour:
//   - mic icon  → dictation. Audio uploads to /agent/transcribe, the
//                 returned text is appended to the input field. The
//                 kid reads it, optionally edits, then taps send.
//                 (Does NOT auto-submit.)
//   - waveform  → opens the full Conversation modal (parent handles).
//                 In the modal everything is automatic.
//   - send (↑)  → submit the current text. Only visible when text is
//                 present.

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

const WAVEFORM_BARS = 18;

export type AgentComposerProps = {
  disabled?: boolean;
  /** True while the agent is producing a reply — composer locks input. */
  busy?: boolean;
  /** Async transcriber the composer calls when the mic recording is done.
   *  Returns the recognised text which is appended to the input field. */
  transcribe: (audio: {
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

  // Refs so the VAD callback can call stop() even when its closure is stale.
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
    try {
      const recognised = await transcribe({ base64: result.base64, mime: result.mime });
      const cleaned = recognised.trim();
      if (cleaned) {
        // Append to the current input — let the kid keep typing or edit
        // before sending.
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
          <View style={styles.inputWrap}>
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
            <View style={styles.trailingButtons}>
              {hasText ? (
                <SendButton onPress={submitText} disabled={!hasText || disabled || busy} />
              ) : (
                <>
                  <MicButton onPress={startVoice} disabled={disabled || busy} />
                  {onOpenConversation ? (
                    <ConversationButton onPress={onOpenConversation} disabled={disabled || busy} />
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

function MicButton({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed, disabled && styles.dim]}
      accessibilityRole="button"
      accessibilityLabel="Sprachnachricht aufnehmen"
    >
      <Icon name="mic" size={22} color={LB.ink2} />
    </Pressable>
  );
}

function ConversationButton({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [
        styles.conversationBtn,
        pressed && styles.pressed,
        disabled && styles.dim,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Sprachgespräch starten"
    >
      <Icon name="waveform" size={20} color={LB.ink} />
    </Pressable>
  );
}

function SendButton({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [
        styles.sendBtn,
        disabled && styles.dim,
        pressed && !disabled && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Antwort absenden"
    >
      <Icon name="arrow-up" size={20} color={LB.paper} />
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
        style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Aufnahme abbrechen"
      >
        <Icon name="close" size={20} color={LB.ink2} />
      </Pressable>
      <View style={styles.waveformWrap}>
        <View style={styles.statusRow}>
          <View style={styles.recordingDot} />
          <Text style={styles.statusText}>{uploading ? 'Verstehe …' : 'Hört zu …'}</Text>
        </View>
        <Waveform level={level} />
      </View>
      <Pressable
        onPress={onStop}
        disabled={uploading}
        hitSlop={8}
        style={({ pressed }) => [styles.confirmBtn, pressed && styles.pressed]}
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
  const phasesRef = useRef<number[]>(Array.from({ length: WAVEFORM_BARS }, () => Math.random()));
  return (
    <View style={styles.waveform}>
      {phasesRef.current.map((p, i) => {
        const distanceFromCentre = Math.abs(i - WAVEFORM_BARS / 2) / (WAVEFORM_BARS / 2);
        const amp = level * (1 - distanceFromCentre * 0.3) + 0.05;
        const height = 6 + Math.min(28, Math.max(2, amp * 80 * (0.6 + p * 0.8)));
        return (
          <View
            key={i}
            style={{
              width: 3,
              height,
              borderRadius: 1.5,
              backgroundColor: LB.primary,
              opacity: 0.8 + p * 0.2,
            }}
          />
        );
      })}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

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
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: LB.bg,
    borderRadius: 26,
    paddingLeft: 18,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 52,
  },
  input: {
    flex: 1,
    paddingVertical: 8,
    paddingRight: 6,
    color: LB.ink,
    fontSize: 16,
    lineHeight: 22,
    // Roughly 3 lines * 22 lineHeight + a little padding.
    maxHeight: 72,
  },
  trailingButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 2,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conversationBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: LB.paper,
    // Soft ring so the white pill stands out against the bg-tinted input
    borderWidth: 1,
    borderColor: LB.hairline,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: LB.primary,
  },
  pressed: { opacity: 0.7 },
  dim: { opacity: 0.35 },
  // Recording bar
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  cancelBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: LB.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveformWrap: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 22,
    backgroundColor: LB.bg,
    minHeight: 44,
    justifyContent: 'center',
    gap: 4,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: LB.danger },
  statusText: { fontSize: 12, color: LB.ink2 },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 30 },
  confirmBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: LB.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
