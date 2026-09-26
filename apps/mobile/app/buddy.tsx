// The one screen, Buddy first: the one thing that matters now (if any), the
// one open decision, and the conversation — what Buddy did stands in it, with
// undo. Starting something is a tap on a suggestion, the camera, or just
// saying it. No lists, no menus to learn. docs/architecture.md §Home.
// Taps are direct API calls (no model); only free text goes to Buddy.
// Voice mode (headphones switch next to the menu): Buddy's reply to what she
// just sent is read aloud, and the mic is the composer's main control.

import type { BuddyHome, MessageView } from '@learnbuddy/shared-types/contracts';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BuddyOrb } from '../components/lb/BuddyOrb.js';
import { Composer } from '../components/buddy/Composer.js';
import { Conversation } from '../components/buddy/Conversation.js';
import { DecisionCard } from '../components/buddy/DecisionCard.js';
import { whenText } from '../components/buddy/describe.js';
import { NowCard } from '../components/buddy/NowCard.js';
import { WorkingNote } from '../components/buddy/WorkingNote.js';
import { ChoiceSheet } from '../components/learn/ChoiceSheet.js';
import { TopicSheet } from '../components/learn/TopicSheet.js';
import type { TopicKind } from '../components/learn/useStartTopic.js';
import { Banner } from '../components/lb/Banner.js';
import { Btn } from '../components/lb/Btn.js';
import { CircleBtn } from '../components/lb/CircleBtn.js';
import { EmptyState } from '../components/lb/EmptyState.js';
import { Glow } from '../components/lb/Glow.js';
import { OrbitMenu, type OrbitItem } from '../components/lb/OrbitMenu.js';
import { StartRow } from '../components/lb/StartRow.js';
import { LoadingState } from '../components/lb/LoadingState.js';
import { Sheet } from '../components/lb/Sheet.js';
import { toast } from '../components/lb/Toast.js';
import { useSpokenWords } from '../components/math/useSpokenMath.js';
import { clearAdminToken } from '../lib/admin.js';
import { requestAdmin } from '../lib/adminFlow.js';
import { ApiError, newId } from '../lib/api/client.js';
import {
  answerContactOptIn,
  reportOutcome,
  retryMaterial,
  sendMessageStreamed,
  skipStep,
  startStep,
  undoAction,
} from '../lib/api/endpoints.js';
import { keys, queryClient, setHome, useHome } from '../lib/api/queries.js';
import { messageFor, turnFailureText } from '../lib/errors.js';
import { currentLocale } from '../lib/i18n/index.js';
import { registerDeviceForPush } from '../lib/push.js';
import { speakInOrder, stop as stopListening } from '../lib/speech/listen.js';
import { replyAfter, spokenText } from '../lib/speech/spoken.js';
import { createStreamSpeaker, type StreamSpeaker } from '../lib/speech/streamSpeaker.js';
import { useVoiceMode } from '../lib/speech/voiceMode.js';
import { LB } from '../lib/theme/colors.js';
import { TYPE } from '../lib/theme/type.js';

const VISIBLE_MESSAGES = 6;

/** iOS can't present a sheet while another one is still sliding away. */
const SHEET_SWAP_MS = Platform.OS === 'ios' ? 450 : 0;

export default function BuddyScreen() {
  const { t } = useTranslation(['buddy', 'common', 'learn']);
  const home = useHome();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ id: string; text: string } | null>(null);
  /** Buddy's reply while it is being written (an answer that changes nothing). */
  const [live, setLive] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [topic, setTopic] = useState<TopicKind | null>(null);
  const [choice, setChoice] = useState<'homework' | 'vocab' | null>(null);
  const scroll = useRef<ScrollView>(null);
  // After sending, follow the conversation to its end once the new content has rendered.
  const followEnd = useRef(false);
  const voiceOn = useVoiceMode((s) => s.on);
  const words = useSpokenWords();
  /** The message she sent last whose reply hasn't been read aloud yet (voice mode). */
  const awaitingReply = useRef<string | null>(null);

  // Voice mode: Buddy's reply to what she just sent is read aloud once it is there
  // (right with the answer, or later when a slow turn finishes).
  const thread = home.data?.thread;
  useEffect(() => {
    const sent = awaitingReply.current;
    if (!sent || !thread) return;
    const reply = replyAfter(thread, sent);
    if (!reply) return;
    awaitingReply.current = null;
    if (voiceOn) speakInOrder([{ text: spokenText(reply.text, words), lang: currentLocale() }]);
  }, [thread, voiceOn, words]);

  // Going to another screen ends whatever is being read.
  useFocusEffect(useCallback(() => () => stopListening(), []));

  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.home });

  /** Runs a tap; a returned home replaces the cached one. */
  async function act(fn: () => Promise<BuddyHome | void>): Promise<void> {
    setBusy(true);
    try {
      const next = await fn();
      if (next) setHome(next);
    } catch (err) {
      toast.show(messageFor(err), 'error');
      if (
        err instanceof ApiError &&
        (err.code === 'conflict' || err.code === 'stale' || err.code === 'not_found')
      ) {
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function send(
    text: string,
    clientMessageId: string = newId(),
    replyToId: string | null = null,
  ) {
    setPending({ id: clientMessageId, text });
    setLive(null);
    followEnd.current = true;
    awaitingReply.current = clientMessageId;
    // Buddy's reply appears while it is written when the answer changes nothing; in voice
    // mode it is also read sentence by sentence (docs/architecture.md §Speed).
    let round = 0;
    const cur: { speaker: StreamSpeaker | null } = { speaker: null };
    try {
      const res = await sendMessageStreamed(text, clientMessageId, replyToId, (e) => {
        if (e.round !== round) {
          round = e.round;
          cur.speaker?.cancel();
          cur.speaker = null;
          setLive(null);
        }
        if (!e.speakable) return;
        setLive(e.text);
        followEnd.current = true;
        if (!useVoiceMode.getState().on) return;
        cur.speaker ??= createStreamSpeaker(
          currentLocale(),
          (sentence) => spokenText(sentence, words),
          () => undefined,
        );
        cur.speaker.feed(e.text, e.done);
      });
      // Already read while it was written: the effect below does not read it again.
      if (cur.speaker) {
        const reply = replyAfter(res.home.thread, clientMessageId);
        if (reply && reply.text === cur.speaker.text) awaitingReply.current = null;
        else cur.speaker.cancel();
      }
      setHome(res.home);
      if (res.status === 'failed') toast.show(turnFailureText(res.error_code), 'error');
    } catch (err) {
      cur.speaker?.cancel();
      toast.show(messageFor(err), 'error');
      // The message may have reached the server (then it shows as failed or processing).
      await refresh();
    } finally {
      setPending(null);
      setLive(null);
      followEnd.current = true;
    }
  }

  async function enableContact(asAdult: boolean) {
    if (asAdult && !(await requestAdmin())) return;
    await act(async () => {
      const next = await answerContactOptIn(true);
      // The PIN was for this one step (docs/privacy.md §PIN gate).
      if (asAdult) clearAdminToken();
      // Ask for notification permission only now, when it has a purpose.
      await registerDeviceForPush().catch(() => false);
      return next;
    });
  }

  /**
   * The ways to start, on the ring around Buddy (docs/UX-PRINCIPLES.md §6:
   * examples of what Buddy does, not a feature catalog). The first one fits her
   * situation; everything else she just says, and Buddy answers with a button.
   */
  function orbitItems(next: BuddyHome['next']): OrbitItem[] {
    const exam = next.find((i) => i.kind === 'exam');
    return [
      exam
        ? {
            key: 'test',
            icon: 'check',
            label: t('buddy:suggest.test'),
            onPress: () => void send(t('buddy:suggest.test_message', { title: exam.title })),
          }
        : {
            key: 'exam',
            icon: 'clock',
            label: t('buddy:suggest.exam_short'),
            onPress: () => void send(t('buddy:suggest.exam')),
          },
      {
        key: 'homework',
        icon: 'pencil',
        label: t('buddy:suggest.homework'),
        onPress: () => setChoice('homework'),
      },
      {
        key: 'speak',
        icon: 'mic',
        label: t('buddy:suggest.speak'),
        onPress: () => setTopic('speak'),
      },
      {
        key: 'vocab',
        icon: 'book',
        label: t('buddy:suggest.vocab'),
        onPress: () => setChoice('vocab'),
      },
      {
        key: 'explain',
        icon: 'bulb',
        label: t('buddy:suggest.explain'),
        onPress: () => setTopic('explain'),
      },
    ];
  }

  /** From a choice sheet on: first let it close, then go on. */
  function fromChoice(next: () => void): void {
    setChoice(null);
    setTimeout(next, SHEET_SWAP_MS);
  }

  if (home.isPending) return <LoadingState label={t('common:loading')} />;
  if (home.isError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: LB.bg, justifyContent: 'center' }}>
        <EmptyState
          title={messageFor(home.error)}
          action={
            <Btn center onPress={() => void home.refetch()}>
              {t('common:actions.retry')}
            </Btn>
          }
        />
      </SafeAreaView>
    );
  }

  const h = home.data;
  // The next test in one line; everything else Buddy says in the conversation.
  const nextExam = h.next.find((i) => i.kind === 'exam') ?? null;
  const messages = h.thread.slice(-VISIBLE_MESSAGES);
  // Hide the optimistic bubble once the server has the message.
  const shownPending =
    pending && !h.thread.some((m) => m.client_message_id === pending.id)
      ? { text: pending.text }
      : null;

  // Once there is a conversation, it gets the room; the ring shrinks to a row.
  const talking = messages.length > 0 || shownPending !== null;
  const top = [
    !h.system.model ? (
      <Banner key="model" tone="warning">
        {t('buddy:system.no_model')}
      </Banner>
    ) : null,
    h.system.scheduler === 'stale' ? (
      <Banner key="scheduler" tone="warning">
        {t('buddy:system.scheduler_stale')}
      </Banner>
    ) : null,
    h.now ? (
      <NowCard
        key="now"
        card={h.now}
        busy={busy}
        onResume={(id) => router.push(`/practice/${id}`)}
        onStart={(stepId) =>
          void act(async () => {
            const { session_id } = await startStep(stepId);
            router.push(`/practice/${session_id}`);
          })
        }
        onSkip={(stepId) => void act(() => skipStep(stepId))}
        onCapture={(stepId, goalId) =>
          router.push({
            pathname: '/capture',
            params: { ...(stepId ? { stepId } : {}), ...(goalId ? { goalId } : {}) },
          })
        }
        onRetryMaterial={(id) =>
          void act(async () => {
            await retryMaterial(id);
            await refresh();
          })
        }
      />
    ) : null,
    h.working ? <WorkingNote key="working" what={h.working} /> : null,
    h.decision ? (
      <DecisionCard
        key="decision"
        decision={h.decision}
        compact={h.now !== null}
        busy={busy}
        onOptIn={(enable) =>
          enable ? void enableContact(false) : void act(() => answerContactOptIn(false))
        }
        onAdultOptIn={() => void enableContact(true)}
        onOutcome={(goalId, outcome) => void act(() => reportOutcome(goalId, outcome))}
      />
    ) : null,
  ].filter((node) => node !== null);
  // The one headline: her name gets the full width (long names wrap, never overlap).
  const greeting = (
    <View style={{ gap: talking ? 0 : 4 }}>
      <Text
        accessibilityRole="header"
        style={[
          TYPE.display,
          talking ? { fontSize: 22, lineHeight: 28 } : { fontSize: 28, lineHeight: 34 },
          { textAlign: 'center' },
        ]}
      >
        {t('buddy:greeting', { name: h.learner.name })}
      </Text>
      {/* Personal when something is coming up: the next test; otherwise the open question.
          With a card on top that card is the personal line. */}
      {talking && top.length > 0 ? null : (
        <Text
          numberOfLines={talking ? 1 : undefined}
          style={[
            talking ? TYPE.body : TYPE.title,
            { color: LB.ink2, textAlign: 'center', fontWeight: '500' },
          ]}
        >
          {nextExam
            ? t('buddy:next.line', {
                title: nextExam.title,
                when: nextExam.date ? whenText(nextExam.date, nextExam.time) : '',
              })
            : t('buddy:greeting_ask')}
        </Text>
      )}
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: LB.bg }}>
      <Glow />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingTop: 8,
          }}
        >
          {/* Talking with Buddy hands-free (conversation mode). */}
          <CircleBtn
            icon="headphones"
            onPress={() => router.push('/talk')}
            accessibilityLabel={t('buddy:talk.open')}
          />
          <Text style={[TYPE.label, { color: LB.ink2, letterSpacing: 2 }]}>BUDDY</Text>
          <CircleBtn
            icon="more"
            onPress={() => setMenuOpen(true)}
            accessibilityLabel={t('buddy:menu.open')}
          />
        </View>

        {/* What matters now stays on top; it never scrolls away under the conversation. */}
        {top.length > 0 ? (
          <ScrollView
            testID="scroll-top"
            style={{ flexGrow: 0, flexShrink: 1, maxHeight: '50%' }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, gap: 12 }}
          >
            {top}
          </ScrollView>
        ) : null}

        {talking ? (
          <>
            <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
              {greeting}
              {/* The ring, small: starting stays one tap away. */}
              <StartRow items={orbitItems(h.next)} disabled={pending !== null} />
            </View>
            <ScrollView
              ref={scroll}
              testID="scroll-thread"
              style={{ flex: 1 }}
              contentContainerStyle={{
                flexGrow: 1,
                justifyContent: 'flex-end',
                paddingHorizontal: 16,
                paddingVertical: 12,
                gap: 10,
              }}
              keyboardShouldPersistTaps="handled"
              // A conversation: always at its newest message.
              onContentSizeChange={() => {
                scroll.current?.scrollToEnd({ animated: followEnd.current });
                followEnd.current = false;
              }}
              refreshControl={
                <RefreshControl
                  refreshing={home.isRefetching}
                  onRefresh={() => void home.refetch()}
                />
              }
            >
              {h.thread.length > VISIBLE_MESSAGES || h.thread_has_more ? (
                <Btn size="sm" variant="ghost" center onPress={() => router.push('/history')}>
                  {t('buddy:thread.load_more')}
                </Btn>
              ) : null}
              <Conversation
                contactOn={h.system.contact_enabled}
                messages={messages}
                pending={shownPending}
                live={live}
                busy={busy || pending !== null}
                showActions
                onUndo={(id) => void act(() => undoAction(id))}
                onOption={(messageId, option) => void send(option, newId(), messageId)}
                onResend={(m: MessageView) =>
                  void send(m.text, m.client_message_id ?? newId(), m.reply_to_id)
                }
              />
            </ScrollView>
          </>
        ) : (
          <ScrollView
            testID="scroll-home"
            style={{ flex: 1 }}
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: 'center',
              padding: 16,
              gap: 18,
            }}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={home.isRefetching}
                onRefresh={() => void home.refetch()}
              />
            }
          >
            {greeting}
            {/* The ring: Buddy in the middle, ways to start around it. */}
            <OrbitMenu
              items={orbitItems(h.next)}
              disabled={pending !== null}
              // Only Buddy in the middle: nothing that could run into the labels on a small phone.
              center={<BuddyOrb size={72} />}
            />
            {/* First visit: one sentence about Buddy; the ring above shows how to start. */}
            <Text
              style={[TYPE.body, { color: LB.ink2, textAlign: 'center', paddingHorizontal: 12 }]}
            >
              {t('buddy:intro.body')}
            </Text>
          </ScrollView>
        )}
        <Composer
          disabled={pending !== null}
          onSend={(text) => void send(text)}
          onPhoto={() => router.push('/capture')}
        />
      </KeyboardAvoidingView>

      <Sheet
        visible={menuOpen}
        title={t('buddy:menu.title')}
        closeLabel={t('common:actions.close')}
        onClose={() => setMenuOpen(false)}
      >
        {(
          [
            ['memory', '/memory'],
            ['library', '/library'],
            ['settings', '/settings'],
          ] as const
        ).map(([key, path]) => (
          <Btn
            key={key}
            variant="outline"
            full
            onPress={() => {
              setMenuOpen(false);
              router.push(path);
            }}
          >
            {t(`buddy:menu.${key}`)}
          </Btn>
        ))}
      </Sheet>

      <ChoiceSheet
        visible={choice !== null}
        title={t(choice === 'vocab' ? 'learn:vocab.title' : 'learn:homework.title')}
        body={t(choice === 'vocab' ? 'learn:vocab.body' : 'learn:homework.body')}
        onClose={() => setChoice(null)}
        choices={
          choice === 'vocab'
            ? [
                {
                  label: t('learn:vocab.photo'),
                  icon: 'camera',
                  onPress: () => fromChoice(() => router.push('/capture')),
                },
                {
                  label: t('learn:vocab.type'),
                  icon: 'keyboard',
                  onPress: () => fromChoice(() => setTopic('vocab')),
                },
              ]
            : [
                {
                  label: t('learn:homework.photo'),
                  icon: 'camera',
                  onPress: () =>
                    fromChoice(() =>
                      router.push({ pathname: '/capture', params: { purpose: 'homework' } }),
                    ),
                },
                {
                  label: t('learn:homework.type'),
                  icon: 'keyboard',
                  onPress: () => fromChoice(() => setTopic('help')),
                },
              ]
        }
      />
      <TopicSheet kind={topic} onClose={() => setTopic(null)} />
    </SafeAreaView>
  );
}
