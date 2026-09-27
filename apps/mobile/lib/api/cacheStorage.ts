// Where the kept home and profile live on a phone: AsyncStorage (app-private storage).
// The web build uses cacheStorage.web.ts. Every call may fail; callers catch.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { CACHE_PREFIX } from './deviceCache.js';

export function readCache(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key);
}

export async function writeCache(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}

/** Every kept copy, of anyone who used this phone. */
export async function removeAllCaches(): Promise<void> {
  const all = await AsyncStorage.getAllKeys();
  const ours = all.filter((k) => k.startsWith(CACHE_PREFIX));
  if (ours.length > 0) await AsyncStorage.multiRemove(ours);
}
