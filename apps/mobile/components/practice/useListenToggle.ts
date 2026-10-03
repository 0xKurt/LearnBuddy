// One tap reads a text aloud in its language, a second tap stops it (lib/speech/listen.ts).
// Shared by every "read this aloud" control — the "Anhören" pill (`ListenButton`) and the round
// "Vorlesen" speaker over a question (`ReadQuestionButton`, issue #238) — so they behave the
// same: going away mid-sentence (next question, leaving) stops the reading, and a voice that
// could not read it is said, never left in silence (docs/engineering-guards.md, rule 3).

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { speak, stop, type ListenEnd } from '../../lib/speech/listen.js';
import { toast } from '../lb/Toast.js';

export function useListenToggle(
  text: string,
  lang: string,
  slow = false,
): { playing: boolean; press: () => void } {
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
    void speak(text, lang, { slow, onEnd });
  }

  return { playing, press };
}
