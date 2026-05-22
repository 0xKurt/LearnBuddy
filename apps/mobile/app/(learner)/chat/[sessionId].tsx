// Agent chat screen.
//
// One conversation, one composer (text + voice). All pedagogy lives
// in the server agent — this screen just renders bubbles and submits
// messages. The agent decides when to introduce a new item ("OK weiter
// mit …"), when to hint, when to reveal — server returns advance/reveal
// flags so we can update the progress chip without re-rendering items.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { getAccount } from '../../../lib/api/account';
import {
  createAgentSession,
  finishAgentSession,
  streamAgentTurn,
  transcribeVoice,
  warmTranscribe,
  type AgentSseFrame,
} from '../../../lib/api/agent';
import { Btn } from '../../../components/lb/Btn';
import { AgentComposer } from '../../../components/chat/AgentComposer';
import { ChatBubble, AgentThinking } from '../../../components/chat/ChatBubble';
import { useNavigateUp } from '../../../lib/navigation/hierarchy';
import { LB } from '../../../lib/theme/colors';
import { playTtsAudio, type TtsPlayHandle } from '../../../lib/voice/play-tts';

type Message = {
  id: string;
  role: 'learner' | 'agent';
  content: string;
  isStreaming?: boolean;
  verdict?: 'correct' | 'partially_correct' | 'incorrect' | 'skipped' | null;
};

function newClientTurnId(): string {
  // RFC4122 v4-ish (random) without bringing in a uuid lib.
  const rand = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${rand(8)}-${rand(4)}-4${rand(3)}-8${rand(3)}-${rand(12)}`;
}

export default function AgentChatScreen() {
  const { t } = useTranslation('home');
  const navigateUp = useNavigateUp();
  const params = useLocalSearchParams<{
    sessionId?: string;
    subjectId?: string;
    folderId?: string;
    materialId?: string;
    topic?: string;
    testMode?: string;
  }>();
  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const learnerId = accountQuery.data?.learner?.id ?? null;

  // The route segment is required by Expo Router. "new" is the sentinel
  // for "create a fresh session"; anything else is treated as a session
  // id to resume (resume itself is a stub for now — see Phase 3).
  const initialSessionId = params.sessionId && params.sessionId !== 'new' ? params.sessionId : null;
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [completedItems, setCompletedItems] = useState(0);
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  const listRef = useRef<FlatList<Message>>(null);
  const testMode = params.testMode === 'true';

  // Tutor TTS playback for non-conversation turns (text submit + single-shot
  // mic). The conversation auto-loop owns its own playback inside the
  // composer because it needs to re-open the mic when audio ends.
  const ttsHandleRef = useRef<TtsPlayHandle | null>(null);
  // Visible playback state — drives the "🔊 Spricht …" indicator and
  // gates the composer's mic so the kid can't talk over the tutor.
  const [tutorSpeaking, setTutorSpeaking] = useState(false);
  // Sticky diagnostic so a failed playback shows up in the UI without
  // needing to read logs ("Stimme konnte nicht abgespielt werden — …").
  const [voicePlaybackError, setVoicePlaybackError] = useState<string | null>(null);
  // The opener audio is synthesised by the server on session create
  // and held HERE — NOT auto-played. The kid sees the opener text
  // immediately; the voice only plays the first time they tap the
  // conversation button. Text-only learners never hear it. After the
  // first conv-start the audio is consumed and stop/restart of conv
  // mode does not replay it.
  const openerAudioRef = useRef<{ base64: string; mime: string } | null>(null);
  const startTutorTts = useCallback((audio: { base64: string; mime: string }) => {
    ttsHandleRef.current?.stop();
    setVoicePlaybackError(null);
    const handle = playTtsAudio(audio.base64, audio.mime, (kind, detail) => {
      setVoicePlaybackError(`${kind}: ${detail}`);
    });
    ttsHandleRef.current = handle;
    setTutorSpeaking(true);
    void handle.done.then(() => {
      if (ttsHandleRef.current === handle) {
        ttsHandleRef.current = null;
        setTutorSpeaking(false);
      }
    });
  }, []);
  const stopTutorTts = useCallback(() => {
    ttsHandleRef.current?.stop();
    ttsHandleRef.current = null;
    setTutorSpeaking(false);
  }, []);
  useEffect(() => () => stopTutorTts(), [stopTutorTts]);

  // Composer-facing hook: play the opener voice the FIRST time the
  // kid taps the conversation button, then resolve so the composer
  // opens the mic. Subsequent calls return immediately so a
  // stop/restart of conv mode does not replay the opener.
  const playOpenerOnceBeforeConv = useCallback(async () => {
    const audio = openerAudioRef.current;
    if (!audio) return;
    openerAudioRef.current = null; // consume — never play again
    startTutorTts(audio);
    await ttsHandleRef.current?.done;
  }, [startTutorTts]);

  // ── Bootstrap ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!learnerId) return;
    if (sessionId) {
      setBootstrapping(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const created = await createAgentSession(learnerId, {
          subject_id: params.subjectId ?? null,
          folder_id: params.folderId ?? null,
          material_id: params.materialId ?? null,
          topic: params.topic ?? null,
          test_mode: testMode,
          max_items: 20,
        });
        if (cancelled) return;
        setSessionId(created.session_id);
        setTotalItems(created.items.length);
        setCompletedItems(0);
        // Server seeds ONE tutor turn that combines opener + first
        // question. We render it as a single bubble so the screen
        // matches the persisted thread (and Gemini's alternating-role
        // convention).
        setMessages([
          {
            id: 'opener',
            role: 'agent',
            content: `${created.opener}\n\n${created.first_question}`,
          },
        ]);
        // Don't auto-play — stash for the first conv-start, see
        // playOpenerOnceBeforeConv below. Kids who only type never
        // hear the opener forced on session open.
        if (created.audio) openerAudioRef.current = created.audio;
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('chat.could_not_start'));
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    learnerId,
    sessionId,
    params.subjectId,
    params.folderId,
    params.materialId,
    params.topic,
    testMode,
  ]);

  // ── Send (text only — voice is transcribed into the field first) ────
  const onSubmitText = useCallback(
    async (textToSend: string) => {
      if (!sessionId || !learnerId || busy || sessionEnded) return;
      // If the previous reply is still being spoken, cut it off so two
      // tutor voices don't overlap.
      stopTutorTts();
      setBusy(true);
      setThinking(true);
      const learnerMsgId = `l-${Date.now()}`;
      const agentId = `a-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: learnerMsgId, role: 'learner', content: textToSend },
        { id: agentId, role: 'agent', content: '', isStreaming: true },
      ]);
      let replyText = '';
      let finalVerdict: Message['verdict'] = null;
      let advanced = false;
      // Boxed so the closure assignment survives TS's narrow-to-null
      // across the awaited stream.
      const replyAudioBox: { value: { base64: string; mime: string } | null } = { value: null };
      const ctid = newClientTurnId();
      const handle = (e: AgentSseFrame) => {
        switch (e.type) {
          case 'reply':
            replyText = e.text;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentId ? { ...m, content: replyText, isStreaming: false } : m,
              ),
            );
            setThinking(false);
            break;
          case 'done':
            finalVerdict = e.verdict;
            advanced = e.advance;
            if (e.audio) replyAudioBox.value = { base64: e.audio.base64, mime: e.audio.mime };
            if (advanced) setCompletedItems((n) => n + 1);
            if (e.session_complete) setSessionEnded(true);
            break;
          case 'error':
            setError(e.message);
            break;
          default:
            break;
        }
      };
      try {
        await streamAgentTurn(
          learnerId,
          sessionId,
          { client_turn_id: ctid, text: textToSend, audio_base64: null, audio_mime: null },
          handle,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : t('chat.connection_lost'));
      } finally {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === agentId ? { ...m, isStreaming: false, verdict: finalVerdict } : m,
          ),
        );
        setBusy(false);
        setThinking(false);
      }
      // Tutor reads the reply aloud whenever the server synthesised
      // audio — same playback the conversation auto-loop uses, just
      // without the "re-open mic when done" handler.
      if (replyAudioBox.value) startTutorTts(replyAudioBox.value);
      if (advanced && completedItems + 1 >= totalItems) {
        setSessionEnded(true);
        if (sessionId && learnerId) void finishAgentSession(learnerId, sessionId);
      }
    },
    [
      sessionId,
      learnerId,
      busy,
      sessionEnded,
      completedItems,
      totalItems,
      stopTutorTts,
      startTutorTts,
    ],
  );

  const transcribe = useCallback(
    async (audio: {
      base64: string;
      mime: 'audio/m4a' | 'audio/mp4' | 'audio/wav' | 'audio/webm';
    }): Promise<string> => {
      if (!learnerId) return '';
      return transcribeVoice(learnerId, audio.base64, audio.mime);
    },
    [learnerId],
  );

  const warmStt = useCallback(() => {
    if (!learnerId) return;
    warmTranscribe(learnerId);
  }, [learnerId]);

  // Conversation mode: audio in → full pedagogy turn → returns the
  // reply text + audio (GCP Chirp HD) so the composer can play it.
  // The SSE callback updates the chat bubbles the same way a text turn
  // would, so the kid sees every exchange in the transcript (no modal,
  // no overlay).
  const submitVoiceTurn = useCallback(
    async (audio: {
      base64: string;
      mime: 'audio/m4a' | 'audio/mp4' | 'audio/wav' | 'audio/webm';
    }): Promise<{ reply: string; audio?: { base64: string; mime: string } | null }> => {
      if (!sessionId || !learnerId || sessionEnded) return { reply: '', audio: null };
      setBusy(true);
      setThinking(true);
      const learnerMsgId = `lv-${Date.now()}`;
      const agentMsgId = `av-${Date.now()}`;
      // Optimistic learner bubble — content gets replaced by the
      // server transcript once it arrives.
      setMessages((prev) => [
        ...prev,
        { id: learnerMsgId, role: 'learner', content: '…' },
        { id: agentMsgId, role: 'agent', content: '', isStreaming: true },
      ]);
      let replyText = '';
      let replyAudio: { base64: string; mime: string } | null = null;
      let finalVerdict: Message['verdict'] = null;
      let advanced = false;
      let hadError = false;
      const ctid = newClientTurnId();
      const handle = (e: AgentSseFrame) => {
        switch (e.type) {
          case 'transcript':
            setMessages((prev) =>
              prev.map((m) => (m.id === learnerMsgId ? { ...m, content: e.text } : m)),
            );
            break;
          case 'reply':
            replyText = e.text;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsgId ? { ...m, content: replyText, isStreaming: false } : m,
              ),
            );
            setThinking(false);
            break;
          case 'done':
            finalVerdict = e.verdict;
            advanced = e.advance;
            if (e.audio) replyAudio = { base64: e.audio.base64, mime: e.audio.mime };
            if (advanced) setCompletedItems((n) => n + 1);
            if (e.session_complete) setSessionEnded(true);
            break;
          case 'error':
            hadError = true;
            // 'silent' = noise / no speech detected. In conversation
            // mode the composer just re-opens the mic on its own, so
            // showing a red error banner for every bedroom rustle is
            // pure noise. Drop it; surface every other error.
            if (e.code !== 'silent') setError(e.message);
            break;
          default:
            break;
        }
      };
      try {
        await streamAgentTurn(
          learnerId,
          sessionId,
          {
            client_turn_id: ctid,
            text: null,
            audio_base64: audio.base64,
            audio_mime: audio.mime,
          },
          handle,
        );
      } catch (err) {
        hadError = true;
        setError(err instanceof Error ? err.message : t('chat.connection_lost'));
      } finally {
        if (hadError) {
          // Remove the stale optimistic bubbles so failed attempts don't
          // accumulate in the transcript.
          setMessages((prev) => prev.filter((m) => m.id !== learnerMsgId && m.id !== agentMsgId));
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === agentMsgId ? { ...m, isStreaming: false, verdict: finalVerdict } : m,
            ),
          );
        }
        setBusy(false);
        setThinking(false);
      }
      if (advanced && completedItems + 1 >= totalItems) {
        setSessionEnded(true);
        if (sessionId && learnerId) void finishAgentSession(learnerId, sessionId);
      }
      return { reply: replyText, audio: replyAudio };
    },
    [sessionId, learnerId, sessionEnded, completedItems, totalItems],
  );

  // ── Auto-scroll ───────────────────────────────────────────────────────
  useEffect(() => {
    if (messages.length === 0) return;
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length]);

  // Top safe-area is owned by (learner)/_layout.tsx — see comment
  // there. Bottom: the global BottomNav is hidden on /chat, so the
  // composer at the bottom of this screen needs to pad itself by
  // insets.bottom so the home-indicator doesn't cover it.
  const insets = useSafeAreaInsets();

  // ── Render guards ─────────────────────────────────────────────────────
  if (accountQuery.isLoading || bootstrapping) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={LB.primary} size="large" />
        <Text style={styles.muted}>{t('chat.preparing')}</Text>
      </View>
    );
  }
  if (!learnerId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{t('chat.no_learner_title')}</Text>
        <Btn variant="primary" onPress={() => router.replace('/(learner)/home')}>
          {t('chat.to_overview')}
        </Btn>
      </View>
    );
  }
  if (error && messages.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Btn
          variant="primary"
          onPress={() => {
            setError(null);
            setBootstrapping(true);
            setSessionId(null);
          }}
        >
          {t('chat.retry')}
        </Btn>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={styles.header}>
          <Btn variant="ghost" size="sm" onPress={navigateUp}>
            {t('chat.back')}
          </Btn>
          <View style={styles.progressBox}>
            <Text style={styles.progressLabel}>
              {Math.min(completedItems, totalItems)} / {totalItems || '?'}
            </Text>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${totalItems > 0 ? Math.min((completedItems / totalItems) * 100, 100) : 0}%`,
                  },
                ]}
              />
            </View>
          </View>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item, index }) => {
            // Only the LAST agent bubble breathes while the tutor speaks —
            // older bubbles keep their static state. Matches what a
            // reader expects: "this is what's being said right now."
            const isLast = index === messages.length - 1;
            const bubbleSpeaking = tutorSpeaking && isLast && item.role === 'agent';
            return (
              <ChatBubble
                role={item.role}
                content={item.content}
                isStreaming={item.isStreaming}
                speaking={bubbleSpeaking}
                verdict={item.verdict ?? null}
              />
            );
          }}
          style={styles.listFlex}
          contentContainerStyle={styles.list}
          ListFooterComponent={thinking ? <AgentThinking /> : null}
          showsVerticalScrollIndicator={false}
        />

        {!sessionEnded ? (
          <AgentComposer
            busy={busy}
            disabled={tutorSpeaking}
            tutorSpeaking={tutorSpeaking}
            onSubmitText={onSubmitText}
            transcribe={transcribe}
            submitVoiceTurn={submitVoiceTurn}
            warmStt={warmStt}
            beforeFirstConvListen={playOpenerOnceBeforeConv}
          />
        ) : (
          <View style={styles.endBlock}>
            <Text style={styles.endTitle}>{t('chat.session_ended_title')}</Text>
            <Text style={styles.muted}>{t('chat.session_ended_body')}</Text>
            <Btn
              variant="primary"
              onPress={() =>
                router.replace({
                  pathname: '/(learner)/result',
                  params: sessionId ? { sessionId } : {},
                })
              }
            >
              {t('chat.to_summary')}
            </Btn>
          </View>
        )}

        {/* Banner only on real failures — the "speaking" state is now
         *  communicated via the bubble's opacity pulse + the conv-
         *  button's bar animation, so a redundant text banner would
         *  just be noise. */}
        {voicePlaybackError ? (
          <Text style={styles.errorBanner}>
            {t('chat.voice_playback_failed', { detail: voicePlaybackError })}
          </Text>
        ) : null}
        {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
      </KeyboardAvoidingView>
      {/* Home-indicator-safe spacer — composer is flush at the bottom
       *  and we don't render the global BottomNav on /chat. */}
      <View style={{ height: insets.bottom, backgroundColor: LB.paper }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LB.bg },
  flex: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 32,
    backgroundColor: LB.bg,
  },
  muted: { fontSize: 14, color: LB.ink2 },
  errorText: { fontSize: 16, color: LB.danger, textAlign: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
    backgroundColor: LB.paper,
    borderBottomWidth: 1,
    borderBottomColor: LB.hairline,
  },
  progressBox: { flex: 1 },
  progressLabel: { fontSize: 12, color: LB.ink3, marginBottom: 4 },
  progressTrack: { height: 3, backgroundColor: LB.hairline, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: LB.primary, borderRadius: 2 },
  listFlex: { flex: 1 },
  list: { paddingVertical: 12, flexGrow: 1 },
  endBlock: {
    padding: 24,
    alignItems: 'center',
    gap: 12,
    backgroundColor: LB.paper,
    borderTopWidth: 1,
    borderTopColor: LB.hairline,
  },
  endTitle: { fontSize: 18, fontWeight: '700', color: LB.ink },
  errorBanner: {
    fontSize: 13,
    color: LB.danger,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: LB.paper,
    borderTopWidth: 1,
    borderTopColor: LB.hairline,
  },
  statusBanner: {
    fontSize: 12,
    color: LB.ink2,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: LB.paper,
    borderTopWidth: 1,
    borderTopColor: LB.hairline,
  },
});
