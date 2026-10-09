// The conversation about the question on screen, in its box under the card (`ThreadBox`, issues
// #96, #286): her tries and Buddy's replies (`ItemThread`), then what follows a closed question —
// "selbst gefunden" in homework help, the solution where it says something new, the word to hear
// again, what the Hörtext said — "Anders erklären", and while the question is open the help chips
// ("Tipp", "Lösung zeigen" or what stands in its place). Moved out of `app/practice/[id].tsx`
// (issue #311).

import type { SessionItemView, SessionView } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';

import { isForeign } from '../../lib/i18n/index.js';
import type { AnswerForm } from '../../lib/practice/answerForm.js';
import type { Offers } from '../../lib/practice/offers.js';
import type { QuestionView } from '../../lib/practice/questionView.js';
import type { ScreenRoom } from '../../lib/practice/screenRoom.js';
import type { PracticeActions } from '../../lib/practice/usePracticeActions.js';
import { useVoiceMode } from '../../lib/speech/voiceMode.js';
import { Rise } from '../lb/Motion.js';
import { HeardTextCard } from './HeardTextCard.js';
import { HelpChips } from './HelpChips.js';
import { ItemThread } from './ItemThread.js';
import { ListenButton } from './ListenButton.js';
import { Reexplain } from './Reexplain.js';
import { SelfSolvedCard, SolutionCard } from './SolutionCard.js';
import { ThreadBox } from './ThreadBox.js';

type Props = {
  session: SessionView;
  shown: SessionItemView;
  view: QuestionView;
  form: AnswerForm;
  offers: Offers;
  /** How the conversation shares the room with the card (`threadRoom`, via `useScreenRoom`). */
  room: ReturnType<ScreenRoom['layout']>;
  measured: ScreenRoom;
  /** What is on its way is her question to the tutor, not an answer. */
  asking: boolean | undefined;
  actions: Pick<
    PracticeActions,
    'again' | 'askHint' | 'explainAgain' | 'keep' | 'later' | 'reveal'
  >;
  disabled: boolean;
};

export function QuestionThread({
  session,
  shown,
  view,
  form,
  offers,
  room,
  measured,
  asking,
  actions,
  disabled,
}: Props) {
  const { t } = useTranslation('practice');
  const conversation = useVoiceMode((s) => s.conversation);
  const { item } = shown;
  const { open } = view;
  const { structured, choices, tapChoices, speaking } = form;
  // A foreign vocabulary word, once the question is closed: its answer to hear.
  const hearAnswer = item.kind === 'vocab' && !open && isForeign(item.lang);
  // The ways past the question (`questionOffers`), and "Tipp" while the server has one.
  const skipTo =
    offers.skip === 'reveal' ? actions.reveal : offers.skip === 'later' ? actions.later : null;
  const skip = skipTo ? () => void skipTo(item.id) : undefined;
  const hint = shown.hint_available ? () => void actions.askHint(item.id) : undefined;
  return (
    <ThreadBox
      cap={room.threadCap}
      floor={room.threadFloor}
      holds={room.threadHolds}
      tops={room.tops}
      followEnd={view.followEnd}
      readFrom={view.pendingText === null ? room.readFrom : undefined}
      box={measured.thread}
      onNeed={measured.setThreadNeed}
      onParts={measured.setPartTops}
    >
      <ItemThread
        turns={view.threadTurns}
        pending={view.pendingText}
        asking={asking}
        later={{ onKeep: (turnId) => void actions.keep(turnId), disabled }}
        hideVerdicts={offers.testing}
        // A spoken answer: the judgement's words belong here, the marked sentence
        // stays in the card (issue #14).
        pronunciation={item.kind === 'speak'}
        // While a structured question is open her answer stands on its board, not in a
        // bubble (ItemThread). Once it is closed the board is gone, there is room, and
        // the bubble with its verdict shows what she did, like any other answer.
        // The same for tapped options (issue #288): a tried tile says "Schon
        // ausprobiert" itself, and a bubble repeating it was a duplicate — for a
        // picture option even the formula behind the drawing. In a conversation the
        // bubble stays: there it is the only place she sees what was heard.
        echoAnswers={!((structured || ((choices || tapChoices) && !conversation)) && open)}
        onTurnTops={measured.setTurnTops}
        essay={item.kind === 'essay'}
      />
      {session.mode === 'help' && shown.status === 'correct' ? (
        <Rise delay={180}>
          <SelfSolvedCard />
        </Rise>
      ) : null}
      {/* The solution only where it says something new (issue #93): after an
          answer she got right herself, the chip and Buddy's reply carry it — and for a
          multiple choice its own tile does, marked "Lösung" under the options that
          stay (issue #521). */}
      {shown.status !== 'open' &&
      shown.status !== 'correct' &&
      shown.answer !== null &&
      choices === null ? (
        <Rise delay={180}>
          <SolutionCard answer={shown.answer} numeric={item.kind === 'numeric'} />
        </Rise>
      ) : null}
      {hearAnswer && shown.answer !== null && item.lang !== null ? (
        <ListenButton source={{ text: shown.answer, lang: item.lang }} />
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
          turns={view.turnsAgain}
          pending={actions.again?.itemId === item.id ? actions.again.way : null}
          disabled={disabled}
          delay={1000}
          onAsk={(way, choice) => void actions.explainAgain(item.id, way, choice)}
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
          onReveal={speaking && session.reveal_allowed ? undefined : skip}
          revealLabel={offers.skipLabel ? t(offers.skipLabel) : undefined}
          revealHint={offers.skipHint ? t(offers.skipHint) : undefined}
          disabled={disabled}
        />
      ) : null}
    </ThreadBox>
  );
}
