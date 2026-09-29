// One practice session (docs/architecture.md §Practice): one question at a
// time, a short conversation with Buddy about it, the solution once it is
// closed, and a calm summary at the end. The server decides everything that
// matters (verdicts, which question is open, the summary); this screen shows
// it. The server finishes a session when its last question closes. "Beenden" with questions
// still open goes back to Buddy and keeps the session to go on with (home card, the sheet);
// in a test it hands the test in and shows the review (decision D-5, audit H-8, M-36).
//
// Modes: help (homework) never offers the solution – a solved task says she found it
// herself; "Tipp" asks for a hint and "Später" sets a task aside (it stays open and comes
// back after the others). "Lösung zeigen" appears only after a try or a hint.
// Questions Buddy wrote (origin 'buddy') carry a small tag.
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
  ReexplainWay,
  SessionItemView,
  SessionView,
  SpeakStreamEvent,
} from '@learnbuddy/shared-types/contracts';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { TFunction } from 'i18next';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Btn } from '../../components/lb/Btn.js';
import { EmptyState } from '../../components/lb/EmptyState.js';
import { Appear, Rise, SlideIn } from '../../components/lb/Motion.js';
import { LoadingState } from '../../components/lb/LoadingState.js';
import { PracticeSkeleton } from '../../components/lb/Skeletons.js';
import { Screen } from '../../components/lb/Screen.js';
import { Sheet } from '../../components/lb/Sheet.js';
import { toast } from '../../components/lb/Toast.js';
import { useSpokenWords } from '../../components/math/useSpokenMath.js';
import { AnswerComposer } from '../../components/practice/AnswerComposer.js';
import { BottomBar } from '../../components/practice/BottomBar.js';
import { ChoiceList, SpokenChoiceBar } from '../../components/practice/ChoiceList.js';
import { HelpChips } from '../../components/practice/HelpChips.js';
import { ItemThread } from '../../components/practice/ItemThread.js';
import { ListenButton } from '../../components/practice/ListenButton.js';
import { EDGE_FADE, TopEdgeFade, topEdgeMask } from '../../components/lb/EdgeFade.js';
import { ProgressRow, QuestionCard } from '../../components/practice/Question.js';
import { Reexplain } from '../../components/practice/Reexplain.js';
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
  deferItem,
  finishSession,
  flagItem,
  hintItem,
  reexplainItem,
  revealItem,
} from '../../lib/api/endpoints.js';
import { keys, queryClient, usePracticeSession } from '../../lib/api/queries.js';
import { useDraft } from '../../lib/drafts.js';
import { messageFor } from '../../lib/errors.js';
import { currentLocale } from '../../lib/i18n/index.js';
import { announce } from '../../lib/announce.js';
import { haptic } from '../../lib/haptics.js';
import type { SpokenWords } from '../../lib/math/speak.js';
import { speakInOrder, stop as stopListening, type SpokenPart } from '../../lib/speech/listen.js';
import { feedbackReadText, questionReadText, spokenText } from '../../lib/speech/spoken.js';
import { baseLanguage } from '../../lib/speech/voice.js';
import { afterFeedback, useHandsFree } from '../../lib/speech/handsFree.js';
import { useVoiceMode } from '../../lib/speech/voiceMode.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { KeyboardSafe } from '../../components/lb/KeyboardSafe.js';
import { reacted } from '../../lib/perf.js';

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
          // The sheet's language (a German biology sheet stays German on an English phone).
          lang: item.prompt_lang ?? app,
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
  const { palette } = useTheme();
  const { t } = useTranslation(['practice', 'common']);
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? '';
  const query = usePracticeSession(id);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const [pinnedId, setPinnedId] = useState<string | null>(null);
  // Kept on the device: a half-typed answer survives Android killing the app.
  const { text, setText } = useDraft(`session.${id}`);
  const [pending, setPending] = useState<{ itemId: string; text: string } | null>(null);
  /** The pronunciation judgement while the model is still listening (issue #8). */
  const [speakLive, setSpeakLive] = useState<SpeakStreamEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [finishFailed, setFinishFailed] = useState(false);
  const [closing, setClosing] = useState(false);
  /** "Frage passt nicht": the confirm sheet, and the question it is about. */
  const [flagFor, setFlagFor] = useState<string | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  /** "Anders erklären": the way she tapped, while Buddy writes. */
  const [again, setAgain] = useState<{ itemId: string; way: ReexplainWay } | null>(null);
  // Measured, so free space goes to the question instead of an empty conversation
  // (issue #96): the middle of the screen, what the conversation's content really
  // needs, and what stands around the question card (progress row, tools).
  const [middleHeight, setMiddleHeight] = useState(0);
  const [threadNeed, setThreadNeed] = useState(0);
  const [questionContentHeight, setQuestionContentHeight] = useState(0);
  const [cardHeight, setCardHeight] = useState(0);
  const working = useRef(false);
  const lastSent = useRef<SentAnswer | null>(null);
  const finishStarted = useRef(false);
  const scroll = useRef<ScrollView>(null);

  const session = query.data;
  // The session ran here while the screen was open: its end is a moment (SessionSummary).
  const sawActive = useRef(false);
  if (session?.status === 'active') sawActive.current = true;
  const voiceOn = useVoiceMode((s) => s.on);
  const words = useSpokenWords();

  // Voice mode: a question is read aloud once when it appears (or when voice mode is switched on).
  const onScreen = session ? questionOnScreen(session, pinnedId) : null;
  const toRead = onScreen && onScreen.status === 'open' ? onScreen.item : null;
  // Hands-free (lib/speech/handsFree.ts): once she started a mic here herself, reading
  // to the end lets the mic listen again, and a closed question moves on by itself.
  const readQuestion = (item: ItemView) =>
    speakInOrder(questionParts(item, words, t), (why) => {
      if (why === 'done') useHandsFree.getState().listenNow();
    });
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

  /** Buddy's reaction after an answer or a hint, with the verdict word first and math in words. */
  function feedbackText(res: AnswerResponse): string {
    // A running test says no verdict (the result comes at the end).
    const testing = res.session.mode === 'test' && res.session.status === 'active';
    const key = testing ? null : verdictWordKey(res.verdict);
    return feedbackReadText(key ? t(key) : null, res.reply.text, words);
  }

  /** A right answer feels like one; "not yet" is a soft nudge (never in a running test). */
  function feel(res: AnswerResponse): void {
    if (res.session.mode === 'test' && res.session.status === 'active') return;
    if (res.verdict === 'correct') haptic.success();
    else if (res.verdict === 'partially_correct' || res.verdict === 'incorrect') haptic.soft();
  }

  /**
   * Voice mode reads the feedback aloud; otherwise a screen reader hears the same words —
   * the verdict too, never raw LaTeX (audit M-82).
   */
  function readFeedback(res: AnswerResponse, itemId: string): void {
    feel(res);
    const text = feedbackText(res);
    if (!useVoiceMode.getState().on) {
      announce(text);
      return;
    }
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
    if (session?.mode === 'test' && session.status === 'active') {
      // A test is handed in: the review comes right here, questions she never got to marked
      // as such, with every solution (audit M-36).
      try {
        await store(await finishSession(id));
        setPinnedId(null);
        void queryClient.invalidateQueries({ queryKey: keys.home });
      } catch (err) {
        toast.show(messageFor(err), 'error');
      } finally {
        setClosing(false);
      }
      return;
    }
    // Anything else is a pause: open questions stay where they are, the answers are stored,
    // and Buddy's home (and the sheet) lead back here (decision D-5, audit H-8). The server
    // finished the session already if nothing is open.
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
    haptic.tap();
    setPinnedId(itemId);
    setPending({ itemId, text: shownText });
    setBusy(true);
    try {
      const res = await answerItem(id, { client_turn_id: clientTurnId, item_id: itemId, ...input });
      lastSent.current = null;
      await store(res.session);
      // Tap on "Prüfen" → the verdict on screen (issue #66).
      reacted('check');
      if (answerText !== null) setText((current) => (current.trim() === answerText ? '' : current));
      if (res.session.items.find((i) => i.item.id === itemId)?.status !== 'open')
        Keyboard.dismiss();
      readFeedback(res, itemId);
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
      const revealed = await revealItem(id, itemId);
      await store(revealed);
      // "Lösung zeigen": the solution is said too, math in words (audit M-82).
      const answer = revealed.items.find((i) => i.item.id === itemId)?.answer;
      if (answer) announce(`${t('practice:solution.title')}: ${spokenText(answer, words)}`);
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
    haptic.tap();
    setPinnedId(itemId);
    setBusy(true);
    try {
      const res = await hintItem(id, itemId);
      await store(res.session);
      readFeedback(res, itemId);
    } catch (err) {
      toast.show(messageFor(err), 'error');
      if (outdated(err)) void queryClient.invalidateQueries({ queryKey: keys.session(id) });
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  /** "Anders erklären": a new explanation of a shown solution. */
  async function explainAgain(itemId: string, way: ReexplainWay): Promise<void> {
    if (working.current) return;
    working.current = true;
    haptic.tap();
    setAgain({ itemId, way });
    setBusy(true);
    try {
      const res = await reexplainItem(id, itemId, way);
      await store(res.session);
      // Heard like every reply of Buddy's: read aloud in voice mode, else told to a screen reader.
      const said = spokenText(res.reply.text, words);
      if (useVoiceMode.getState().on) speakInOrder([{ text: said, lang: currentLocale() }]);
      else announce(said);
    } catch (err) {
      toast.show(messageFor(err), 'error');
      if (outdated(err)) void queryClient.invalidateQueries({ queryKey: keys.session(id) });
    } finally {
      working.current = false;
      setAgain(null);
      setBusy(false);
    }
  }

  /** Homework help "Später": the task stays open and comes back after the others. */
  async function later(itemId: string): Promise<void> {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await store(await deferItem(id, itemId));
      setPinnedId(null);
      setText('');
      lastSent.current = null;
      Keyboard.dismiss();
      announce(t('practice:later_done'));
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
        <PracticeSkeleton label={t('practice:loading')} />
      </Screen>
    );
  }

  const title = session.title.trim() || t('practice:title_fallback');
  const shown = questionOnScreen(session, pinnedId);

  // ─────────────── nothing left to answer ───────────────

  if (!shown) {
    if (session.status === 'finished' && session.summary) {
      // What more practice would be about: what did not sit, else what did, else the
      // topics of the questions she just worked on.
      const summary = session.summary;
      const againTopics =
        summary.shaky_topics.length > 0
          ? summary.shaky_topics
          : summary.secure_topics.length > 0
            ? summary.secure_topics
            : [
                ...new Set(
                  session.items
                    .map((i) => i.item.topic?.trim())
                    .filter((t): t is string => t !== undefined && t.length > 0),
                ),
              ];
      return (
        <Screen title={title}>
          <ScrollView
            testID="scroll-list"
            contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            <SessionSummary
              celebrate={sawActive.current}
              summary={session.summary}
              mode={session.mode}
              review={session.mode === 'test' ? session.items : null}
            />
          </ScrollView>
          <BottomBar>
            <Appear delay={sawActive.current ? 900 : 0} style={{ gap: 10 }}>
              {/* Weiterüben ist immer einen Tipp entfernt (issue #47): das Wacklige zuerst,
                  sonst mehr vom Sitzenden — und wenn die Zusammenfassung keine Themen kennt,
                  die der Fragen selbst. Eine Übung endet nie in einer Sackgasse. */}
              {session.mode !== 'help' && againTopics.length > 0 ? (
                <AgainButton
                  {...(session.summary.shaky_topics.length > 0 ? {} : { kind: 'harder' as const })}
                  title={session.title}
                  topics={againTopics}
                  sessionId={session.id}
                />
              ) : null}
              <Btn size="lg" pill full onPress={backToBuddy}>
                {t('practice:back_to_buddy')}
              </Btn>
            </Appear>
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

  const canReveal = session.reveal_allowed;
  // A running test: no verdicts, no solutions, but a question can be skipped.
  const testing = session.mode === 'test' && session.status === 'active';
  // Homework help: a task can be set aside while another one is open (it comes back).
  const canPostpone =
    session.mode === 'help' &&
    shown.status === 'open' &&
    session.items.filter((i) => i.status === 'open').length > 1;
  // "Lösung zeigen" only once the server offers it: after a try or a hint (feedback #8).
  const skip =
    testing || shown.reveal_available
      ? () => void reveal(shown.item.id)
      : canPostpone
        ? () => void later(shown.item.id)
        : undefined;
  const skipLabel = testing
    ? t('practice:skip')
    : canPostpone && !shown.reveal_available
      ? t('practice:later')
      : undefined;
  const skipHint = canPostpone && !testing ? t('practice:later_hint') : undefined;
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
        accessibilityHint={t(testing ? 'practice:end_hint_test' : 'practice:end_hint')}
      >
        {t('practice:end')}
      </Btn>
    </View>
  );

  // ─────────────── one question ───────────────

  const item = shown.item;
  const open = shown.status === 'open';
  const locked = busy || closing;
  const itemTurns = session.turns.filter((turn) => turn.item_id === item.id);
  // Her tries and Buddy's replies; "Anders erklären" exchanges stand after the solution.
  const turns = itemTurns.filter((turn) => turn.reexplain === null);
  const turnsAgain = itemTurns.filter((turn) => turn.reexplain !== null);
  // After a shown solution — in homework after a task she solved herself (never in a test).
  // Not after a clean first try: there the three ways to re-explain were three chips of
  // noise between the solution and "Weiter" (owner 28.09., issue #61). She can still ask
  // Buddy in the chat, and after a wrong try or a hint they are right there.
  const satFirstTry = shown.status === 'correct' && shown.attempts <= 1 && shown.hints_used === 0;
  const canExplainAgain =
    !open &&
    !testing &&
    !satFirstTry &&
    (shown.answer !== null || (session.mode === 'help' && shown.status === 'correct'));
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
  const followEnd = itemTurns.length > 0 || pendingText !== null || !open;
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

  // The middle of the screen belongs to the question and the conversation. What the
  // conversation's content does not need goes to the question card, not to an empty
  // gap (issue #96): the card grows into `cardMin`, its figure sizes itself from that
  // measured room. The cap keeps a third of the middle for the conversation once
  // there is one — past it only the conversation scrolls (CLAUDE.md rule 16).
  const questionCap = Math.round(middleHeight * 0.7);
  // The conversation keeps its content plus the fade at its top edge, so a fully
  // visible first bubble never dissolves into the mask (EdgeFade.tsx).
  const spare = Math.min(Math.max(0, middleHeight - threadNeed - EDGE_FADE), questionCap);
  const aroundCard = Math.max(0, questionContentHeight - cardHeight);
  const cardMin = middleHeight > 0 && cardHeight > 0 ? Math.max(0, spare - aroundCard) : 0;

  // No scrolling to find what matters (CLAUDE.md rule 16): the question stays on top,
  // the way to answer stays at the bottom, and only the conversation between them
  // grows — like a chat, newest at the bottom.
  return (
    <Screen title={title} right={endButton}>
      <KeyboardSafe style={{ flex: 1 }}>
        <View
          style={{ flex: 1 }}
          onLayout={(e) => setMiddleHeight(Math.round(e.nativeEvent.layout.height))}
        >
          <ScrollView
            testID="scroll-question"
            // No clamp and no shrinking: the question must NEVER scroll (rule 16), so
            // nothing may cut it below its content — an irreducible question (three-line
            // fraction prompt + the figure's legible minimum) beat every cap by a few px
            // on 360×740. When space runs out the conversation yields: it scrolls.
            // The cap still bounds how far the card GROWS (cardMin below).
            style={{ flexGrow: 0, flexShrink: 0 }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, gap: 10 }}
            onContentSizeChange={(_, h) => setQuestionContentHeight(Math.round(h))}
          >
            <ProgressRow
              position={session.items.indexOf(shown) + 1}
              total={session.items.length}
              closed={session.items.filter((i) => i.status !== 'open').length}
              right={flagButton}
            />
            {session.mode === 'help' || testing ? (
              <Text style={[TYPE.small, { color: palette.primaryDk, fontWeight: '500' }]}>
                {t(testing ? 'practice:test_note' : 'practice:help_note')}
              </Text>
            ) : null}
            {/* The next question comes in softly from the side (keyed by the question). */}
            <SlideIn
              key={item.id}
              onLayout={(e) => setCardHeight(Math.round(e.nativeEvent.layout.height))}
            >
              {speaking ? (
                <SpeakCard item={item} turns={turns} live={speakLive} sessionId={session.id} />
              ) : (
                <QuestionCard
                  prompt={item.prompt}
                  topic={item.topic}
                  figure={item.figure}
                  figureMaxHeight={Math.round(windowHeight * 0.14)}
                  image={item.image}
                  imageKey={item.id}
                  imageMaxHeight={Math.min(180, Math.round(windowHeight * 0.2))}
                  fromBuddy={item.origin === 'buddy'}
                  minHeight={cardMin}
                  // Her short answer appears in the gap of a fill-in sentence while she types.
                  answer={
                    typed && (item.kind === 'short' || item.kind === 'vocab') ? text : undefined
                  }
                />
              )}
            </SlideIn>
            {tools.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{tools}</View>
            ) : null}
          </ScrollView>
          {/* minHeight 0: on the web a flex child's min-height is its content, and the
              conversation then SQUEEZES the question below its own content instead of
              scrolling itself (issue #96 — 39 px overflow in voice mode; Yoga on the
              phones already defaults to 0). The conversation is the one that scrolls. */}
          <View style={{ flex: 1, minHeight: 0 }}>
            <ScrollView
              ref={scroll}
              testID="scroll-thread"
              style={[{ flex: 1 }, topEdgeMask]}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                flexGrow: 1,
                justifyContent: 'flex-end',
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}
              onContentSizeChange={() => {
                if (followEnd) scroll.current?.scrollToEnd({ animated: true });
              }}
              onLayout={() => {
                // The keyboard shrinks this view; keep the latest reply visible above it.
                if (followEnd) scroll.current?.scrollToEnd({ animated: false });
              }}
            >
              {/* One measured column: what the conversation truly holds (plus the 12 pt
                  of padding above and below), so the question knows what is spare. */}
              <View
                style={{ gap: 12 }}
                onLayout={(e) => setThreadNeed(Math.round(e.nativeEvent.layout.height) + 24)}
              >
                <ItemThread
                  turns={turns}
                  pending={pendingText}
                  hideVerdicts={testing}
                  // A spoken answer: the judgement's words belong here, the marked sentence
                  // stays in the card (issue #14).
                  pronunciation={item.kind === 'speak'}
                />
                {session.mode === 'help' && shown.status === 'correct' ? (
                  <Rise delay={180}>
                    <SelfSolvedCard />
                  </Rise>
                ) : null}
                {/* The solution only where it says something new (issue #93): after an
                    answer she got right herself, the chip and Buddy's reply carry it. */}
                {shown.status !== 'open' && shown.status !== 'correct' && shown.answer !== null ? (
                  <Rise delay={180}>
                    <SolutionCard answer={shown.answer} numeric={item.kind === 'numeric'} />
                  </Rise>
                ) : null}
                {item.kind === 'vocab' && !open && shown.answer !== null && foreign(item.lang) ? (
                  <ListenButton text={shown.answer} lang={item.lang} />
                ) : null}
                {canExplainAgain ? (
                  <Reexplain
                    turns={turnsAgain}
                    pending={again?.itemId === item.id ? again.way : null}
                    disabled={locked}
                    delay={1000}
                    onAsk={(way) => void explainAgain(item.id, way)}
                  />
                ) : null}
                {open ? (
                  <HelpChips
                    onHint={hint}
                    onReveal={skip}
                    revealLabel={skipLabel}
                    revealHint={skipHint}
                    disabled={locked}
                  />
                ) : null}
              </View>
            </ScrollView>
            {/* What scrolls up under the question fades out instead of peeking out (finding 8). */}
            <TopEdgeFade />
          </View>
        </View>
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
            />
          </View>
        ) : null}
        {typed ? (
          <AnswerComposer
            kind={item.kind}
            prompt={item.prompt}
            unit={item.unit}
            lang={item.kind === 'vocab' ? item.lang : item.prompt_lang}
            value={text}
            disabled={locked}
            onChange={setText}
            onCheck={check}
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
            onProgress={setSpeakLive}
            onOutdated={() => void queryClient.invalidateQueries({ queryKey: keys.session(id) })}
            onSkip={canReveal ? () => void reveal(item.id) : undefined}
          />
        ) : null}
        {open ? null : (
          <BottomBar>
            <Appear delay={120}>
              <Btn size="lg" pill full onPress={next}>
                {t('practice:next')}
              </Btn>
            </Appear>
          </BottomBar>
        )}
      </KeyboardSafe>
      <Sheet
        visible={flagOpen}
        title={t('practice:flag.sheet_title')}
        closeLabel={t('common:actions.cancel')}
        onClose={() => setFlagOpen(false)}
      >
        <Text style={TYPE.body}>{t('practice:flag.sheet_body')}</Text>
        <Btn full busy={busy} onPress={() => void flag()}>
          {t('practice:flag.confirm')}
        </Btn>
      </Sheet>
    </Screen>
  );
}
