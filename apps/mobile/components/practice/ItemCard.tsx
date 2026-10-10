// The one thing in front of her: the question's card. A sentence she says (`SpeakCard`), a word
// she hears and writes (Diktat, `DictationCard`, issue #242: no word to read, so the card is the
// way to hear it), or the question with its drawing or picture (`QuestionCard`). The card grows
// into room the conversation does not need (`threadRoom`, issue #96). Moved out of
// `app/practice/[id].tsx` (issue #311).

import type { SessionItemView, SpeakStreamEvent } from '@learnbuddy/shared-types/contracts';

import type { AnswerForm } from '../../lib/practice/answerForm.js';
import type { QuestionView } from '../../lib/practice/questionView.js';
import { DictationCard } from './DictationCard.js';
import { QuestionCard } from './Question.js';
import { SpeakCard } from './SpeakPanel.js';

type Props = {
  sessionId: string;
  shown: SessionItemView;
  /** The run's title: a topic it already names stays out of the card. */
  title: string;
  view: QuestionView;
  form: AnswerForm;
  /** The pronunciation judgement while the model is still listening (issue #8). */
  speakLive: SpeakStreamEvent | null;
  /** The recordings she already heard in this run (`useHeardTexts`). */
  heard: (ref: string | undefined) => boolean;
  markHeard: (ref: string | undefined) => void;
  disabled: boolean;
  /** At least this tall: grown into room the conversation does not need (`threadRoom`). */
  minHeight: number | undefined;
  /** The drawing's and the picture's largest height (`visualCaps`). */
  caps: { figure: number; image: number };
  /** Her short answer, shown in the gap of a fill-in sentence while she types. */
  filling: string | undefined;
  /** While Vorlesen is on, a tap on the question reads it again (#434): where it may be heard. */
  readAgain: { onReadAgain?: () => void };
};

export function ItemCard({
  sessionId,
  shown,
  title,
  view,
  form,
  speakLive,
  heard,
  markHeard,
  disabled,
  minHeight,
  caps,
  filling,
  readAgain,
}: Props) {
  const { item } = shown;
  if (form.speaking)
    return <SpeakCard item={item} turns={view.turns} live={speakLive} sessionId={sessionId} />;
  if (item.kind === 'spelling_dictation')
    return (
      <DictationCard
        sessionId={sessionId}
        itemId={item.id}
        prompt={item.prompt}
        // Having answered, she has heard it — also after the screen was rebuilt.
        heard={shown.attempts > 0 || heard(item.listen?.ref)}
        onHeard={() => markHeard(item.listen?.ref)}
        disabled={disabled}
        minHeight={minHeight}
        compact={view.dictationCompact}
      />
    );
  return (
    <QuestionCard
      prompt={item.prompt}
      // Not twice: a topic the header's title already names stays out of the card.
      topic={item.topic && title.includes(item.topic) ? null : item.topic}
      // A figure she taps stands in the answer, not in the card (`FigureTapAnswer`, `CodeLineAnswer`).
      figure={form.figureInAnswer ? null : item.figure}
      figureMaxHeight={caps.figure}
      image={item.image}
      imageKey={item.id}
      imageMaxHeight={caps.image}
      fromBuddy={item.origin === 'buddy'}
      minHeight={minHeight}
      dense={form.staff !== null}
      answer={filling}
      // What she answers from: a reading text (#233), a task's situation (#297).
      stimulus={item}
      answerBoard={form.board}
      {...readAgain}
    />
  );
}
