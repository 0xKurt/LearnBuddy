// Chat-style tutoring screen.
//
// Wires the ChatBubble + ChatComposer shell to the existing pedagogical
// backend (`POST /sessions`, `POST /sessions/:id/turn`, `PATCH /sessions/
// :id/finish`). Every Phase A–E pedagogy (praise context, runtime signal,
// give-up cascade, move registry, probes, misconception confrontation,
// curiosity hook, fatigue-driven end) flows through that endpoint — this
// screen is a thin chat-shaped view onto it.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ActivityIndicator, FlatList, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { getAccount } from '../../../lib/api/account';
import { finishSession, startSession } from '../../../lib/api/sessions';
import { streamTurn } from '../../../lib/api/conversation';
import { Btn } from '../../../components/lb/Btn';
import { ChatBubble, AgentThinking } from '../../../components/chat/ChatBubble';
import { ChatComposer } from '../../../components/chat/ChatComposer';
import { LB } from '../../../lib/theme/colors';

type Message = {
  id: string;
  role: 'learner' | 'agent' | 'system';
  content: string;
  isStreaming?: boolean;
  verdict?: 'correct' | 'partially_correct' | 'incorrect' | 'skipped' | null;
};

type SessionItem = Awaited<ReturnType<typeof startSession>>['items'][number];

export default function ChatScreen() {
  const params = useLocalSearchParams<{
    sessionId?: string;
    subjectId?: string;
    folderId?: string;
    materialId?: string;
    testMode?: string;
  }>();

  // Source the learner from the authenticated account, not the URL. The
  // URL only carries non-sensitive route state.
  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const learnerId = accountQuery.data?.learner?.id ?? null;

  const [sessionId, setSessionId] = useState<string | null>(params.sessionId ?? null);
  const [items, setItems] = useState<SessionItem[]>([]);
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [opener, setOpener] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [sessionActive, setSessionActive] = useState(true);
  const [endingSuggested, setEndingSuggested] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  const listRef = useRef<FlatList<Message>>(null);

  const currentItem = items[currentItemIndex] ?? null;
  const testMode = params.testMode === 'true';

  // ── Bootstrap ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!learnerId) return;
    if (sessionId) {
      // Resume path. For now we don't restore the on-screen transcript;
      // we just continue answering items in the same session row. The
      // real snapshot endpoint exists (`GET /sessions/:id`) and can be
      // wired here when we want to restore the bubbles.
      setBootstrapping(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const created = await startSession(learnerId, {
          subject_id: params.subjectId ?? null,
          folder_id: params.folderId ?? null,
          material_id: params.materialId ?? null,
          test_mode: testMode,
          max_items: 20,
        });
        if (cancelled) return;
        setSessionId(created.session_id);
        setItems(created.items);
        const seed: Message[] = [];
        if (created.opener) {
          setOpener(created.opener);
          seed.push({ id: 'opener', role: 'agent', content: created.opener });
        }
        const first = created.items[0];
        if (first) {
          seed.push({ id: `q-${first.id}`, role: 'agent', content: first.question });
        }
        setMessages(seed);
      } catch (err) {
        if (!cancelled)
          setLoadError(err instanceof Error ? err.message : 'Konnte Session nicht starten');
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [learnerId, sessionId, params.subjectId, params.folderId, params.materialId, testMode]);

  // ── Submit ────────────────────────────────────────────────────────────
  const submit = useCallback(
    async (text: string) => {
      if (!sessionId || !currentItem || !learnerId) return;
      if (!sessionActive) return;
      if (streaming || thinking) return;
      const learnerMsgId = `l-${Date.now()}`;
      const agentMsgId = `a-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
      setMessages((prev) => [
        ...prev,
        { id: learnerMsgId, role: 'learner', content: text },
        { id: agentMsgId, role: 'agent', content: '', isStreaming: true },
      ]);
      setThinking(true);
      let acc = '';
      let finalVerdict: Message['verdict'] = null;
      let revealedAnswer = false;
      try {
        await streamTurn(
          learnerId,
          sessionId,
          {
            client_turn_id: `${sessionId}-${learnerMsgId}`,
            item_id: currentItem.id,
            mode: 'text',
            text,
            duration_ms: 0,
            test_mode: testMode,
          },
          (event) => {
            switch (event.type) {
              case 'token': {
                if (thinking) setThinking(false);
                if (!streaming) setStreaming(true);
                acc += event.text;
                setMessages((prev) =>
                  prev.map((m) => (m.id === agentMsgId ? { ...m, content: acc } : m)),
                );
                break;
              }
              case 'feedback': {
                // Full final text — replaces the streaming accumulator so
                // non-streaming Vertex fallbacks still render correctly.
                if (event.text && event.text.length > acc.length) {
                  acc = event.text;
                  setMessages((prev) =>
                    prev.map((m) => (m.id === agentMsgId ? { ...m, content: acc } : m)),
                  );
                }
                break;
              }
              case 'verdict':
                finalVerdict = event.verdict;
                break;
              case 'done':
                if (event.session_ending_suggested) setEndingSuggested(true);
                if (!event.session_active) setSessionActive(false);
                revealedAnswer = false;
                break;
              case 'error':
                setLoadError(event.message);
                break;
              default:
                break;
            }
          },
        );
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Verbindung unterbrochen');
        setStreaming(false);
        setThinking(false);
        return;
      }
      setStreaming(false);
      setThinking(false);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === agentMsgId ? { ...m, isStreaming: false, verdict: finalVerdict } : m,
        ),
      );

      // Advance to the next item on terminal verdicts. The server's
      // give-up cascade already controls escalation within an item, so
      // here we only advance on a definite outcome.
      if (finalVerdict === 'correct' || finalVerdict === 'skipped' || revealedAnswer) {
        advance();
      }
    },
    [sessionId, currentItem, learnerId, sessionActive, streaming, thinking, testMode],
  );

  const advance = useCallback(() => {
    setCurrentItemIndex((idx) => {
      const next = idx + 1;
      if (next >= items.length) {
        setSessionActive(false);
        if (sessionId && learnerId) void finishSession(learnerId, sessionId);
        return idx;
      }
      const nextItem = items[next]!;
      // Small delay so the verdict bubble settles before the next
      // question pops in — feels less abrupt.
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          { id: `q-${nextItem.id}-${next}`, role: 'agent', content: nextItem.question },
        ]);
      }, 350);
      return next;
    });
  }, [items, sessionId, learnerId]);

  // ── Auto-scroll ───────────────────────────────────────────────────────
  useEffect(() => {
    if (messages.length === 0) return;
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length, streaming]);

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
  if (loadError && messages.length === 0) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>{loadError}</Text>
        <Btn
          variant="primary"
          onPress={() => {
            setLoadError(null);
            setBootstrapping(true);
            setSessionId(null);
          }}
        >
          Nochmal versuchen
        </Btn>
      </SafeAreaView>
    );
  }

  // ── Header + main ─────────────────────────────────────────────────────
  const progressLabel = useMemo(
    () => `${Math.min(currentItemIndex + 1, items.length)} / ${items.length || '?'}`,
    [currentItemIndex, items.length],
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Btn variant="ghost" size="sm" onPress={() => router.back()}>
          ← Zurück
        </Btn>
        <View style={styles.progressBox}>
          <Text style={styles.progressLabel}>{progressLabel}</Text>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${
                    items.length > 0
                      ? Math.min(((currentItemIndex + 1) / items.length) * 100, 100)
                      : 0
                  }%`,
                },
              ]}
            />
          </View>
        </View>
        {opener && currentItemIndex === 0 ? (
          <Text style={styles.openerHint}>Letztes Mal</Text>
        ) : null}
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <ChatBubble
            role={item.role === 'agent' ? 'agent' : item.role}
            content={item.content}
            isStreaming={item.isStreaming}
            verdict={item.verdict ?? null}
          />
        )}
        contentContainerStyle={styles.list}
        ListFooterComponent={thinking && !streaming ? <AgentThinking /> : null}
        showsVerticalScrollIndicator={false}
      />

      {endingSuggested ? (
        <View style={styles.endingHint}>
          <Text style={styles.endingHintText}>
            Wir waren heute lange dran. Magst du morgen weitermachen?
          </Text>
          <Btn
            variant="soft"
            size="sm"
            onPress={() => {
              setSessionActive(false);
              if (sessionId && learnerId) void finishSession(learnerId, sessionId);
            }}
          >
            Heute genug
          </Btn>
        </View>
      ) : null}

      {sessionActive && currentItem ? (
        <ChatComposer
          mode="text"
          answerKind={currentItem.answer_kind}
          units={currentItem.units}
          mcOptions={currentItem.mc_options ?? undefined}
          disabled={thinking || streaming}
          onSubmit={submit}
        />
      ) : (
        <View style={styles.endBlock}>
          <Text style={styles.endTitle}>Session beendet</Text>
          <Text style={styles.muted}>Gut gemacht — bis bald.</Text>
          <Btn
            variant="primary"
            onPress={() => {
              router.replace({
                pathname: '/(learner)/result',
                params: sessionId ? { sessionId } : {},
              });
            }}
          >
            Zur Zusammenfassung
          </Btn>
        </View>
      )}
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
  openerHint: { fontSize: 11, color: LB.primaryDk, fontWeight: '600' },
  list: { paddingVertical: 12, flexGrow: 1 },
  endingHint: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: LB.peach,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: LB.hairline,
  },
  endingHintText: { flex: 1, fontSize: 13, color: LB.ink },
  endBlock: {
    padding: 24,
    alignItems: 'center',
    gap: 12,
    backgroundColor: LB.paper,
    borderTopWidth: 1,
    borderTopColor: LB.hairline,
  },
  endTitle: { fontSize: 18, fontWeight: '700', color: LB.ink },
});
