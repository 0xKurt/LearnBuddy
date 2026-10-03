// "Vorlesen" at every question, also without voice mode (issue #238): the round speaker in the
// question's progress row, right above the card. For the child who reads slowly — first grade, LRS, German as a second
// language, a word problem where the reading blocks the arithmetic.
//
// Why a round icon in the progress row and not a pill row under the card or a corner of it: a
// row costs a whole line (54 pt) on every question, and inside the card the icon took width from
// the topic line or the prompt and added a line there — either way a structured question's parts
// were pushed off a 360×740 phone (rule 16). The progress row is 44 pt tall anyway. The speaker is
// the app's one sign for "read aloud" (the voice-mode switch, every "Anhören"), and a screen
// reader hears "Frage vorlesen" — never the icon alone.
//
// One tap reads, a second tap stops (the icon turns into the stop square and the label into
// "Anhalten": the state is never colour alone). Going away mid-sentence — the next question,
// leaving the screen — stops it as well. Her reading speed is the one she set for Buddy's voice
// (the server's speed step), so there is no second "slow" button competing for the corner.
//
// What is read is handed in already SPOKEN (`questionReadText`: math, fractions and formulas in
// words); this button never turns LaTeX into sound.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { speak, stop, type ListenEnd } from '../../lib/speech/listen.js';
import { CircleBtn } from '../lb/CircleBtn.js';
import { toast } from '../lb/Toast.js';

type Props = {
  /** The question as it is said (math in words). */
  text: string;
  /** Its language (the sheet's, `prompt_lang`, else the app's). */
  lang: string;
};

export function ReadQuestionButton({ text, lang }: Props) {
  const { t } = useTranslation('practice');
  const [playing, setPlaying] = useState(false);
  const mounted = useRef(true);
  const playingRef = useRef(false);
  playingRef.current = playing;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (playingRef.current) stop();
    };
  }, []);

  function onEnd(why: ListenEnd): void {
    if (!mounted.current) return;
    setPlaying(false);
    // Neither the natural voice nor the phone's own could read it: said, not left in silence.
    if (why === 'error') toast.show(t('speak.no_voice'), 'info');
  }

  function press(): void {
    if (playing) {
      stop();
      return;
    }
    setPlaying(true);
    void speak(text, lang, { onEnd });
  }

  return (
    <CircleBtn
      // Plain, without the ring: the ringed speaker in the header is the voice-mode switch, and
      // two equal circles one above the other read as the same control twice.
      plain
      icon={playing ? 'stop' : 'speak'}
      onPress={press}
      accessibilityLabel={playing ? t('speak.listen_stop') : t('speak.read_question_label')}
      {...(playing ? {} : { accessibilityHint: t('speak.read_question_hint') })}
    />
  );
}
