// Where the voice-mode switch is kept on a phone: AsyncStorage. (The web
// build uses voiceModeStorage.web.ts: AsyncStorage's web module fails to load
// under Metro's web bundle.) Both may fail; callers catch.

import AsyncStorage from '@react-native-async-storage/async-storage';

export function readVoiceMode(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key);
}

export async function writeVoiceMode(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}
