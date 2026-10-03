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
  isStructuredKind,
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
import type { TFunction } from 'i18next';
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
import { AnswerComposer } from '../../components/practice/AnswerComposer.js';
import { CardPass } from '../../components/practice/CardPass.js';
import { BottomBar } from '../../components/practice/BottomBar.js';
import { ChoiceList, SpokenChoiceBar } from '../../components/practice/ChoiceList.js';
import {
  canDisputeVerdict,
  DisputeVerdictButton,
  DisputeVerdictSheet,
} from '../../components/practice/DisputeVerdict.js';
import { FractionBarAnswer } from '../../components/practice/FractionBarAnswer.js';
import { HearText, HeardTextCard } from '../../components/practice/HearText.js';
import { HelpChips } from '../../components/practice/HelpChips.js';
import { ItemThread } from '../../components/practice/ItemThread.js';
import { ListenButton } from '../../components/practice/ListenButton.js';
import {
  emptyStaffAnswer,
  StaffAnswer,
  staffComplete,
  staffLineOf,
  type StaffAnswerState,
} from '../../components/practice/StaffAnswer.js';
import { FreeSpace, FreeSpaceReport } from '../../components/practice/FreeSpace.js';
import { StructuredAnswer } from '../../components/practice/StructuredAnswer.js';
import { TopEdgeFade, topEdgeMask, topEdgeMaskFrom } from '../../components/lb/EdgeFade.js';
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
import { reacted, tapped } from '../../lib/perf.js';
import { bottomRoom, SPACE } from '../../lib/theme/space.js';

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

/**
 * How far a drawing or photo may shrink below its own cap so Buddy's newest turn shows whole
 * (issue #286); figureScale.ts still keeps a drawing legible.
 */
const CARD_GIVES = 48;

/** The conversation's padding above its first turn (its content container's paddingVertical). */
const THREAD_PAD = 12;

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
            // Options that are pictures are not read by their texts: the text may be the
            // very formula the question asks about (issue #231). They are seen, and a screen
            // reader hears each one described.
            item.kind === 'multiple_choice' && !item.choice_figures ? item.choices : null,
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
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();

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
  /**
   * The listening texts she has already heard in this run, by their recording's alias (issue
   * #210). Three questions about one text share it, so the second one offers "nochmal hören"
   * instead of announcing a text that is not new. It lives here, above the question, because
   * that is where the run is: a component keyed by the question would forget it every time.
   */
  const [heardTexts, setHeardTexts] = useState<ReadonlySet<string>>(() => new Set());
  /**
   * Die Notenzeile, die sie geschrieben hat, und zu welcher Frage (issue #226). Aus demselben
   * Grund an der Frage festgemacht wie die Anordnung darüber: die nächste Frage beginnt mit einer
   * leeren Zeile, und nichts Geschriebenes rutscht hinein.
   */
  const [written, setWritten] = useState<{ itemId: string; answer: StaffAnswerState } | null>(null);
  /** The pronunciation judgement while the model is still listening (issue #8). */
  const [speakLive, setSpeakLive] = useState<SpeakStreamEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [finishFailed, setFinishFailed] = useState(false);
  const [closing, setClosing] = useState(false);
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
  // A flashcard pass is not read aloud and never arms the mic: there is no answer to listen
  // for (issue #147). The card itself offers "Anhören" for the word, which is the control
  // that makes sense there.
  const toRead =
    onScreen && onScreen.status === 'open' && !session?.card_pass ? onScreen.item : null;
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
    session?.status === 'active' &&
    // Not while more questions are still being written (issue #220): she was faster than the
    // generator, and ending the run here would throw away the questions still on their way — the
    // server refuses it too, this only saves the pointless call.
    !session.preparing &&
    session.items.every((i) => i.status !== 'open');

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

  // ─────────────── a flashcard pass ───────────────

  if (session.card_pass) {
    return <CardPass session={session} title={title} onChange={store} onClose={close} />;
  }

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
              {/* Lernkarten statt tippen (issue #147): wo die Wiederholung ganz aus Vokabeln
                  besteht, geht sie als Karten durch — nicht NEBEN „nochmal üben", sondern an
                  seiner Stelle. Zwei Wege zum selben Ziel wären genau die Wahl, die die App
                  ihr abnehmen soll (Regel 16), und für zwanzig Wörter auf dem Handy ist
                  Tippen das, worüber der Owner sich beschwert hat. Der Server entscheidet,
                  wann das gilt (practice/cards.ts offersCardPass). */}
              {session.card_pass_offered ? (
                <Btn
                  size="lg"
                  variant="soft"
                  pill
                  icon="practice"
                  full
                  busy={busy}
                  onPress={() => void goThroughCards()}
                  accessibilityHint={t('practice:cards.offer_hint')}
                >
                  {t('practice:cards.offer')}
                </Btn>
              ) : session.mode !== 'help' && againTopics.length > 0 ? (
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
    // She answered the questions the run started with and the rest is still being written
    // (issue #220). Not a result and not an error — the next questions are on their way, and the
    // screen asks for them until they are there (`usePracticeSession`).
    if (active && session.preparing) {
      return (
        <Screen title={title}>
          <LoadingState label={t('practice:more_coming')} />
        </Screen>
      );
    }
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
  const choices =
    item.kind === 'multiple_choice' && item.choices && item.choices.length > 0
      ? item.choices
      : null;
  // Vocabulary she is recognising: her own words to tap, instead of typing every one of
  // them on a phone (issue #147). Not a different question — tapping one sends it as the
  // answer and the same rules grade it — but it IS the whole way to answer here: four
  // cards and a field would not fit a 360×740 phone without scrolling (rule 16), and
  // asking her to choose between two ways to say the same thing is the complexity this
  // app is supposed to carry for her. Producing the foreign word is still typed; the
  // server only offers tapping where she is recognising (practice/tapChoices.ts).
  const tapChoices =
    choices === null && item.tap_choices && item.tap_choices.length > 0 ? item.tap_choices : null;
  const speaking = item.kind === 'speak';
  // A structured item (issues #228–#230): ordering, matching, filling in a table. Its own surface
  // is the WHOLE way to answer — no answer field, not even for the table, whose writing happens
  // in its own cells; the server takes only `parts` for it.
  const structured = isStructuredKind(item.kind);
  // Die leere Notenzeile, auf die sie schreibt (issue #226). Wie eine Anordnung ist sie der GANZE Weg
  // zu antworten: ein Antwortfeld gibt es daneben nicht, und das eine „Prüfen“ steht darunter.
  // Der Bruchbalken bleibt der andere Fall derselben Fläche — er schreibt ins Feld, sie nicht.
  const staff = open && item.surface?.mode === 'notes' ? item.surface : null;
  const barSurface = open && item.surface && item.surface.mode !== 'notes' ? item.surface : null;
  const typed =
    open && choices === null && tapChoices === null && !structured && staff === null && !speaking;
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
    // Hörverstehen (issue #210): the text is heard, not read, so the way to hear it stands in
    // the same row as every other "read this aloud" — and it stays after the question closes,
    // next to the words of it, because listening again while reading is how it is reviewed.
    item.listen ? (
      <HearText
        key="hear"
        sessionId={session.id}
        itemId={item.id}
        heard={heardTexts.has(item.listen.ref)}
        onHeard={() => {
          const ref = item.listen?.ref;
          if (ref !== undefined)
            setHeardTexts((was) => (was.has(ref) ? was : new Set(was).add(ref)));
        }}
        disabled={locked}
      />
    ) : null,
  ].filter((node) => node !== null);

  // A judgement she has been given and may disagree with (issue #164). The rule and the copy
  // live in components/practice/DisputeVerdict.tsx, where a component test holds them.
  const disputeButton = canDisputeVerdict({
    open,
    sessionStatus: session.status,
    testing,
    mode: session.mode,
    origin: item.origin,
  }) ? (
    <DisputeVerdictButton
      disabled={locked}
      onPress={() => {
        setDisputeFor(item.id);
        setDisputeOpen(true);
      }}
    />
  ) : null;

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

  // The conversation shows WHOLE turns only (issue #286). It may take its own box plus the free
  // room under the answer (`FreeSpace`) — that sum does not change while the box is sized, so the
  // measurement is stable. If everything fits, everything shows. Otherwise the box starts at the
  // earliest turn from which the rest still fits, so at rest the top edge lies in the gap above
  // a whole turn — nothing of the turn before peeks out under the question card. Earlier turns
  // are a scroll up away; the edge then fades (#63, `scrolledUp` below). Never less than the
  // newest turn: after "Prüfen" Buddy's reply is what matters, and the way to answer gives way
  // first (a structured board scrolls inside itself before the reply is hidden). Only when the
  // newest turn alone is taller than the room is it cut, under the full fade (rule 16 allows a
  // conversation to scroll). A question card with a drawing lends its growth back to the
  // conversation (`cardDelta`, also negative when the drawing gave room), so the room counts it.
  // Per question AND per window: a narrower phone wraps the prompt onto another line and gives
  // the drawing a smaller cap, so its own height measured on another size is wrong here.
  const naturalKey = `${item.id}:${windowWidth}x${windowHeight}`;
  const cardNatural = natural?.key === naturalKey ? natural.height : 0;
  const cardDelta = cardNatural > 0 ? cardHeight - cardNatural : 0;
  // When something below grows (the voice bar, the keyboard's room) and the column runs past
  // its end, that overrun comes off the room too — a grown card gives it back first.
  // Two ways to see it: past the column's own end (phones, where a flex child may shrink below
  // its content), and past the window (the web, where the column grows with its content and the
  // page itself would scroll).
  const overrun =
    column > 0
      ? Math.max(0, columnEnd - column, columnTop > 0 ? columnTop + columnEnd - windowHeight : 0)
      : 0;
  // What the conversation would have next to the card at its own height.
  const room = Math.max(0, threadBox + freeSpace + cardDelta - overrun);
  // How much each turn needs to the end of the conversation, newest last. The tops are in
  // ItemThread's coordinates; it starts after the thread's padding.
  const tops = turns.map((turn) => turnTops[turn.id]).filter((y): y is number => y !== undefined);
  // From a turn's top, with SPACE.sm of the gap above it, to the end of the conversation.
  const fromTurn = tops
    .map((y) => threadNeed - (THREAD_PAD + y) + SPACE.sm)
    .filter((h) => h < threadNeed);
  // Before the first turn the conversation is only the hint row ("Tipp"): nothing of Buddy's
  // to protect, so at the largest board it gives way whole — never half a row (as before #286).
  const quiet = turns.length === 0;
  const newestNeed = fromTurn.length > 0 ? Math.min(...fromTurn) : quiet ? 0 : threadNeed;
  let threadCap: number | undefined;
  let threadClipped = false;
  // An open structured board shrinks (`PartsArea` scrolls) before Buddy's reply is hidden.
  const boardGives = open && item.task_view !== null && item.task_view !== undefined;
  // A quiet thread decides even at room 0 — else the row would come back half and flicker.
  if ((room > 0 || quiet) && threadNeed > 0) {
    if (threadNeed <= room) {
      threadCap = threadNeed;
    } else if (quiet) {
      threadCap = 0;
    } else {
      const fits = fromTurn.filter((h) => h <= room);
      // The newest turn alone does not fit: it keeps its full height only where a board can
      // give way under it (a structured surface scrolls inside itself); with nothing to give
      // — choices, a field, the voice bar — it is cut to the room under the fade instead of
      // pushing the bar off the screen.
      threadCap =
        fits.length > 0 ? Math.max(...fits) : boardGives ? Math.max(room, newestNeed) : room;
      threadClipped = fits.length === 0 && newestNeed > room;
    }
  }
  const threadFloor = boardGives ? Math.min(newestNeed, threadNeed) : 0;

  // The card with a drawing or photo and the conversation share the room (issue #96, #286).
  // What the conversation leaves, the card grows into (`cardGrowTo` > 0: its figure sizes itself
  // from the measured room, at most to half the window) instead of an empty gap under the answer.
  // When Buddy's newest turn would be cut, the drawing gives room first (`cardGrowTo` < 0: a
  // lower cap, down to its legible minimum, lib/math/figureScale.ts) — a reply half under the
  // card read as a fault. The room is the same sum whatever the card does, so both settle in one
  // pass, and a new reply or a taller bar takes its room back from the card first.
  const visual = cardNatural > 0 && (item.figure || item.image) && !speaking;
  const threadWants =
    threadCap === undefined || !threadClipped ? (threadCap ?? threadNeed) : newestNeed;
  const cardGrowTo = visual
    ? Math.max(
        -CARD_GIVES,
        Math.min(room - threadWants, Math.round(windowHeight * 0.5) - cardNatural),
      )
    : 0;
  if (cardGrowTo < 0 && threadCap !== undefined && !boardGives) {
    // The room the drawing really gave (measured, `cardDelta`: at its legible minimum it may
    // give less than asked) goes to the newest turn; whatever is still missing is cut.
    threadCap = Math.min(threadWants, Math.max(room, room - cardDelta));
    threadClipped = threadCap < newestNeed;
  }
  // Something lies above what the box shows: its top edge fades (#63).
  const threadHolds = threadClipped || (threadCap !== undefined && threadCap < threadNeed);

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
                <ProgressRow
                  position={session.items.indexOf(shown) + 1}
                  total={session.items.length}
                  closed={session.items.filter((i) => i.status !== 'open').length}
                  // The server's word, never the app's guess: while it says more questions are coming,
                  // the total is not the number it will be (issue #220).
                  preparing={session.preparing}
                  right={flagButton ?? disputeButton}
                />
                {session.mode === 'help' || testing ? (
                  <Text style={[TYPE.small, { color: palette.primaryDk, fontWeight: '500' }]}>
                    {t(testing ? 'practice:test_note' : 'practice:help_note')}
                  </Text>
                ) : null}
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
                  ) : (
                    <QuestionCard
                      prompt={item.prompt}
                      topic={item.topic}
                      figure={item.figure}
                      figureMaxHeight={Math.round(windowHeight * 0.14) + Math.min(0, cardGrowTo)}
                      image={item.image}
                      imageKey={item.id}
                      imageMaxHeight={
                        Math.min(180, Math.round(windowHeight * 0.2)) + Math.min(0, cardGrowTo)
                      }
                      fromBuddy={item.origin === 'buddy'}
                      minHeight={cardGrowTo > 0 ? cardNatural + cardGrowTo : undefined}
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
                      turns={turns}
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
            {open && choices ? (
              // No room of its own above the options (issue #288): the hint row's touch height
              // already sets them apart, and 8 pt more was a gap and cost the second row of
              // pictures its place on 360×740.
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingBottom: voiceOn ? 0 : bottomRoom(insets.bottom, SPACE.md),
                }}
              >
                <ChoiceList
                  choices={choices}
                  figures={item.choice_figures}
                  tried={tried}
                  disabled={locked}
                  onChoose={(index, choice) => void answer(item.id, { choice: index }, choice)}
                />
              </View>
            ) : null}
            {open && tapChoices ? (
              <View style={{ paddingHorizontal: 16 }}>
                <ChoiceList
                  choices={tapChoices}
                  tried={tried}
                  disabled={locked}
                  // The word goes as if she had typed it: same grading, same key (issue #147).
                  onChoose={(_index, choice) =>
                    void answer(item.id, { text: choice, via: 'tapped' }, choice)
                  }
                />
              </View>
            ) : null}
            {/* A structured item's parts (issues #228–#230): one surface per kind, each with its
            own "Prüfen" in the pinned bar and its arrangement in a draft, so a theme switch
            (a remount) keeps it. Keyed by the question, so a new one starts empty. */}
            {open && item.task_view ? (
              <View testID="answer-surface" style={{ flexGrow: 1, flexShrink: 1, minHeight: 0 }}>
                <StructuredAnswer
                  key={item.id}
                  view={item.task_view}
                  draftKey={`session.${id}.${item.id}`}
                  disabled={locked}
                  onSubmit={(parts, shownText) => void answer(item.id, { parts }, shownText)}
                />
              </View>
            ) : null}
            {/* Die Notenzeile, auf die sie schreibt (issue #226). Sie steht, wo sonst eine Anordnung
            oder das Antwortfeld steht, und gibt als Erstes Platz her: die gemessene Höhe
            und was sie kostet, stehen in `StaffAnswer.tsx`. */}
            {staff ? (
              <View
                testID="answer-staff"
                style={{ flexShrink: 1, minHeight: 0, paddingTop: SPACE.sm }}
              >
                <ScrollView
                  testID="scroll-list"
                  style={{ flexGrow: 0, flexShrink: 1 }}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingHorizontal: SPACE.lg }}
                >
                  <StaffAnswer
                    key={item.id}
                    surface={staff}
                    answer={staffAnswer}
                    disabled={locked}
                    onChange={(next) => setWritten({ itemId: item.id, answer: next })}
                  />
                </ScrollView>
              </View>
            ) : null}
            {/* The free room (issue #286): below the way to answer, above what is pinned. A structured
            surface carries its own, between its board and its "Prüfen" (`PartsArea`). */}
            {open && item.task_view ? null : <FreeSpace />}
            {/* The fraction bar she works with (issue #162). It sits where her finger already
            is — right above the field — and it writes into that very field, so "Prüfen",
            the math keys and typing stay exactly what they were. A picked bar goes out at
            once, like a choice. */}
            {barSurface ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 8 }} testID="answer-surface">
                <FractionBarAnswer
                  surface={barSurface}
                  value={text}
                  disabled={locked}
                  onChange={(next) => {
                    setShadedAnswer({ itemId: item.id, text: next });
                    setText(next);
                  }}
                  onPick={(picked) => void answer(item.id, { text: picked, via: 'tapped' }, picked)}
                />
              </View>
            ) : null}
            {staff ? (
              <BottomBar>
                <Btn
                  size="lg"
                  pill
                  full
                  // Nichts zu prüfen, solange ein Takt noch leer ist: eine halb geschriebene Zeile
                  // wäre eine Antwort, die noch nicht gegeben wurde.
                  disabled={locked || !staffComplete(staffAnswer)}
                  onPress={() => {
                    tapped('check');
                    const line = staffLineOf(staffAnswer);
                    // Kein `via: 'tapped'`, obwohl sie getippt hat: `via` unterscheidet
                    // WIEDERERKENNEN von PRODUZIEREN (issue #163), und hier ist nichts
                    // wiedererkannt. Ein Wort aus vier eigenen anzutippen ist leichter, als es zu
                    // schreiben; eine Notenzeile selbst zu setzen ist genau das, was die
                    // Klassenarbeit verlangt — mit einem Stift statt mit dem Finger. Dasselbe
                    // Argument, das `summary.ts` für die mehrteiligen Antworten führt.
                    void answer(item.id, { text: line }, line);
                  }}
                >
                  {t('practice:check')}
                </Btn>
              </BottomBar>
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
                onText={(said) => void answer(item.id, { text: said, via: 'spoken' }, said)}
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
                onOutdated={() =>
                  void queryClient.invalidateQueries({ queryKey: keys.session(id) })
                }
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
