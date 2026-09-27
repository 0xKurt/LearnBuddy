// The parents' admin token lives for one step (docs/privacy.md §PIN gate, H-19):
// it expires, it is dropped when the app goes to the background, and listeners
// (the contact button) learn that it is gone.

import { afterEach, describe, expect, it } from 'vitest';

import {
  adminToken,
  clearAdminToken,
  installAdminAutoClear,
  onAdminChange,
  setAdminToken,
  type AppStateLike,
} from '../admin.js';

function fakeAppState(): AppStateLike & { emit(state: string): void; listeners: number } {
  const listeners = new Set<(state: string) => void>();
  return {
    addEventListener: (_type, listener) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
    emit: (state) => {
      for (const l of listeners) l(state);
    },
    get listeners() {
      return listeners.size;
    },
  };
}

describe('admin token', () => {
  afterEach(() => clearAdminToken());

  it('is gone once it expires, and says so', () => {
    const now = Date.parse('2026-09-28T08:00:00Z');
    setAdminToken('t1', '2026-09-28T08:05:00Z');
    let changes = 0;
    const off = onAdminChange(() => changes++);
    expect(adminToken(now + 4 * 60_000)).toBe('t1');
    expect(adminToken(now + 5 * 60_000)).toBeNull();
    expect(changes).toBe(1);
    // Stays gone, also for a clock that goes back.
    expect(adminToken(now)).toBeNull();
    off();
  });

  it('is cleared when the app goes to the background, not when it is merely inactive', () => {
    const appState = fakeAppState();
    const off = installAdminAutoClear(appState);
    setAdminToken('t2', new Date(Date.now() + 60_000).toISOString());
    appState.emit('inactive');
    expect(adminToken()).toBe('t2');
    appState.emit('background');
    expect(adminToken()).toBeNull();
    off();
    expect(appState.listeners).toBe(0);
  });

  it('tells listeners when a step clears it', () => {
    setAdminToken('t3', new Date(Date.now() + 60_000).toISOString());
    const seen: Array<string | null> = [];
    const off = onAdminChange(() => seen.push(adminToken()));
    clearAdminToken();
    // Clearing twice is quiet.
    clearAdminToken();
    expect(seen).toEqual([null]);
    off();
  });
});
