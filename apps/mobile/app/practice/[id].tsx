// One practice session (docs/architecture.md §Practice): one question at a
// time, a short conversation with Buddy about it, the solution once it is
// closed, and a calm summary at the end. The server decides everything that
// matters (verdicts, which question is open, the summary); this screen shows
// it. "Beenden" finishes the session and goes back to Buddy.
//
// Modes: explain shows Buddy's explanation first (and keeps it one tap away);
// help (homework) never offers the solution – a solved task says she found it
// herself. Questions Buddy wrote (origin 'buddy') carry a small tag.
// "Frage passt nicht" (a quiet button, then a confirm sheet) takes a question
// from a photo or from Buddy out for good — not for homework, not in a test.
//
// Voice mode ("Sprachmodus", the headphones switch in the header): each new
// question is read aloud (choices as "A: …, B: …", a vocab prompt in its own
// language), and so is Buddy's reply with the verdict word after every answer.
// The mic is the main control; reading stops when she starts speaking or
// leaves. The microphone itself only ever starts with her tap.

import type {
  AnswerResponse,
  ItemView,
  PracticeTurnView,
  SessionItemView,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { TFunction } from 'i18next';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Btn } from '../../components/lb/Btn.js';
import { EmptyState } from '../../components/lb/EmptyState.js';
import { LoadingState } from '../../components/lb/LoadingState.js';
import { Screen } from '../../components/lb/Screen.js';
import { Sheet } from '../../components/lb/Sheet.js';
import { toast } from '../../components/lb/Toast.js';
import { useSpokenWords } from '../../components/math/useSpokenMath.js';
import { AnswerComposer } from '../../components/practice/AnswerComposer.js';
import { BottomBar } from '../../components/practice/BottomBar.js';
import { ChoiceList, SpokenChoiceBar } from '../../components/practice/ChoiceList.js';
import { ExplainCard, ExplainText } from '../../components/practice/ExplainCard.js';
import { ItemThread } from '../../components/practice/ItemThread.js';
import { ListenButton } from '../../components/practice/ListenButton.js';
import { ProgressRow, QuestionCard } from '../../components/practice/Question.js';
import { AgainButton } from '../../components/practice/AgainButton.js';
import { SessionSummary } from '../../components/practice/SessionSummary.js';
import { SelfSolvedCard, SolutionCard } from '../../components/practice/SolutionCard.js';
import {
  latestPronunciation,
  SpeakCard,
  SpeakPanel,
} from '../../components/practice/SpeakPanel.js';
import { VoiceModeToggle } from '../../components/voice/VoiceModeToggle.js';
import { ApiError, newId } from '../../lib/api/client.js';
import {
  answerItem,
  finishSession,
  flagItem,
  hintItem,
  revealItem,
} from '../../lib/api/endpoints.js';
import { keys, queryClient, usePracticeSession } from '../../lib/api/queries.js';
import { messageFor } from '../../lib/errors.js';
import { currentLocale } from '../../lib/i18n/index.js';
import type { SpokenWords } from '../../lib/math/speak.js';
import { speakInOrder, stop as stopListening, type SpokenPart } from '../../lib/speech/listen.js';
import { feedbackReadText, questionReadText, spokenText } from '../../lib/speech/spoken.js';
import { baseLanguage } from '../../lib/speech/voice.js';
import { afterFeedback, useHandsFree } from '../../lib/speech/handsFree.js';
import { useVoiceMode } from '../../lib/speech/voiceMode.js';
import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';

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

/** What voice mode reads when a question appears (never the topic). */
function questionParts(item: ItemView, words: SpokenWords, t: TFunction): SpokenPart[] {
  const app = currentLocale();
  switch (item.kind) {
    case 'speak':
      return [
        { text: t('practice:speak.instruction'), lang: app },
        { text: item.prompt, lang: item.lang ?? item.prompt_lang ?? app },
      ];
    case 'vocab':
      return [{ text: spokenText(item.prompt, words), lang: item.prompt_lang ?? app }];
    default:
      return [
        {
          text: questionReadText(
            item.prompt,
            item.kind === 'multiple_choice' ? item.choices : null,
            words,
          ),
          lang: app,
        },
      ];
  }
}

/** The verdict word read before Buddy's reply (as ItemThread shows it); none for "not an attempt". */
function verdictWordKey(verdict: PracticeTurnView['verdict']): string | null {
  if (verdict === 'not_an_attempt') return null;
  return `practice:verdict.${verdict ?? 'unchecked'}`;
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
  const { height: windowHeight } = useWindowDimensions();

  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [pending, setPending] = useState<{ itemId: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [finishFailed, setFinishFailed] = useState(false);
  const [closing, setClosing] = useState(false);
  /** Explain mode: the explanation was read ("Verstanden – frag mich!"). */
  const [introRead, setIntroRead] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  /** "Frage passt nicht": the confirm sheet, and the question it is about. */
  const [flagFor, setFlagFor] = useState<string | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const working = useRef(false);
  const lastSent = useRef<SentAnswer | null>(null);
  const finishStarted = useRef(false);
  const scroll = useRef<ScrollView>(null);

  const session = query.data;
  const voiceOn = useVoiceMode((s) => s.on);
  const words = useSpokenWords();

  // Voice mode: a question is read aloud once when it appears (or when voice mode is switched on).
  const onScreen = session ? questionOnScreen(session, pinnedId) : null;
  const introWaiting =
    session !== undefined &&
    session.mode === 'explain' &&
    (session.intro?.trim() ?? '') !== '' &&
    !introRead &&
    !(session.items.some((i) => i.status !== 'open') || session.turns.length > 0);
  const toRead = onScreen && onScreen.status === 'open' && !introWaiting ? onScreen.item : null;
  // Hands-free (lib/speech/handsFree.ts): once she started a mic here herself, reading
  // to the end lets the mic listen again, and a closed question moves on by itself.
  const readQuestion = (item: ItemView) =>
    speakInOrder(questionParts(item, words, t), (why) => {
      if (why === 'done') useHandsFree.getState().listenNow();
    });
  // Voice mode: the explanation is read aloud first (then "Verstanden – frag mich!").
  const introText = introWaiting ? (session?.intro?.trim() ?? '') : '';
  useEffect(() => {
    if (voiceOn && introText)
      speakInOrder([{ text: spokenText(introText, words), lang: currentLocale() }]);
  }, [voiceOn, introText]);
  useEffect(() => {
    if (voiceOn && toRead) readQuestion(toRead);
    // Only a new question (or switching voice mode on) reads again; "Nochmal vorlesen" repeats it.
  }, [voiceOn, toRead?.id]);

  // Leaving the screen ends whatever is being read, and the hands-free loop.
  useFocusEffect(
    useCallback(() => {
      useHandsFree.getState().disarm();
      return () => {
        useHandsFree.getState().disarm();
        stopListening();
      };
    }, []),
  );
  useEffect(() => {
    if (!voiceOn) useHandsFree.getState().disarm();
  }, [voiceOn]);

  /** Voice mode: Buddy's reaction after an answer, with the verdict word first. */
  function readFeedback(res: AnswerResponse, itemId: string): void {
    if (!useVoiceMode.getState().on) return;
    // A running test says no verdict (the result comes at the end).
    const testing = res.session.mode === 'test' && res.session.status === 'active';
    const key = testing ? null : verdictWordKey(res.verdict);
    const text = feedbackReadText(key ? t(key) : null, res.reply.text, words);
    speakInOrder([{ text, lang: currentLocale() }], (why) => {
      if (why !== 'done') return;
      const hands = useHandsFree.getState();
      const then = afterFeedback(res.session.items, itemId, hands.armed);
      if (then === 'listen') hands.listenNow();
      // Closed: on to the next open question, which is read and then listened for.
      if (then === 'next') setTimeout(() => nextRef.current(), 400);
    });
  }

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
      if (useVoiceMode.getState().on) readFeedback(res, itemId);
      else AccessibilityInfo.announceForAccessibility(res.reply.text);
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
    readFeedback(res, itemId);
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

  /** "Tipp": the next prepared hint, at once. */
  async function askHint(itemId: string): Promise<void> {
    if (working.current) return;
    working.current = true;
    setPinnedId(itemId);
    setBusy(true);
    try {
      const res = await hintItem(id, itemId);
      await store(res.session);
      if (useVoiceMode.getState().on) readFeedback(res, itemId);
    } catch (err) {
      toast.show(messageFor(err), 'error');
      if (outdated(err)) void queryClient.invalidateQueries({ queryKey: keys.session(id) });
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  /** "Frage passt nicht" confirmed: out of this session and out of future practice. */
  async function flag(): Promise<void> {
    const itemId = flagFor;
    if (!itemId || working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await store(await flagItem(id, itemId));
      setFlagOpen(false);
      // On to the next open question (or the result, when none is left).
      setPinnedId(null);
      setText('');
      lastSent.current = null;
      Keyboard.dismiss();
      toast.show(t('practice:flag.done'));
    } catch (err) {
      setFlagOpen(false);
      toast.show(messageFor(err), 'error');
      if (outdated(err)) void queryClient.invalidateQueries({ queryKey: keys.session(id) });
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  const nextRef = useRef(() => undefined as void);
  nextRef.current = () => next();
  function next(): void {
    setPinnedId(null);
    setText('');
    lastSent.current = null;
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
            testID="scroll-list"
            contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            <SessionSummary
              summary={session.summary}
              homework={session.mode === 'help'}
              review={session.mode === 'test' ? session.items : null}
            />
          </ScrollView>
          <BottomBar>
            <View style={{ gap: 10 }}>
              {session.mode !== 'help' && session.summary.shaky_topics.length > 0 ? (
                <AgainButton title={session.title} topics={session.summary.shaky_topics} />
              ) : session.mode !== 'help' && session.summary.secure_topics.length > 0 ? (
                <AgainButton
                  kind="harder"
                  title={session.title}
                  topics={session.summary.secure_topics}
                />
              ) : null}
              <Btn size="lg" pill full onPress={backToBuddy}>
                {t('practice:back_to_buddy')}
              </Btn>
            </View>
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
  // A running test: no verdicts, no solutions, but a question can be skipped.
  const testing = session.mode === 'test' && session.status === 'active';
  const skip = canReveal || testing ? () => void reveal(shown.item.id) : undefined;
  const skipLabel = testing ? t('practice:skip') : undefined;
  const hint = shown.hint_available ? () => void askHint(shown.item.id) : undefined;
  const endButton = (
    // Stays while a question is on screen, also once the session was finished in the
    // background (finishing again is a no-op) – the header must not jump under the reader.
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <VoiceModeToggle />
      <Btn
        variant="outline"
        size="sm"
        pill
        onPress={() => void close()}
        disabled={closing}
        accessibilityLabel={t('practice:end_label')}
        accessibilityHint={t('practice:end_hint')}
      >
        {t('practice:end')}
      </Btn>
    </View>
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
          <Btn size="lg" pill full onPress={() => setIntroRead(true)}>
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
  // Only a question from a photo or from Buddy; never homework, never during a test.
  const flaggable =
    open &&
    session.status === 'active' &&
    session.mode !== 'help' &&
    !testing &&
    (item.origin === 'material' || item.origin === 'buddy');

  function check(value: string): void {
    if (value) void answer(item.id, { text: value }, value);
  }

  // A small row of quiet tools under the question (never a second headline).
  const tools = [
    intro ? (
      <Btn key="intro" size="sm" variant="soft" pill icon="book" onPress={() => setIntroOpen(true)}>
        {t('practice:explain.again')}
      </Btn>
    ) : null,
    // With options the voice bar carries it (SpokenChoiceBar).
    voiceOn && open && !choices ? (
      <Btn key="read" size="sm" variant="soft" pill icon="speak" onPress={() => readQuestion(item)}>
        {t('common:voice.read_again')}
      </Btn>
    ) : null,
    item.kind === 'vocab' && foreign(item.prompt_lang) ? (
      <ListenButton key="listen" text={item.prompt} lang={item.prompt_lang} />
    ) : null,
  ].filter((node) => node !== null);

  const flagButton = flaggable ? (
    <Btn
      size="sm"
      variant="ghost"
      pill
      disabled={locked}
      onPress={() => {
        setFlagFor(item.id);
        setFlagOpen(true);
      }}
      accessibilityHint={t('practice:flag.hint')}
    >
      {t('practice:flag.button')}
    </Btn>
  ) : null;

  // No scrolling to find what matters (CLAUDE.md rule 16): the question stays on top,
  // the way to answer stays at the bottom, and only the conversation between them
  // grows — like a chat, newest at the bottom.
  return (
    <Screen title={title} right={endButton}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          testID="scroll-question"
          style={{ flexGrow: 0, flexShrink: 1, maxHeight: '60%' }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, gap: 10 }}
        >
          <ProgressRow
            position={session.items.indexOf(shown) + 1}
            total={session.items.length}
            closed={session.items.filter((i) => i.status !== 'open').length}
            right={flagButton}
          />
          {session.mode === 'help' || testing ? (
            <Text style={[TYPE.small, { color: LB.primaryDk, fontWeight: '500' }]}>
              {t(testing ? 'practice:test_note' : 'practice:help_note')}
            </Text>
          ) : null}
          {speaking ? (
            <SpeakCard item={item} turns={turns} />
          ) : (
            <QuestionCard
              prompt={item.prompt}
              topic={item.topic}
              figure={item.figure}
              figureMaxHeight={Math.round(windowHeight * 0.14)}
              fromBuddy={item.origin === 'buddy'}
              // Her short answer appears in the gap of a fill-in sentence while she types.
              answer={typed && (item.kind === 'short' || item.kind === 'vocab') ? text : undefined}
            />
          )}
          {tools.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{tools}</View>
          ) : null}
        </ScrollView>
        <ScrollView
          ref={scroll}
          testID="scroll-thread"
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'flex-end',
            paddingHorizontal: 16,
            paddingVertical: 12,
            gap: 12,
          }}
          onContentSizeChange={() => {
            if (followEnd) scroll.current?.scrollToEnd({ animated: true });
          }}
          onLayout={() => {
            // The keyboard shrinks this view; keep the latest reply visible above it.
            if (followEnd) scroll.current?.scrollToEnd({ animated: false });
          }}
        >
          <ItemThread turns={turns} pending={pendingText} hideVerdicts={testing} />
          {session.mode === 'help' && shown.status === 'correct' ? <SelfSolvedCard /> : null}
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
        {open && choices ? (
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 8,
              paddingBottom: voiceOn ? 0 : Math.max(insets.bottom, 12),
            }}
          >
            <ChoiceList
              choices={choices}
              tried={tried}
              disabled={locked}
              onChoose={(index, choice) => void answer(item.id, { choice: index }, choice)}
              onReveal={skip}
              revealLabel={skipLabel}
              onHint={hint}
            />
          </View>
        ) : null}
        {typed ? (
          <AnswerComposer
            kind={item.kind}
            prompt={item.prompt}
            unit={item.unit}
            lang={item.kind === 'vocab' ? item.lang : null}
            value={text}
            disabled={locked}
            onChange={setText}
            onCheck={check}
            onReveal={skip}
            revealLabel={skipLabel}
            onHint={hint}
          />
        ) : null}
        {open && choices && voiceOn ? (
          <SpokenChoiceBar
            prompt={item.prompt}
            disabled={locked}
            onText={(said) => void answer(item.id, { text: said }, said)}
            onReadAgain={() => readQuestion(item)}
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
            <Btn size="lg" pill full onPress={next}>
              {t('practice:next')}
            </Btn>
          </BottomBar>
        )}
      </KeyboardAvoidingView>
      <Sheet
        visible={flagOpen}
        title={t('practice:flag.sheet_title')}
        closeLabel={t('common:actions.cancel')}
        onClose={() => setFlagOpen(false)}
      >
        <Text style={TYPE.body}>{t('practice:flag.sheet_body')}</Text>
        <Btn full disabled={busy} onPress={() => void flag()}>
          {t('practice:flag.confirm')}
        </Btn>
      </Sheet>
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
