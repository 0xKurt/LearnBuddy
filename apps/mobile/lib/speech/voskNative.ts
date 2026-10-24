// requires live verification on a real iPhone / Android phone
import Constants from 'expo-constants';
import { AppState, Platform, TurboModuleRegistry, type TurboModule } from 'react-native';
import type { VoskBridge } from './vosk.js';

export function nativeVosk(): VoskBridge | null {
  if (Platform.OS === 'web' || Constants.executionEnvironment === 'storeClient') return null;
  try {
    const bridge = TurboModuleRegistry.get<TurboModule & VoskBridge>('Vosk');
    return bridge &&
      typeof bridge.checkPcm === 'function' &&
      typeof bridge.releaseCheckModel === 'function'
      ? bridge
      : null;
  } catch {
    return null;
  }
}

// Free the warm model when the app leaves the foreground. Native work drains before release.
if (Platform.OS !== 'web')
  AppState.addEventListener('change', (state) => {
    if (state !== 'active')
      void nativeVosk()
        ?.releaseCheckModel()
        .catch(() => undefined);
  });

/** Reuse the app's decoder, imported only after the native capability check succeeds. */
export async function pronunciationPcm(base64: string): Promise<string> {
  const { decodeAudioData } = await import('react-native-audio-api');
  const encoded = atob(base64);
  const bytes = Uint8Array.from(encoded, (c) => c.charCodeAt(0));
  const audio = await decodeAudioData(bytes.buffer, 16_000);
  if (
    audio.numberOfChannels !== 1 ||
    audio.sampleRate !== 16_000 ||
    audio.duration > 30 ||
    audio.length === 0
  )
    throw new Error('unsupported_pronunciation_audio');
  const samples = audio.getChannelData(0);
  const pcm = new Uint8Array(samples.length * 2);
  const view = new DataView(pcm.buffer);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  let binary = '';
  for (let offset = 0; offset < pcm.length; offset += 8192)
    binary += String.fromCharCode(...pcm.subarray(offset, offset + 8192));
  return btoa(binary);
}
