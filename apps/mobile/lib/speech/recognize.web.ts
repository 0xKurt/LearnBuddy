// In the browser the system recogniser (Web Speech) would send her voice to
// Google's servers, so it is never used there (engine.ts): the browser always
// records and sends the audio to our EU path.

import type { SpeechEngine } from './engine.js';

export async function engineFor(_locale: string): Promise<SpeechEngine> {
  return 'server';
}

export type DevicePhase = 'idle' | 'starting' | 'listening' | 'stopping';
export type DeviceFailure = 'empty' | 'failed';

export function useDeviceRecognition(_: {
  maxMs: number;
  onText: (text: string) => void;
  onFallback: () => void;
  onFailed: (why: DeviceFailure) => void;
}) {
  return {
    phase: 'idle' as DevicePhase,
    heard: '',
    level: 0,
    elapsedMs: 0,
    start: async (_lang: string, _opts: { untilPause?: boolean } = {}): Promise<void> => {},
    stop: (): void => {},
  };
}
