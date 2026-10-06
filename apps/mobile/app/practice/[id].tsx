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
// A flashcard pass is the same route and a different screen (issue #147, Stufe 2): the
// session says `card_pass`, nothing in it is graded, and `components/practice/CardPass.tsx`
// takes over. Keeping it here means every way into a session — Buddy's home card, the result
// screen's offer, a link — lands in the right place without knowing which pass it is.
//
// Voice mode ("Sprachmodus", the headphones switch in the header): each new
// question is read aloud (choices as "A: …, B: …", a vocab prompt in its own
// language), and so is Buddy's reply with the verdict word after every answer.
// The mic is the main control; reading stops when she starts speaking or
// leaves. The microphone itself only ever starts with her tap.

import {
  type AnswerResponse,
  type ItemView,
  type ReexplainWay,
  type SessionView,
  type SpeakStreamEvent,
  type StructuredAnswer as StructuredParts,
} from '@learnbuddy/shared-types/contracts';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Btn } from '../../components/lb/Btn.js';
import { EndButton } from '../../components/lb/EndButton.js';
import { Appear, Rise, SlideIn } from '../../components/lb/Motion.js';
import { LoadingState } from '../../components/lb/LoadingState.js';
import { PracticeSkeleton } from '../../components/lb/Skeletons.js';
import { Screen } from '../../components/lb/Screen.js';
import { Sheet } from '../../components/lb/Sheet.js';
import { toast } from '../../components/lb/Toast.js';
import { useSpokenWords } from '../../components/math/useSpokenMath.js';
import { TypedAnswer } from '../../components/practice/TypedAnswer.js';
import { CardPass } from '../../components/practice/CardPass.js';
import { DrillRound } from '../../components/practice/DrillRound.js';
import { BottomBar } from '../../components/lb/BottomBar.js';
import { ChoiceList, SpokenChoice } from '../../components/practice/ChoiceList.js';
import {
  canDisputeVerdict,
  DisputeVerdictSheet,
} from '../../components/practice/DisputeVerdict.js';
import { FigureTapAnswer } from '../../components/practice/FigureTapAnswer.js';
import { FractionBarBoard } from '../../components/practice/FractionBarAnswer.js';
import { DictationCard } from '../../components/practice/DictationCard.js';
import { HeardTextCard } from '../../components/practice/HearText.js';
import { HelpChips } from '../../components/practice/HelpChips.js';
import { ItemThread } from '../../components/practice/ItemThread.js';
import { PracticeStuck } from '../../components/practice/PracticeStuck.js';
import { ListenButton } from '../../components/practice/ListenButton.js';
import { QuestionCorner } from '../../components/practice/QuestionCorner.js';
import { ReadQuestionButton } from '../../components/practice/ReadQuestionButton.js';
import { QuestionTools } from '../../components/practice/QuestionTools.js';
import {
  emptyStaffAnswer,
  readStaffDraft,
  type StaffDraft,
} from '../../components/practice/StaffAnswer.js';
import { StaffWriting } from '../../components/practice/StaffWriting.js';
import { FreeSpaceReport } from '../../components/practice/FreeSpace.js';
import { AnswerShell } from '../../components/practice/AnswerShell.js';
import { AskRoute } from '../../components/practice/CheckBar.js';
import { StructuredAnswer } from '../../components/practice/StructuredAnswer.js';
import { ThreadBox } from '../../components/practice/ThreadBox.js';
import { ProgressRow, QuestionCard } from '../../components/practice/Question.js';
import { Reexplain } from '../../components/practice/Reexplain.js';
import { RunResult } from '../../components/practice/RunResult.js';
import { TestClockHeader } from '../../components/practice/TestClock.js';
import { SelfSolvedCard, SolutionCard } from '../../components/practice/SolutionCard.js';
import {
  latestPronunciation,
  SpeakCard,
  SpeakPanel,
} from '../../components/practice/SpeakPanel.js';
import { VoiceModeToggle } from '../../components/voice/VoiceModeToggle.js';
import { isOutdated, isRetryable } from '../../lib/api/apiError.js';
import { newId } from '../../lib/api/client.js';
import {
  answerItem,
  askItem,
  disputeVerdict,
  deferItem,
  finishSession,
  flagItem,
  hintItem,
  keepForLater,
  explainItem,
  revealItem,
  startCardPass,
} from '../../lib/api/endpoints.js';
import {
  keys,
  queryClient,
  seedSession,
  storeTurn,
  usePracticeSession,
} from '../../lib/api/queries.js';
import { useDraft } from '../../lib/drafts.js';
import { messageFor } from '../../lib/errors.js';
import { currentLocale } from '../../lib/i18n/index.js';
import { questionParts } from '../../lib/practice/questionParts.js';
import { answerForm } from '../../lib/practice/answerForm.js';
import { questionOffers, questionOnScreen } from '../../lib/practice/offers.js';
import { leftAfterSend } from '../../lib/practice/essay.js';
import { foreign, verdictWordKey } from '../../lib/practice/onScreen.js';
import { useFinishWhenDone } from '../../lib/practice/finishWhenDone.js';
import { useHeardTexts } from '../../lib/practice/heardTexts.js';
import { useScreenRoom } from '../../lib/practice/screenRoom.js';
import { announce } from '../../lib/announce.js';
import { haptic } from '../../lib/haptics.js';
import { speakInOrder, stop as stopListening } from '../../lib/speech/listen.js';
import { feedbackReadText, spokenText } from '../../lib/speech/spoken.js';
import { afterFeedback, useHandsFree } from '../../lib/speech/handsFree.js';
import { useVoiceMode } from '../../lib/speech/voiceMode.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { KeyboardSafe } from '../../components/lb/KeyboardSafe.js';
import { useVisibleHeight } from '../../lib/useVisibleHeight.js';
import { reacted } from '../../lib/perf.js';
import { SPACE } from '../../lib/theme/space.js';

/**
 * What she sent, and how (issue #163). `via` is not decoration: since #147 a tapped word
 * travels as ordinary text so grading stays one path — so the text alone no longer shows
 * whether she recognised the word or wrote it, and a class test asks for the second.
 */
type AnswerInput = ({ text: string } | { choice: number } | { parts: StructuredParts }) & {
  via?: 'typed' | 'tapped' | 'spoken';
};

/** The last answer sent; until the server confirms it, retrying the same answer reuses its id. */
type SentAnswer = {
  clientTurnId: string;
  itemId: string;
  text: string | null;
  choice: number | null;
  /**
   * A structured answer (issue #228), as JSON: an arrangement has no text of its own, its parts
   * are what makes it the same answer or a different one. Without this a re-arranged order
   * would reuse the first id and the server would file it as the same turn.
   */
  parts: string | null;
};

function backToBuddy(): void {
  // Pops back to Buddy when it is below in the stack, otherwise replaces this
  // screen with it (router.replace would leave a second Buddy on the stack).
  router.dismissTo('/buddy');
}

export default function PracticeScreen() {
  const { palette } = useTheme();
  const { t } = useTranslation(['practice', 'common']);
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? '';
  const query = usePracticeSession(id);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  // What she can see, keyboard or not: with it up the window keeps its height (edge-to-edge),
  // and caps taken from the window grew the card into the room the conversation needed — its
  // newest turn then stood half under the card (issue #289, second case).
  const viewHeight = useVisibleHeight().visible;

  const [pinnedId, setPinnedId] = useState<string | null>(null);
  // The division step Buddy's reply names, opened on the board (#420), keyed by that reply.
  const [stepOpen, setStepOpen] = useState<{ itemId: string; step: number; turn: string } | null>(
    null,
  );
  // Kept on the device: a half-typed answer survives Android killing the app.
  const { text, setText } = useDraft(`session.${id}`);
  /** Her question to the tutor (issue #402), kept like her answer: an app kill does not lose it. */
  const question = useDraft(`session.${id}.ask`);
  /** What is on its way: an answer, or her question (`asked`). */
  const [pending, setPending] = useState<{ itemId: string; text: string; asked?: true } | null>(
    null,
  );
  /** The recordings she already heard in this run (issues #210, #242). */
  const { heard, markHeard } = useHeardTexts(id);
  /**
   * Die Notenzeile, die sie geschrieben hat, und zu welcher Frage (issue #226). Aus demselben
   * Grund an der Frage festgemacht wie die Anordnung darüber: die nächste Frage beginnt mit einer
   * leeren Zeile, und nichts Geschriebenes rutscht hinein.
   */
  // Im Entwurf und nicht nur im Zustand (issue #275): ein Farbwechsel baut den Bildschirm neu
  // auf, und ihre halbe Zeile war danach weg.
  const staffDraft = useDraft(`session.${id}.staff`);
  const written = readStaffDraft(staffDraft.text);
  const setWritten = (next: StaffDraft) => staffDraft.setText(JSON.stringify(next));
  /** The pronunciation judgement while the model is still listening (issue #8). */
  const [speakLive, setSpeakLive] = useState<SpeakStreamEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  /**
   * A test she sat with time has run out on this screen (issue #241). The questions go away at
   * once and the test is handed in as soon as no answer is on its way — an answer she sent at
   * the last second is still graded (the server allows for the network).
   */
  const [timeUp, setTimeUp] = useState(false);
  /** "Frage passt nicht": the confirm sheet, and the question it is about. */
  const [flagFor, setFlagFor] = useState<string | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  /** "Bewertung stimmt nicht" (issue #164): the same, for a judgement already given. */
  const [disputeFor, setDisputeFor] = useState<string | null>(null);
  const [disputeOpen, setDisputeOpen] = useState(false);
  /** "Anders erklären": the way she tapped, while Buddy writes. */
  const [again, setAgain] = useState<{ itemId: string; way: ReexplainWay } | null>(null);
  // Measured: what the conversation's content really needs and what the question takes, so the
  // conversation can show whole turns in the room there is (issue #286, `useScreenRoom`).
  const measured = useScreenRoom();
  const working = useRef(false);
  const lastSent = useRef<SentAnswer | null>(null);

  const session = query.data;
  // The session ran here while the screen was open: its end is a moment (SessionSummary).
  const sawActive = useRef(false);
  if (session?.status === 'active') sawActive.current = true;
  const voiceOn = useVoiceMode((s) => s.on);
  const words = useSpokenWords();

  // Voice mode: a question is read aloud once when it appears (or when voice mode is switched on).
  const onScreen = session ? questionOnScreen(session, pinnedId) : null;
  // A flashcard pass is not read aloud and never arms the mic: there is no answer to listen
  // for (issue #147). The card itself offers "Anhören" for the word, which is the control
  // that makes sense there.
  // Nor a question the server says must not be heard (issue #238, `read_aloud`): a spelling
  // task, a vocabulary prompt that holds its own answer. Voice mode obeys the same rule as the
  // "Vorlesen" button — hearing it would hand over the solution either way.
  const toRead =
    onScreen &&
    onScreen.status === 'open' &&
    !session?.card_pass &&
    !session?.drill &&
    onScreen.item.read_aloud
      ? onScreen.item
      : null;
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
    setStepOpen(res.column_step ? { itemId, step: res.column_step, turn: res.reply.id } : null);
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

  // Once no question is open, the run is finished — once (`useFinishWhenDone`).
  // And a test whose time is up (issue #241) is handed in once no answer is on its way.
  const { finish, finishFailed } = useFinishWhenDone(id, session, store, {
    timeUp,
    busy,
    onHandIn: () => setPinnedId(null),
  });

  // Buddy's home shows this session (questions left, the result): refresh it on the way out.
  useEffect(() => () => void queryClient.invalidateQueries({ queryKey: keys.home }), []);

  async function store(next: SessionView): Promise<void> {
    // A refetch that started before this change must not overwrite it.
    await queryClient.cancelQueries({ queryKey: keys.session(id) });
    queryClient.setQueryData(keys.session(id), next);
  }

  /**
   * One call to the server at a time (`working`): busy while it runs; a failure is said, and a
   * view the server calls outdated is fetched again. `onError` adds what one call undoes besides.
   */
  async function act(work: () => Promise<void>, onError?: (err: unknown) => void): Promise<void> {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await work();
    } catch (err) {
      onError?.(err);
      toast.show(messageFor(err), 'error');
      if (isOutdated(err)) void queryClient.invalidateQueries({ queryKey: keys.session(id) });
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  /** After a step that leaves the question: no half answer, no retry id, no keyboard. */
  function clearAnswer(): void {
    setText('');
    lastSent.current = null;
    Keyboard.dismiss();
  }

  /**
   * "Die Wörter als Karten durchgehen" (issue #147): the server picks the words of this
   * finished run that did not sit and opens the pass in place of the result — the result has
   * been read by then, and the pass is where she is now.
   */
  function goThroughCards(): Promise<void> {
    return act(async () => {
      haptic.tap();
      const pass = await startCardPass(id);
      seedSession(pass);
      router.replace(`/practice/${pass.id}`);
    });
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

  function answer(itemId: string, input: AnswerInput, shownText: string): Promise<void> {
    const answerText = 'text' in input ? input.text : null;
    const choice = 'choice' in input ? input.choice : null;
    const parts = 'parts' in input ? JSON.stringify(input.parts) : null;
    return act(
      async () => {
        const prev = lastSent.current;
        // Retrying the very same answer keeps its id, so the server records it only once.
        const clientTurnId =
          prev &&
          prev.itemId === itemId &&
          prev.text === answerText &&
          prev.choice === choice &&
          prev.parts === parts
            ? prev.clientTurnId
            : newId();
        lastSent.current = { clientTurnId, itemId, text: answerText, choice, parts };
        haptic.tap();
        setPinnedId(itemId);
        setPending({ itemId, text: shownText });
        try {
          const body = { client_turn_id: clientTurnId, item_id: itemId, ...input };
          const res = await answerItem(id, body);
          lastSent.current = null;
          await store(res.session);
          // Tap on "Prüfen" → the verdict on screen (issue #66).
          reacted('check');
          const after = res.session.items.find((i) => i.item.id === itemId);
          // A long text stays in the field: her next version starts from it (#258).
          if (answerText !== null) setText((c) => leftAfterSend(c, answerText, after?.item.kind));
          if (after?.status !== 'open') Keyboard.dismiss();
          readFeedback(res, itemId);
        } finally {
          setPending(null);
        }
      },
      // The typed answer stays in the field, so trying again is one tap.
      (err) => {
        if (isOutdated(err)) lastSent.current = null;
      },
    );
  }

  /** Buddy listened to a recording (SpeakPanel sends it and retries it itself). */
  async function spoke(itemId: string, res: AnswerResponse): Promise<void> {
    setPinnedId(itemId);
    await store(res.session);
    readFeedback(res, itemId);
  }

  function reveal(itemId: string): Promise<void> {
    return act(async () => {
      setPinnedId(itemId);
      const revealed = await revealItem(id, itemId);
      await store(revealed);
      // "Lösung zeigen": the solution is said too, math in words (audit M-82).
      const answer = revealed.items.find((i) => i.item.id === itemId)?.answer;
      if (answer) announce(`${t('practice:solution.title')}: ${spokenText(answer, words)}`);
      clearAnswer();
    });
  }

  /** "Tipp": the next prepared hint, at once. */
  function askHint(itemId: string): Promise<void> {
    return act(async () => {
      haptic.tap();
      setPinnedId(itemId);
      const res = await hintItem(id, itemId);
      await store(res.session);
      readFeedback(res, itemId);
    });
  }

  /**
   * Her question to the tutor (issue #402): never graded, never a try; the reply joins the
   * conversation like a hint's. What she typed stays in the field until the reply is there.
   */
  function ask(itemId: string, text: string): Promise<void> {
    return act(async () => {
      haptic.tap();
      setPinnedId(itemId);
      setPending({ itemId, text, asked: true });
      try {
        const res = await askItem(id, itemId, text);
        await store(res.session);
        question.setText('');
        readFeedback(res, itemId);
      } finally {
        setPending(null);
      }
    });
  }

  /** "Merk ich mir für nachher" (issue #402): Buddy brings her question up after the practice. */
  function keep(turnId: string): Promise<void> {
    return act(async () => {
      haptic.tap();
      storeTurn(id, (await keepForLater(id, turnId)).turn);
    });
  }

  /** "Anders erklären", or with `choice` the reason she tapped (#388): Buddy's answer under it. */
  function explainAgain(itemId: string, way: ReexplainWay, choice?: number): Promise<void> {
    return act(async () => {
      haptic.tap();
      setAgain({ itemId, way });
      try {
        const res = await explainItem(id, itemId, way, choice);
        await store(res.session);
        // Heard like every reply of Buddy's: read aloud in voice mode, else told to a screen reader.
        const said = spokenText(res.reply.text, words);
        if (useVoiceMode.getState().on) speakInOrder([{ text: said, lang: currentLocale() }]);
        else announce(said);
      } finally {
        setAgain(null);
      }
    });
  }

  /** Homework help "Später": the task stays open and comes back after the others. */
  function later(itemId: string): Promise<void> {
    return act(async () => {
      await store(await deferItem(id, itemId));
      setPinnedId(null);
      clearAnswer();
      announce(t('practice:later_done'));
    });
  }

  /**
   * "Die Bewertung stimmt nicht" confirmed (issue #164). Different from "Frage passt
   * nicht", which is about an unfit question while it is still open: this is about a
   * judgement she has already been given and disagrees with. The question leaves the
   * result and future practice, and her learning state goes back to what it was.
   */
  function dispute(): Promise<void> {
    const itemId = disputeFor;
    if (!itemId) return Promise.resolve();
    return act(
      async () => {
        await store(await disputeVerdict(id, itemId));
        setDisputeOpen(false);
        setPinnedId(null);
        clearAnswer();
        toast.show(t('practice:dispute.done'));
      },
      () => setDisputeOpen(false),
    );
  }

  /** "Frage passt nicht" confirmed: out of this session and out of future practice. */
  function flag(): Promise<void> {
    const itemId = flagFor;
    if (!itemId) return Promise.resolve();
    return act(
      async () => {
        await store(await flagItem(id, itemId));
        setFlagOpen(false);
        // On to the next open question (or the result, when none is left).
        setPinnedId(null);
        clearAnswer();
        toast.show(t('practice:flag.done'));
      },
      () => setFlagOpen(false),
    );
  }

  const nextRef = useRef(() => undefined as void);
  nextRef.current = () => next();
  function next(): void {
    setPinnedId(null);
    setText('');
    question.setText('');
    lastSent.current = null;
  }

  // ─────────────── loading / not loadable ───────────────

  if (!session) {
    if (query.isError) {
      return (
        <PracticeStuck
          message={messageFor(query.error)}
          onBack={backToBuddy}
          {...(isRetryable(query.error) ? { onRetry: () => void query.refetch() } : {})}
        />
      );
    }
    return (
      <Screen>
        <PracticeSkeleton label={t('practice:loading')} />
      </Screen>
    );
  }

  const title = session.title.trim() || t('practice:title_fallback');

  // ─────────────── a flashcard pass ───────────────

  if (session.card_pass) {
    return <CardPass session={session} title={title} onChange={store} onClose={close} />;
  }

  // ─────────────── a Kopfrechnen round (issue #243) ───────────────

  if (session.drill) {
    return <DrillRound session={session} title={title} onChange={store} onClose={close} />;
  }

  const shown = questionOnScreen(session, pinnedId);

  // ─────────────── nothing left to answer ───────────────
  // Also when the time of a test with time is up (issue #241): no question stays on screen to be
  // answered into the void; the result comes as soon as the test is handed in.

  if (!shown || (timeUp && session.status === 'active')) {
    if (session.status === 'finished' && session.summary) {
      return (
        <RunResult
          session={session}
          summary={session.summary}
          title={title}
          celebrate={sawActive.current}
          busy={busy}
          onCards={() => void goThroughCards()}
          onBack={backToBuddy}
        />
      );
    }
    const active = session.status === 'active';
    // She answered the questions the run started with and the rest is still being written
    // (issue #220). Not a result and not an error — the next questions are on their way, and the
    // screen asks for them until they are there (`usePracticeSession`).
    if (active && session.preparing && !timeUp) {
      return (
        <Screen title={title}>
          <LoadingState label={t('practice:more_coming')} />
        </Screen>
      );
    }
    if (active && !finishFailed) {
      return (
        <Screen title={title}>
          <LoadingState label={t(timeUp ? 'practice:timer.up' : 'practice:finishing')} />
        </Screen>
      );
    }
    // Finishing failed (retry), or the session ended without a result (abandoned).
    return (
      <PracticeStuck
        title={title}
        message={active ? t('practice:finish_failed') : t('practice:ended')}
        onBack={backToBuddy}
        {...(active ? { onRetry: () => void finish() } : {})}
      />
    );
  }

  const canReveal = session.reveal_allowed;
  // The ways past, back to and out of the question (`questionOffers`).
  const offers = questionOffers(session, shown);
  const { testing } = offers;
  const skipTo = offers.skip === 'reveal' ? reveal : offers.skip === 'later' ? later : null;
  const skip = skipTo ? () => void skipTo(shown.item.id) : undefined;
  const hint = shown.hint_available ? () => void askHint(shown.item.id) : undefined;
  const endButton = (
    // Stays while a question is on screen, also once the session was finished in the
    // background (finishing again is a no-op) – the header must not jump under the reader.
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
      <VoiceModeToggle />
      <EndButton
        onPress={() => void close()}
        disabled={closing}
        label={t('practice:end_label')}
        hint={t(testing ? 'practice:end_hint_test' : 'practice:end_hint')}
      />
    </View>
  );

  // ─────────────── one question ───────────────

  const item = shown.item;
  const open = shown.status === 'open';
  const locked = busy || closing;
  const itemTurns = session.turns.filter((turn) => turn.item_id === item.id);
  // Her tries and Buddy's replies; "Anders erklären" exchanges stand after the solution.
  const turns = itemTurns.filter((turn) => turn.reexplain === null);
  // A Diktat shows only her latest try and what followed it (issue #242): each try replaces the
  // last, and three tries with three replies, the word and the follow-ups do not fit under the
  // card on 360×740 — an older bubble would sit half cut under its edge (review of #286).
  const lastTry = turns.map((turn) => turn.role).lastIndexOf('learner');
  const threadTurns =
    item.kind === 'spelling_dictation' && lastTry > 0 ? turns.slice(lastTry) : turns;
  const turnsAgain = itemTurns.filter((turn) => turn.reexplain !== null);
  const pendingText = pending?.itemId === item.id ? pending.text : null;
  // Once there is a conversation the Diktat card is one row (DictationCard `compact`).
  const dictationCompact = itemTurns.length > 0 || pendingText !== null;
  // Which way she answers — exactly one (`answerForm`).
  const { choices, tapChoices, speaking, structured, staff, barSurface, tapFigure, typed } =
    answerForm(item, open);
  // Her short answer appears in the gap of a fill-in sentence while she types.
  const filling = typed && (item.kind === 'short' || item.kind === 'vocab') ? text : undefined;
  const reRead = voiceOn && open && !choices && item.read_aloud ? () => readQuestion(item) : null;
  /** Ihre Notenzeile zu DIESER Frage; eine andere Frage beginnt mit einer leeren Zeile. */
  const staffAnswer =
    written?.itemId === item.id ? written.answer : emptyStaffAnswer(staff?.bars ?? 1);
  const tried = new Set(
    turns
      .filter((turn) => turn.role === 'learner' && turn.verdict === 'incorrect')
      .map((turn) => turn.text),
  );
  // Once there is a conversation (or the solution), keep its newest part in view.
  const followEnd = itemTurns.length > 0 || pendingText !== null || !open;

  // A shaded bar is a tap, even though "Prüfen" sends it (issue #163).
  const check = (value: string, via: 'typed' | 'tapped' = 'typed') =>
    value ? void answer(item.id, { text: value, via }, value) : undefined;

  // A foreign vocabulary word has its own "Anhören" (its pronunciation is the point); that IS
  // its read-aloud button, so it never gets a second one.
  const hearWord = item.kind === 'vocab' && foreign(item.prompt_lang);
  // "Frage vorlesen" (issue #238) in the card's meta row (`ReadQuestionButton`, issue #310). Only
  // where the server allows it (`read_aloud`), only while the question is open, and not where
  // another control already reads it — voice mode's "Nochmal vorlesen", the pronunciation card's
  // "Anhören", the foreign word's "Anhören". It says what voice mode says (math in words, choices
  // as "A: …, B: …"). Keyed by the question: a new one never inherits a running reading.
  const readOut =
    !voiceOn && open && item.read_aloud && !speaking && !hearWord
      ? (questionParts(item, words, t)[0] ?? null)
      : null;

  // How the conversation and the card share the room (issues #96, #286, #232): `threadRoom`.
  const { threadCap, threadFloor, threadHolds, cardGrowTo, caps, cardNatural, ...room } =
    measured.layout({
      // A figure she taps stands in the answer, not in the card (`FigureTapAnswer`).
      item: tapFigure ? { ...item, figure: null } : item,
      open,
      speaking,
      threadTurns,
      quiet: turns.length === 0,
      dictationCompact,
      viewHeight,
      windowWidth,
      safeBottom: insets.bottom,
    });

  // Where she is — the server's word, never the app's guess: while it says more questions are
  // coming, the total is not the number it will be (issue #220).
  const progress = {
    position: session.items.indexOf(shown) + 1,
    total: session.items.length,
    closed: session.items.filter((i) => i.status !== 'open').length,
    preparing: session.preparing,
  };
  const corner = (
    <QuestionCorner
      flaggable={offers.flaggable}
      // A judgement she has been given and may disagree with (issue #164). The
      // rule and the copy live in components/practice/DisputeVerdict.tsx.
      canDispute={canDisputeVerdict({
        open,
        sessionStatus: session.status,
        testing,
        mode: session.mode,
        origin: item.origin,
        kind: item.kind,
      })}
      disabled={locked}
      onFlag={() => {
        setFlagFor(item.id);
        setFlagOpen(true);
      }}
      onDispute={() => {
        setDisputeFor(item.id);
        setDisputeOpen(true);
      }}
    />
  );

  // No scrolling to find what matters (CLAUDE.md rule 16): the question stays on top,
  // the way to answer stays at the bottom, and only the conversation between them
  // grows — like a chat, newest at the bottom.
  return (
    <Screen title={title} right={endButton}>
      <KeyboardSafe style={{ flex: 1 }}>
        <FreeSpaceReport.Provider value={measured.setFreeSpace}>
          {/* Her question (issue #402): the field of the bar on every form without a typed answer. */}
          <AskRoute.Provider
            value={{
              value: question.text,
              onChange: question.setText,
              onSend: () => void ask(item.id, question.text.trim()),
              disabled: locked,
              focused: measured.asking,
              onFocused: measured.setAsking,
            }}
          >
            {/* The column, measured: its end mark (below) says how far its content runs past it. */}
            <View
              style={{ flex: 1, minHeight: 0 }}
              ref={measured.columnRef}
              onLayout={(e) => measured.onColumn(Math.round(e.nativeEvent.layout.height))}
            >
              <View
                style={{
                  // The question and the conversation take what they need, no more: the free room
                  // collects under them and the way to answer stands at the bottom (`AnswerShell`,
                  // issues #286, #386). The question never shrinks; the conversation does, by whole turns
                  // (`threadCap`).
                  flexGrow: 0,
                  flexShrink: 1,
                  minHeight: measured.questionContentHeight + threadFloor,
                }}
              >
                <ScrollView
                  testID="scroll-question"
                  // No clamp and no shrinking: the question must NEVER scroll (rule 16), so
                  // nothing may cut it below its content — an irreducible question (three-line
                  // fraction prompt + the figure's legible minimum) beat every cap by a few px
                  // on 360×740. When space runs out the conversation yields: whole turns (threadCap).
                  style={{ flexGrow: 0, flexShrink: 0 }}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, gap: 10 }}
                  onContentSizeChange={(_, h) => measured.setQuestionContentHeight(Math.round(h))}
                >
                  {testing && session.timer ? (
                    // A test she asked to sit with time (issue #241): the time left in a small chip
                    // at the end of the same row, and the one line under it — the header does not grow.
                    <TestClockHeader
                      timer={session.timer}
                      receivedAt={query.dataUpdatedAt}
                      onTimeUp={() => setTimeUp(true)}
                      progress={{ ...progress, right: corner }}
                    />
                  ) : (
                    <>
                      <ProgressRow {...progress} right={corner} />
                      {session.mode === 'help' || testing ? (
                        <Text style={[TYPE.small, { color: palette.primaryDk, fontWeight: '500' }]}>
                          {t(testing ? 'practice:test_note' : 'practice:help_note')}
                        </Text>
                      ) : null}
                    </>
                  )}
                  {/* The next question comes in softly from the side (keyed by the question). */}
                  <SlideIn
                    key={item.id}
                    onLayout={(e) => room.onCard(Math.round(e.nativeEvent.layout.height))}
                  >
                    {speaking ? (
                      <SpeakCard
                        item={item}
                        turns={turns}
                        live={speakLive}
                        sessionId={session.id}
                      />
                    ) : item.kind === 'spelling_dictation' ? (
                      // Diktat (issue #242): no word to read, so the card is the way to hear it.
                      <DictationCard
                        sessionId={session.id}
                        itemId={item.id}
                        prompt={item.prompt}
                        // Having answered, she has heard it — also after the screen was rebuilt.
                        heard={shown.attempts > 0 || heard(item.listen?.ref)}
                        onHeard={() => markHeard(item.listen?.ref)}
                        disabled={locked}
                        minHeight={cardGrowTo > 0 ? cardNatural + cardGrowTo : undefined}
                        compact={dictationCompact}
                      />
                    ) : (
                      <QuestionCard
                        prompt={item.prompt}
                        // Not twice: a topic the header's title already names stays out of the card.
                        topic={item.topic && title.includes(item.topic) ? null : item.topic}
                        figure={tapFigure ? null : item.figure}
                        figureMaxHeight={caps.figure}
                        image={item.image}
                        imageKey={item.id}
                        imageMaxHeight={caps.image}
                        fromBuddy={item.origin === 'buddy'}
                        read={
                          readOut ? (
                            <ReadQuestionButton
                              key={`read-${item.id}`}
                              text={readOut.text}
                              lang={readOut.lang}
                            />
                          ) : null
                        }
                        minHeight={cardGrowTo > 0 ? cardNatural + cardGrowTo : undefined}
                        dense={staff !== null}
                        answer={filling}
                        // The text she reads it from, above the question (Leseverständnis, #233).
                        passage={item.passage}
                        answerBoard={open && structured}
                      />
                    )}
                  </SlideIn>
                  <QuestionTools
                    item={item}
                    sessionId={session.id}
                    readAgain={reRead}
                    hearWord={hearWord}
                    heard={heard}
                    markHeard={markHeard}
                    disabled={locked}
                  />
                </ScrollView>
                <ThreadBox
                  cap={threadCap}
                  floor={threadFloor}
                  holds={threadHolds}
                  tops={room.tops}
                  followEnd={followEnd}
                  readFrom={pendingText === null ? room.readFrom : undefined}
                  onBox={measured.setThreadBox}
                  onNeed={measured.setThreadNeed}
                  onParts={measured.setPartTops}
                >
                  <ItemThread
                    turns={threadTurns}
                    pending={pendingText}
                    asking={pending?.asked}
                    later={{ onKeep: (turnId) => void keep(turnId), disabled: locked }}
                    hideVerdicts={testing}
                    // A spoken answer: the judgement's words belong here, the marked sentence
                    // stays in the card (issue #14).
                    pronunciation={item.kind === 'speak'}
                    // While a structured question is open her answer stands on its board, not in a
                    // bubble (ItemThread). Once it is closed the board is gone, there is room, and
                    // the bubble with its verdict shows what she did, like any other answer.
                    // The same for tapped options (issue #288): a tried tile says "Schon
                    // ausprobiert" itself, and a bubble repeating it was a duplicate — for a
                    // picture option even the formula behind the drawing. In voice mode the
                    // bubble stays: there it is the only place she sees what was heard.
                    echoAnswers={!((structured || ((choices || tapChoices) && !voiceOn)) && open)}
                    onTurnTops={measured.setTurnTops}
                    essay={item.kind === 'essay'}
                  />
                  {session.mode === 'help' && shown.status === 'correct' ? (
                    <Rise delay={180}>
                      <SelfSolvedCard />
                    </Rise>
                  ) : null}
                  {/* The solution only where it says something new (issue #93): after an
                answer she got right herself, the chip and Buddy's reply carry it. */}
                  {shown.status !== 'open' &&
                  shown.status !== 'correct' &&
                  shown.answer !== null ? (
                    <Rise delay={180}>
                      <SolutionCard answer={shown.answer} numeric={item.kind === 'numeric'} />
                    </Rise>
                  ) : null}
                  {item.kind === 'vocab' && !open && shown.answer !== null && foreign(item.lang) ? (
                    <ListenButton text={shown.answer} lang={item.lang} />
                  ) : null}
                  {/* What the Hörtext said, once the question is closed (issue #210). The server
                sends it under exactly the condition it sends the solution under. */}
                  {shown.listen_transcript !== null ? (
                    <Rise delay={180}>
                      <HeardTextCard text={shown.listen_transcript} />
                    </Rise>
                  ) : null}
                  {offers.explainAgain ? (
                    <Reexplain
                      turns={turnsAgain}
                      pending={again?.itemId === item.id ? again.way : null}
                      disabled={locked}
                      delay={1000}
                      onAsk={(way, choice) => void explainAgain(item.id, way, choice)}
                      why={shown.why}
                    />
                  ) : null}
                  {open ? (
                    <HelpChips
                      onHint={hint}
                      hintOffered={shown.hint_offered}
                      // A spoken sentence has no solution to show — it stands in the card, and
                      // the bar under it already offers the one way past it ("Diesmal
                      // überspringen", which is this very `reveal` call). Two names in two
                      // shapes for one action, on opposite sides of the screen, was half of
                      // why this screen felt unlike the rest (issue #186). In a running test
                      // the bar has no way out, so there the chip stays.
                      onReveal={speaking && canReveal ? undefined : skip}
                      revealLabel={offers.skipLabel ? t(`practice:${offers.skipLabel}`) : undefined}
                      revealHint={offers.skipHint ? t(`practice:${offers.skipHint}`) : undefined}
                      disabled={locked}
                    />
                  ) : null}
                </ThreadBox>
              </View>
              {/* Options she taps (issue #288), in the answer shell like every form (issue #310): at the
            bottom, the free room above (#386), and in voice mode the spoken answer where
            "Prüfen" stands for the others. Tapped words go as if she had typed them: same
            grading, same key (issue #147). */}
              {open && (choices || tapChoices) ? (
                <AnswerShell
                  keeps="whole"
                  answer={
                    <ChoiceList
                      choices={choices ?? tapChoices ?? []}
                      figures={choices ? item.choice_figures : null}
                      tried={tried}
                      disabled={locked}
                      onChoose={(index, choice) =>
                        void answer(
                          item.id,
                          choices ? { choice: index } : { text: choice, via: 'tapped' },
                          choice,
                        )
                      }
                    />
                  }
                  action={{
                    tap: true,
                    voice:
                      choices && voiceOn ? (
                        <SpokenChoice
                          prompt={item.prompt}
                          disabled={locked}
                          onText={(said) =>
                            void answer(item.id, { text: said, via: 'spoken' }, said)
                          }
                          {...(item.read_aloud ? { onReadAgain: () => readQuestion(item) } : {})}
                        />
                      ) : undefined,
                  }}
                />
              ) : null}
              {/* A structured item's parts (issues #228–#230): one form per kind in the answer
            shell (answer, free room, "Prüfen" — `AnswerShell`, issue #310), its arrangement in a
            draft, so a theme switch (a remount) keeps it. Keyed by the question, so a new one
            starts empty. */}
              {open && item.task_view ? (
                <View
                  style={{ flexGrow: 1, flexShrink: 1, minHeight: 0 }}
                  onLayout={(e) =>
                    measured.setSurfaceHeight(Math.round(e.nativeEvent.layout.height))
                  }
                >
                  <StructuredAnswer
                    key={item.id}
                    view={item.task_view}
                    draftKey={`session.${id}.${item.id}`}
                    disabled={locked}
                    onSubmit={(body, shownText) => void answer(item.id, body, shownText)}
                    opens={stepOpen?.itemId === item.id ? stepOpen : null}
                  />
                </View>
              ) : null}
              {/* Die Notenzeile, auf die sie schreibt (issue #226), in der Antworthülle (#310). */}
              {staff ? (
                <StaffWriting
                  key={item.id}
                  surface={staff}
                  answer={staffAnswer}
                  disabled={locked}
                  onChange={(next) => setWritten({ itemId: item.id, answer: next })}
                  // Kein `via: 'tapped'`, obwohl sie getippt hat: `via` unterscheidet WIEDERERKENNEN
                  // von PRODUZIEREN (issue #163), und hier ist nichts wiedererkannt. Eine Notenzeile
                  // selbst zu setzen ist genau das, was die Klassenarbeit verlangt — mit einem Stift
                  // statt mit dem Finger (dasselbe Argument wie `summary.ts` für mehrteilige Antworten).
                  onCheck={(line) => void answer(item.id, { text: line }, line)}
                />
              ) : null}
              {typed ? (
                <TypedAnswer
                  kind={item.kind}
                  prompt={item.prompt}
                  unit={item.unit}
                  subjectKind={item.subject_kind}
                  lang={item.kind === 'vocab' ? item.lang : item.prompt_lang}
                  value={text}
                  disabled={locked}
                  onChange={setText}
                  onCheck={check}
                />
              ) : null}
              {/* The fraction bar she works with (issue #162), a board like the others (report #388
            §9, issue #402): the shaded bar is the answer, "Prüfen" checks it, and the bar's field
            is her question. A picked bar goes out at once, like a tile. */}
              {barSurface ? (
                <FractionBarBoard
                  surface={barSurface}
                  value={text}
                  disabled={locked}
                  onChange={setText}
                  onCheck={(value) => check(value, 'tapped')}
                />
              ) : null}
              {/* A figure she taps a place in (issue #248), a board like the bar. Not `via: 'tapped'`:
            nothing is offered to recognise — marking the place IS what the class test asks for. */}
              {tapFigure ? (
                <FigureTapAnswer
                  key={item.id}
                  figure={tapFigure}
                  value={text}
                  disabled={locked}
                  onChange={setText}
                  onCheck={check}
                />
              ) : null}
              {/* The pronunciation recorder and "Weiter" stand where "Prüfen" does, under the free
            room (`AnswerShell`): nothing to answer in a slot, only the bar. */}
              {open && speaking ? (
                <AnswerShell
                  action={{
                    bar: (
                      <SpeakPanel
                        item={item}
                        sessionId={id}
                        hasFeedback={latestPronunciation(turns) !== null}
                        disabled={locked}
                        onResult={(res) => spoke(item.id, res)}
                        onProgress={setSpeakLive}
                        onOutdated={() =>
                          void queryClient.invalidateQueries({ queryKey: keys.session(id) })
                        }
                        onSkip={canReveal ? () => void reveal(item.id) : undefined}
                      />
                    ),
                  }}
                />
              ) : null}
              {open ? null : (
                <AnswerShell
                  action={{
                    bar: (
                      <BottomBar>
                        <Appear delay={120}>
                          <Btn size="lg" pill full onPress={next}>
                            {t('practice:next')}
                          </Btn>
                        </Appear>
                      </BottomBar>
                    ),
                  }}
                />
              )}
              <View style={{ height: 0 }} ref={measured.endRef} />
            </View>
          </AskRoute.Provider>
        </FreeSpaceReport.Provider>
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

      {/* A judgement she disagrees with (issue #164): the question and its mark go, and
          her learning state goes back to what it was before this answer. */}
      <DisputeVerdictSheet
        visible={disputeOpen}
        busy={busy}
        onClose={() => setDisputeOpen(false)}
        onConfirm={() => void dispute()}
      />
    </Screen>
  );
}
