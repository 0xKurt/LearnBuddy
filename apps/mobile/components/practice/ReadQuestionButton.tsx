// "Frage vorlesen" at every question, also without voice mode (issue #238): for the child who
// reads slowly — first grade, LRS, German as a second language, a word problem where the reading
// blocks the arithmetic.
//
// Where: the one place for it is the question card's meta row ("Frage von Buddy · Thema"), at its
// end (issue #310, decision of 04.10.). Small and quiet — the icon-only `<Btn>` lays out at 24 pt
// inside a 26 pt row, its touch target still 44 (Btn `iconOnly`) — so it costs the card no height.
// It used to stand in the progress row above the card, where it squeezed the progress bar and,
// with a test's clock beside it, pushed the bar out (#334.2). In voice mode it goes away: Buddy
// reads anyway, and "Nochmal vorlesen" is the one way to hear it again. The speaker is the app's
// one sign for "read this aloud"; the voice-mode switch in the header carries the headphones.
//
// One tap reads, a second tap stops (the icon turns into the stop square and the label into
// "Anhalten": the state is never colour alone). Going away mid-sentence — the next question,
// leaving the screen — stops it as well. Her reading speed is the one she set for Buddy's voice.
//
// What is read is handed in already SPOKEN (`questionParts`: math, fractions and formulas in
// words); this button never turns LaTeX into sound.

import { useTranslation } from 'react-i18next';

import { Btn } from '../lb/Btn.js';
import { useListenToggle } from './useListenToggle.js';

type Props = {
  /** The question as it is said (math in words). */
  text: string;
  /** Its language (the sheet's, `prompt_lang`, else the app's). */
  lang: string;
};

export function ReadQuestionButton({ text, lang }: Props) {
  const { t } = useTranslation('practice');
  const { playing, press } = useListenToggle(text, lang);
  const label = playing ? t('speak.listen_stop') : t('speak.read_question_label');
  return (
    <Btn
      iconOnly
      icon={playing ? 'stop' : 'speak'}
      onPress={press}
      {...(playing ? {} : { accessibilityHint: t('speak.read_question_hint') })}
    >
      {label}
    </Btn>
  );
}
