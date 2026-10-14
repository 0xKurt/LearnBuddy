import { CheckOverrideProvider } from '../../components/practice/CheckOverride.js';
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
// Vorlesen (the speaker switch in the header, the chat's, issue #386): each new
// question is read aloud (choices as "A: …, B: …", a vocab prompt in its own
// language), and so is Buddy's reply with the verdict word after every answer.
// Gespräch (the waveform in the input bar) reads aloud too, and the bar becomes the
// conversation row with the mic in the middle (`CheckBar`), and as on /talk the mic
// listens by itself once the question has been read; reading stops when she starts
// speaking or leaves.
//
// This file puts the screen together (issue #311); each part has one job:
//   · lib/practice/usePracticeActions — what she does with the question, each a server call;
//   · lib/practice/usePracticeDrafts, usePracticeVoice — what she writes, what is heard;
//   · lib/practice/useSessionEnd, useCornerConfirm — the run's end, the corner's sheet;
//   · lib/practice/questionView, screenRoom — what the question shows, how the room is shared;
//   · components/practice/QuestionProgress, ItemCard, QuestionThread, AnswerArea, NoQuestion —
//     what is drawn.

import type { SpeakStreamEvent } from '@learnbuddy/shared-types/contracts';
import { useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardSafe } from '../../components/lb/KeyboardSafe.js';
import { SlideIn } from '../../components/lb/Motion.js';
import { Screen } from '../../components/lb/Screen.js';
import { PracticeSkeleton } from '../../components/lb/Skeletons.js';
import { AnswerArea } from '../../components/practice/AnswerArea.js';
import { CardPass } from '../../components/practice/CardPass.js';
import { AskRoute } from '../../components/practice/CheckBar.js';
import { Reexplain } from '../../components/practice/Reexplain.js';
import { DURATION } from '../../lib/theme/motion.js';
import { DrillRound } from '../../components/practice/DrillRound.js';
import { FreeSpaceReport } from '../../components/practice/FreeSpace.js';
import { ItemCard } from '../../components/practice/ItemCard.js';
import { NoQuestion } from '../../components/practice/NoQuestion.js';
import { PracticeStuck } from '../../components/practice/PracticeStuck.js';
import { CornerSheet } from '../../components/practice/QuestionCorner.js';
import { RunMeta } from '../../components/lb/QuestionCard.js';
import {
  HomeworkHint,
  clockTail,
  progressLine,
  QuestionMenu,
  QuestionProgress,
  testMeta,
} from '../../components/practice/QuestionProgress.js';
import { useTestClock } from '../../components/practice/TestClock.js';
import { QuestionHelp, QuestionThread } from '../../components/practice/QuestionThread.js';
import { AnswerFlow } from '../../components/practice/AnswerShell.js';
import { QuestionTools } from '../../components/practice/QuestionTools.js';
import { useSpeakPhase } from '../../components/practice/SpeakPanel.js';
import { isRetryable } from '../../lib/api/apiError.js';
import { usePracticeSession } from '../../lib/api/queries.js';
import { practiceHeadState } from '../../lib/buddy/headState.js';
import { messageFor } from '../../lib/errors.js';
import { isForeign } from '../../lib/i18n/index.js';
import { FigureSizingReport } from '../../lib/math/figureSizing.js';
import { answerForm } from '../../lib/practice/answerForm.js';
import { useHeardTexts } from '../../lib/practice/heardTexts.js';
import { questionOffers, questionOnScreen } from '../../lib/practice/offers.js';
import { questionView } from '../../lib/practice/questionView.js';
import { PictureRoom, useScreenRoom } from '../../lib/practice/screenRoom.js';
import { useCornerConfirm } from '../../lib/practice/useCornerConfirm.js';
import { usePracticeActions } from '../../lib/practice/usePracticeActions.js';
import { usePracticeDrafts } from '../../lib/practice/usePracticeDrafts.js';
import { usePracticeVoice } from '../../lib/practice/usePracticeVoice.js';
import { backToBuddy, useSessionEnd } from '../../lib/practice/useSessionEnd.js';
import { SPACE } from '../../lib/theme/space.js';
import { useVisibleHeight } from '../../lib/useVisibleHeight.js';

export default function PracticeScreen() {
  const { t } = useTranslation(['practice', 'common']);
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? '';
  const query = usePracticeSession(id);
  const session = query.data;
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  // What she can see, keyboard or not: with it up the window keeps its height (edge-to-edge),
  // and caps taken from the window grew the card into the room the conversation needed — its
  // newest turn then stood half under the card (issue #289, second case).
  const viewHeight = useVisibleHeight().visible;

  /** The question she works on or has just closed (it stays until "Weiter"). */
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const drafts = usePracticeDrafts(id);
  /** The recordings she already heard in this run (issues #210, #242). */
  const { heard, markHeard } = useHeardTexts(id);
  /** The pronunciation judgement while the model is still listening (issue #8). */
  const [speakLive, setSpeakLive] = useState<SpeakStreamEvent | null>(null);
  /** What a speaking task does with her voice right now: the head's orb follows it. */
  const speakPhase = useSpeakPhase((s) => s.phase);
  // What was there when the screen opened stands still; a judgement that arrives now is fresh.
  const knownTurns = useRef<ReadonlySet<string> | null>(null);
  const judgedDraft = useRef<{ id: string; text: string } | null>(null);
  /** A test with time: the minutes left and its gentle sentence, as its clock reports them. */
  const clock = useTestClock();
  if (session && knownTurns.current === null)
    knownTurns.current = new Set(session.turns.map((turn) => turn.id));
  // Measured: what the conversation's content really needs and what the question takes, so the
  // conversation can show whole turns in the room there is (issue #286, `useScreenRoom`).
  const measured = useScreenRoom();
  function next(): void {
    setPinnedId(null);
    drafts.clearAll();
  }
  const voice = usePracticeVoice(session, pinnedId, next);
  const actions = usePracticeActions({ id, pin: setPinnedId, drafts, voice });
  const { busy, pending, store } = actions;
  const end = useSessionEnd({ id, session, store, busy, pin: setPinnedId });
  const corner = useCornerConfirm({
    id,
    act: actions.act,
    store,
    onDone: () => {
      setPinnedId(null);
      drafts.clearAnswer();
    },
  });

  /** Her question about the question or card on screen: the bar's field (`AskRoute`, #402, #384). */
  const askRoute = (itemId: string) => ({
    value: drafts.question.text,
    onChange: drafts.question.setText,
    onSend: () => void actions.ask(itemId, drafts.question.text.trim()),
    disabled: busy || end.closing,
    focused: measured.asking,
    onFocused: measured.setAsking,
  });

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
      // Design ui_kits/app/Extra.jsx `SystemState` "load-question": the head is there at once,
      // with the way out, and Buddy thinks while the questions are fetched.
      <Screen
        title={t('practice:title_fallback')}
        state="think"
        leading={{ icon: 'close', label: t('practice:end_label'), onPress: backToBuddy }}
      >
        <PracticeSkeleton label={t('practice:loading')} />
      </Screen>
    );
  }

  const title = session.title.trim() || t('practice:title_fallback');

  // ─────────────── a flashcard pass ───────────────

  if (session.card_pass) {
    const card = session.current_item_id ?? '';
    const asked = { pending: pending?.itemId === card ? pending.text : null, onKeep: actions.keep };
    return (
      <AskRoute.Provider value={askRoute(card)}>
        <CardPass
          session={session}
          title={title}
          onChange={store}
          onClose={end.close}
          asked={asked}
        />
      </AskRoute.Provider>
    );
  }

  // ─────────────── a Kopfrechnen round (issue #243) ───────────────

  if (session.drill) {
    return <DrillRound session={session} title={title} onChange={store} onClose={end.close} />;
  }

  // ─────────────── nothing left to answer ───────────────

  const shown = questionOnScreen(session, pinnedId);
  if (!shown || (end.timeUp && session.status === 'active')) {
    return (
      <NoQuestion
        session={session}
        title={title}
        timeUp={end.timeUp}
        finishFailed={end.finishFailed}
        celebrate={end.celebrate}
        busy={busy}
        onCards={() => void actions.goThroughCards()}
        onRetry={() => void end.finish()}
      />
    );
  }

  // ─────────────── one question ───────────────

  // The ways past, back to and out of the question (`questionOffers`).
  const offers = questionOffers(session, shown);
  const item = shown.item;
  const view = questionView(session, shown, pending);
  const { open } = view;
  const locked = busy || end.closing;
  /** Her newest judged try at this question: what the head's orb answers (`practiceHeadState`). */
  const lastTry = view.turns.filter((turn) => turn.role === 'learner' && turn.verdict).at(-1);
  // What stood in her answer field when that try's judgement arrived: once it differs, she has
  // started again and the head waits for her.
  if (lastTry && judgedDraft.current?.id !== lastTry.id)
    judgedDraft.current = { id: lastTry.id, text: drafts.text };
  // Which way she answers — exactly one (`answerForm`).
  const form = answerForm(item, open);
  // Her short answer appears in the gap of a fill-in sentence while she types.
  const filling =
    form.typed && (item.kind === 'short' || item.kind === 'vocab') ? drafts.text : undefined;
  // "Nochmal vorlesen" in the conversation row — only where the server allows hearing it.
  const readAgain = item.read_aloud ? { onReadAgain: () => voice.readQuestion(item) } : {};
  // How the conversation and the card share the room (issues #96, #286, #232): `threadRoom`.
  const room = measured.layout({
    // A figure she taps stands in the answer, not in the card (`FigureTapAnswer`, `CodeLineAnswer`).
    item: form.figureInAnswer ? { ...item, figure: null } : item,
    open,
    speaking: form.speaking,
    threadTurns: view.threadTurns,
    turnsAgain: view.turnsAgain,
    quiet: view.turns.length === 0,
    dictationCompact: view.dictationCompact,
    viewHeight,
    windowWidth,
    safeBottom: insets.bottom,
  });

  const originalForm = answerForm(item, true);
  const ordinaryBody =
    (originalForm.typed && item.kind !== 'spelling_dictation' && originalForm.code === null) ||
    (originalForm.choices !== null && !item.choice_figures?.length);
  const questionCard = (
    <SlideIn key={item.id}>
      {/* Homework says what it is as a quiet line above the question (design
          ui_kits/app/Flows.jsx:50). It stands in the question's own measured column, outside the
          card: the room the conversation gets is what is left under both. */}
      {session.mode === 'help' ? <HomeworkHint /> : null}
      <FigureSizingReport.Provider value={measured.figureSizing}>
        <View
          ref={measured.cardRef}
          onLayout={(e) => room.onCard(Math.round(e.nativeEvent.layout.height))}
        >
          <RunMeta.Provider value={testMeta(t, offers.testing, clock.soon)}>
            <ItemCard
              extra={
                <QuestionTools
                  item={item}
                  sessionId={session.id}
                  // A foreign vocabulary word has its own "Anhören" (its pronunciation is the
                  // point); that IS its read-aloud button, so it never gets a second one.
                  hearWord={item.kind === 'vocab' && isForeign(item.prompt_lang)}
                  heard={heard}
                  markHeard={markHeard}
                  disabled={locked}
                />
              }
              sessionId={session.id}
              shown={shown}
              title={title}
              view={view}
              form={form}
              speakLive={speakLive}
              heard={heard}
              markHeard={markHeard}
              disabled={locked}
              minHeight={
                !ordinaryBody && room.cardGrowTo > 0
                  ? room.cardNatural + room.cardGrowTo
                  : undefined
              }
              caps={room.caps}
              filling={filling}
              readAgain={readAgain}
            />
          </RunMeta.Provider>
        </View>
      </FigureSizingReport.Provider>
    </SlideIn>
  );
  const renderFlow = (
    reexplanation?: ReactNode,
    shortcuts?: ReactNode,
    revealTop?: number,
    revealKey?: string,
  ) => (
    <AnswerFlow.Provider
      value={{
        question: ordinaryBody ? questionCard : null,
        newestReply:
          view.turnsAgain.at(-1)?.id ??
          view.threadTurns.filter((turn) => turn.role === 'tutor').at(-1)?.id ??
          null,
        readKey:
          revealTop !== undefined
            ? (revealKey ?? `${id}.${item.id}.reasons`)
            : view.pendingText === null && actions.again === null
              ? (view.turnsAgain.at(-1)?.id ??
                view.threadTurns.filter((turn) => turn.role === 'tutor').at(-1)?.id ??
                null)
              : null,
        readFrom:
          revealTop !== undefined
            ? (room.tops.at(-1) ?? 0) + revealTop
            : view.pendingText === null && actions.again === null
              ? room.readFrom
              : undefined,
        sentKey:
          (actions.again?.itemId === item.id ? actions.again.way : null) ??
          view.pendingText ??
          view.threadTurns.filter((turn) => turn.role === 'learner').at(-1)?.id ??
          null,
        thread: (
          <QuestionThread
            unbounded={ordinaryBody}
            reexplanation={reexplanation}
            session={session}
            shown={shown}
            view={view}
            form={form}
            offers={offers}
            room={room}
            measured={measured}
            asking={pending?.asked}
            actions={actions}
            disabled={locked}
          />
        ),
        tools: (
          <>
            <QuestionHelp
              session={session}
              shown={shown}
              view={view}
              form={form}
              offers={offers}
              actions={actions}
              disabled={locked}
            />
            {shortcuts}
          </>
        ),
      }}
    >
      <AnswerArea
        sessionId={id}
        item={item}
        open={open}
        form={form}
        view={view}
        canReveal={session.reveal_allowed}
        drafts={drafts}
        actions={actions}
        measured={measured}
        readAgain={readAgain}
        onSpeakProgress={setSpeakLive}
        disabled={locked}
        closed={{ solution: shown.answer, judged: !offers.testing, onNext: next }}
      />
    </AnswerFlow.Provider>
  );

  // No scrolling to find what matters (CLAUDE.md rule 16): the question stays on top,
  // the way to answer stays at the bottom, and only the conversation between them
  // grows — like a chat, newest at the bottom.
  return (
    <Screen
      title={title}
      // In a test with time, the minutes left stand beside where she is (`progressLine`).
      subtitle={progressLine(t, view.progress)}
      subtitleTail={clockTail(t, offers.testing ? clock.minutes : null)}
      leading={{
        icon: 'close',
        onPress: () => void end.close(),
        disabled: end.closing,
        label: t('practice:end_label'),
        hint: t(offers.testing ? 'practice:end_hint_test' : 'practice:end_hint'),
      }}
      state={practiceHeadState({
        listening: speakPhase === 'hearing',
        checking: busy || view.pendingText !== null || speakPhase === 'judging',
        open,
        fresh: lastTry !== undefined && knownTurns.current?.has(lastTry.id) === false,
        // A test keeps its verdicts for the review: no celebration gives one away.
        afterCorrect: !offers.testing && lastTry?.verdict === 'correct',
        // Not right yet: Buddy speaks until she writes her next answer (the draft she had when
        // his words arrived is the fact; `judgedDraft` above).
        replying:
          !offers.testing &&
          lastTry !== undefined &&
          lastTry.verdict !== 'correct' &&
          judgedDraft.current?.text === drafts.text,
      })}
      // The question's own ⋯ ("Frage passt nicht", "Einspruch"), drawn only while it has something
      // to offer: its action cannot stand in the shared menu before that sheet has room for it.
      menu={{
        own: (
          <QuestionMenu
            session={session}
            item={item}
            open={open}
            testing={offers.testing}
            flaggable={offers.flaggable}
            disabled={locked}
            onCorner={(action) => corner.ask(action, item.id)}
          />
        ),
      }}
      footer={
        <QuestionProgress
          inHeader
          session={session}
          item={item}
          open={open}
          testing={offers.testing}
          flaggable={offers.flaggable}
          progress={view.progress}
          disabled={locked}
          onCorner={(action) => corner.ask(action, item.id)}
          receivedAt={query.dataUpdatedAt}
          onTimeUp={end.onTimeUp}
        />
      }
    >
      <KeyboardSafe style={{ flex: 1 }}>
        <FreeSpaceReport.Provider value={measured.free}>
          {/* Her question (issue #402): the field of the bar on every form without a typed answer.
              The room left under the bar, for the pictures that give way to it (`PictureRoom`). */}
          <AskRoute.Provider value={askRoute(item.id)}>
            <PictureRoom.Provider value={room.spare}>
              {/* The column, measured: its end mark (below) says how far its content runs past it. */}
              <View
                style={{ flex: 1, minHeight: 0 }}
                ref={measured.columnRef}
                onLayout={(e) => measured.onColumn(Math.round(e.nativeEvent.layout.height))}
              >
                {ordinaryBody ? null : (
                  <View
                    style={{
                      // The question and the conversation take what they need, no more: the free room
                      // collects under them and the way to answer stands at the bottom (`AnswerShell`,
                      // issues #286, #386). The question never shrinks; the conversation does, by whole
                      // turns (`threadCap`).
                      flexGrow: 0,
                      flexShrink: 1,
                      minHeight: measured.questionContentHeight,
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
                      contentContainerStyle={{
                        paddingHorizontal: SPACE.lg,
                        paddingTop: SPACE.xs,
                        gap: SPACE.md,
                      }}
                      onContentSizeChange={(_, h) =>
                        measured.setQuestionContentHeight(Math.round(h))
                      }
                    >
                      {/* The next question comes in softly from the side (keyed by the question). Its
                      drawing reports while it sizes itself: the card's own height waits for it. */}
                      {questionCard}
                    </ScrollView>
                  </View>
                )}
                <CheckOverrideProvider key={item.id}>
                  {ordinaryBody && offers.explainAgain ? (
                    <Reexplain
                      draftKey={`${session.id}.${item.id}.why`}
                      turns={view.turnsAgain}
                      pending={actions.again?.itemId === item.id ? actions.again.way : null}
                      disabled={locked}
                      delay={DURATION.gentle}
                      onAsk={(way, choice) => actions.explainAgain(item.id, way, choice)}
                      why={shown.why}
                      render={({ body, actions: shortcuts, revealTop, revealKey }) =>
                        renderFlow(body, shortcuts, revealTop, revealKey)
                      }
                    />
                  ) : (
                    renderFlow()
                  )}
                </CheckOverrideProvider>
                <View style={{ height: 0 }} ref={measured.endRef} />
              </View>
            </PictureRoom.Provider>
          </AskRoute.Provider>
        </FreeSpaceReport.Provider>
      </KeyboardSafe>
      {/* "Frage passt nicht", or a judgement she disagrees with (issue #164): the question and
          its mark go, and her learning state goes back to what it was before this answer. */}
      <CornerSheet
        action={corner.action}
        visible={corner.open}
        busy={busy}
        onClose={corner.close}
        onConfirm={() => void corner.confirm()}
      />
    </Screen>
  );
}
