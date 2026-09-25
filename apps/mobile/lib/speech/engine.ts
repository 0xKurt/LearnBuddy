// Which way her speech becomes text (pure, unit-tested; docs/privacy.md
// §Processors): the phone's own recogniser when it can work *on the device*
// for that language — fast, the words appear while she speaks, the audio never
// leaves the phone — otherwise a recording sent once to our EU path
// (POST /voice/transcribe). The system recogniser is never used in its
// server mode (Apple's/Google's servers), and never in the browser (Chrome's
// Web Speech sends audio to Google): she is a minor.

import { baseLanguage } from './voice.js';

export type SpeechEngine = 'device' | 'server';

export type EngineFacts = {
  platform: 'ios' | 'android' | 'web' | 'other';
  /** The system recogniser exists and can be started. */
  available: boolean;
  /** The system says it can recognise without the network. */
  onDeviceSupported: boolean;
  /** Android: the locales whose offline model is installed; null = not reported (iOS). */
  installedLocales: readonly string[] | null;
  /** The locale she will speak ("fr-FR"). */
  locale: string;
  /** This locale already failed on the device during this app run. */
  failedBefore: boolean;
};

const norm = (l: string) => l.replace('_', '-').toLowerCase();

/** The installed locale that fits best: the exact one, else one of the same language; null if none. */
export function installedMatch(installed: readonly string[], locale: string): string | null {
  const want = norm(locale);
  const exact = installed.find((l) => norm(l) === want);
  if (exact) return exact;
  const base = baseLanguage(locale);
  return installed.find((l) => base !== null && baseLanguage(l) === base) ?? null;
}

export function chooseEngine(f: EngineFacts): SpeechEngine {
  if (f.platform !== 'ios' && f.platform !== 'android') return 'server';
  if (!f.available || !f.onDeviceSupported || f.failedBefore) return 'server';
  // Android only works offline with the language's model installed.
  if (f.platform === 'android') {
    if (f.installedLocales === null) return 'server';
    return installedMatch(f.installedLocales, f.locale) !== null ? 'device' : 'server';
  }
  return 'device';
}

/**
 * Recogniser errors after which the same tap simply continues with a
 * recording for our EU path (the device can't do it here), as opposed to
 * "didn't hear anything" or "no permission", which she sees.
 */
export function fallsBackToServer(code: string): boolean {
  return (
    code === 'language-not-supported' ||
    code === 'service-not-allowed' ||
    code === 'network' ||
    code === 'busy' ||
    code === 'bad-grammar' ||
    code === 'client' ||
    code === 'unknown'
  );
}

/**
 * What she has said so far, from the recogniser's results: finished parts
 * are kept (Android reports each pause as a final part), the running part
 * replaces itself as it grows.
 */
export type Heard = { committed: string; interim: string };

export const NOTHING_HEARD: Heard = { committed: '', interim: '' };

const join = (a: string, b: string) => [a.trim(), b.trim()].filter(Boolean).join(' ');

export function hearResult(prev: Heard, transcript: string, isFinal: boolean): Heard {
  const t = transcript.trim();
  if (!isFinal) return { committed: prev.committed, interim: t };
  // Some recognisers repeat everything said so far in each final result.
  if (prev.committed && t.startsWith(prev.committed)) return { committed: t, interim: '' };
  return { committed: join(prev.committed, t), interim: '' };
}

export function heardText(h: Heard): string {
  return join(h.committed, h.interim);
}
