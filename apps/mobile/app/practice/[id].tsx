// One practice session (docs/architecture.md §Practice): one question at a
// time, a short conversation with Buddy about it, the solution once it is
// closed, and a calm summary at the end. The server decides everything that
// matters (verdicts, which question is open, the summary); this screen shows
// it. "Beenden" finishes the session and goes back to Buddy.
//
// Modes: explain shows Buddy's explanation first (and keeps it one tap away);
// help (homework) never offers the solution – a solved task says she found it
// herself. Questions Buddy wrote (origin 'buddy') carry a small tag.

import type {
  AnswerResponse,
  SessionItemView,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '../../components/lb/Banner.js';
import { Btn } from '../../components/lb/Btn.js';
import { EmptyState } from '../../components/lb/EmptyState.js';
import { LoadingState } from '../../components/lb/LoadingState.js';
import { Screen } from '../../components/lb/Screen.js';
import { Sheet } from '../../components/lb/Sheet.js';
import { toast } from '../../components/lb/Toast.js';
import { AnswerComposer } from '../../components/practice/AnswerComposer.js';
import { BottomBar } from '../../components/practice/BottomBar.js';
import { ChoiceList } from '../../components/practice/ChoiceList.js';
import { ExplainCard, ExplainText } from '../../components/practice/ExplainCard.js';
import { ItemThread } from '../../components/practice/ItemThread.js';
import { ListenButton } from '../../components/practice/ListenButton.js';
import { ProgressRow, QuestionCard } from '../../components/practice/Question.js';
import { SessionSummary } from '../../components/practice/SessionSummary.js';
import { SelfSolvedCard, SolutionCard } from '../../components/practice/SolutionCard.js';
import {
  latestPronunciation,
  SpeakCard,
  SpeakPanel,
} from '../../components/practice/SpeakPanel.js';
import { ApiError, newId } from '../../lib/api/client.js';
import { answerItem, finishSession, revealItem } from '../../lib/api/endpoints.js';
import { keys, queryClient, usePracticeSession } from '../../lib/api/queries.js';
import { messageFor } from '../../lib/errors.js';
import { currentLocale } from '../../lib/i18n/index.js';
import { baseLanguage } from '../../lib/speech/voice.js';

type AnswerInput = { text: string } | { choice: number };

/** The last answer sent; until the server confirms it, retrying the same answer reuses its id. */
type SentAnswer = {
  clientTurnId: string;
  itemId: string;
  text: string | null;
  choice: number | null;
};

/** A language other than the app's: worth hearing read aloud (vocab prompts and answers). */
function foreign(lang: string | null): lang is string {
  const base = baseLanguage(lang);
  return base !== null && base !== currentLocale();
}

function backToBuddy(): void {
  // Pops back to Buddy when it is below in the stack, otherwise replaces this
  // screen with it (router.replace would leave a second Buddy on the stack).
  router.dismissTo('/buddy');
}

/** A 4xx won't get better by trying again. */
function retryable(err: unknown): boolean {
  return !(err instanceof ApiError && err.status >= 400 && err.status < 500);
}

/** The session changed elsewhere: the question is already closed, the session ended or is gone. */
function outdated(err: unknown): boolean {
  return err instanceof ApiError && (err.code === 'conflict' || err.code === 'not_found');
}

/**
 * The question on screen: the one the learner works on or has just closed
 * (it stays until "Weiter"), otherwise the first open one; none when nothing is left.
 */
function questionOnScreen(session: SessionView, pinnedId: string | null): SessionItemView | null {
  const pinned = pinnedId ? session.items.find((i) => i.item.id === pinnedId) : undefined;
  const id = pinned?.item.id ?? session.current_item_id;
  const shown = id ? session.items.find((i) => i.item.id === id) : undefined;
  // An open question of a session that has ended can't be answered any more.
  if (!shown || (shown.status === 'open' && session.status !== 'active')) return null;
  return shown;
}

export default function PracticeScreen() {
  const { t } = useTranslation(['practice', 'common']);
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? '';
  const query = usePracticeSession(id);
  const insets = useSafeAreaInsets();

  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [pending, setPending] = useState<{ itemId: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [finishFailed, setFinishFailed] = useState(false);
  const [closing, setClosing] = useState(false);
  /** Explain mode: the explanation was read ("Verstanden – frag mich!"). */
  const [introRead, setIntroRead] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const working = useRef(false);
  const lastSent = useRef<SentAnswer | null>(null);
  const finishStarted = useRef(false);
  const scroll = useRef<ScrollView>(null);

  const session = query.data;
  const nothingOpen =
    session?.status === 'active' && session.items.every((i) => i.status !== 'open');

  // Once no question is open, the session is finished – once, while the
  // learner may still be reading the last solution.
  useEffect(() => {
    if (!nothingOpen || finishStarted.current) return;
    finishStarted.current = true;
    void finish();
  }, [nothingOpen]);

  // Buddy's home shows this session (questions left, the result): refresh it on the way out.
  useEffect(
    () => () => {
      void queryClient.invalidateQueries({ queryKey: keys.home });
    },
    [],
  );

  async function store(next: SessionView): Promise<void> {
    // A refetch that started before this change must not overwrite it.
    await queryClient.cancelQueries({ queryKey: keys.session(id) });
    queryClient.setQueryData(keys.session(id), next);
  }

  async function finish(): Promise<void> {
    setFinishFailed(false);
    try {
      await store(await finishSession(id));
      void queryClient.invalidateQueries({ queryKey: keys.home });
    } catch (err) {
      toast.show(messageFor(err), 'error');
      setFinishFailed(true);
    }
  }

  async function close(): Promise<void> {
    if (closing) return;
    setClosing(true);
    try {
      // With nothing answered, the server keeps Buddy's step open.
      await finishSession(id);
    } catch (err) {
      // Leaving always works; the session then stays open and can be resumed from Buddy.
      toast.show(messageFor(err), 'error');
    }
    // Marked stale instead of written: this screen is leaving and shouldn't flash the result.
    void queryClient.invalidateQueries({ queryKey: keys.session(id), refetchType: 'none' });
    void queryClient.invalidateQueries({ queryKey: keys.home });
    backToBuddy();
  }

  async function answer(itemId: string, input: AnswerInput, shownText: string): Promise<void> {
    if (working.current) return;
    working.current = true;
    const answerText = 'text' in input ? input.text : null;
    const choice = 'choice' in input ? input.choice : null;
    const prev = lastSent.current;
    // Retrying the very same answer keeps its id, so the server records it only once.
    const clientTurnId =
      prev && prev.itemId === itemId && prev.text === answerText && prev.choice === choice
        ? prev.clientTurnId
        : newId();
    lastSent.current = { clientTurnId, itemId, text: answerText, choice };
    setPinnedId(itemId);
    setPending({ itemId, text: shownText });
    setBusy(true);
    try {
      const res = await answerItem(id, { client_turn_id: clientTurnId, item_id: itemId, ...input });
      lastSent.current = null;
      await store(res.session);
      if (answerText !== null) setText((current) => (current.trim() === answerText ? '' : current));
      if (res.session.items.find((i) => i.item.id === itemId)?.status !== 'open')
        Keyboard.dismiss();
      AccessibilityInfo.announceForAccessibility(res.reply.text);
    } catch (err) {
      // The typed answer stays in the field, so trying again is one tap.
      toast.show(messageFor(err), 'error');
      if (outdated(err)) {
        lastSent.current = null;
        void queryClient.invalidateQueries({ queryKey: keys.session(id) });
      }
    } finally {
      working.current = false;
      setPending(null);
      setBusy(false);
    }
  }

  /** Buddy listened to a recording (SpeakPanel sends it and retries it itself). */
  async function spoke(itemId: string, res: AnswerResponse): Promise<void> {
    setPinnedId(itemId);
    await store(res.session);
  }

  async function reveal(itemId: string): Promise<void> {
    if (working.current) return;
    working.current = true;
    setPinnedId(itemId);
    setBusy(true);
    try {
      await store(await revealItem(id, itemId));
      lastSent.current = null;
      setText('');
      Keyboard.dismiss();
    } catch (err) {
      toast.show(messageFor(err), 'error');
      if (outdated(err)) void queryClient.invalidateQueries({ queryKey: keys.session(id) });
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  function next(): void {
    setPinnedId(null);
    setText('');
    lastSent.current = null;
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  // ─────────────── loading / not loadable ───────────────

  if (!session) {
    if (query.isError) {
      const canRetry = retryable(query.error);
      return (
        <Screen>
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <EmptyState
              title={messageFor(query.error)}
              action={
                <View style={{ gap: 10, alignItems: 'center' }}>
                  {canRetry ? (
                    <Btn center onPress={() => void query.refetch()}>
                      {t('common:actions.retry')}
                    </Btn>
                  ) : null}
                  <Btn variant={canRetry ? 'ghost' : 'primary'} center onPress={backToBuddy}>
                    {t('practice:back_to_buddy')}
                  </Btn>
                </View>
              }
            />
          </View>
        </Screen>
      );
    }
    return (
      <Screen>
        <LoadingState label={t('practice:loading')} />
      </Screen>
    );
  }

  const title = session.title.trim() || t('practice:title_fallback');
  const shown = questionOnScreen(session, pinnedId);

  // ─────────────── nothing left to answer ───────────────

  if (!shown) {
    if (session.status === 'finished' && session.summary) {
      return (
        <Screen title={title}>
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            <SessionSummary summary={session.summary} homework={session.mode === 'help'} />
          </ScrollView>
          <BottomBar>
            <Btn size="lg" full onPress={backToBuddy}>
              {t('practice:back_to_buddy')}
            </Btn>
          </BottomBar>
        </Screen>
      );
    }
    const active = session.status === 'active';
    if (active && !finishFailed) {
      return (
        <Screen title={title}>
          <LoadingState label={t('practice:finishing')} />
        </Screen>
      );
    }
    // Finishing failed (retry), or the session ended without a result (abandoned).
    return (
      <Screen title={title}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            title={active ? t('practice:finish_failed') : t('practice:ended')}
            action={
              <View style={{ gap: 10, alignItems: 'center' }}>
                {active ? (
                  <Btn center onPress={() => void finish()}>
                    {t('common:actions.retry')}
                  </Btn>
                ) : null}
                <Btn variant={active ? 'ghost' : 'primary'} center onPress={backToBuddy}>
                  {t('practice:back_to_buddy')}
                </Btn>
              </View>
            }
          />
        </View>
      </Screen>
    );
  }

  const intro = session.mode === 'explain' ? (session.intro?.trim() ?? '') : '';
  const canReveal = session.reveal_allowed;
  const endButton = (
    // Stays while a question is on screen, also once the session was finished in the
    // background (finishing again is a no-op) – the header must not jump under the reader.
    <Btn
      variant="ghost"
      onPress={() => void close()}
      disabled={closing}
      accessibilityLabel={t('practice:end_label')}
      accessibilityHint={t('practice:end_hint')}
    >
      {t('practice:end')}
    </Btn>
  );

  // ─────────────── explain: the explanation first ───────────────

  const started = session.items.some((i) => i.status !== 'open') || session.turns.length > 0;
  if (intro && !introRead && !started) {
    return (
      <Screen title={title} right={endButton}>
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <ExplainCard text={intro} />
        </ScrollView>
        <BottomBar>
          <Btn size="lg" full onPress={() => setIntroRead(true)}>
            {t('practice:explain.ready')}
          </Btn>
        </BottomBar>
      </Screen>
    );
  }

  // ─────────────── one question ───────────────

  const item = shown.item;
  const open = shown.status === 'open';
  const locked = busy || closing;
  const turns = session.turns.filter((turn) => turn.item_id === item.id);
  const pendingText = pending?.itemId === item.id ? pending.text : null;
  const choices =
    item.kind === 'multiple_choice' && item.choices && item.choices.length > 0
      ? item.choices
      : null;
  const speaking = item.kind === 'speak';
  const typed = open && choices === null && !speaking;
  const tried = new Set(
    turns
      .filter((turn) => turn.role === 'learner' && turn.verdict === 'incorrect')
      .map((turn) => turn.text),
  );
  // Once there is a conversation (or the solution), keep its newest part in view.
  const followEnd = turns.length > 0 || pendingText !== null || !open;

  function check(): void {
    const value = text.trim();
    if (value) void answer(item.id, { text: value }, value);
  }

  return (
    <Screen title={title} right={endButton}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: 16,
            gap: 16,
            paddingBottom: open && !typed && !speaking ? insets.bottom + 24 : 16,
          }}
          onContentSizeChange={() => {
            if (followEnd) scroll.current?.scrollToEnd({ animated: true });
          }}
          onLayout={() => {
            // The keyboard shrinks this view; keep the latest reply visible above it.
            if (followEnd) scroll.current?.scrollToEnd({ animated: false });
          }}
        >
          {session.mode === 'help' ? <Banner tone="info">{t('practice:help_note')}</Banner> : null}
          {intro ? (
            <Btn size="sm" variant="ghost" onPress={() => setIntroOpen(true)}>
              {t('practice:explain.again')}
            </Btn>
          ) : null}
          <ProgressRow
            position={session.items.indexOf(shown) + 1}
            total={session.items.length}
            closed={session.items.filter((i) => i.status !== 'open').length}
          />
          {speaking ? (
            <SpeakCard item={item} turns={turns} />
          ) : (
            <QuestionCard
              prompt={item.prompt}
              topic={item.topic}
              figure={item.figure}
              fromBuddy={item.origin === 'buddy'}
            />
          )}
          {item.kind === 'vocab' && foreign(item.prompt_lang) ? (
            <ListenButton text={item.prompt} lang={item.prompt_lang} />
          ) : null}
          <ItemThread turns={turns} pending={pendingText} />
          {open && choices ? (
            <ChoiceList
              choices={choices}
              tried={tried}
              disabled={locked}
              onChoose={(index, choice) => void answer(item.id, { choice: index }, choice)}
              onReveal={canReveal ? () => void reveal(item.id) : undefined}
            />
          ) : null}
          {shown.status === 'correct' && shown.answer === null ? <SelfSolvedCard /> : null}
          {shown.status !== 'open' && shown.answer !== null ? (
            <SolutionCard
              status={shown.status}
              answer={shown.answer}
              numeric={item.kind === 'numeric'}
            />
          ) : null}
          {item.kind === 'vocab' && !open && shown.answer !== null && foreign(item.lang) ? (
            <ListenButton text={shown.answer} lang={item.lang} />
          ) : null}
        </ScrollView>
        {typed ? (
          <AnswerComposer
            kind={item.kind}
            prompt={item.prompt}
            unit={item.unit}
            value={text}
            disabled={locked}
            onChange={setText}
            onCheck={check}
            onReveal={canReveal ? () => void reveal(item.id) : undefined}
          />
        ) : null}
        {open && speaking ? (
          <SpeakPanel
            item={item}
            sessionId={id}
            hasFeedback={latestPronunciation(turns) !== null}
            disabled={locked}
            onResult={(res) => spoke(item.id, res)}
            onOutdated={() => void queryClient.invalidateQueries({ queryKey: keys.session(id) })}
            onSkip={canReveal ? () => void reveal(item.id) : undefined}
          />
        ) : null}
        {open ? null : (
          <BottomBar>
            <Btn size="lg" full onPress={next}>
              {t('practice:next')}
            </Btn>
          </BottomBar>
        )}
      </KeyboardAvoidingView>
      {intro ? (
        <Sheet
          visible={introOpen}
          title={t('practice:explain.sheet_title')}
          closeLabel={t('common:actions.close')}
          onClose={() => setIntroOpen(false)}
        >
          <ExplainText text={intro} />
        </Sheet>
      ) : null}
    </Screen>
  );
}
