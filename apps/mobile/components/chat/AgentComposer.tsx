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
import { useTranslation } from 'react-i18next';

import { Icon } from '../lb/Icon';
import { LB } from '../../lib/theme/colors';
import { type TtsPlayHandle } from '../../lib/voice/play-tts';
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
  /** True when the chat screen is playing tutor audio that the composer
   *  itself didn't kick off (e.g. the opener, or a text-turn reply).
   *  Drives the same "Antwortet" status display + waveform animation
   *  used during the composer's own conv-speaking phase, so the user
   *  has one consistent "tutor is talking" visual cue everywhere. */
  tutorSpeaking?: boolean;
  /** Single-shot dictation: audio in, text out. Mic mode calls this and
   *  appends the result to the input field. */
  transcribe?: (audio: {
    base64: string;
    mime: 'audio/m4a' | 'audio/mp4' | 'audio/wav' | 'audio/webm';
  }) => Promise<string>;
  /** Conversation mode: submit audio as a learner turn. Returns the
   *  agent's reply text AFTER the chat screen has finished playing
   *  the tutor audio (whether streamed per-sentence or a single MP3
   *  fallback). The composer used to play the audio itself, but with
   *  streaming voice mode the chat screen owns the queue — so this
   *  promise resolves only when it's safe to re-open the mic. */
  submitVoiceTurn?: (audio: {
    base64: string;
    mime: 'audio/m4a' | 'audio/mp4' | 'audio/wav' | 'audio/webm';
  }) => Promise<{ reply: string }>;
  /** Fire-and-forget hook called the instant the user taps the mic so
   *  the parent can pre-warm the STT pipeline (Vercel cold start +
   *  GCP gRPC handshake). */
  warmStt?: () => void;
  /** Optional async step the composer awaits BEFORE opening the mic
   *  the very first time conversation mode is entered. Used by the
   *  chat screen to read the opener aloud the first time the kid
   *  taps the voice button, but never on stop-then-restart. The hook
   *  resolves immediately on subsequent calls. */
  beforeFirstConvListen?: () => Promise<void>;
  onSubmitText: (text: string) => void;
};

export function AgentComposer({
  disabled = false,
  busy = false,
  tutorSpeaking = false,
  transcribe,
  submitVoiceTurn,
  warmStt,
  beforeFirstConvListen,
  onSubmitText,
}: AgentComposerProps) {
  const { t } = useTranslation('home');
  const [text, setText] = useState('');
  const [mode, setMode] = useState<Mode>('idle');
  const [errorHint, setErrorHint] = useState<string | null>(null);
  // Synthetic "level" that breathes 0.2 ↔ 0.7 over ~1.4 s while the
  // tutor speaks — feeds the Waveform component so the bars rise and
  // fall in time with the audio (synchronised with the chat-bubble
  // opacity pulse).
  const [speakLevel, setSpeakLevel] = useState(0.2);
  // Dismissable error: every time a NEW error appears, the dismissed
  // flag resets so the message actually shows again.
  const [errorDismissed, setErrorDismissed] = useState(false);
  useEffect(() => {
    if (errorHint) setErrorDismissed(false);
  }, [errorHint]);

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
  // VAD config now lives on the hook default (900ms silence, -30dB
  // threshold). Tightened on 2026-05-21 because the previous threshold
  // (-42 dB, 1200ms) treated bedroom rustling as "still talking" and
  // never auto-stopped.
  const voice = useVoiceRecorder({ onSilence });

  // ── Mic mode (single-shot dictation) ──────────────────────────────
  const stopMicAndTranscribe = useCallback(async () => {
    if (mode !== 'mic-recording') return;
    setMode('mic-uploading');
    setErrorHint(null);
    setErrorDismissed(false);
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
    setErrorDismissed(false);
    setMode('idle');
  }, [voice]);

  const startMic = useCallback(async () => {
    if (mode !== 'idle' || disabled || busy) return;
    setErrorHint(null);
    setErrorDismissed(false);
    // Fire pre-warm BEFORE awaiting the recorder — the gRPC handshake
    // and Vercel cold start should be running in parallel with the
    // user's first ~700ms of speech.
    warmStt?.();
    const ok = await voice.start();
    if (ok) setMode('mic-recording');
  }, [mode, disabled, busy, voice, warmStt]);

  // ── Conversation mode (auto loop) ─────────────────────────────────
  const conversationCancelledRef = useRef(false);
  const ttsHandleRef = useRef<TtsPlayHandle | null>(null);

  const beginConvListen = useCallback(async () => {
    if (conversationCancelledRef.current) return;
    setErrorHint(null);
    setErrorDismissed(false);
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
    // submitVoiceTurn now owns the full tutor lifecycle on the chat
    // screen side — streaming sentence-level audio chunks play
    // straight from the SSE handler, and the promise resolves only
    // AFTER the last chunk finishes. So we just show conv-speaking
    // for the duration and re-open the mic on resolve.
    setMode('conv-speaking');
    try {
      await submitVoiceTurn({ base64: result.base64, mime: result.mime });
    } catch (err) {
      setErrorHint(err instanceof Error ? err.message : 'Antwort fehlgeschlagen');
      if (!conversationCancelledRef.current) void beginConvListen();
      return;
    }
    if (conversationCancelledRef.current) return;
    void beginConvListen();
  }, [voice, submitVoiceTurn, beginConvListen]);

  const startConversation = useCallback(async () => {
    if (mode !== 'idle' || disabled || busy) return;
    conversationCancelledRef.current = false;
    warmStt?.();
    // The chat screen owns the opener audio. It plays it the FIRST
    // time the kid enters conv mode (so text-only users never hear it
    // forced on session open) and resolves immediately on every
    // subsequent call. We await it so the mic doesn't open while the
    // opener is still speaking.
    if (beforeFirstConvListen) {
      try {
        await beforeFirstConvListen();
      } catch {
        /* opener playback failure shouldn't block conversation start */
      }
      if (conversationCancelledRef.current) return;
    }
    await beginConvListen();
  }, [mode, disabled, busy, beginConvListen, warmStt, beforeFirstConvListen]);

  const stopConversation = useCallback(async () => {
    conversationCancelledRef.current = true;
    ttsHandleRef.current?.stop();
    ttsHandleRef.current = null;
    await voice.cancel();
    setMode('idle');
  }, [voice]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      conversationCancelledRef.current = true;
      ttsHandleRef.current?.stop();
      ttsHandleRef.current = null;
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
  // "Speaking" covers BOTH composer-owned playback (conv-speaking mode)
  // and chat-screen-owned playback (opener / text-turn replies). One
  // visual cue, two trigger sources — no more separate "Tutor spricht
  // …" banner.
  const isSpeaking = mode === 'conv-speaking' || tutorSpeaking;
  const isConversation =
    mode === 'conv-listening' || mode === 'conv-uploading' || mode === 'conv-speaking';

  // Breath cycle while tutor is speaking. SetInterval is cheap here
  // (one timer, 200 ms cadence) and avoids pulling Animated for a
  // single numeric value driving downstream rendering.
  useEffect(() => {
    if (!isSpeaking) {
      setSpeakLevel(0.2);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      // 1.4 s sine cycle, 0.25 baseline + 0.45 amplitude → bars rise
      // and fall between 0.25 and 0.7. Same period as the chat-bubble
      // breath so the two cues feel synchronised even though they're
      // running on separate animation engines.
      const phase = ((Date.now() - start) % 1400) / 1400;
      const wave = 0.25 + 0.45 * (0.5 - 0.5 * Math.cos(phase * Math.PI * 2));
      setSpeakLevel(wave);
    }, 80);
    return () => clearInterval(id);
  }, [isSpeaking]);

  const statusText = (() => {
    if (mode === 'mic-recording') return t('chat.composer.listening');
    if (mode === 'mic-uploading') return t('chat.composer.understanding');
    if (mode === 'conv-listening') return t('chat.composer.listening');
    if (mode === 'conv-uploading') return t('chat.composer.thinking');
    if (mode === 'conv-speaking' || tutorSpeaking) return t('chat.composer.answering');
    return '';
  })();

  return (
    <View style={styles.outer}>
      {(errorHint || voice.permissionDenied) && !errorDismissed ? (
        <Pressable
          onPress={() => setErrorDismissed(true)}
          style={styles.errorRow}
          accessibilityRole="button"
          accessibilityLabel={t('chat.composer.a11y.dismiss_error')}
          hitSlop={4}
        >
          <Text style={styles.errorHint} numberOfLines={3}>
            {errorHint ?? t('chat.composer.mic_denied')}
          </Text>
          <View style={styles.errorClose}>
            <Icon name="close" size={14} color={LB.danger} />
          </View>
        </Pressable>
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
              <Waveform
                level={isRecording ? voice.level : isSpeaking ? speakLevel : 0.15}
                // Orange bars = "your mic is hot, talk now". Gray bars =
                // "the tutor has the floor (opener TTS, thinking,
                // answering); wait." We previously coloured the tutor's
                // breathing waveform orange too, which collided with the
                // recording cue and made kids start talking during the
                // opener. Same animation, different colour.
                dim={!isRecording}
              />
            </View>
          ) : (
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={t('chat.composer.input_placeholder')}
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
              label={t('chat.composer.a11y.end_conv')}
            />
          ) : tutorSpeaking ? // statusBlock above ("Antwortet" + animated waveform) is // No actionable button here — the kid just waits. The // Chat-screen owns the playback (opener / text-turn reply).
          // the cue.
          null : mode === 'mic-recording' ? (
            <>
              <RoundButton
                variant="soft"
                icon="close"
                iconColor={LB.ink}
                onPress={cancelMic}
                label={t('chat.composer.a11y.cancel_mic')}
              />
              <RoundButton
                variant="success"
                icon="check"
                iconColor={LB.paper}
                onPress={stopMicAndTranscribe}
                label={t('chat.composer.a11y.confirm_mic')}
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
              label={t('chat.composer.a11y.please_wait')}
            />
          ) : hasText ? (
            <RoundButton
              variant="primary"
              icon="arrow-up"
              iconColor={LB.paper}
              onPress={submitText}
              disabled={disabled || busy}
              label={t('chat.composer.a11y.send')}
            />
          ) : (
            <>
              <RoundButton
                variant="ink"
                icon="mic"
                iconColor={LB.primaryDk}
                onPress={startMic}
                disabled={disabled || busy}
                label={t('chat.composer.a11y.start_mic')}
              />
              {submitVoiceTurn ? (
                <RoundButton
                  variant="primary"
                  icon="waveform"
                  iconColor={LB.paper}
                  onPress={startConversation}
                  disabled={disabled || busy}
                  label={t('chat.composer.a11y.start_conv')}
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
  // CRITICAL: backgroundColor on Pressable silently fails to render in
  // RN 0.73+. The bg has to live on an inner View. Pressable only owns
  // layout (alignSelf, overflow for ripple clipping) and the pressed
  // opacity. Same pattern as components/lb/Btn.tsx — see CLAUDE.md rule.
  const variantStyle =
    variant === 'primary'
      ? styles.btnPrimary
      : variant === 'soft'
        ? styles.btnSoft
        : variant === 'stop'
          ? styles.btnStop
          : variant === 'ink'
            ? styles.btnInk
            : styles.btnSuccess;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        alignSelf: 'center',
        opacity: disabled ? 0.4 : 1,
        borderRadius: BTN_SIZE / 2,
        overflow: 'hidden',
      }}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.btn,
            variantStyle,
            !disabled && styles.btnRaised,
            pressed && !disabled && styles.pressed,
          ]}
        >
          {showSpinner ? (
            <ActivityIndicator color={iconColor} />
          ) : (
            <Icon name={icon} size={20} color={iconColor} />
          )}
        </View>
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
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
    paddingHorizontal: 8,
  },
  errorHint: {
    flex: 1,
    fontSize: 12,
    color: LB.danger,
  },
  errorClose: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
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
  },
  // Shadow only when enabled — Android renders `elevation` as a
  // RECTANGULAR drop-shadow that doesn't respect the parent's
  // borderRadius. With the disabled `opacity: 0.4` on the Pressable,
  // that rectangle becomes visible as an octagonal halo around the
  // circle. Keeping the shadow off in the disabled state hides it.
  btnRaised: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  // Warm-only palette — no black/ink backgrounds anywhere (design rule).
  // Differentiate buttons via icon shape + saturation level, not by
  // reaching for an ink contrast.
  btnPrimary: { backgroundColor: LB.primary }, // terracotta — Send + Conversation start
  btnInk: { backgroundColor: LB.primaryLt }, // light terracotta — Mic (softer than Wave)
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
