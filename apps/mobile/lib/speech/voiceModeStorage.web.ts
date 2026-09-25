// Where the voice-mode switch is kept in a browser: localStorage (absent or
// blocked in some private windows; callers catch).

export function readVoiceMode(key: string): Promise<string | null> {
  try {
    return Promise.resolve(globalThis.localStorage?.getItem(key) ?? null);
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error('storage unavailable'));
  }
}

export function writeVoiceMode(key: string, value: string): Promise<void> {
  try {
    globalThis.localStorage?.setItem(key, value);
    return Promise.resolve();
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error('storage unavailable'));
  }
}
