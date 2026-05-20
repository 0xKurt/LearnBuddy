// Voice conversation mode — full-screen, ChatGPT-Voice-style.
//
// State machine (cycles automatically until the learner taps Beenden):
//
//   idle ──tap-to-start──▶ listening
//   listening ──VAD silence──▶ submitting
//   submitting ──transcript event──▶ thinking
//   thinking ──reply event──▶ speaking
//   speaking ──TTS onDone──▶ listening (next cycle)
//   error from any state ──▶ listening (auto-retry)
//
// Visual: one big animated circle in the centre that morphs colour +
// pulse rhythm with the state. The learner sees "Hört zu", "Denkt …",
// or "Antwortet" — no chat bubbles in this view. The underlying
// conversation is still persisted server-side, so closing the modal
// drops back into the chat with the full transcript intact.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Speech from 'expo-speech';

import { streamAgentTurn, type AgentSseFrame } from '../../lib/api/agent';
import { LB } from '../../lib/theme/colors';
import { useVoiceRecorder } from '../../lib/voice/use-voice-recorder';

export type VoiceConversationModalProps = {
  visible: boolean;
  learnerId: string;
  sessionId: string;
  locale: 'de' | 'en' | 'fr' | 'es' | 'it';
  onClose: () => void;
  /** Called when the modal finishes a turn — lets the parent chat
   *  screen refresh its transcript (the agent persisted both turns
   *  server-side, so the parent just needs to know to re-fetch). */
  onTurnComplete?: (info: {
    transcript: string;
    reply: string;
    verdict: string | null;
    advance: boolean;
  }) => void;
};

type State = 'idle' | 'listening' | 'submitting' | 'thinking' | 'speaking' | 'error';

function newClientTurnId(): string {
  const rand = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${rand(8)}-${rand(4)}-4${rand(3)}-8${rand(3)}-${rand(12)}`;
}

function ttsLocale(l: VoiceConversationModalProps['locale']): string {
  switch (l) {
    case 'de':
      return 'de-DE';
    case 'fr':
      return 'fr-FR';
    case 'es':
      return 'es-ES';
    case 'it':
      return 'it-IT';
    default:
      return 'en-US';
  }
}

export function VoiceConversationModal({
  visible,
  learnerId,
  sessionId,
  locale,
  onClose,
  onTurnComplete,
}: VoiceConversationModalProps) {
  const [state, setState] = useState<State>('idle');
  const [hint, setHint] = useState<string>('Tippe in die Mitte, um das Gespräch zu starten.');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // The cycle is driven by refs because the recorder closures and the
  // SSE callbacks both fire after the state has moved on.
  const stateRef = useRef<State>('idle');
  const cancelledRef = useRef(false);
  stateRef.current = state;

  const submitOnSilence = useCallback(async () => {
    if (stateRef.current !== 'listening') return;
    await stopAndSendRef.current();
  }, []);

  const voice = useVoiceRecorder({ onSilence: submitOnSilence, silenceMs: 1800 });

  // ── Pulse animation ─────────────────────────────────────────────────
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    // Different rhythm per state — listening is fast, thinking slow.
    const dur = state === 'listening' ? 700 : state === 'thinking' ? 1400 : 1100;
    pulse.stopAnimation();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: dur,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: dur,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, state, pulse]);

  // ── Turn cycle ──────────────────────────────────────────────────────
  const stopAndSendRef = useRef<() => Promise<void>>(async () => {});

  const beginListening = useCallback(async () => {
    if (cancelledRef.current) return;
    setErrorMsg(null);
    setState('listening');
    setHint('Sprich los — ich höre zu.');
    const ok = await voice.start();
    if (!ok) {
      setState('error');
      setErrorMsg('Mikrofon-Zugriff fehlt. Bitte in den Einstellungen erlauben.');
    }
  }, [voice]);

  const sendRecordingAndContinue = useCallback(async () => {
    if (cancelledRef.current) return;
    setState('submitting');
    setHint('Sende …');
    const recording = await voice.stop();
    if (!recording || recording.durationMs < 250) {
      // Too short — likely a misfire. Restart listening.
      void beginListening();
      return;
    }

    setState('thinking');
    setHint('Denkt …');

    let transcript = '';
    let reply = '';
    let verdict: string | null = null;
    let advance = false;

    const handle = (e: AgentSseFrame) => {
      switch (e.type) {
        case 'transcript':
          transcript = e.text;
          setHint(`„${transcript.slice(0, 60)}${transcript.length > 60 ? '…' : ''}"`);
          break;
        case 'reply':
          reply = e.text;
          break;
        case 'done':
          verdict = e.verdict;
          advance = e.advance;
          break;
        case 'error':
          setErrorMsg(e.message);
          break;
      }
    };

    try {
      await streamAgentTurn(
        learnerId,
        sessionId,
        {
          client_turn_id: newClientTurnId(),
          text: null,
          audio_base64: recording.base64,
          audio_mime: recording.mime,
        },
        handle,
      );
    } catch (err) {
      if (cancelledRef.current) return;
      setErrorMsg(err instanceof Error ? err.message : 'Verbindung unterbrochen');
      setState('error');
      // Auto-retry by going back to listening after a short beat.
      setTimeout(() => {
        if (!cancelledRef.current) void beginListening();
      }, 1200);
      return;
    }

    if (cancelledRef.current) return;
    onTurnComplete?.({ transcript, reply, verdict, advance });

    if (!reply) {
      // Nothing to speak — go straight back to listening.
      void beginListening();
      return;
    }

    setState('speaking');
    setHint(reply);
    Speech.speak(reply, {
      language: ttsLocale(locale),
      pitch: 1.0,
      rate: 1.0,
      onDone: () => {
        if (cancelledRef.current) return;
        void beginListening();
      },
      onStopped: () => {
        if (cancelledRef.current) return;
        void beginListening();
      },
      onError: () => {
        if (cancelledRef.current) return;
        void beginListening();
      },
    });
  }, [voice, learnerId, sessionId, locale, onTurnComplete, beginListening]);

  stopAndSendRef.current = sendRecordingAndContinue;

  // ── Lifecycle ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    cancelledRef.current = false;
    setState('idle');
    setHint('Tippe in die Mitte, um das Gespräch zu starten.');
    return () => {
      // Tear down on modal close.
      cancelledRef.current = true;
      void voice.cancel();
      void Speech.stop();
    };
    // Only re-run on visibility flip; voice.cancel ref churn would
    // cause unwanted resets mid-cycle.
  }, [visible]);

  const handleOrbTap = useCallback(() => {
    if (state === 'idle') {
      void beginListening();
      return;
    }
    if (state === 'speaking') {
      // Interrupt the agent — stop TTS and start listening immediately.
      void Speech.stop();
      void beginListening();
      return;
    }
    if (state === 'listening') {
      // Manual early stop — finish the recording and send what we have.
      void sendRecordingAndContinue();
      return;
    }
    if (state === 'error') {
      void beginListening();
      return;
    }
    // submitting / thinking: tap is a no-op — we don't want to send mid-roundtrip.
  }, [state, beginListening, sendRecordingAndContinue]);

  const handleClose = useCallback(() => {
    cancelledRef.current = true;
    void voice.cancel();
    void Speech.stop();
    onClose();
  }, [voice, onClose]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.topRow}>
          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Gespräch beenden"
          >
            <Text style={styles.closeText}>Beenden</Text>
          </Pressable>
        </View>

        <View style={styles.centre}>
          <Pressable
            onPress={handleOrbTap}
            accessibilityRole="button"
            accessibilityLabel={
              state === 'idle'
                ? 'Gespräch starten'
                : state === 'listening'
                  ? 'Antwort jetzt senden'
                  : state === 'speaking'
                    ? 'Antwort unterbrechen'
                    : state === 'error'
                      ? 'Nochmal versuchen'
                      : 'Bitte warten'
            }
          >
            <Orb state={state} level={voice.level} pulse={pulse} />
          </Pressable>
          <Text style={styles.stateLabel}>{labelForState(state)}</Text>
          <Text style={styles.hint} numberOfLines={4}>
            {errorMsg ?? hint}
          </Text>
        </View>

        <View style={styles.bottomRow}>
          <Text style={styles.footnote}>
            {state === 'listening'
              ? 'Pausiere kurz, dann sende ich automatisch.'
              : state === 'speaking'
                ? 'Tippe um zu unterbrechen.'
                : ' '}
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function labelForState(s: State): string {
  switch (s) {
    case 'idle':
      return 'Bereit';
    case 'listening':
      return 'Höre zu';
    case 'submitting':
      return 'Sende';
    case 'thinking':
      return 'Denkt';
    case 'speaking':
      return 'Antwortet';
    case 'error':
      return 'Verbindung gestört';
  }
}

function colourForState(s: State): { ring: string; core: string } {
  switch (s) {
    case 'idle':
      return { ring: LB.lavenderDeep, core: LB.lavender };
    case 'listening':
      return { ring: LB.primary, core: LB.primaryLt };
    case 'submitting':
    case 'thinking':
      return { ring: LB.ink3, core: LB.bg };
    case 'speaking':
      return { ring: LB.primaryDk, core: LB.peach };
    case 'error':
      return { ring: LB.danger, core: LB.peach };
  }
}

function Orb({ state, level, pulse }: { state: State; level: number; pulse: Animated.Value }) {
  const { ring, core } = colourForState(state);
  // The outer ring scales with the live audio level when listening, and
  // with the slow pulse otherwise.
  const liveScale = state === 'listening' ? 1 + level * 0.35 : 1;
  return (
    <View style={styles.orbWrap}>
      <Animated.View
        style={[
          styles.orbRing,
          {
            backgroundColor: ring,
            transform: [
              {
                scale: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [liveScale, liveScale + 0.12],
                }),
              },
            ],
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.6] }),
          },
        ]}
      />
      <Animated.View
        style={[
          styles.orbCore,
          {
            backgroundColor: core,
            transform: [
              {
                scale: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.05],
                }),
              },
            ],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LB.paper },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  closeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: LB.bg,
  },
  closeText: { fontSize: 14, color: LB.ink, fontWeight: '600' },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingHorizontal: 32,
  },
  orbWrap: {
    width: 240,
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbRing: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
  },
  orbCore: {
    width: 160,
    height: 160,
    borderRadius: 80,
  },
  stateLabel: {
    fontSize: 22,
    fontWeight: '700',
    color: LB.ink,
    letterSpacing: -0.4,
  },
  hint: {
    fontSize: 15,
    color: LB.ink2,
    textAlign: 'center',
    lineHeight: 22,
  },
  bottomRow: {
    paddingHorizontal: 32,
    paddingBottom: 16,
    alignItems: 'center',
  },
  footnote: { fontSize: 12, color: LB.ink3, textAlign: 'center' },
});
