// One tap plays, a second tap stops — the one listening hook of the practice screen (#311 part 6,
// #445). It plays either of the two things the app can make heard:
//
//   · words in their language (lib/speech/listen.ts: Buddy's voice, else the phone's) — the
//     "Anhören" pill (`ListenButton`) for a word, a sentence, a card;
//   · tones the app computes itself (lib/music/play.ts: `tone.ts` synthesis through the same
//     player) — a drawn note line (`StaffPlayButton`, the staff keys' "Anhören") and the two notes
//     of an interval she names by ear (issue #445).
//
// Both behave like every listen control (`lib/speech/usePlayback.ts`): going away mid-sound stops
// it, and a sound that could not be played is said, never left in silence. This hook only says
// where the sound comes from. Before #445 the note line had its own copy of it; before #311 so
// did the Hörtext.

import type { HeardTones } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';

import { playLine, stopNotes } from '../../lib/music/play.js';
import { speak, stop as stopSpeaking } from '../../lib/speech/listen.js';
import { usePlayback } from '../../lib/speech/usePlayback.js';

/** What a listen control plays: words in a language, or tones the app makes. */
export type Hearing = { text: string; lang: string; slow?: boolean } | { tones: HeardTones };

export function useListenToggle(hearing: Hearing): { playing: boolean; press: () => void } {
  const { t } = useTranslation('practice');
  const tones = 'tones' in hearing;
  const { busy, toggle } = usePlayback<'on'>({
    text: t(tones ? 'staff.no_sound' : 'speak.no_voice'),
    tone: 'info',
  });

  function press(): void {
    // The pill says "Anhalten" from the tap on, not from the first sound.
    toggle('on', ({ ended }) => {
      if ('tones' in hearing) {
        playLine(hearing.tones.bars, hearing.tones.tempo, ended);
        return stopNotes;
      }
      void speak(hearing.text, hearing.lang, { slow: hearing.slow ?? false, onEnd: ended });
      return stopSpeaking;
    });
  }

  return { playing: busy !== null, press };
}
