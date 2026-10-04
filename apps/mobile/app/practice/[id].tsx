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
  type PracticeTurnView,
  type ReexplainWay,
  type SessionItemView,
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
import { Icon } from '../../components/lb/Icon.js';
import { EmptyState } from '../../components/lb/EmptyState.js';
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
import { FractionBarAnswer } from '../../components/practice/FractionBarAnswer.js';
import { DictationCard } from '../../components/practice/DictationCard.js';
import { HeardTextCard } from '../../components/practice/HearText.js';
import { HelpChips } from '../../components/practice/HelpChips.js';
import { ItemThread } from '../../components/practice/ItemThread.js';
import { ListenButton } from '../../components/practice/ListenButton.js';
import { QuestionCorner } from '../../components/practice/QuestionCorner.js';
import { QuestionTools } from '../../components/practice/QuestionTools.js';
import {
  emptyStaffAnswer,
  readStaffDraft,
  type StaffDraft,
} from '../../components/practice/StaffAnswer.js';
import { StaffWriting } from '../../components/practice/StaffWriting.js';
import { FreeSpaceReport } from '../../components/practice/FreeSpace.js';
import { AnswerShell } from '../../components/practice/AnswerShell.js';
import { StructuredAnswer } from '../../components/practice/StructuredAnswer.js';
import { TopEdgeFade, topEdgeMask, topEdgeMaskFrom } from '../../components/lb/EdgeFade.js';
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
  disputeVerdict,
  deferItem,
  finishSession,
  flagItem,
  hintItem,
  reexplainItem,
  revealItem,
  startCardPass,
} from '../../lib/api/endpoints.js';
import { keys, queryClient, seedSession, usePracticeSession } from '../../lib/api/queries.js';
import { useDraft } from '../../lib/drafts.js';
import { messageFor } from '../../lib/errors.js';
import { currentLocale } from '../../lib/i18n/index.js';
import { questionParts } from '../../lib/practice/questionParts.js';
import { answerForm } from '../../lib/practice/answerForm.js';
import { useFinishWhenDone } from '../../lib/practice/finishWhenDone.js';
import { useHeardTexts } from '../../lib/practice/heardTexts.js';
import { boardKeeps, threadRoom } from '../../lib/practice/threadRoom.js';
import { announce } from '../../lib/announce.js';
import { haptic } from '../../lib/haptics.js';
import { speakInOrder, stop as stopListening } from '../../lib/speech/listen.js';
import { feedbackReadText, spokenText } from '../../lib/speech/spoken.js';
import { baseLanguage } from '../../lib/speech/voice.js';
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

/** A language other than the app's: worth hearing read aloud (vocab prompts and answers). */
function foreign(lang: string | null): lang is string {
  const base = baseLanguage(lang);
  return base !== null && base !== currentLocale();
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
  const { width: windowWidth } = useWindowDimensions();
  // What she can see, keyboard or not: with it up the window keeps its height (edge-to-edge),
  // and caps taken from the window grew the card into the room the conversation needed — its
  // newest turn then stood half under the card (issue #289, second case).
  const viewHeight = useVisibleHeight().visible;

  const [pinnedId, setPinnedId] = useState<string | null>(null);
  // Kept on the device: a half-typed answer survives Android killing the app.
  const { text, setText } = useDraft(`session.${id}`);
  const [pending, setPending] = useState<{ itemId: string; text: string } | null>(null);
  /**
   * What the fraction bar wrote into the answer field, and for which question (issue #162).
   * Only so the server hears HOW she answered (issue #163): the same text typed is a
   * different thing from the same text shaded. Once she edits it — or the next question
   * happens to want the same fraction — it is hers again.
   */
  const [shadedAnswer, setShadedAnswer] = useState<{ itemId: string; text: string } | null>(null);
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
  // conversation can show whole turns in the room there is (issue #286, `threadCap`).
  /** The conversation's box and the free room under the answer (issue #286, `threadCap`). */
  const [threadBox, setThreadBox] = useState(0);
  const [freeSpace, setFreeSpace] = useState(0);
  const [turnTops, setTurnTops] = useState<Readonly<Record<string, number>>>({});
  const [threadNeed, setThreadNeed] = useState(0);
  const [questionContentHeight, setQuestionContentHeight] = useState(0);
  /** The question card as laid out, and its own height before it grew (issue #96). */
  const [cardHeight, setCardHeight] = useState(0);
  /** The structured board's height as laid out; null until it has been (issue #232). */
  const [surfaceHeight, setSurfaceHeight] = useState<number | null>(null);
  const [natural, setNatural] = useState<{ key: string; height: number } | null>(null);
  /** The column's height and where its content ends: what runs past is `overrun`. */
  const [column, setColumn] = useState(0);
  const [columnEnd, setColumnEnd] = useState(0);
  const [columnTop, setColumnTop] = useState(0);
  const columnRef = useRef<View>(null);
  /** She scrolled the conversation up from its end: its top edge fades fully (#63). */
  const [scrolledUp, setScrolledUp] = useState(false);
  const working = useRef(false);
  const lastSent = useRef<SentAnswer | null>(null);
  const scroll = useRef<ScrollView>(null);

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

  /**
   * "Die Wörter als Karten durchgehen" (issue #147): the server picks the words of this
   * finished run that did not sit and opens the pass in place of the result — the result has
   * been read by then, and the pass is where she is now.
   */
  async function goThroughCards(): Promise<void> {
    if (working.current) return;
    working.current = true;
    haptic.tap();
    setBusy(true);
    try {
      const pass = await startCardPass(id);
      seedSession(pass);
      router.replace(`/practice/${pass.id}`);
    } catch (err) {
      toast.show(messageFor(err), 'error');
    } finally {
      working.current = false;
      setBusy(false);
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
    const parts = 'parts' in input ? JSON.stringify(input.parts) : null;
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
      if (isOutdated(err)) {
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
      if (isOutdated(err)) void queryClient.invalidateQueries({ queryKey: keys.session(id) });
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
      if (isOutdated(err)) void queryClient.invalidateQueries({ queryKey: keys.session(id) });
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
      if (isOutdated(err)) void queryClient.invalidateQueries({ queryKey: keys.session(id) });
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
      if (isOutdated(err)) void queryClient.invalidateQueries({ queryKey: keys.session(id) });
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  /**
   * "Die Bewertung stimmt nicht" confirmed (issue #164). Different from "Frage passt
   * nicht", which is about an unfit question while it is still open: this is about a
   * judgement she has already been given and disagrees with. The question leaves the
   * result and future practice, and her learning state goes back to what it was.
   */
  async function dispute(): Promise<void> {
    const itemId = disputeFor;
    if (!itemId || working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await store(await disputeVerdict(id, itemId));
      setDisputeOpen(false);
      setPinnedId(null);
      setText('');
      lastSent.current = null;
      Keyboard.dismiss();
      toast.show(t('practice:dispute.done'));
    } catch (err) {
      setDisputeOpen(false);
      toast.show(messageFor(err), 'error');
      if (isOutdated(err)) void queryClient.invalidateQueries({ queryKey: keys.session(id) });
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
      if (isOutdated(err)) void queryClient.invalidateQueries({ queryKey: keys.session(id) });
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
      const canRetry = isRetryable(query.error);
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
  // A free text has no solution to show, so the way past it is named for what it does
  // (issue #197) — "Lösung zeigen" would promise something the server does not send.
  const skipLabel =
    testing || shown.item.kind === 'long'
      ? t('practice:skip')
      : canPostpone && !shown.reveal_available
        ? t('practice:later')
        : undefined;
  const skipHint = canPostpone && !testing ? t('practice:later_hint') : undefined;
  const hint = shown.hint_available ? () => void askHint(shown.item.id) : undefined;
  const endButton = (
    // Stays while a question is on screen, also once the session was finished in the
    // background (finishing again is a no-op) – the header must not jump under the reader.
    //
    // "Beenden" is a round ✕ beside the speaker, both 44 pt: the header title is one line
    // (components/lb/Screen.tsx, issue #287) and a worded pill left it ~125 pt at 360 wide —
    // the topic came out as "Flächeninhalt Rec…" (issue #286). The words stay with a screen
    // reader ("Übung beenden") and the hint says where it leads.
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
      <VoiceModeToggle />
      <Btn
        variant="outline"
        size="sm"
        pill
        // compact (12 each side) + the 20 pt icon = 44: a circle, like the speaker.
        compact
        label={<Icon name="close" size={20} color={closing ? palette.ink2 : palette.ink} />}
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
  // A Diktat shows only her latest try and what followed it (issue #242): each try replaces the
  // last, and three tries with three replies, the word and the follow-ups do not fit under the
  // card on 360×740 — an older bubble would sit half cut under its edge (review of #286).
  const lastTry = turns.map((turn) => turn.role).lastIndexOf('learner');
  const threadTurns =
    item.kind === 'spelling_dictation' && lastTry > 0 ? turns.slice(lastTry) : turns;
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
    (shown.answer !== null ||
      (session.mode === 'help' && shown.status === 'correct') ||
      // A free text sends no answer (issue #197) — but asking about her own text again is
      // exactly where it helps most, so the offer stays.
      shown.item.kind === 'long');
  const pendingText = pending?.itemId === item.id ? pending.text : null;
  // Once there is a conversation the Diktat card is one row (DictationCard `compact`).
  const dictationCompact = itemTurns.length > 0 || pendingText !== null;
  // Which way she answers — exactly one (`answerForm`).
  const { choices, tapChoices, speaking, structured, staff, barSurface, typed } = answerForm(
    item,
    open,
  );
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
  // Only a question from a photo or from Buddy; never homework, never during a test.
  const flaggable =
    open &&
    session.status === 'active' &&
    session.mode !== 'help' &&
    !testing &&
    (item.origin === 'material' || item.origin === 'buddy');

  function check(value: string): void {
    // A shaded bar is a tap, even though "Prüfen" sends it (issue #163).
    const shaded = shadedAnswer?.itemId === item.id && shadedAnswer.text === value;
    if (value) void answer(item.id, { text: value, via: shaded ? 'tapped' : 'typed' }, value);
  }

  // A foreign vocabulary word has its own "Anhören" (its pronunciation is the point); that IS
  // its read-aloud button, so it never gets a second one.
  const hearWord = item.kind === 'vocab' && foreign(item.prompt_lang);
  // "Vorlesen" at every question, also without voice mode (issue #238): the round speaker in the
  // question's progress row, right above the card (ReadQuestionButton). That row is 44 pt tall
  // anyway ("Frage passt nicht"), so the speaker costs no height; inside the card it narrowed the
  // "Frage von Buddy · topic" line or the prompt by a line and pushed a structured question's
  // parts off a 360×740 phone (rule 16). Only where the server allows it (`read_aloud`, decided by
  // code), only while the question is open, and not where another control already reads it —
  // voice mode's "Nochmal vorlesen", the pronunciation card's own "Anhören", the foreign word's
  // "Anhören". What it says is what voice mode says: math, fractions and formulas in words,
  // choices as "A: …, B: …". Keyed by the question, so a new question never inherits a reading
  // that is still running: the old button goes away and stops it.
  const readOut =
    !voiceOn && open && item.read_aloud && !speaking && !hearWord
      ? (questionParts(item, words, t)[0] ?? null)
      : null;

  // How the conversation and the card share the room (issues #96, #286, #232): `threadRoom`.
  // Per question AND per window: a narrower phone wraps the prompt onto another line and gives
  // the drawing a smaller cap, so its own height measured on another size is wrong here.
  const naturalKey = `${item.id}:${windowWidth}x${viewHeight}`;
  const cardNatural = natural?.key === naturalKey ? natural.height : 0;
  const cardDelta = cardNatural > 0 ? cardHeight - cardNatural : 0;
  // When something below grows (the voice bar, the keyboard's room) and the column runs past
  // its end, that overrun comes off the room too — a grown card gives it back first.
  // Two ways to see it: past the column's own end (phones, where a flex child may shrink below
  // its content), and past the window (the web, where the column grows with its content and the
  // page itself would scroll).
  const overrun =
    column > 0
      ? Math.max(0, columnEnd - column, columnTop > 0 ? columnTop + columnEnd - viewHeight : 0)
      : 0;
  // What the conversation would have next to the card at its own height.
  const room = Math.max(0, threadBox + freeSpace + cardDelta - overrun);
  // An open structured board gives way under Buddy's reply, down to what it keeps (#232).
  const boardGives = open && item.task_view !== null && item.task_view !== undefined;
  const { threadCap, threadFloor, threadClipped, threadHolds, cardGrowTo } = threadRoom({
    room,
    threadNeed,
    // The tops are in ItemThread's coordinates; it starts after the thread's padding.
    tops: threadTurns.map((turn) => turnTops[turn.id]).filter((y): y is number => y !== undefined),
    quiet: turns.length === 0,
    boardGives,
    boardSpare:
      boardGives && surfaceHeight !== null
        ? Math.max(0, surfaceHeight - boardKeeps(insets.bottom))
        : Infinity,
    cardNatural,
    cardDelta,
    visual: cardNatural > 0 && Boolean(item.figure || item.image) && !speaking,
    growable: item.figure?.type !== 'staff',
    // A Diktat card before her first answer holds only the way to hear the word (issue #242): it
    // takes all the room the conversation does not use, so no empty band is left under it (#286).
    fills: cardNatural > 0 && item.kind === 'spelling_dictation' && !dictationCompact,
    viewHeight,
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
      itemId={item.id}
      read={readOut}
      flaggable={flaggable}
      // A judgement she has been given and may disagree with (issue #164). The
      // rule and the copy live in components/practice/DisputeVerdict.tsx.
      canDispute={canDisputeVerdict({
        open,
        sessionStatus: session.status,
        testing,
        mode: session.mode,
        origin: item.origin,
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
        <FreeSpaceReport.Provider value={setFreeSpace}>
          {/* The column, measured: its end mark (below) says how far its content runs past it. */}
          <View
            style={{ flex: 1, minHeight: 0 }}
            ref={columnRef}
            onLayout={(e) => {
              setColumn(Math.round(e.nativeEvent.layout.height));
              columnRef.current?.measureInWindow((_x, y) => setColumnTop(Math.round(y)));
            }}
          >
            <View
              style={{
                // The question and the conversation take what they need, no more: the way to answer
                // stands right under them, and the free room collects below it (`FreeSpace`, issue
                // #286). The question never shrinks; the conversation does, by whole turns
                // (`threadCap`).
                flexGrow: 0,
                flexShrink: 1,
                minHeight: questionContentHeight + threadFloor,
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
                onContentSizeChange={(_, h) => setQuestionContentHeight(Math.round(h))}
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
                  onLayout={(e) => {
                    const h = Math.round(e.nativeEvent.layout.height);
                    setCardHeight(h);
                    // Its own height before it grows: measured only while it has no minHeight.
                    // (While it shrinks back its height lags a render behind; taking that as its
                    // own height made it never give the room back. A picture that loads while it
                    // is grown pushes the column past its end — the overrun takes the growth
                    // away, and then it measures itself again.)
                    if (cardGrowTo === 0) setNatural({ key: naturalKey, height: h });
                  }}
                >
                  {speaking ? (
                    <SpeakCard item={item} turns={turns} live={speakLive} sessionId={session.id} />
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
                      topic={item.topic}
                      figure={item.figure}
                      figureMaxHeight={Math.round(viewHeight * 0.14) + Math.min(0, cardGrowTo)}
                      image={item.image}
                      imageKey={item.id}
                      imageMaxHeight={
                        Math.min(180, Math.round(viewHeight * 0.2)) + Math.min(0, cardGrowTo)
                      }
                      fromBuddy={item.origin === 'buddy'}
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
              {/* minHeight 0: on the web a flex child's min-height is its content, and the
              conversation then SQUEEZES the question below its own content instead of
              scrolling itself (issue #96 — 39 px overflow in voice mode; Yoga on the
              phones already defaults to 0). The conversation is the one that scrolls. */}
              <View
                style={{ flexShrink: 1, minHeight: threadFloor, maxHeight: threadCap }}
                onLayout={(e) => setThreadBox(Math.round(e.nativeEvent.layout.height))}
              >
                <ScrollView
                  ref={scroll}
                  testID="scroll-thread"
                  // The fade only where the box holds more than it shows (`threadHolds`).
                  // At rest on a whole turn the fade covers only the gap above it (SPACE.sm);
                  // scrolled up, or cut, it is the full EDGE_FADE over what passes the edge.
                  style={[
                    { flexGrow: 0, flexShrink: 1 },
                    threadHolds
                      ? scrolledUp || threadClipped
                        ? topEdgeMask
                        : topEdgeMaskFrom(0, SPACE.sm)
                      : null,
                  ]}
                  scrollEventThrottle={64}
                  onScroll={(e) => {
                    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                    const up =
                      contentSize.height - (contentOffset.y + layoutMeasurement.height) > 4;
                    if (up !== scrolledUp) setScrolledUp(up);
                  }}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{
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
                      turns={threadTurns}
                      pending={pendingText}
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
                      onTurnTops={setTurnTops}
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
                    {item.kind === 'vocab' &&
                    !open &&
                    shown.answer !== null &&
                    foreign(item.lang) ? (
                      <ListenButton text={shown.answer} lang={item.lang} />
                    ) : null}
                    {/* What the Hörtext said, once the question is closed (issue #210). The server
                    sends it under exactly the condition it sends the solution under. */}
                    {shown.listen_transcript !== null ? (
                      <Rise delay={180}>
                        <HeardTextCard text={shown.listen_transcript} />
                      </Rise>
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
                        // A spoken sentence has no solution to show — it stands in the card, and
                        // the bar under it already offers the one way past it ("Diesmal
                        // überspringen", which is this very `reveal` call). Two names in two
                        // shapes for one action, on opposite sides of the screen, was half of
                        // why this screen felt unlike the rest (issue #186). In a running test
                        // the bar has no way out, so there the chip stays.
                        onReveal={speaking && canReveal ? undefined : skip}
                        revealLabel={skipLabel}
                        revealHint={skipHint}
                        disabled={locked}
                      />
                    ) : null}
                  </View>
                </ScrollView>
                {/* What scrolls up under the question fades out instead of peeking out (finding 8). */}
                {threadHolds && (scrolledUp || threadClipped) ? <TopEdgeFade /> : null}
              </View>
            </View>
            {/* Options she taps (issue #288), in the answer shell like every form (issue #310): flush
            under the Tipp row, the free room below, and in voice mode the spoken answer where
            "Prüfen" stands for the others. Tapped words go as if she had typed them: same
            grading, same key (issue #147). */}
            {open && (choices || tapChoices) ? (
              <AnswerShell
                keeps="whole"
                flush
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
                        onText={(said) => void answer(item.id, { text: said, via: 'spoken' }, said)}
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
                onLayout={(e) => setSurfaceHeight(Math.round(e.nativeEvent.layout.height))}
              >
                <StructuredAnswer
                  key={item.id}
                  view={item.task_view}
                  draftKey={`session.${id}.${item.id}`}
                  disabled={locked}
                  onSubmit={(body, shownText) => void answer(item.id, body, shownText)}
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
                // The fraction bar she works with (issue #162). It stands under the question like
                // every board and writes into the input bar at the bottom, so "Prüfen", the math
                // keys and typing stay exactly what they were. A picked bar goes out at once.
                surface={
                  barSurface ? (
                    <View testID="answer-surface">
                      <FractionBarAnswer
                        surface={barSurface}
                        value={text}
                        disabled={locked}
                        onChange={(next) => {
                          setShadedAnswer({ itemId: item.id, text: next });
                          setText(next);
                        }}
                        onPick={(picked) =>
                          void answer(item.id, { text: picked, via: 'tapped' }, picked)
                        }
                      />
                    </View>
                  ) : null
                }
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
            <View
              style={{ height: 0 }}
              onLayout={(e) => setColumnEnd(Math.round(e.nativeEvent.layout.y))}
            />
          </View>
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
