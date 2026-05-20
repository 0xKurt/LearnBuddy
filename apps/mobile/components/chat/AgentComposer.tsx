// Agent composer — one pill, all states inline.
//
// Three modes, never a separate layout or a modal:
//
//   IDLE
//   ┌────────────────────────────────────────────────────────┐
//   │  Antwort eingeben …             [ mic ] [ wave ]        │
//   └────────────────────────────────────────────────────────┘
//
//   TYPING
//   ┌────────────────────────────────────────────────────────┐
//   │  2/3 + 1/4 ist …                              [  ↑ ]    │
//   └────────────────────────────────────────────────────────┘
//
//   MIC RECORDING (dictation — fills the input field on stop)
//   ┌────────────────────────────────────────────────────────┐
//   │  ● Hört zu  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒    [ × ] [ ✓ ]            │
//   └────────────────────────────────────────────────────────┘
//
//   CONVERSATION MODE (auto loop — TTS, listen again, no modal)
//   ┌────────────────────────────────────────────────────────┐
//   │  ● Hört zu  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒              [ ⏹ ]         │
//   └────────────────────────────────────────────────────────┘
//   (the chat history above stays visible — kid sees every turn)
//
// The pill (LB.bg, radius 28, minHeight 56) never changes dimensions
// across states. Only the contents and the trailing buttons swap.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Speech from 'expo-speech';

import { Icon } from '../lb/Icon';
import { LB } from '../../lib/theme/colors';
import { useVoiceRecorder } from '../../lib/voice/use-voice-recorder';

const WAVEFORM_BARS = 30;

type Mode =
  | 'idle' // typing / nothing happening
  | 'mic-recording' // single-shot dictation, listening
  | 'mic-uploading' // single-shot, transcription in flight
  | 'conv-listening' // conversation mode, mic open
  | 'conv-uploading' // conversation mode, audio uploaded → server processing
  | 'conv-speaking'; // conversation mode, TTS playing

export type AgentComposerProps = {
  disabled?: boolean;
  /** True while the parent is processing a non-voice turn — locks the input. */
  busy?: boolean;
  /** Single-shot dictation: audio in, text out. Mic mode calls this and
   *  appends the result to the input field. */
  transcribe?: (audio: {
    base64: string;
    mime: 'audio/m4a' | 'audio/mp4' | 'audio/wav' | 'audio/webm';
  }) => Promise<string>;
  /** Conversation mode: submit audio as a learner turn and return the
   *  agent's reply text. The parent owns the SSE stream + chat bubble
   *  updates; the composer just plays TTS on the returned text and
   *  re-opens the mic when speech ends. Return '' to skip TTS. */
  submitVoiceTurn?: (audio: {
    base64: string;
    mime: 'audio/m4a' | 'audio/mp4' | 'audio/wav' | 'audio/webm';
  }) => Promise<string>;
  onSubmitText: (text: string) => void;
  /** UI locale used for TTS voice selection. */
  locale?: 'de' | 'en' | 'fr' | 'es' | 'it';
};

function ttsLocale(l: 'de' | 'en' | 'fr' | 'es' | 'it' | undefined): string {
  switch (l) {
    case 'en':
      return 'en-US';
    case 'fr':
      return 'fr-FR';
    case 'es':
      return 'es-ES';
    case 'it':
      return 'it-IT';
    default:
      return 'de-DE';
  }
}

export function AgentComposer({
  disabled = false,
  busy = false,
  transcribe,
  submitVoiceTurn,
  onSubmitText,
  locale,
}: AgentComposerProps) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<Mode>('idle');
  const [errorHint, setErrorHint] = useState<string | null>(null);

  // ── Refs for stale-closure-safe callbacks ──────────────────────────
  const modeRef = useRef<Mode>('idle');
  modeRef.current = mode;
  const stopAndProcessRef = useRef<() => Promise<void>>(async () => {});

  // The VAD callback can fire after the recorder closure is stale, so
  // it always reaches in via ref.
  const onSilence = useCallback(async () => {
    const m = modeRef.current;
    if (m === 'mic-recording' || m === 'conv-listening') {
      await stopAndProcessRef.current();
    }
  }, []);
  // Tighter VAD (1200ms vs the previous 1800ms) so the pause between
  // "I'm done speaking" and "the agent starts processing" feels
  // responsive instead of laggy. Combined with the minSpeechMs floor
  // (800ms) this still avoids cutting off mid-sentence.
  const voice = useVoiceRecorder({ onSilence, silenceMs: 1200 });

  // ── Mic mode (single-shot dictation) ──────────────────────────────
  const stopMicAndTranscribe = useCallback(async () => {
    if (mode !== 'mic-recording') return;
    setMode('mic-uploading');
    setErrorHint(null);
    const result = await voice.stop();
    if (!result || result.durationMs < 250) {
      setMode('idle');
      return;
    }
    if (typeof transcribe !== 'function') {
      setErrorHint('Aufnahme noch nicht bereit. Bitte App neu laden.');
      setMode('idle');
      return;
    }
    try {
      const recognised = (await transcribe({ base64: result.base64, mime: result.mime })).trim();
      if (recognised) {
        setText((prev) => (prev.trim() ? `${prev.trim()} ${recognised}` : recognised));
      }
    } catch (err) {
      setErrorHint(err instanceof Error ? err.message : 'Konnte nicht verstehen');
    } finally {
      setMode('idle');
    }
  }, [mode, voice, transcribe]);

  const cancelMic = useCallback(async () => {
    await voice.cancel();
    setErrorHint(null);
    setMode('idle');
  }, [voice]);

  const startMic = useCallback(async () => {
    if (mode !== 'idle' || disabled || busy) return;
    setErrorHint(null);
    const ok = await voice.start();
    if (ok) setMode('mic-recording');
  }, [mode, disabled, busy, voice]);

  // ── Conversation mode (auto loop) ─────────────────────────────────
  const conversationCancelledRef = useRef(false);

  const beginConvListen = useCallback(async () => {
    if (conversationCancelledRef.current) return;
    setErrorHint(null);
    const ok = await voice.start();
    if (!ok) {
      setMode('idle');
      return;
    }
    setMode('conv-listening');
  }, [voice]);

  const stopConvAndProcess = useCallback(async () => {
    if (modeRef.current !== 'conv-listening') return;
    setMode('conv-uploading');
    const result = await voice.stop();
    if (conversationCancelledRef.current) return;
    if (!result || result.durationMs < 250) {
      // Misfire — listen again.
      void beginConvListen();
      return;
    }
    if (typeof submitVoiceTurn !== 'function') {
      setErrorHint('Gespräch noch nicht bereit. Bitte App neu laden.');
      conversationCancelledRef.current = true;
      setMode('idle');
      return;
    }
    let reply = '';
    try {
      reply = (await submitVoiceTurn({ base64: result.base64, mime: result.mime })).trim();
    } catch (err) {
      setErrorHint(err instanceof Error ? err.message : 'Antwort fehlgeschlagen');
      // Continue the loop — let the kid try again.
      if (!conversationCancelledRef.current) void beginConvListen();
      return;
    }
    if (conversationCancelledRef.current) return;
    if (!reply) {
      // Nothing to speak — go straight back to listening.
      void beginConvListen();
      return;
    }
    setMode('conv-speaking');
    Speech.speak(reply, {
      language: ttsLocale(locale),
      pitch: 1.0,
      // 1.18 ≈ natural conversational pace; the platform default of
      // 1.0 sounds slow and robotic to a school-aged learner.
      rate: 1.18,
      onDone: () => {
        if (!conversationCancelledRef.current) void beginConvListen();
      },
      onStopped: () => {
        if (!conversationCancelledRef.current) void beginConvListen();
      },
      onError: () => {
        if (!conversationCancelledRef.current) void beginConvListen();
      },
    });
  }, [voice, submitVoiceTurn, locale, beginConvListen]);

  const startConversation = useCallback(async () => {
    if (mode !== 'idle' || disabled || busy) return;
    conversationCancelledRef.current = false;
    await beginConvListen();
  }, [mode, disabled, busy, beginConvListen]);

  const stopConversation = useCallback(async () => {
    conversationCancelledRef.current = true;
    void Speech.stop();
    await voice.cancel();
    setMode('idle');
  }, [voice]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      conversationCancelledRef.current = true;
      void Speech.stop();
    };
  }, []);

  // Centralised "stop the current recording and process accordingly"
  // — the VAD callback uses this; it dispatches by current mode.
  stopAndProcessRef.current = async () => {
    if (modeRef.current === 'mic-recording') {
      await stopMicAndTranscribe();
    } else if (modeRef.current === 'conv-listening') {
      await stopConvAndProcess();
    }
  };

  // ── Send text ──────────────────────────────────────────────────────
  const submitText = useCallback(() => {
    const value = text.trim();
    if (!value || disabled || busy || mode !== 'idle') return;
    onSubmitText(value);
    setText('');
  }, [text, disabled, busy, mode, onSubmitText]);

  // ── Derived UI state ───────────────────────────────────────────────
  const hasText = text.trim().length > 0;
  const isRecording = mode === 'mic-recording' || mode === 'conv-listening';
  const isProcessing = mode === 'mic-uploading' || mode === 'conv-uploading';
  const isSpeaking = mode === 'conv-speaking';
  const isConversation =
    mode === 'conv-listening' || mode === 'conv-uploading' || mode === 'conv-speaking';

  const statusText = (() => {
    if (mode === 'mic-recording') return 'Hört zu';
    if (mode === 'mic-uploading') return 'Verstehe …';
    if (mode === 'conv-listening') return 'Hört zu';
    if (mode === 'conv-uploading') return 'Denkt …';
    if (mode === 'conv-speaking') return 'Antwortet';
    return '';
  })();

  return (
    <View style={styles.outer}>
      {errorHint || voice.permissionDenied ? (
        <Text style={styles.errorHint}>
          {errorHint ?? 'Mikrofon-Zugriff fehlt. Bitte in den Einstellungen erlauben.'}
        </Text>
      ) : null}

      <View style={styles.pill}>
        {/* CONTENT (input OR status display) */}
        <View style={styles.contentArea}>
          {isRecording || isProcessing || isSpeaking ? (
            <View style={styles.statusBlock}>
              <View style={styles.statusRow}>
                {isRecording ? <View style={styles.dot} /> : null}
                {isProcessing ? <ActivityIndicator size="small" color={LB.ink2} /> : null}
                <Text style={styles.statusText}>{statusText}</Text>
              </View>
              <Waveform level={isRecording ? voice.level : 0.15} dim={!isRecording} />
            </View>
          ) : (
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
          )}
        </View>

        {/* TRAILING BUTTONS */}
        <View style={styles.trailing}>
          {/* Conversation active → just the stop pill */}
          {isConversation ? (
            <RoundButton
              variant="stop"
              icon="close"
              iconColor={LB.paper}
              onPress={stopConversation}
              label="Sprachgespräch beenden"
            />
          ) : mode === 'mic-recording' ? (
            <>
              <RoundButton
                variant="soft"
                icon="close"
                iconColor={LB.ink}
                onPress={cancelMic}
                label="Aufnahme abbrechen"
              />
              <RoundButton
                variant="success"
                icon="check"
                iconColor={LB.paper}
                onPress={stopMicAndTranscribe}
                label="Aufnahme übernehmen"
              />
            </>
          ) : mode === 'mic-uploading' ? (
            <RoundButton
              variant="success"
              icon="check"
              iconColor={LB.paper}
              onPress={() => undefined}
              disabled
              showSpinner
              label="Bitte warten"
            />
          ) : hasText ? (
            <RoundButton
              variant="primary"
              icon="arrow-up"
              iconColor={LB.paper}
              onPress={submitText}
              disabled={disabled || busy}
              label="Antwort absenden"
            />
          ) : (
            <>
              <RoundButton
                variant="ink"
                icon="mic"
                iconColor={LB.paper}
                onPress={startMic}
                disabled={disabled || busy}
                label="Sprachnachricht aufnehmen"
              />
              {submitVoiceTurn ? (
                <RoundButton
                  variant="primary"
                  icon="waveform"
                  iconColor={LB.paper}
                  onPress={startConversation}
                  disabled={disabled || busy}
                  label="Sprachgespräch starten"
                />
              ) : null}
            </>
          )}
        </View>
      </View>
    </View>
  );
}

// ── Round button (one component, four variants) ───────────────────────────

type Variant = 'primary' | 'soft' | 'stop' | 'ink' | 'success';

function RoundButton({
  variant,
  icon,
  iconColor,
  onPress,
  disabled,
  showSpinner,
  label,
}: {
  variant: Variant;
  icon: 'arrow-up' | 'mic' | 'waveform' | 'close' | 'check';
  iconColor: string;
  onPress: () => void;
  disabled?: boolean;
  showSpinner?: boolean;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [
        styles.btn,
        variant === 'primary' && styles.btnPrimary,
        variant === 'soft' && styles.btnSoft,
        variant === 'stop' && styles.btnStop,
        variant === 'ink' && styles.btnInk,
        variant === 'success' && styles.btnSuccess,
        disabled && styles.dim,
        pressed && !disabled && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {showSpinner ? (
        <ActivityIndicator color={iconColor} />
      ) : (
        <Icon name={icon} size={20} color={iconColor} />
      )}
    </Pressable>
  );
}

// ── Waveform ──────────────────────────────────────────────────────────────

function Waveform({ level, dim = false }: { level: number; dim?: boolean }) {
  // Stable phases so the bars don't jitter wildly on re-render.
  const phasesRef = useRef<number[]>(Array.from({ length: WAVEFORM_BARS }, () => Math.random()));
  return (
    <View style={styles.waveform}>
      {phasesRef.current.map((p, i) => {
        const distanceFromCentre = Math.abs(i - WAVEFORM_BARS / 2) / (WAVEFORM_BARS / 2);
        const amp = level * (1 - distanceFromCentre * 0.25) + 0.05;
        const height = 4 + Math.min(22, Math.max(2, amp * 60 * (0.6 + p * 0.7)));
        return (
          <View
            key={i}
            style={{
              width: 2,
              height,
              borderRadius: 1,
              backgroundColor: dim ? LB.ink3 : LB.primary,
              opacity: dim ? 0.55 : 0.85 + p * 0.15,
            }}
          />
        );
      })}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

// Material Design min tappable target: 48dp. Apple HIG: 44pt. We go 48
// so the buttons feel substantial in either world.
const BTN_SIZE = 48;
// Pill is sized off the buttons + symmetric padding — that way the
// recording state, the idle state, and the single-line typing state
// all render at EXACTLY the same height. Only multiline text grows the
// pill (via `maxHeight: 88` on the input).
const PILL_PAD_V = 6;
const PILL_HEIGHT = BTN_SIZE + PILL_PAD_V * 2; // 60

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

  // ── The single pill — same dimensions in every state ──
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: LB.bg,
    borderRadius: PILL_HEIGHT / 2,
    paddingLeft: 22,
    paddingRight: PILL_PAD_V,
    paddingVertical: PILL_PAD_V,
    minHeight: PILL_HEIGHT,
    borderWidth: 1,
    borderColor: LB.hairline,
  },
  contentArea: {
    flex: 1,
    paddingRight: 12,
    justifyContent: 'center',
    // Locks the idle / recording / processing content to the same
    // visual height as a single-line input. Multiline lets the input
    // grow ABOVE this (up to maxHeight 88) — the pill grows with it.
    minHeight: BTN_SIZE,
  },
  input: {
    paddingVertical: 6,
    color: LB.ink,
    fontSize: 16,
    lineHeight: 22,
    // ~ 3 lines of 22 + a little slack; after that scrolls inside.
    maxHeight: 88,
  },

  // ── Recording / processing content (replaces the input area).
  // Internal heights MUST sum to ≤ BTN_SIZE (48) so the pill stays
  // the same shape as in idle.
  statusBlock: {
    gap: 2,
    paddingVertical: 0,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 16,
    height: 16,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: LB.danger },
  statusText: { fontSize: 13, color: LB.ink2, fontWeight: '500' },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 18,
  },

  // ── Trailing button row ──
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12, // breathing room between buttons
    alignSelf: 'center',
  },
  btn: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: BTN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  // Saturated colours — pastels were too zart, the user couldn't see
  // the buttons clearly. These contrast hard against the LB.bg pill.
  btnPrimary: { backgroundColor: LB.primary }, // terracotta — Send + Conversation start
  btnInk: { backgroundColor: LB.ink }, // near-black — Mic (clearly different from Wave)
  btnSuccess: { backgroundColor: LB.success }, // sage green — "Yes, use this take"
  btnStop: { backgroundColor: LB.danger }, // red — exit conversation
  btnSoft: {
    backgroundColor: LB.paper,
    borderWidth: 1,
    borderColor: LB.hairline,
  }, // neutral white — Cancel during recording
  pressed: { opacity: 0.6 },
  dim: { opacity: 0.4 },
});
