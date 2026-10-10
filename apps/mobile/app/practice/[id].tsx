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
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EndButton } from '../../components/lb/EndButton.js';
import { KeyboardSafe } from '../../components/lb/KeyboardSafe.js';
import { SlideIn } from '../../components/lb/Motion.js';
import { Screen } from '../../components/lb/Screen.js';
import { PracticeSkeleton } from '../../components/lb/Skeletons.js';
import { AnswerArea } from '../../components/practice/AnswerArea.js';
import { CardPass } from '../../components/practice/CardPass.js';
import { AskRoute } from '../../components/practice/CheckBar.js';
import { DrillRound } from '../../components/practice/DrillRound.js';
import { FreeSpaceReport } from '../../components/practice/FreeSpace.js';
import { HeadActions } from '../../components/practice/HeadActions.js';
import { ItemCard } from '../../components/practice/ItemCard.js';
import { NoQuestion } from '../../components/practice/NoQuestion.js';
import { PracticeStuck } from '../../components/practice/PracticeStuck.js';
import { CornerSheet } from '../../components/practice/QuestionCorner.js';
import { QuestionProgress } from '../../components/practice/QuestionProgress.js';
import { QuestionThread } from '../../components/practice/QuestionThread.js';
import { QuestionTools } from '../../components/practice/QuestionTools.js';
import { isRetryable } from '../../lib/api/apiError.js';
import { usePracticeSession } from '../../lib/api/queries.js';
import { messageFor } from '../../lib/errors.js';
import { isForeign } from '../../lib/i18n/index.js';
import { FigureSizingReport } from '../../lib/math/figureSizing.js';
import { answerForm } from '../../lib/practice/answerForm.js';
import { useHeardTexts } from '../../lib/practice/heardTexts.js';
import { questionOffers, questionOnScreen } from '../../lib/practice/offers.js';
import { questionView } from '../../lib/practice/questionView.js';
import { useScreenRoom } from '../../lib/practice/screenRoom.js';
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
      <Screen>
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
  const endButton = (
    // Stays while a question is on screen, also once the session was finished in the
    // background (finishing again is a no-op) – the header must not jump under the reader.
    <HeadActions>
      <EndButton
        onPress={() => void end.close()}
        disabled={end.closing}
        label={t('practice:end_label')}
        hint={t(offers.testing ? 'practice:end_hint_test' : 'practice:end_hint')}
      />
    </HeadActions>
  );

  // No scrolling to find what matters (CLAUDE.md rule 16): the question stays on top,
  // the way to answer stays at the bottom, and only the conversation between them
  // grows — like a chat, newest at the bottom.
  return (
    <Screen title={title} right={endButton}>
      <KeyboardSafe style={{ flex: 1 }}>
        <FreeSpaceReport.Provider value={measured.free}>
          {/* Her question (issue #402): the field of the bar on every form without a typed answer. */}
          <AskRoute.Provider value={askRoute(item.id)}>
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
                  // issues #286, #386). The question never shrinks; the conversation does, by whole
                  // turns (`threadCap`).
                  flexGrow: 0,
                  flexShrink: 1,
                  minHeight: measured.questionContentHeight + room.threadFloor,
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
                    // token-exempt: the question column's gap, off the scale since #286; moving it to SPACE.md is a visible change (#311 10b)
                    gap: 10,
                  }}
                  onContentSizeChange={(_, h) => measured.setQuestionContentHeight(Math.round(h))}
                >
                  <QuestionProgress
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
                  {/* The next question comes in softly from the side (keyed by the question). Its
                      drawing reports while it sizes itself: the card's own height waits for it. */}
                  <SlideIn key={item.id}>
                    <FigureSizingReport.Provider value={measured.figureSizing}>
                      <View
                        ref={measured.cardRef}
                        onLayout={(e) => room.onCard(Math.round(e.nativeEvent.layout.height))}
                      >
                        <ItemCard
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
                            room.cardGrowTo > 0 ? room.cardNatural + room.cardGrowTo : undefined
                          }
                          caps={room.caps}
                          filling={filling}
                          readAgain={readAgain}
                        />
                      </View>
                    </FigureSizingReport.Provider>
                  </SlideIn>
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
                </ScrollView>
                <QuestionThread
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
              </View>
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
              <View style={{ height: 0 }} ref={measured.endRef} />
            </View>
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
