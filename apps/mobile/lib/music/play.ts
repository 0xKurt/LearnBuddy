// Eine Notenzeile hörbar machen (issue #226: „Die kann man sich dann sogar anhören").
//
// Kein zweiter Weg für Audio. Die Töne entstehen in `tone.ts` als fertige WAV-Bytes, und von
// hier an läuft alles durch die Strecke, die Buddys Stimme schon benutzt: `audioUri` legt die
// Bytes dort ab, wo ein Player sie öffnen kann (auf dem Handy eine kurzlebige Datei im Cache,
// im Browser eine `data:`-URI), `playAudio` spielt sie mit `expo-audio` und sagt, wie es
// ausgegangen ist. Deshalb braucht „Anhören" keine neue native Abhängigkeit, funktioniert im
// Walkthrough im Browser genauso wie auf dem Gerät, und es gibt genau eine Stelle, an der
// Audio-Eigenheiten (Klingelschalter, blockierte Wiedergabe, hängender Player) behandelt sind.
//
// `react-native-audio-api` wäre der naheliegende Weg (ein Oszillator statt selbst gerechneter
// Samples) und liegt auch schon als Abhängigkeit bereit — aber kein App-Code importiert es
// (`docs/decisions/upload-waehrend-aufnahme.md` §5), es wäre im Web eine zweite Strecke, und
// selbst gerechnete Samples sind messbar: `tone.test.ts` prüft Länge, Pegel und Frequenz, was
// an einem echten Oszillator niemand im Test nachrechnen kann.

import { audioUri, releaseAudio } from '../speech/naturalAudio.js';
import { playAudio } from '../speech/naturalPlayer.js';
import type { ListenEnd, PlayHandle } from '../speech/pipeline.js';
import { wavOfLine, wavOfPitch } from './tone.js';
import type { Pitch, StaffBars } from '@learnbuddy/shared-types/contracts';

/**
 * Nur EINE Wiedergabe gleichzeitig, und das ist eine Entscheidung: zwei übereinander gelegte
 * Zeilen sind ein Akkord, und Mehrstimmigkeit ist ausdrücklich draußen (`contracts/staff.ts`).
 * Ein neuer Tipp während eines Tons ersetzt ihn also, statt dazuzukommen.
 */
let current: { handle: PlayHandle; uri: string } | null = null;

function stopCurrent(): void {
  if (current === null) return;
  const { handle, uri } = current;
  current = null;
  handle.stop();
  releaseAudio(uri);
}

/** Alles anhalten — beim Verlassen der Frage oder des Bildschirms. */
export function stopNotes(): void {
  stopCurrent();
}

function play(base64: string, onEnd?: (why: ListenEnd) => void): PlayHandle {
  stopCurrent();
  let uri: string;
  try {
    uri = audioUri(base64, 'audio/wav');
  } catch {
    // Kein Platz im Cache, kein Dateisystem: nichts zu hören, und die Frage bleibt bedienbar.
    onEnd?.('error');
    return { stop: () => undefined };
  }
  const mine = { handle: { stop: () => undefined } as PlayHandle, uri };
  const handle = playAudio(uri, {
    onStart: () => undefined,
    onProgress: () => undefined,
    onEnd: (why) => {
      if (current === mine) current = null;
      releaseAudio(uri);
      onEnd?.(why);
    },
  });
  mine.handle = handle;
  current = mine;
  return handle;
}

/** Die ganze Zeile, im Tempo der Aufgabe. */
export function playLine(
  bars: StaffBars,
  tempo: number,
  onEnd?: (why: ListenEnd) => void,
): PlayHandle {
  return play(wavOfLine(bars, tempo), onEnd);
}

/**
 * Ein einzelner Ton, sofort — das ist die Rückmeldung auf jeden Tipp auf der Notenzeile
 * (issue #226: „Bei jedem Tipp spielt die Note sofort"). Sie hört damit, ob die Linie, die sie
 * getroffen hat, die gemeinte ist, bevor irgendjemand ein Urteil fällt.
 */
export function playPitch(pitch: Pitch): PlayHandle {
  return play(wavOfPitch(pitch));
}
