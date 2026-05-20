// Agent chat screen.
//
// One conversation, one composer (text + voice). All pedagogy lives
// in the server agent — this screen just renders bubbles and submits
// messages. The agent decides when to introduce a new item ("OK weiter
// mit …"), when to hint, when to reveal — server returns advance/reveal
// flags so we can update the progress chip without re-rendering items.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { getAccount } from '../../../lib/api/account';
import {
  createAgentSession,
  finishAgentSession,
  streamAgentTurn,
  type AgentSseFrame,
} from '../../../lib/api/agent';
import { Btn } from '../../../components/lb/Btn';
import { AgentComposer } from '../../../components/chat/AgentComposer';
import { ChatBubble, AgentThinking } from '../../../components/chat/ChatBubble';
import { LB } from '../../../lib/theme/colors';
import type { VoiceRecording } from '../../../lib/voice/use-voice-recorder';

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
  const params = useLocalSearchParams<{
    sessionId?: string;
    subjectId?: string;
    folderId?: string;
    materialId?: string;
    testMode?: string;
  }>();
  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const learnerId = accountQuery.data?.learner?.id ?? null;

  const [sessionId, setSessionId] = useState<string | null>(params.sessionId ?? null);
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
          test_mode: testMode,
          max_items: 20,
        });
        if (cancelled) return;
        setSessionId(created.session_id);
        setTotalItems(created.items.length);
        setCompletedItems(0);
        setMessages([
          { id: 'opener', role: 'agent', content: created.opener },
          { id: 'q-0', role: 'agent', content: created.first_question },
        ]);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Konnte Session nicht starten');
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [learnerId, sessionId, params.subjectId, params.folderId, params.materialId, testMode]);

  // ── Send (text or voice) ──────────────────────────────────────────────
  const send = useCallback(
    async (payload: { text?: string; voice?: VoiceRecording }) => {
      if (!sessionId || !learnerId || busy || sessionEnded) return;
      setBusy(true);
      setThinking(true);
      const learnerId_msg = `l-${Date.now()}`;
      const agentId = `a-${Date.now()}`;
      const seedLearnerContent = payload.text ?? '';
      setMessages((prev) => [
        ...prev,
        { id: learnerId_msg, role: 'learner', content: seedLearnerContent || '…' },
        { id: agentId, role: 'agent', content: '', isStreaming: true },
      ]);
      let replyText = '';
      let finalVerdict: Message['verdict'] = null;
      let advanced = false;
      const ctid = newClientTurnId();
      const handle = (e: AgentSseFrame) => {
        switch (e.type) {
          case 'transcript':
            // Voice transcript — show it as the learner's bubble.
            setMessages((prev) =>
              prev.map((m) => (m.id === learnerId_msg ? { ...m, content: e.text } : m)),
            );
            break;
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
          {
            client_turn_id: ctid,
            text: payload.text ?? null,
            audio_base64: payload.voice?.base64 ?? null,
            audio_mime: payload.voice?.mime ?? null,
          },
          handle,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Verbindung unterbrochen');
      } finally {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === agentId ? { ...m, isStreaming: false, verdict: finalVerdict } : m,
          ),
        );
        setBusy(false);
        setThinking(false);
      }
      if (advanced && completedItems + 1 >= totalItems) {
        // Last item just finished.
        setSessionEnded(true);
        if (sessionId && learnerId) void finishAgentSession(learnerId, sessionId);
      }
    },
    [sessionId, learnerId, busy, sessionEnded, completedItems, totalItems],
  );

  const onSubmitText = useCallback((text: string) => void send({ text }), [send]);
  const onSubmitVoice = useCallback((voice: VoiceRecording) => void send({ voice }), [send]);

  // ── Auto-scroll ───────────────────────────────────────────────────────
  useEffect(() => {
    if (messages.length === 0) return;
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length]);

  // ── Render guards ─────────────────────────────────────────────────────
  if (accountQuery.isLoading || bootstrapping) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={LB.primary} size="large" />
        <Text style={styles.muted}>Vorbereitung läuft …</Text>
      </SafeAreaView>
    );
  }
  if (!learnerId) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>Kein Lernerprofil gefunden.</Text>
        <Btn variant="primary" onPress={() => router.replace('/(learner)/home')}>
          Zur Übersicht
        </Btn>
      </SafeAreaView>
    );
  }
  if (error && messages.length === 0) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Btn
          variant="primary"
          onPress={() => {
            setError(null);
            setBootstrapping(true);
            setSessionId(null);
          }}
        >
          Nochmal versuchen
        </Btn>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Btn variant="ghost" size="sm" onPress={() => router.back()}>
          ← Zurück
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
        renderItem={({ item }) => (
          <ChatBubble
            role={item.role}
            content={item.content}
            isStreaming={item.isStreaming}
            verdict={item.verdict ?? null}
          />
        )}
        contentContainerStyle={styles.list}
        ListFooterComponent={thinking ? <AgentThinking /> : null}
        showsVerticalScrollIndicator={false}
      />

      {!sessionEnded ? (
        <AgentComposer busy={busy} onSubmitText={onSubmitText} onSubmitVoice={onSubmitVoice} />
      ) : (
        <View style={styles.endBlock}>
          <Text style={styles.endTitle}>Session beendet</Text>
          <Text style={styles.muted}>Gut gemacht — bis bald.</Text>
          <Btn
            variant="primary"
            onPress={() =>
              router.replace({
                pathname: '/(learner)/result',
                params: sessionId ? { sessionId } : {},
              })
            }
          >
            Zur Zusammenfassung
          </Btn>
        </View>
      )}

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LB.bg },
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
});
