// Where the closed card on top is remembered on a phone: AsyncStorage. (The web build uses
// homeCardStorage.web.ts, like voiceModeStorage.) Both may fail; callers catch.

import AsyncStorage from '@react-native-async-storage/async-storage';

export function readClosedCard(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key);
}

export async function writeClosedCard(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}
