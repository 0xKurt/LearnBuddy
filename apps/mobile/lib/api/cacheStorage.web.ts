// Where the kept home and profile live in a browser: localStorage (absent or blocked in
// some private windows; callers catch).

import { CACHE_PREFIX } from './deviceCache.js';

function store(): Storage {
  const s = globalThis.localStorage;
  if (!s) throw new Error('storage unavailable');
  return s;
}

export function readCache(key: string): Promise<string | null> {
  try {
    return Promise.resolve(store().getItem(key));
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error('storage unavailable'));
  }
}

export function writeCache(key: string, value: string): Promise<void> {
  try {
    store().setItem(key, value);
    return Promise.resolve();
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error('storage unavailable'));
  }
}

export function removeAllCaches(): Promise<void> {
  try {
    const s = store();
    const ours: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k?.startsWith(CACHE_PREFIX)) ours.push(k);
    }
    for (const k of ours) s.removeItem(k);
    return Promise.resolve();
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error('storage unavailable'));
  }
}
