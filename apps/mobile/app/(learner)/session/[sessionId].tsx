// Conversational learning session — Doc 05 §session, Doc 01 §Studying
// ("Das Üben ist ein Gespräch"), Doc 06 §P3.
//
// This is the core experience: a real chat with the tutor. The screen shows
// a transcript of question / learner / tutor bubbles; the tutor reply streams
// in token-by-token. The learner answers by typing OR by voice (toggleable
// mid-conversation, always with a text fallback so it can never dead-end).
// Wrong answers stay on the same question and the tutor walks a hint
// staircase in-thread. The whole thread is persisted server-side, so the
// agent always answers with full context and the session resumes exactly.

import NetInfo from '@react-native-community/netinfo';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Btn,
  Card,
  Chip,
  DiagramQuestion,
  ExplainModal,
  FillBlank,
  FunctionPlot,
  LatexText,
  LoadingState,
  MathInput,
  MathKeyboard,
  SessionTopBar,
  SvgStimulus,
  VoiceButton,
  toast,
} from '../../../components/lb/index.js';
import { getAccount } from '../../../lib/api/account.js';
import { ApiError } from '../../../lib/api/client.js';
import { getSessionSnapshot, patchSession, streamTurn } from '../../../lib/api/conversation.js';
import { getStudyAsset } from '../../../lib/api/studyAssets.js';
import { postAttemptBatch } from '../../../lib/api/attempts.js';
import { drainOutbox } from '../../../lib/sync/outbox.js';
import { sqliteOutbox } from '../../../lib/sync/outbox-store.js';
import {
  buildResumeTranscript,
  normVerdict,
  type DisplayVerdict,
} from '../../../lib/conversation/transcript.js';
import { finishSession, startSession } from '../../../lib/api/sessions.js';
import { localEvaluate, type EvaluatableItem } from '../../../lib/eval/local.js';
import { clearPendingSession, savePendingSession } from '../../../lib/session/pending.js';
import { LB } from '../../../lib/theme/colors.js';
import type { Item, Locale, SvgStimulus as SvgStimulusData } from '@learnbuddy/shared-types';

type BubbleRole = 'tutor' | 'learner' | 'question';
type Msg = {
  id: string;
  role: BubbleRole;
  text: string;
  streaming?: boolean;
  errored?: boolean;
  verdict?: DisplayVerdict;
};

function uuid(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
      ((+c ^ (Math.floor(Math.random() * 256) & (15 >> (+c / 4)))) as number).toString(16),
    )
  );
}

function voiceLocale(locale: Locale): string {
  return { de: 'de-DE', en: 'en-US', fr: 'fr-FR', es: 'es-ES', it: 'it-IT' }[locale];
}

export default function SessionScreen() {
  const { t } = useTranslation('session');
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    sessionId: string;
    subjectId?: string;
    folderId?: string;
    materialId?: string;
    learnerId?: string;
    testMode?: string;
    resumeSessionId?: string;
  }>();
  const testMode = params.testMode === 'true';

  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const learnerId = params.learnerId || (accountQuery.data?.learner?.id ?? '');
  const uiLocale: Locale = accountQuery.data?.learner?.ui_locale ?? 'de';
  const profileVoice = accountQuery.data?.learner?.preferred_answer_mode === 'voice';

  // ── Session bootstrap (start fresh OR resume an existing one) ─────────────
  const boot = useQuery({
    queryKey: ['session-boot', params.sessionId, params.resumeSessionId],
    enabled: !!learnerId,
    // Creating/loading a session is a ONE-SHOT side effect. focusManager is
    // wired to AppState, so default options would refetch on app foreground
    // / reconnect and call startSession again → a brand-new server session
    // id swaps in mid-conversation and the live thread is lost. Pin it.
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: false,
    queryFn: async (): Promise<{
      serverSessionId: string;
      items: Item[];
      startIdx: number;
      priorMsgs: Msg[];
      pinnedTopic: string | null;
    }> => {
      if (params.resumeSessionId) {
        const snap = await getSessionSnapshot(learnerId, params.resumeSessionId);
        const items = snap.items as Item[];
        // Rebuild a readable, chronological transcript (Question → answer →
        // feedback → …) and decide which item to resume on. Pure + tested
        // in lib/conversation/transcript.ts.
        const { messages, startIdx } = buildResumeTranscript(snap.turns, items);
        return {
          serverSessionId: snap.session_id,
          items,
          startIdx,
          priorMsgs: messages as Msg[],
          pinnedTopic: snap.pinned_topic,
        };
      }
      const started = await startSession(learnerId, {
        subject_id: params.subjectId ?? null,
        folder_id: params.folderId ?? null,
        material_id: params.materialId ?? null,
        test_mode: testMode,
        max_items: 20,
      });
      return {
        serverSessionId: started.session_id,
        items: started.items as Item[],
        startIdx: 0,
        priorMsgs: [],
        pinnedTopic: null,
      };
    },
  });

  const [idx, setIdx] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [answer, setAnswer] = useState('');
  const [fillValues, setFillValues] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [canAdvance, setCanAdvance] = useState(false);
  const [tries, setTries] = useState(0);
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceUnavailable, setVoiceUnavailable] = useState(false);
  const [pinned, setPinned] = useState<string | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const [done, setDone] = useState(false);
  // True once the bootstrap effect has applied items/messages to state.
  // Until then `items` is [] even though boot.data exists — without this
  // gate the `!item` check below briefly flashes the "All done!" screen.
  const [booted, setBooted] = useState(false);

  const serverSessionId = boot.data?.serverSessionId ?? '';
  const item: Item | undefined = items[idx];
  const startedAtRef = useRef<number>(Date.now());
  const scrollRef = useRef<ScrollView>(null);
  const bootedRef = useRef(false);

  // Numbered-diagram items: resolve the study asset to a signed image so
  // the learner can actually see what marker N refers to.
  const diagramQ = useQuery({
    queryKey: ['study-asset', item?.study_asset_id ?? null],
    enabled: !!item?.study_asset_id && !!learnerId,
    staleTime: 5 * 60_000,
    queryFn: () => getStudyAsset(learnerId, item!.study_asset_id as string),
  });

  // Apply the bootstrap result once.
  useEffect(() => {
    if (!boot.data || bootedRef.current) return;
    bootedRef.current = true;
    setVoiceOn(profileVoice);
    setPinned(boot.data.pinnedTopic);
    setItems(boot.data.items);
    setIdx(boot.data.startIdx);
    const seed = [...boot.data.priorMsgs];
    if (boot.data.startIdx < boot.data.items.length) {
      const it = boot.data.items[boot.data.startIdx]!;
      // On resume the question may already be in the rebuilt thread (the
      // in-progress item had earlier attempts) — don't show it twice.
      if (!seed.some((m) => m.id === `q-${it.id}`)) {
        seed.push({ id: `q-${it.id}`, role: 'question', text: it.question });
      }
    } else {
      setDone(true);
    }
    setMessages(seed);
    setBooted(true);
    if (boot.data.serverSessionId && learnerId) {
      void savePendingSession({
        session_id: boot.data.serverSessionId,
        learner_id: learnerId,
        test_mode: testMode,
      });
    }
  }, [boot.data, learnerId, profileVoice, testMode]);

  // Auto-scroll only when the user is already near the bottom — yanking them
  // away from a paragraph they're reading because a new token streamed in is
  // worse than the bottom going off-screen. Threshold (40px) approximates one
  // line of body copy.
  const nearBottomRef = useRef(true);
  useEffect(() => {
    if (!nearBottomRef.current) return;
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(id);
  }, [messages]);

  // Drain any offline-queued attempts on mount and whenever connectivity
  // is regained (Doc 05 §sync-engine). Idempotent server-side.
  useEffect(() => {
    if (!learnerId) return;
    const tryDrain = () => {
      void drainOutbox(sqliteOutbox, learnerId, (a) => postAttemptBatch(learnerId, a)).catch(
        () => undefined,
      );
    };
    tryDrain();
    const unsub = NetInfo.addEventListener((s) => {
      if (s.isConnected) tryDrain();
    });
    return unsub;
  }, [learnerId]);

  const patchMsg = useCallback((id: string, patch: Partial<Msg>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const advance = useCallback(() => {
    setCanAdvance(false);
    setTries(0);
    const next = idx + 1;
    setAnswer('');
    setFillValues([]);
    startedAtRef.current = Date.now();
    if (next >= items.length) {
      setDone(true);
      setIdx(next);
      return;
    }
    setIdx(next);
    const it = items[next]!;
    setMessages((prev) => [
      ...prev,
      { id: `q-${it.id}-${next}`, role: 'question', text: it.question },
    ]);
  }, [idx, items]);

  const send = useCallback(
    async (rawText: string, mode: 'voice' | 'text' | 'multiple_choice', displayText?: string) => {
      const text = rawText.trim();
      if (!text || sending || !item) return;
      setSending(true);
      setCanAdvance(false);

      const localVerdict = localEvaluate(item as EvaluatableItem, text);

      // Offline-first (Doc 05 §sync-engine): the tutor needs the network,
      // but a confidently locally-gradeable answer can be queued and synced
      // later instead of dead-ending. Anything the tutor must judge gets a
      // calm "needs a connection" message — never a hard block.
      const net = await NetInfo.fetch();
      if (net.isConnected === false) {
        setSending(false);
        if (localVerdict === 'correct' || localVerdict === 'incorrect') {
          const shown = displayText?.trim() || text;
          void sqliteOutbox.enqueue(learnerId, {
            client_attempt_id: uuid(),
            item_id: item.id,
            session_id: serverSessionId || null,
            mode,
            kid_answer: text,
            verdict: localVerdict,
            evaluated_by: 'local',
            hints_used: 0,
            duration_ms: Date.now() - startedAtRef.current,
            test_mode: testMode,
            reviewed_at: new Date().toISOString(),
          });
          setMessages((prev) => [
            ...prev,
            { id: uuid(), role: 'learner', text: shown },
            {
              id: uuid(),
              role: 'tutor',
              text: t('offline_saved'),
              verdict: normVerdict(localVerdict),
            },
          ]);
          setTries((n) => n + 1);
          setCanAdvance(true);
        } else {
          toast.info(t('offline_need_connection'));
        }
        return;
      }

      const learnerMsgId = uuid();
      const tutorMsgId = uuid();
      setMessages((prev) => [
        ...prev,
        // Show a human-readable bubble (the chosen option / readable
        // fill-ins) even though the payload sent to the server is the raw
        // index / "||"-joined string.
        { id: learnerMsgId, role: 'learner', text: displayText?.trim() || text },
        { id: tutorMsgId, role: 'tutor', text: '', streaming: true },
      ]);

      const dropOptimistic = () =>
        setMessages((prev) => prev.filter((m) => m.id !== learnerMsgId && m.id !== tutorMsgId));

      let verdict: Msg['verdict'];
      let failedCode: string | null = null;
      try {
        await streamTurn(
          learnerId,
          serverSessionId,
          {
            client_turn_id: uuid(),
            item_id: item.id,
            mode,
            text,
            duration_ms: Date.now() - startedAtRef.current,
            test_mode: testMode,
            client_local_verdict: localVerdict === 'correct' ? 'correct' : null,
          },
          (e) => {
            if (e.type === 'transcript' && e.text) patchMsg(learnerMsgId, { text: e.text });
            else if (e.type === 'token')
              setMessages((prev) =>
                prev.map((m) => (m.id === tutorMsgId ? { ...m, text: m.text + e.text } : m)),
              );
            else if (e.type === 'feedback') patchMsg(tutorMsgId, { text: e.text });
            else if (e.type === 'verdict') verdict = normVerdict(e.verdict);
            else if (e.type === 'done') {
              verdict = normVerdict(e.verdict);
              patchMsg(tutorMsgId, { streaming: false, verdict: normVerdict(e.verdict) });
            } else if (e.type === 'error') {
              failedCode = e.code;
            }
          },
        );
        if (failedCode) {
          // The turn was NOT graded or persisted server-side. Don't leave
          // an orphaned answer + error in the transcript (it duplicates on
          // retry) — drop the optimistic pair and surface a calm toast,
          // consistent with how the app reports transient errors.
          dropOptimistic();
          toast.error(t(`stream_error.${failedCode}`, { defaultValue: t('stream_error.generic') }));
        } else {
          patchMsg(tutorMsgId, { streaming: false, verdict });
          // Count a real, completed attempt (drives the "skip" affordance).
          setTries((n) => n + 1);
          // Advance on a real success OR once the item is closed out
          // (gave up / tutor revealed it). Decoupling "Weiter" from
          // 'correct' removes the pressure that made the model fake a
          // "Genau!" just so the learner could move on.
          if (verdict === 'correct' || verdict === 'skipped') setCanAdvance(true);
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          // Session unrecoverable — send the learner back to sign-in
          // instead of stranding them on a turn that will never succeed.
          router.replace('/login');
          return;
        }
        dropOptimistic();
        toast.error(t('stream_error.generic'));
      } finally {
        setSending(false);
      }
    },
    [item, learnerId, serverSessionId, sending, testMode, patchMsg, t],
  );

  const submitTyped = useCallback(() => {
    if (!item) return;
    // '||' matches how lib/eval/local.ts splits fill-blank answers, so the
    // zero-cost local fast-path can recognise a fully-correct set.
    if (item.answer_kind === 'fill_blank') {
      void send(fillValues.join('||'), 'text', fillValues.filter((v) => v?.trim()).join(' · '));
      setFillValues([]);
    } else {
      void send(answer, 'text');
      setAnswer('');
    }
  }, [item, answer, fillValues, send]);

  const onVoice = useCallback(
    (transcript: string) => {
      void send(transcript, 'voice');
    },
    [send],
  );

  const onVoiceUnavailable = useCallback(() => {
    // Voice can't be used here (module missing, permission denied, or it
    // threw). Fall back to the keyboard immediately, tell the learner once,
    // and remember it so the "speak instead" toggle (which would just fail
    // again) is hidden for the rest of the session.
    setVoiceUnavailable((already) => {
      if (!already) toast.info(t('voice.switched_to_text'));
      return true;
    });
    setVoiceOn(false);
  }, [t]);

  const finish = useCallback(async () => {
    try {
      await finishSession(learnerId, serverSessionId);
    } catch {
      /* result screen still loads from attempts */
    }
    await clearPendingSession();
    router.replace({
      pathname: '/(learner)/result',
      params: { sessionId: serverSessionId, testMode: String(testMode) },
    });
  }, [learnerId, serverSessionId, testMode]);

  const keepGoing = useCallback(async () => {
    try {
      const snap = await patchSession(learnerId, serverSessionId, { keep_going: true });
      const nextItems = snap.items as Item[];
      if (nextItems.length > items.length) {
        const next = items.length;
        setItems(nextItems);
        setDone(false);
        setIdx(next);
        const it = nextItems[next]!;
        setMessages((prev) => [
          ...prev,
          { id: `q-${it.id}-${next}`, role: 'question', text: it.question },
        ]);
      } else {
        toast.info(t('keep_going_empty'));
      }
    } catch {
      toast.error(t('error_title'));
    }
  }, [learnerId, serverSessionId, items.length, t]);

  const togglePin = useCallback(async () => {
    if (!item) return;
    const nextPinned = pinned ? null : (item.topic ?? null);
    setPinned(nextPinned);
    try {
      await patchSession(learnerId, serverSessionId, { pinned_topic: nextPinned });
      toast.info(nextPinned ? t('pin.on', { topic: nextPinned }) : t('pin.off'));
    } catch {
      setPinned(pinned);
    }
  }, [item, pinned, learnerId, serverSessionId, t]);

  // Confirm before leaving mid-conversation, and reassure that progress is
  // kept (the home/practice resume banner brings them right back here).
  const confirmExit = useCallback(() => {
    Alert.alert(t('exit.title'), t('exit.saved_hint'), [
      { text: t('exit.keep_going'), style: 'cancel' },
      {
        text: t('exit.end'),
        style: 'destructive',
        onPress: () => router.replace('/(learner)/home'),
      },
    ]);
  }, [t]);

  // Android hardware back must hit the same confirm, not silently bail.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (boot.data && !done) {
        confirmExit();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [boot.data, done, confirmExit]);

  // ── Render states ────────────────────────────────────────────────────────
  if (boot.isLoading || accountQuery.isLoading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
        <LoadingState />
      </SafeAreaView>
    );
  }
  if (boot.isError || !boot.data) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
        <View
          style={{ flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 14 }}
        >
          <Text style={{ fontSize: 17, color: LB.ink2, textAlign: 'center', lineHeight: 24 }}>
            {t('no_items')}
          </Text>
          <Btn size="lg" onPress={() => router.replace('/(learner)/home')}>
            {t('back')}
          </Btn>
        </View>
      </SafeAreaView>
    );
  }

  // boot.data has resolved but the bootstrap effect hasn't applied it to
  // state yet — keep showing the loader instead of flashing "All done!".
  if (!booted) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
        <LoadingState />
      </SafeAreaView>
    );
  }

  if (done || !item) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16 }}>
          <Card tone="mint" padding={24}>
            <Text style={{ fontSize: 24, fontWeight: '600', color: LB.ink, letterSpacing: -0.5 }}>
              {t('done.title')}
            </Text>
            <Text style={{ fontSize: 15, color: LB.ink2, marginTop: 8, lineHeight: 22 }}>
              {t('done.body')}
            </Text>
          </Card>
          {!testMode && (
            <Btn size="lg" full variant="outline" onPress={() => void keepGoing()}>
              {t('done.keep_going')}
            </Btn>
          )}
          <Btn size="lg" full onPress={() => void finish()}>
            {t('done.finish')}
          </Btn>
        </View>
      </SafeAreaView>
    );
  }

  const total = items.length;
  const stimulusSvg =
    item.stimulus_kind === 'svg' && item.stimulus_data
      ? (item.stimulus_data as SvgStimulusData)
      : null;
  const voiceEligible = voiceOn && (item.answer_kind === 'short' || item.answer_kind === 'long');

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <SessionTopBar
        progress={(idx + (canAdvance ? 1 : 0)) / total}
        index={`${Math.min(idx + 1, total)} / ${total}`}
        badge={testMode ? t('badge_test') : t('badge_practice')}
        onExit={confirmExit}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={8}
      >
        <ScrollView
          ref={scrollRef}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            const distanceFromBottom =
              contentSize.height - (contentOffset.y + layoutMeasurement.height);
            nearBottomRef.current = distanceFromBottom < 40;
          }}
          scrollEventThrottle={120}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 20,
            gap: 10,
          }}
        >
          {/* Pin + explain controls */}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            {!testMode && item.topic ? (
              <Pressable
                onPress={() => void togglePin()}
                accessibilityRole="button"
                hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
              >
                <View
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    backgroundColor: pinned ? LB.primaryLt : '#fff',
                    borderColor: pinned ? LB.primaryDk : LB.hairline,
                    borderWidth: 1,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      color: pinned ? LB.primaryDk : LB.ink,
                      fontWeight: '600',
                    }}
                  >
                    {pinned ? t('pin.pinned') : t('pin.pin')}
                  </Text>
                </View>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => setExplainOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t('explain.open')}
              hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
            >
              <View
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  backgroundColor: '#fff',
                  borderColor: LB.hairline,
                  borderWidth: 1,
                }}
              >
                <Text style={{ fontSize: 12, color: LB.ink, fontWeight: '600' }}>
                  {t('explain.pill')}
                </Text>
              </View>
            </Pressable>
          </View>

          {messages.map((m) => (
            <Bubble key={m.id} msg={m} item={item} stimulusSvg={stimulusSvg} t={t} />
          ))}

          {sending && (
            <View style={{ alignSelf: 'flex-start', paddingLeft: 6, paddingVertical: 4 }}>
              <ActivityIndicator color={LB.ink3} size="small" />
            </View>
          )}
        </ScrollView>

        {/* Active diagram — kept visible above the composer so the learner
            can see the numbered figure while typing/speaking the label. */}
        {diagramQ.data ? (
          <View
            style={{
              borderTopColor: LB.hairline,
              borderTopWidth: 1,
              backgroundColor: LB.bg,
              alignItems: 'center',
              paddingVertical: 10,
            }}
          >
            <DiagramQuestion
              storage_url={diagramQ.data.signed_url}
              width={diagramQ.data.width}
              height={diagramQ.data.height}
              label_positions={diagramQ.data.label_positions}
              active_index={item.diagram_label_index ?? null}
            />
          </View>
        ) : null}

        {/* Composer */}
        <View
          style={{
            borderTopColor: LB.hairline,
            borderTopWidth: 1,
            backgroundColor: LB.bg,
            paddingHorizontal: 14,
            paddingTop: 10,
            paddingBottom: Math.max(insets.bottom, 10),
            gap: 10,
          }}
        >
          {canAdvance ? (
            <>
              <Btn size="lg" full onPress={advance}>
                {t('next')}
              </Btn>
              {item.problem_template_id ? (
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/(learner)/practice/[templateId]',
                      params: { templateId: item.problem_template_id as string },
                    })
                  }
                  accessibilityRole="button"
                  hitSlop={{ top: 14, bottom: 14, left: 16, right: 16 }}
                >
                  <Text style={{ fontSize: 13, color: LB.ink2, textAlign: 'center' }}>
                    {t('practice_similar')}
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <>
              <Composer
                item={item}
                t={t}
                sending={sending}
                answer={answer}
                setAnswer={setAnswer}
                fillValues={fillValues}
                setFillValues={setFillValues}
                voiceEligible={voiceEligible}
                voiceLocaleTag={voiceLocale(uiLocale)}
                onSubmitTyped={submitTyped}
                onPickMc={(i) =>
                  void send(String(i), 'multiple_choice', item.mc_options?.[i] ?? `#${i + 1}`)
                }
                onVoice={onVoice}
                onVoiceUnavailable={onVoiceUnavailable}
                voiceOn={voiceOn}
                canUseVoice={item.answer_kind === 'short' || item.answer_kind === 'long'}
                voiceUnavailable={voiceUnavailable}
                onToggleVoice={() => setVoiceOn((v) => !v)}
              />
              {tries >= 1 && !sending ? (
                <Pressable
                  onPress={advance}
                  accessibilityRole="button"
                  hitSlop={{ top: 14, bottom: 14, left: 16, right: 16 }}
                >
                  <Text style={{ fontSize: 13, color: LB.ink3, textAlign: 'center' }}>
                    {t('skip')}
                  </Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      <ExplainModal
        visible={explainOpen}
        onClose={() => setExplainOpen(false)}
        learnerId={learnerId}
        itemId={item.id}
        topic={item.question}
        context={item.source_excerpt ?? undefined}
      />
    </SafeAreaView>
  );
}

function Bubble({
  msg,
  item,
  stimulusSvg,
  t,
}: {
  msg: Msg;
  item: Item;
  stimulusSvg: SvgStimulusData | null;
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  if (msg.role === 'question') {
    return (
      <Card tone="lavender" padding={18}>
        <Text
          style={{
            fontSize: 11,
            color: LB.ink2,
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: 0.6,
          }}
        >
          {t('question_label_short')}
        </Text>
        <Text style={{ fontSize: 16, color: LB.ink, marginTop: 6, lineHeight: 23 }}>
          {msg.text}
        </Text>
        {item.latex_expected ? (
          <View style={{ marginTop: 12 }}>
            <LatexText expression={item.latex_expected} displayMode />
          </View>
        ) : null}
        {item.stimulus_kind === 'function_plot' && item.stimulus_data ? (
          <View style={{ marginTop: 14, alignItems: 'center' }}>
            <FunctionPlot
              {...(item.stimulus_data as Parameters<typeof FunctionPlot>[0])}
              width={300}
              height={200}
            />
          </View>
        ) : null}
        {stimulusSvg ? (
          <View style={{ marginTop: 14, alignItems: 'center' }}>
            <SvgStimulus
              svg={stimulusSvg.content}
              width={300}
              height={220}
              fallbackLabel={t('stimulus.fallback')}
            />
          </View>
        ) : null}
      </Card>
    );
  }

  const mine = msg.role === 'learner';
  return (
    <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
      <View
        style={{
          paddingVertical: 11,
          paddingHorizontal: 14,
          borderRadius: 18,
          borderBottomRightRadius: mine ? 4 : 18,
          borderBottomLeftRadius: mine ? 18 : 4,
          backgroundColor: mine ? LB.primary : msg.errored ? 'rgba(177,73,60,0.10)' : '#fff',
          borderColor: mine ? LB.primary : LB.hairline,
          borderWidth: 1,
        }}
      >
        {!mine && msg.verdict ? (
          <View style={{ marginBottom: 6 }}>
            <Chip
              tone={
                msg.verdict === 'correct'
                  ? 'success'
                  : msg.verdict === 'partially_correct'
                    ? 'warning'
                    : 'gray'
              }
            >
              {t(`verdict.${msg.verdict}`)}
            </Chip>
          </View>
        ) : null}
        <Text
          style={{
            fontSize: 15,
            lineHeight: 21,
            color: mine ? '#fff' : msg.errored ? LB.danger : LB.ink,
          }}
        >
          {msg.text || (msg.streaming ? '…' : '')}
        </Text>
      </View>
    </View>
  );
}

function Composer({
  item,
  t,
  sending,
  answer,
  setAnswer,
  fillValues,
  setFillValues,
  voiceEligible,
  voiceLocaleTag,
  onSubmitTyped,
  onPickMc,
  onVoice,
  onVoiceUnavailable,
  voiceOn,
  canUseVoice,
  voiceUnavailable,
  onToggleVoice,
}: {
  item: Item;
  t: (k: string, o?: Record<string, unknown>) => string;
  sending: boolean;
  answer: string;
  setAnswer: (s: string) => void;
  fillValues: string[];
  setFillValues: (v: string[]) => void;
  voiceEligible: boolean;
  voiceLocaleTag: string;
  onSubmitTyped: () => void;
  onPickMc: (i: number) => void;
  onVoice: (text: string) => void;
  onVoiceUnavailable: () => void;
  voiceOn: boolean;
  canUseVoice: boolean;
  voiceUnavailable: boolean;
  onToggleVoice: () => void;
}) {
  // Brief selected-state feedback while the turn is in flight; cleared once
  // it resolves so a wrong choice isn't left looking locked-in, and on a
  // new item.
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => {
    setPicked(null);
  }, [item.id]);
  useEffect(() => {
    if (!sending) setPicked(null);
  }, [sending]);

  if (item.answer_kind === 'multiple_choice') {
    return (
      <View style={{ gap: 8 }}>
        {(item.mc_options ?? []).map((opt, i) => {
          const on = picked === i;
          return (
            <Pressable
              key={i}
              onPress={() => {
                if (sending) return;
                setPicked(i);
                onPickMc(i);
              }}
              accessibilityRole="button"
              accessibilityLabel={opt}
              accessibilityState={{ selected: on }}
            >
              <View
                style={{
                  padding: 14,
                  borderRadius: 14,
                  backgroundColor: on ? LB.primaryLt : '#fff',
                  borderColor: on ? LB.primaryDk : LB.hairline,
                  borderWidth: 1,
                  opacity: sending && !on ? 0.5 : 1,
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    color: on ? LB.primaryDk : LB.ink,
                    fontWeight: on ? '600' : '400',
                  }}
                >
                  {opt}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (item.answer_kind === 'fill_blank') {
    return (
      <View style={{ gap: 10 }}>
        <FillBlank
          template={item.fill_blank_template ?? ''}
          values={fillValues}
          onChange={(i, v) => {
            const next = [...fillValues];
            next[i] = v;
            setFillValues(next);
          }}
        />
        <Btn
          size="lg"
          full
          disabled={sending || fillValues.every((v) => !v?.trim())}
          onPress={onSubmitTyped}
        >
          {sending ? t('checking') : t('submit')}
        </Btn>
      </View>
    );
  }

  if (item.answer_kind === 'numeric' || item.answer_kind === 'formula') {
    return (
      <View style={{ gap: 10 }}>
        {/* Bounded + scrollable so the math keyboard can't push the submit
            button off a small screen — the CTA stays outside, always tappable. */}
        <ScrollView
          style={{ maxHeight: 320 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 10 }}
        >
          <MathInput
            value={answer}
            onChangeText={setAnswer}
            placeholder={
              item.answer_kind === 'numeric' ? t('placeholder.number') : t('placeholder.formula')
            }
          />
          <MathKeyboard
            onInsert={(token) =>
              setAnswer(token === 'BACKSPACE' ? answer.slice(0, -1) : answer + token)
            }
          />
        </ScrollView>
        <Btn size="lg" full disabled={sending || !answer.trim()} onPress={onSubmitTyped}>
          {sending ? t('checking') : t('submit')}
        </Btn>
      </View>
    );
  }

  // short / long / diagram_label → text, with optional voice.
  return (
    <View style={{ gap: 10 }}>
      {voiceEligible ? (
        <VoiceButton
          locale={voiceLocaleTag}
          labelIdle={t('voice.idle')}
          labelActive={t('voice.active')}
          permissionRationale={t('voice.permission_rationale')}
          unavailableLabel={t('voice.unavailable')}
          retryHint={t('voice.retry')}
          onTranscript={onVoice}
          onUnavailable={onVoiceUnavailable}
          disabled={sending}
        />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <TextInput
              value={answer}
              onChangeText={setAnswer}
              placeholder={t('placeholder.answer')}
              placeholderTextColor={LB.ink3}
              multiline={item.answer_kind === 'long'}
              editable={!sending}
              onSubmitEditing={item.answer_kind === 'long' ? undefined : onSubmitTyped}
              returnKeyType="send"
              style={{
                backgroundColor: '#fff',
                borderColor: LB.hairline,
                borderWidth: 1,
                borderRadius: 16,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 16,
                color: LB.ink,
                minHeight: item.answer_kind === 'long' ? 96 : 48,
              }}
            />
          </View>
          <Btn size="md" disabled={sending || !answer.trim()} onPress={onSubmitTyped}>
            {sending ? t('checking') : t('send')}
          </Btn>
        </View>
      )}
      {canUseVoice && !voiceUnavailable ? (
        <Pressable
          onPress={onToggleVoice}
          accessibilityRole="button"
          hitSlop={{ top: 14, bottom: 14, left: 16, right: 16 }}
        >
          <Text style={{ fontSize: 13, color: LB.ink2, textAlign: 'center' }}>
            {voiceOn ? t('voice.use_keyboard') : t('voice.use_voice')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
