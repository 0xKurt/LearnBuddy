// Authenticated progressive MP3 for browsers; the existing player owns playback and preloading.
import { prepareAudio, releasePlayer } from './naturalPlayer.js';
import { preparePcm, releasePcm } from './pcmPlayer.js';
import { appendAudio } from './mediaStream.js';
const streams = new Map<string, () => void>();

export function audioUri(base64: string, mime: 'audio/mpeg' | 'audio/wav'): string {
  return `data:${mime};base64,${base64}`;
}
export function releaseAudio(uri: string): void {
  if (releasePcm(uri)) return;
  releasePlayer(uri);
  streams.get(uri)?.();
  streams.delete(uri);
}
export async function streamAudio(
  source: { uri: string; headers: Record<string, string> },
  signal: AbortSignal,
): Promise<string> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) controller.abort();
  try {
    const res = await fetch(source.uri, { headers: source.headers, signal: controller.signal });
    if (!res.ok || !res.body) throw new Error('speech unavailable');
    if (res.headers.get('content-type')?.startsWith('audio/pcm'))
      return preparePcm(res.body, controller.signal, () => {
        signal.removeEventListener('abort', abort);
        controller.abort();
      });
    const progressive =
      res.headers.get('content-type')?.startsWith('audio/mpeg') &&
      typeof MediaSource !== 'undefined' &&
      MediaSource.isTypeSupported('audio/mpeg');
    const media = progressive ? new MediaSource() : null;
    // WAV/older browsers keep a complete-file fallback, without making a second synthesis call.
    const url = URL.createObjectURL(media ?? (await res.blob()));
    const uri = prepareAudio({ uri: url });
    streams.set(uri, () => {
      controller.abort();
      signal.removeEventListener('abort', abort);
      URL.revokeObjectURL(url);
    });
    if (media)
      void appendAudio(media, res.body, controller.signal).catch(() => {
        if (!controller.signal.aborted && media.readyState === 'open') media.endOfStream('network');
      });
    return uri;
  } catch (error) {
    controller.abort();
    signal.removeEventListener('abort', abort);
    throw error;
  }
}
