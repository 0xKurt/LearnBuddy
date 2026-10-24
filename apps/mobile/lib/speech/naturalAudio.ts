// Audio of one sentence (base64 from POST /voice/speech) as something the player can open:
// a short-lived file in the app's cache on the phone (AVPlayer does not open data: URIs).
// Deleted once played; the cache directory is the system's to clear anyway.

import { File, Paths } from 'expo-file-system';
import { streamingFetch } from '../api/streamingFetch.js';
import { preparePcm, releasePcm } from './pcmPlayer.js';
import { releasePlayer } from './naturalPlayer.js';

let seq = 0;

function cacheAudio(data: string | Uint8Array, mime: 'audio/mpeg' | 'audio/wav'): string {
  const file = new File(
    Paths.cache,
    `buddy-voice-${Date.now()}-${seq++}.${mime === 'audio/wav' ? 'wav' : 'mp3'}`,
  );
  file.create({ overwrite: true });
  file.write(data, typeof data === 'string' ? { encoding: 'base64' } : undefined);
  return file.uri;
}

export function audioUri(base64: string, mime: 'audio/mpeg' | 'audio/wav'): string {
  return cacheAudio(base64, mime);
}

export function releaseAudio(uri: string): void {
  if (releasePcm(uri) || releasePlayer(uri)) return;
  try {
    new File(uri).delete();
  } catch {
    // Already gone.
  }
}

/** Native streaming uses expo/fetch and the shared PCM queue; files are a cache/legacy fallback. */
export async function streamAudio(
  source: { uri: string; headers: Record<string, string> },
  signal: AbortSignal,
): Promise<string> {
  if (signal.aborted) throw new Error('stopped');
  const controller = new AbortController();
  const abort = () => controller.abort();
  const close = () => {
    signal.removeEventListener('abort', abort);
    controller.abort();
  };
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  let streaming = false;
  try {
    const response = await streamingFetch(source.uri, {
      headers: source.headers,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('speech unavailable');
    if (response.headers.get('content-type')?.startsWith('audio/pcm')) {
      const body = response.body;
      if (!body) throw new Error('speech unavailable');
      const uri = preparePcm(body, controller.signal, close);
      streaming = true;
      return uri;
    }
    // Expo starts consuming bytes when body is accessed. Only open that stream for PCM:
    // a competing arrayBuffer() would otherwise cache an empty/truncated WAV or MP3 (#932).
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (signal.aborted) throw new Error('stopped');
    const mime = response.headers.get('content-type')?.startsWith('audio/wav')
      ? 'audio/wav'
      : 'audio/mpeg';
    return cacheAudio(bytes, mime);
  } finally {
    if (!streaming) close();
  }
}
