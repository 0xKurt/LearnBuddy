// The two soft cues of talk mode (gap 17): Buddy starts listening, Buddy stops
// listening — so she knows without looking. Discrete soft taps, no pitch glide
// (the old glissando read as a whimpering animal — user feedback 2026-09-28).
// Synthesised by scripts/make-talk-tones.mjs (tiny, no licensed audio).
// They follow the silent switch: on iOS the tone plays in a session that obeys it,
// and afterwards the session is handed back as talk mode needs it (Buddy's voice is
// heard, the next recording can start). Needs live verification on a phone.
// The web: no tones (lib/speech/cues.web.ts).

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Platform } from 'react-native';

import listenEnd from '../../assets/sounds/listen-end.wav';
import listenStart from '../../assets/sounds/listen-start.wav';

export type Cue = 'listen' | 'done';

const SOURCES: Record<Cue, number> = { listen: listenStart, done: listenEnd };
/** Quiet: a hint, not a signal. */
const VOLUME = 0.35;
/** How long a cue lasts (the files are 110–180 ms). */
export const CUE_MS = 200;

const players = new Map<Cue, AudioPlayer>();

function player(cue: Cue): AudioPlayer {
  let p = players.get(cue);
  if (!p) {
    p = createAudioPlayer(SOURCES[cue]);
    p.volume = VOLUME;
    players.set(cue, p);
  }
  return p;
}

/** Plays a tone; resolves once it is over (or could not play — never an error for her). */
export async function playCue(cue: Cue): Promise<void> {
  try {
    // The silent switch decides (iOS): a session that obeys it for the tone …
    if (Platform.OS === 'ios') await setAudioModeAsync({ playsInSilentMode: false });
    const p = player(cue);
    await p.seekTo(0);
    p.play();
    await new Promise((r) => setTimeout(r, CUE_MS));
  } catch {
    // No tone is fine: the screen and the voice say the same.
  } finally {
    // … then back to talk mode's session, where Buddy's voice is heard (lib/speech/record.ts).
    if (Platform.OS === 'ios')
      await setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
  }
}
