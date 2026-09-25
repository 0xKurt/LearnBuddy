// The one screen: what matters now, the one open decision, what Buddy did,
// what comes next, and the conversation. docs/architecture.md §Home.
// Taps are direct API calls (no model); only free text goes to Buddy.

import type { BuddyHome, MessageView } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
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

import { Composer } from '../components/buddy/Composer.js';
import { Conversation } from '../components/buddy/Conversation.js';
import { DecisionCard } from '../components/buddy/DecisionCard.js';
import { DoneList } from '../components/buddy/DoneList.js';
import { NextList } from '../components/buddy/NextList.js';
import { NowCard } from '../components/buddy/NowCard.js';
import { WorkingNote } from '../components/buddy/WorkingNote.js';
import { ChoiceSheet } from '../components/learn/ChoiceSheet.js';
import { StartRow, type StartTile } from '../components/learn/StartRow.js';
import { TopicSheet } from '../components/learn/TopicSheet.js';
import type { TopicKind } from '../components/learn/useStartTopic.js';
import { Banner } from '../components/lb/Banner.js';
import { Btn } from '../components/lb/Btn.js';
import { Card } from '../components/lb/Card.js';
import { CircleBtn } from '../components/lb/CircleBtn.js';
import { EmptyState } from '../components/lb/EmptyState.js';
import { LoadingState } from '../components/lb/LoadingState.js';
import { Section } from '../components/lb/Section.js';
import { Sheet } from '../components/lb/Sheet.js';
import { toast } from '../components/lb/Toast.js';
import { requestAdmin } from '../lib/adminFlow.js';
import { ApiError, newId } from '../lib/api/client.js';
import {
  answerContactOptIn,
  reportOutcome,
  retryMaterial,
  sendMessage,
  skipStep,
  startStep,
  undoAction,
} from '../lib/api/endpoints.js';
import { keys, queryClient, setHome, useHome } from '../lib/api/queries.js';
import { messageFor, turnFailureText } from '../lib/errors.js';
import { registerDeviceForPush } from '../lib/push.js';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [topic, setTopic] = useState<TopicKind | null>(null);
  const [choice, setChoice] = useState<'homework' | 'vocab' | null>(null);
  const scroll = useRef<ScrollView>(null);
  // After sending, follow the conversation to its end once the new content has rendered.
  const followEnd = useRef(false);

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
    followEnd.current = true;
    try {
      const res = await sendMessage(text, clientMessageId, replyToId);
      setHome(res.home);
      if (res.status === 'failed') toast.show(turnFailureText(res.error_code), 'error');
    } catch (err) {
      toast.show(messageFor(err), 'error');
      // The message may have reached the server (then it shows as failed or processing).
      await refresh();
    } finally {
      setPending(null);
      followEnd.current = true;
    }
  }

  async function enableContact(asAdult: boolean) {
    if (asAdult && !(await requestAdmin())) return;
    await act(async () => {
      const next = await answerContactOptIn(true);
      // Ask for notification permission only now, when it has a purpose.
      await registerDeviceForPush().catch(() => false);
      return next;
    });
  }

  /** The same flows from the start row, the intro's starters and the choice sheets. */
  function pick(tile: StartTile): void {
    switch (tile) {
      case 'photo':
        router.push('/capture');
        return;
      case 'homework':
      case 'vocab':
        setChoice(tile);
        return;
      default:
        setTopic(tile);
    }
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
  const messages = h.thread.slice(-VISIBLE_MESSAGES);
  // Hide the optimistic bubble once the server has the message.
  const shownPending =
    pending && !h.thread.some((m) => m.client_message_id === pending.id)
      ? { text: pending.text }
      : null;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: LB.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          ref={scroll}
          contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 18 }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            if (!followEnd.current) return;
            followEnd.current = false;
            scroll.current?.scrollToEnd({ animated: true });
          }}
          refreshControl={
            <RefreshControl refreshing={home.isRefetching} onRefresh={() => void home.refetch()} />
          }
        >
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text accessibilityRole="header" style={TYPE.display}>
              {t('buddy:greeting', { name: h.learner.name })}
            </Text>
            <CircleBtn
              icon="more"
              onPress={() => setMenuOpen(true)}
              accessibilityLabel={t('buddy:menu.open')}
            />
          </View>

          {!h.system.model ? <Banner tone="warning">{t('buddy:system.no_model')}</Banner> : null}
          {h.system.scheduler === 'stale' ? (
            <Banner tone="warning">{t('buddy:system.scheduler_stale')}</Banner>
          ) : null}

          {h.now ? (
            <NowCard
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
          ) : null}

          {h.working ? <WorkingNote what={h.working} /> : null}

          {h.decision ? (
            <DecisionCard
              decision={h.decision}
              busy={busy}
              onOptIn={(enable) =>
                enable ? void enableContact(false) : void act(() => answerContactOptIn(false))
              }
              onAdultOptIn={() => void enableContact(true)}
              onOutcome={(goalId, outcome) => void act(() => reportOutcome(goalId, outcome))}
            />
          ) : null}

          <StartRow onPick={pick} />

          <DoneList actions={h.done} busy={busy} onUndo={(id) => void act(() => undoAction(id))} />
          <NextList items={h.next} />

          {messages.length === 0 && !shownPending ? (
            // First visit: say who Buddy is and offer ways to start, so nobody faces an empty chat.
            <Card tone="lavender" padding={20} radius={22}>
              <Text accessibilityRole="header" style={TYPE.title}>
                {t('buddy:intro.title')}
              </Text>
              <Text style={[TYPE.body, { marginTop: 6 }]}>{t('buddy:intro.body')}</Text>
              <Text style={[TYPE.small, { marginTop: 16, marginBottom: 10 }]}>
                {t('buddy:intro.start')}
              </Text>
              <View style={{ gap: 10 }}>
                <Btn
                  variant="outline"
                  full
                  wrap
                  disabled={pending !== null}
                  onPress={() => void send(t('buddy:intro.starter_exam'))}
                >
                  {t('buddy:intro.starter_exam')}
                </Btn>
                <Btn variant="outline" full wrap onPress={() => pick('practice')}>
                  {t('buddy:intro.starter_practice')}
                </Btn>
                <Btn variant="outline" full wrap onPress={() => pick('photo')}>
                  {t('buddy:intro.starter_photo')}
                </Btn>
              </View>
            </Card>
          ) : (
            <Section
              title={t('buddy:thread.title')}
              right={
                h.thread.length > VISIBLE_MESSAGES || h.thread_has_more ? (
                  <Btn size="sm" variant="ghost" onPress={() => router.push('/history')}>
                    {t('buddy:thread.show_all')}
                  </Btn>
                ) : undefined
              }
            >
              <Conversation
                messages={messages}
                pending={shownPending}
                busy={busy || pending !== null}
                onOption={(messageId, option) => void send(option, newId(), messageId)}
                onResend={(m: MessageView) =>
                  void send(m.text, m.client_message_id ?? newId(), m.reply_to_id)
                }
              />
            </Section>
          )}
        </ScrollView>
        <Composer disabled={pending !== null} onSend={(text) => void send(text)} />
      </KeyboardAvoidingView>

      <Sheet
        visible={menuOpen}
        title={t('buddy:menu.title')}
        closeLabel={t('common:actions.close')}
        onClose={() => setMenuOpen(false)}
      >
        {(
          [
            ['history', '/history'],
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
