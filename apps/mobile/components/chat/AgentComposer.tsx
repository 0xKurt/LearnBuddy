// Agent composer — single input area with mic + conversation buttons.
//
// Three input affordances:
//   1. Text input + send button → standard typing.
//   2. Mic button → push-to-talk. Tap to start. VAD auto-stops after
//      ~1.8s silence (parent receives the recording via onSubmitVoice).
//      Tap again to cancel/stop early. While recording the row shows
//      a live waveform + "Hört zu …" status; cancel and stop are split
//      buttons so you can throw away a botched take.
//   3. Phone button → opens the full Conversation mode (handled by the
//      parent via onOpenConversation).

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

import { LB } from '../../lib/theme/colors';
import { useVoiceRecorder, type VoiceRecording } from '../../lib/voice/use-voice-recorder';

export type AgentComposerProps = {
  disabled?: boolean;
  /** True while the agent is producing a reply — composer locks input. */
  busy?: boolean;
  onSubmitText: (text: string) => void;
  onSubmitVoice: (recording: VoiceRecording) => void;
  /** Tap on the phone icon — parent opens the Conversation modal. */
  onOpenConversation?: () => void;
};

const WAVEFORM_BARS = 18;

export function AgentComposer({
  disabled = false,
  busy = false,
  onSubmitText,
  onSubmitVoice,
  onOpenConversation,
}: AgentComposerProps) {
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  // Capture refs for stop() so the VAD callback can fire even after
  // the recorder closure is stale.
  const stopRef = useRef<() => Promise<void>>(async () => {});
  const submitOnSilence = useCallback(async () => {
    await stopRef.current();
  }, []);
  const voice = useVoiceRecorder({ onSilence: submitOnSilence, silenceMs: 1800 });

  const doStop = useCallback(async () => {
    if (uploading) return;
    setUploading(true);
    const result = await voice.stop();
    setUploading(false);
    if (result && result.durationMs > 250) onSubmitVoice(result);
  }, [voice, uploading, onSubmitVoice]);
  stopRef.current = doStop;

  const doCancel = useCallback(async () => {
    await voice.cancel();
  }, [voice]);

  const submitText = useCallback(() => {
    const value = text.trim();
    if (!value || disabled || busy || voice.recording) return;
    onSubmitText(value);
    setText('');
  }, [text, disabled, busy, voice.recording, onSubmitText]);

  const toggleVoice = useCallback(async () => {
    if (disabled || busy) return;
    if (voice.recording) {
      await doStop();
      return;
    }
    await voice.start();
  }, [disabled, busy, voice, doStop]);

  const canSendText = text.trim().length > 0 && !disabled && !busy && !voice.recording;
  const showConversationButton =
    !voice.recording && !uploading && !busy && !disabled && !!onOpenConversation;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <View style={styles.container}>
        {voice.permissionDenied ? (
          <Text style={styles.permissionHint}>
            Mikrofon-Zugriff fehlt. Bitte in den Einstellungen erlauben.
          </Text>
        ) : null}

        {/* Recording overlay row — replaces the input while recording */}
        {voice.recording || uploading ? (
          <RecordingBar
            level={voice.level}
            uploading={uploading}
            onStop={toggleVoice}
            onCancel={doCancel}
          />
        ) : (
          <View style={styles.row}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Antwort eingeben …"
              placeholderTextColor={LB.ink3}
              editable={!disabled && !busy}
              style={styles.input}
              multiline
              onSubmitEditing={submitText}
              blurOnSubmit={false}
              returnKeyType="send"
            />
            {/* Conversation (phone) button */}
            {showConversationButton ? (
              <Pressable
                onPress={onOpenConversation}
                style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Sprachgespräch starten"
              >
                <View style={styles.phone}>
                  <Text style={styles.phoneGlyph}>📞</Text>
                </View>
              </Pressable>
            ) : null}
            {/* Mic */}
            <Pressable
              onPress={toggleVoice}
              disabled={disabled || busy}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Sprachnachricht aufnehmen"
            >
              <View style={styles.mic}>
                <Text style={styles.micGlyph}>🎤</Text>
              </View>
            </Pressable>
            {/* Send */}
            <Pressable
              onPress={submitText}
              disabled={!canSendText}
              style={({ pressed }) => [
                styles.iconBtn,
                !canSendText && styles.sendDisabled,
                pressed && canSendText && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Antwort absenden"
            >
              <View style={styles.send}>
                <Text style={styles.sendArrow}>↑</Text>
              </View>
            </Pressable>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Recording bar (waveform + cancel / stop) ──────────────────────────────

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
        style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Aufnahme abbrechen"
      >
        <Text style={styles.cancelGlyph}>×</Text>
      </Pressable>
      <View style={styles.waveformWrap}>
        <View style={styles.statusRow}>
          <View style={styles.recordingDot} />
          <Text style={styles.statusText}>{uploading ? 'Sende …' : 'Hört zu …'}</Text>
        </View>
        <Waveform level={level} />
      </View>
      <Pressable
        onPress={onStop}
        disabled={uploading}
        style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Aufnahme stoppen und senden"
      >
        <View style={styles.send}>
          {uploading ? (
            <ActivityIndicator color={LB.paper} />
          ) : (
            <Text style={styles.sendArrow}>↑</Text>
          )}
        </View>
      </Pressable>
    </View>
  );
}

function Waveform({ level }: { level: number }) {
  // Pre-computed bar phases (stable across re-renders for a smooth look).
  const phasesRef = useRef<number[]>(Array.from({ length: WAVEFORM_BARS }, () => Math.random()));
  return (
    <View style={styles.waveform}>
      {phasesRef.current.map((p, i) => {
        // Each bar oscillates around the live level. Mid bars get
        // amplified slightly so the centre looks louder than edges.
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
  container: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: LB.paper,
    borderTopWidth: 1,
    borderTopColor: LB.hairline,
  },
  permissionHint: { fontSize: 12, color: LB.danger, marginBottom: 6, paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: LB.bg,
    color: LB.ink,
    fontSize: 15,
    lineHeight: 20,
  },
  iconBtn: { alignSelf: 'flex-end' },
  pressed: { opacity: 0.7 },
  sendDisabled: { opacity: 0.35 },
  mic: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: LB.primaryLt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micGlyph: { fontSize: 18 },
  phone: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: LB.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneGlyph: { fontSize: 18 },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: LB.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendArrow: { color: LB.paper, fontSize: 20, fontWeight: '700', marginTop: -2 },
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
  cancelGlyph: { fontSize: 22, color: LB.ink2, marginTop: -2, fontWeight: '700' },
  waveformWrap: {
    flex: 1,
    paddingHorizontal: 12,
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
});
