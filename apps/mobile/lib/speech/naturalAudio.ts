// Audio of one sentence (base64 from POST /voice/speech) as something the player can open:
// a short-lived file in the app's cache on the phone (AVPlayer does not open data: URIs).
// Deleted once played; the cache directory is the system's to clear anyway.

import { File, Paths } from 'expo-file-system';
import { prepareAudio, releasePlayer } from './naturalPlayer.js';

let seq = 0;

export function audioUri(base64: string, mime: 'audio/mpeg' | 'audio/wav'): string {
  const file = new File(
    Paths.cache,
    `buddy-voice-${Date.now()}-${seq++}.${mime === 'audio/wav' ? 'wav' : 'mp3'}`,
  );
  file.create({ overwrite: true });
  file.write(base64, { encoding: 'base64' });
  return file.uri;
}

export function releaseAudio(uri: string): void {
  if (releasePlayer(uri)) return;
  try {
    new File(uri).delete();
  } catch {
    // Already gone.
  }
}

/** Native media transport progressively buffers MP3, including the sentence fetched ahead. */
export async function streamAudio(
  source: { uri: string; headers: Record<string, string> },
  signal: AbortSignal,
): Promise<string> {
  if (signal.aborted) throw new Error('stopped');
  const uri = prepareAudio(source);
  signal.addEventListener('abort', () => releasePlayer(uri), { once: true });
  return uri;
}
