// Agent composer — single input area with a mic button.
//
// Behaviour:
//   - Text input: type, hit send (or paper-plane button).
//   - Mic button: tap to start recording, tap again to stop. While
//     recording the text input dims and the mic shows a pulsing dot.
//   - On stop: audio uploads as `audio_base64`; the server transcribes,
//     emits a `transcript` event the caller renders into the learner's
//     bubble, then streams the agent reply.
//
// No live ASR. No VAD. Tap-to-talk is the right v1 — predictable, no
// false stops, no half-formed sentences sent.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
};

export function AgentComposer({
  disabled = false,
  busy = false,
  onSubmitText,
  onSubmitVoice,
}: AgentComposerProps) {
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const voice = useVoiceRecorder();

  const pulseRef = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (voice.recording) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseRef, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseRef, { toValue: 0, duration: 700, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    pulseRef.setValue(0);
  }, [voice.recording, pulseRef]);

  const submitText = useCallback(() => {
    const value = text.trim();
    if (!value || disabled || busy) return;
    onSubmitText(value);
    setText('');
  }, [text, disabled, busy, onSubmitText]);

  const toggleVoice = useCallback(async () => {
    if (disabled || busy) return;
    if (voice.recording) {
      setUploading(true);
      const result = await voice.stop();
      if (result) onSubmitVoice(result);
      setUploading(false);
      return;
    }
    await voice.start();
  }, [disabled, busy, voice, onSubmitVoice]);

  const inputDimmed = voice.recording || uploading;
  const canSendText = text.trim().length > 0 && !disabled && !busy && !voice.recording;

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
        <View style={styles.row}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={voice.recording ? 'Ich höre …' : 'Antwort eingeben …'}
            placeholderTextColor={LB.ink3}
            editable={!inputDimmed && !disabled && !busy}
            style={[styles.input, inputDimmed && styles.inputMuted]}
            multiline
            onSubmitEditing={submitText}
            blurOnSubmit={false}
            returnKeyType="send"
          />
          {/* Mic toggle */}
          <Pressable
            onPress={toggleVoice}
            disabled={disabled || busy || uploading}
            style={({ pressed }) => [styles.micPressable, pressed && styles.micPressed]}
            accessibilityRole="button"
            accessibilityLabel={voice.recording ? 'Aufnahme stoppen' : 'Sprachnachricht aufnehmen'}
          >
            <View style={[styles.mic, voice.recording && styles.micRecording]}>
              {uploading ? (
                <ActivityIndicator color={LB.paper} size="small" />
              ) : (
                <View style={styles.micDotWrap}>
                  <Animated.View
                    style={[
                      styles.micDot,
                      voice.recording && {
                        transform: [
                          {
                            scale: pulseRef.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.9, 1.4],
                            }),
                          },
                        ],
                        opacity: pulseRef.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 0.55],
                        }),
                      },
                    ]}
                  />
                </View>
              )}
            </View>
          </Pressable>
          {/* Send */}
          <Pressable
            onPress={submitText}
            disabled={!canSendText}
            style={({ pressed }) => [
              styles.sendPressable,
              !canSendText && styles.sendDisabled,
              pressed && canSendText && styles.sendPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Antwort absenden"
          >
            <View style={styles.send}>
              <Text style={styles.sendArrow}>↑</Text>
            </View>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

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
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
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
  inputMuted: { opacity: 0.5 },
  micPressable: { alignSelf: 'flex-end' },
  micPressed: { opacity: 0.7 },
  mic: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: LB.primaryLt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micRecording: { backgroundColor: LB.primary },
  micDotWrap: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  micDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: LB.primaryDk },
  sendPressable: { alignSelf: 'flex-end' },
  sendPressed: { opacity: 0.85 },
  sendDisabled: { opacity: 0.35 },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: LB.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendArrow: { color: LB.paper, fontSize: 20, fontWeight: '700', marginTop: -2 },
});
