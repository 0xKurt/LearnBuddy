// The one listening hook of the practice screen (issue #311 step 2, #445): whatever is heard —
// words in their language, tones the app makes, a question's recording from the server — plays,
// stops and fails the same way, through the one play/stop state (`lib/speech/usePlayback.ts`):
//
//   · words (lib/speech/listen.ts: Buddy's voice, else the phone's) — a vocabulary word, a
//     sentence to say, a card's face;
//   · tones (lib/music/play.ts: `tone.ts` synthesis through the same player) — a drawn note line,
//     the line she writes (`StaffKeys`), the two notes of an interval she names by ear (#445);
//   · a question's recording (`POST /practice/sessions/:id/listen`) — the Hörtext (#210) and the
//     Diktat (#242). There is no local cache of it, deliberately twice over: the audio IS the text
//     in another form, so a file of it kept on the phone would be the solution kept on the device,
//     and the server serves every replay after the first from its spoken-sentence cache. So:
//     fetch, play, delete (`naturalAudio.ts` does the same for Buddy's voice).
//
// Every source has the same two passes — the normal one and the slower one — except tones, which
// carry their own tempo. Where the sound comes from is the only thing this hook decides; what a
// listen control looks like and says is `ListenButton`'s. Before #311 step 2 there were two hooks
// here (`useListenToggle`, `useHearText`) with two different notions of "playing".

import type { HeardTones } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';

import { listenToItem } from '../../lib/api/endpoints.js';
import { playLine, stopNotes } from '../../lib/music/play.js';
import { speak, stop as stopSpeaking } from '../../lib/speech/listen.js';
import { audioUri, releaseAudio } from '../../lib/speech/naturalAudio.js';
import { playAudio } from '../../lib/speech/naturalPlayer.js';
import { usePlayback } from '../../lib/speech/usePlayback.js';

/** What a listen control plays. */
export type ListenSource =
  /** Words in their language (ISO 639-1, e.g. "fr"). */
  | { text: string; lang: string }
  /** Tones the app makes. */
  | { tones: HeardTones }
  /** A question's recording, fetched from the server; `onHeard` once it really sounds. */
  | { item: { sessionId: string; itemId: string; onHeard: () => void } };

/** A pass of what is heard: the normal speed, or the slower one. */
export type Pass = 'normal' | 'slow';

/** What a listen control shows: ready to play, fetching, sounding. */
type ListenState = 'ready' | 'loading' | 'playing';

type Listening = {
  state: (pass: Pass) => ListenState;
  /** Tapping the pass that runs stops it; tapping the other one switches to it. */
  play: (pass: Pass) => void;
  /** Something is being fetched: the other pass waits for it. */
  fetching: boolean;
};

/** What she is told when the sound itself could not be made, per source. */
const FAILED = {
  text: { key: 'listen.no_voice', tone: 'info' },
  tones: { key: 'listen.no_sound', tone: 'info' },
  item: { key: 'listen.failed', tone: 'error' },
} as const;

export const sourceKind = (source: ListenSource): keyof typeof FAILED =>
  'tones' in source ? 'tones' : 'item' in source ? 'item' : 'text';

export function useListen(source: ListenSource): Listening {
  const { t } = useTranslation('practice');
  const failed = FAILED[sourceKind(source)];
  const { busy, playing, toggle } = usePlayback<Pass>({ text: t(failed.key), tone: failed.tone });

  function play(pass: Pass): void {
    // Made on the phone, words and tones start at once (and say "Anhalten" from the tap on); only
    // a recording is fetched first — synchronously started, so a second tap always finds the stop.
    toggle(pass, ({ live, started, ended }) => {
      if ('tones' in source) {
        started();
        playLine(source.tones.bars, source.tones.tempo, ended);
        return stopNotes;
      }
      if ('text' in source) {
        started();
        void speak(source.text, source.lang, { slow: pass === 'slow', onEnd: ended });
        return stopSpeaking;
      }
      const { sessionId, itemId, onHeard } = source.item;
      return listenToItem(sessionId, {
        item_id: itemId,
        ...(pass === 'slow' ? { slow: true } : {}),
      }).then((audio) => {
        const uri = audioUri(audio.audio_base64, audio.mime);
        if (!live()) {
          releaseAudio(uri);
          return null;
        }
        return playAudio(uri, {
          onStart: () => {
            if (!live()) return;
            started();
            onHeard();
          },
          onProgress: () => undefined,
          onEnd: (why) => {
            releaseAudio(uri);
            ended(why);
          },
        }).stop;
      });
    });
  }

  const state = (pass: Pass): ListenState =>
    playing === pass ? 'playing' : busy === pass ? 'loading' : 'ready';
  return { state, play, fetching: busy !== null && playing === null };
}
