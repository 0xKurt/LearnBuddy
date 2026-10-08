// One tap plays, a second tap stops — the one listening hook of the practice screen (#311 part 6,
// #445). It plays either of the two things the app can make heard:
//
//   · words in their language (lib/speech/listen.ts: Buddy's voice, else the phone's) — the
//     "Anhören" pill (`ListenButton`) for a word, a sentence, a card;
//   · tones the app computes itself (lib/music/play.ts: `tone.ts` synthesis through the same
//     player) — a drawn note line (`StaffPlayButton`, the staff keys' "Anhören") and the two notes
//     of an interval she names by ear (issue #445).
//
// So every listen control behaves the same: going away mid-sound (next question, leaving) stops
// it, and a sound that could not be played is said, never left in silence
// (docs/engineering-guards.md, rule 3). Before #445 the note line had its own copy of this hook.

import type { HeardTones } from '@learnbuddy/shared-types/contracts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { playLine, stopNotes, type PlayEnd } from '../../lib/music/play.js';
import { speak, stop as stopSpeaking, type ListenEnd } from '../../lib/speech/listen.js';
import { toast } from '../lb/Toast.js';

/** What a listen control plays: words in a language, or tones the app makes. */
export type Hearing = { text: string; lang: string; slow?: boolean } | { tones: HeardTones };

export function useListenToggle(hearing: Hearing): { playing: boolean; press: () => void } {
  const { t } = useTranslation('practice');
  const [playing, setPlaying] = useState(false);
  const mounted = useRef(true);
  const playingRef = useRef(false);
  playingRef.current = playing;
  const tones = 'tones' in hearing;
  const stop = tones ? stopNotes : stopSpeaking;
  const stopRef = useRef(stop);
  stopRef.current = stop;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (playingRef.current) stopRef.current();
    };
  }, []);

  function onEnd(why: ListenEnd | PlayEnd): void {
    if (!mounted.current) return;
    setPlaying(false);
    // Nothing could be heard — no voice for the words, no sound from the player: said, not silent.
    if (why === 'error') toast.show(t(tones ? 'staff.no_sound' : 'speak.no_voice'), 'info');
  }

  function press(): void {
    if (playing) {
      stop();
      // The tone player reports a stop as its end; the voice does too. Either way the pill is
      // free again at once, not when the player gets round to saying so.
      setPlaying(false);
      return;
    }
    setPlaying(true);
    if ('tones' in hearing) playLine(hearing.tones.bars, hearing.tones.tempo, onEnd);
    else void speak(hearing.text, hearing.lang, { slow: hearing.slow ?? false, onEnd });
  }

  return { playing, press };
}
