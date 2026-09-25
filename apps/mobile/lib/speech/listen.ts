// "Anhören": reads a word or sentence aloud with the device's text-to-speech
// (expo-speech), in a voice of the text's language, normal or slow. Only one
// text plays at a time; starting another ends the first (its onEnd fires).

import * as Speech from 'expo-speech';

import { pickVoice, SPEECH_RATE, voiceLocale } from './voice.js';

export type ListenEnd = 'done' | 'stopped' | 'error';

type Playing = { token: number; onEnd: (why: ListenEnd) => void };

let playing: Playing | null = null;
let nextToken = 1;
const voiceCache = new Map<string, string | null>();

async function voiceFor(locale: string): Promise<string | null> {
  if (voiceCache.has(locale)) return voiceCache.get(locale) ?? null;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    // Browsers load their voices late: an empty list is not cached.
    if (voices.length === 0) return null;
    const id = pickVoice(voices, locale);
    voiceCache.set(locale, id);
    return id;
  } catch {
    return null;
  }
}

function finish(token: number, why: ListenEnd): void {
  if (playing?.token !== token) return;
  const { onEnd } = playing;
  playing = null;
  onEnd(why);
}

/** Reads `text` aloud in `lang` (ISO 639-1, e.g. "fr"). */
export async function speak(
  text: string,
  lang: string,
  opts: { slow?: boolean; onEnd?: (why: ListenEnd) => void } = {},
): Promise<void> {
  const previous = playing;
  const token = nextToken++;
  playing = { token, onEnd: opts.onEnd ?? (() => undefined) };
  if (previous) {
    previous.onEnd('stopped');
    Speech.stop().catch(() => undefined);
  }
  const language = voiceLocale(lang);
  const voice = await voiceFor(language);
  if (playing?.token !== token) return; // Replaced or stopped while looking for a voice.
  try {
    Speech.speak(text, {
      language,
      ...(voice ? { voice } : {}),
      rate: opts.slow ? SPEECH_RATE.slow : SPEECH_RATE.normal,
      onDone: () => finish(token, 'done'),
      onStopped: () => finish(token, 'stopped'),
      onError: () => finish(token, 'error'),
    });
  } catch {
    finish(token, 'error');
  }
}

/** Stops whatever is being read aloud. */
export function stop(): void {
  const current = playing;
  playing = null;
  current?.onEnd('stopped');
  Speech.stop().catch(() => undefined);
}

export type SpokenPart = { text: string; lang: string };

/**
 * Reads several parts one after another, each in its own language (an
 * instruction in the app language, then the sentence in French). Stopping,
 * or reading something else, ends the whole sequence.
 */
export function speakInOrder(parts: readonly SpokenPart[]): void {
  const rest = parts.filter((p) => p.text.trim().length > 0);
  const first = rest[0];
  if (!first) return;
  void speak(first.text, first.lang, {
    onEnd: (why) => {
      if (why === 'done') speakInOrder(rest.slice(1));
    },
  });
}
