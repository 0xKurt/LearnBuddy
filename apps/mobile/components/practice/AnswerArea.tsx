// The way she answers the open question — exactly one (`answerForm`) — at the bottom of the
// column, each in the answer shell (`AnswerShell`, issue #310): options she taps, a structured
// board, the note line, the rhythm field, a typed answer, the fraction bar, a figure she taps a
// place in, the pronunciation recorder. Whatever she gives goes out as her answer
// (`usePracticeActions.answer`). Moved out of `app/practice/[id].tsx` (issue #311).
// Once the question is closed: "Weiter" in the bar, and above it the options of a multiple choice,
// read only, hers and the right one marked (issue #521) — a question that does not name its
// options itself ("Welcher Bruch ist größer?") would otherwise read as a question without them.

import type { ItemView, SpeakStreamEvent } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { AnswerForm } from '../../lib/practice/answerForm.js';
import { choiceMarks } from '../../lib/practice/choiceMarks.js';
import type { QuestionView } from '../../lib/practice/questionView.js';
import type { ScreenRoom } from '../../lib/practice/screenRoom.js';
import type { PracticeActions } from '../../lib/practice/usePracticeActions.js';
import type { PracticeDrafts } from '../../lib/practice/usePracticeDrafts.js';
import { useVoiceMode } from '../../lib/speech/voiceMode.js';
import { BottomBar } from '../lb/BottomBar.js';
import { Btn } from '../lb/Btn.js';
import { Appear } from '../lb/Motion.js';
import { AnswerShell } from './AnswerShell.js';
import { ChoiceList } from './ChoiceList.js';
import { FigureTapAnswer } from './FigureTapAnswer.js';
import { FractionBarBoard } from './FractionBarAnswer.js';
import { RhythmTaps } from './RhythmTaps.js';
import { latestPronunciation, SpeakPanel } from './SpeakPanel.js';
import { StaffWriting } from './StaffWriting.js';
import { StructuredAnswer } from './StructuredAnswer.js';
import { TypedAnswer } from './TypedAnswer.js';

type Props = {
  sessionId: string;
  item: ItemView;
  open: boolean;
  form: AnswerForm;
  /** Her tries so far: the options already tried, the pronunciation feedback given. */
  view: Pick<QuestionView, 'turns' | 'tried'>;
  /** The session lets her past a question (`reveal_allowed`): the recorder offers to skip. */
  canReveal: boolean;
  drafts: Pick<PracticeDrafts, 'text' | 'setText'>;
  actions: Pick<PracticeActions, 'answer' | 'spoke' | 'reveal' | 'refetch' | 'stepOpen'>;
  measured: Pick<ScreenRoom, 'setSurfaceHeight'>;
  /** "Nochmal vorlesen" in the conversation row — only where the server allows hearing it. */
  readAgain: { onReadAgain?: () => void };
  /** The pronunciation judgement while the model is still listening (issue #8). */
  onSpeakProgress: (live: SpeakStreamEvent | null) => void;
  disabled: boolean;
  /**
   * Once the question is closed: the solution the server sent (null in homework help and during a
   * test), whether verdicts are shown (not during a test), and "Weiter".
   */
  closed: { solution: string | null; judged: boolean; onNext: () => void };
};

export function AnswerArea({
  sessionId,
  item,
  open,
  form,
  view,
  canReveal,
  drafts,
  actions,
  measured,
  readAgain,
  onSpeakProgress,
  disabled,
  closed,
}: Props) {
  const { t } = useTranslation('practice');
  const conversation = useVoiceMode((s) => s.conversation);
  const { choices, tapChoices, speaking, staff, taps, barSurface, tapFigure, typed } = form;
  const { text, setText } = drafts;
  const { answer } = actions;
  // A shaded bar is a tap, even though "Prüfen" sends it (issue #163).
  const check = (value: string, via: 'typed' | 'tapped' = 'typed') =>
    value ? void answer(item.id, { text: value, via }, value) : undefined;
  return (
    <>
      {/* Options she taps (issue #288), in the answer shell like every form (issue #310): at the
          bottom, the free room above (#386), and in a conversation the conversation row where
          "Prüfen" stands for the others. Tapped words go as if she had typed them: same
          grading, same key (issue #147). */}
      {open && (choices || tapChoices) ? (
        <AnswerShell
          keeps="whole"
          answer={
            <ChoiceList
              choices={choices ?? tapChoices ?? []}
              figures={choices ? item.choice_figures : null}
              tried={view.tried}
              disabled={disabled}
              onChoose={(index, choice) =>
                void answer(
                  item.id,
                  choices ? { choice: index } : { text: choice, via: 'tapped' },
                  choice,
                )
              }
            />
          }
          action={
            choices && conversation
              ? {
                  talk: {
                    prompt: item.prompt,
                    lang: null,
                    disabled,
                    onText: (said) => void answer(item.id, { text: said, via: 'spoken' }, said),
                    ...readAgain,
                  },
                }
              : { tap: true, canTalk: choices !== null }
          }
        />
      ) : null}
      {/* A structured item's parts (issues #228–#230): one form per kind in the answer shell
          (answer, free room, "Prüfen" — `AnswerShell`, issue #310), its arrangement in a draft,
          so a theme switch (a remount) keeps it. Keyed by the question, so a new one starts
          empty. */}
      {open && item.task_view ? (
        <View
          style={{ flexGrow: 1, flexShrink: 1, minHeight: 0 }}
          onLayout={(e) => measured.setSurfaceHeight(Math.round(e.nativeEvent.layout.height))}
        >
          <StructuredAnswer
            key={item.id}
            view={item.task_view}
            draftKey={`session.${sessionId}.${item.id}`}
            disabled={disabled}
            onSubmit={(body, shownText) => void answer(item.id, body, shownText)}
            opens={actions.stepOpen?.itemId === item.id ? actions.stepOpen : null}
          />
        </View>
      ) : null}
      {/* Die Notenzeile, auf die sie schreibt (issue #226), in der Antworthülle (#310), ihre
          halbe Zeile je Frage im Entwurf (#275). */}
      {staff ? (
        <StaffWriting
          key={item.id}
          surface={staff}
          draftKey={`session.${sessionId}.${item.id}.staff`}
          disabled={disabled}
          // Kein `via: 'tapped'`, obwohl sie getippt hat: `via` unterscheidet WIEDERERKENNEN
          // von PRODUZIEREN (issue #163), und hier ist nichts wiedererkannt. Eine Notenzeile
          // selbst zu setzen ist genau das, was die Klassenarbeit verlangt — mit einem Stift
          // statt mit dem Finger (dasselbe Argument wie `summary.ts` für mehrteilige Antworten).
          onCheck={(line) => void answer(item.id, { text: line }, line)}
        />
      ) : null}
      {taps ? (
        <RhythmTaps
          key={item.id}
          disabled={disabled}
          // Ein gehörter Rhythmus, den sie nachklopft (issue #445): ihre Schläge sind die
          // Antwort, und auch hier ohne `via: 'tapped'` — nichts ist wiedererkannt.
          onCheck={(beats, shown) => void answer(item.id, { text: beats }, shown)}
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
          disabled={disabled}
          onChange={setText}
          onCheck={check}
          work={{ sessionId, itemId: item.id }}
          {...readAgain}
        />
      ) : null}
      {/* The fraction bar she works with (issue #162), a board like the others (report #388
          §9, issue #402): the shaded bar is the answer, "Prüfen" checks it, and the bar's field
          is her question. A picked bar goes out at once, like a tile. */}
      {barSurface ? (
        <FractionBarBoard
          surface={barSurface}
          value={text}
          disabled={disabled}
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
          disabled={disabled}
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
                sessionId={sessionId}
                hasFeedback={latestPronunciation(view.turns) !== null}
                disabled={disabled}
                onResult={(res) => actions.spoke(item.id, res)}
                onProgress={onSpeakProgress}
                onOutdated={actions.refetch}
                onSkip={canReveal ? () => void actions.reveal(item.id) : undefined}
              />
            ),
          }}
        />
      ) : null}
      {/* Closed: "Weiter", and the options of a multiple choice stay above it, read only. */}
      {open ? null : (
        <AnswerShell
          keeps="whole"
          answer={
            choices ? (
              <ChoiceList
                choices={choices}
                figures={item.choice_figures}
                tried={view.tried}
                settled={choiceMarks(choices, view.turns, closed.solution, closed.judged)}
                disabled
              />
            ) : undefined
          }
          action={{
            bar: (
              <BottomBar>
                <Appear delay={120}>
                  <Btn size="lg" pill full onPress={closed.onNext}>
                    {t('next')}
                  </Btn>
                </Appear>
              </BottomBar>
            ),
          }}
        />
      )}
    </>
  );
}
