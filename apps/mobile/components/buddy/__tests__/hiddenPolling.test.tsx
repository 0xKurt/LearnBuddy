// Only the screen she sees asks the server (#637): the chat stays mounted under a practice, under
// "Dein Material" and under Talk, and while Buddy worked it polled its home every 3 s there — a
// full home (40 queries on the server) parsed and drawn into a screen nobody could see.

import { NavigationContext } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ home: 0 }));

vi.mock('../../../lib/api/endpoints.js', async (load) => ({
  ...(await load<Record<string, unknown>>()),
  getHome: async () => {
    calls.home++;
    return busyHome();
  },
}));

const { queryClient, useHome, keys } = await import('../../../lib/api/queries.js');

/** A home while Buddy is working: it asks again every 3 s. */
function busyHome() {
  return { working: { kind: 'turn' }, thread: [], now: null } as never;
}

function route(focused: boolean) {
  return {
    isFocused: () => focused,
    addListener: () => () => undefined,
  };
}

function renderOn(focused: boolean) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <NavigationContext.Provider value={route(focused) as never}>
        {children}
      </NavigationContext.Provider>
    </QueryClientProvider>
  );
  return renderHook(() => useHome(), { wrapper });
}

beforeEach(() => {
  vi.useFakeTimers();
  calls.home = 0;
  queryClient.clear();
  queryClient.setQueryData(keys.home, busyHome());
});
afterEach(() => {
  queryClient.clear();
  vi.useRealTimers();
});

describe('the home is asked for by the screen she sees', () => {
  it('polls while Buddy works on the screen on top', async () => {
    const { unmount } = renderOn(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(calls.home).toBeGreaterThanOrEqual(3);
    unmount();
  });

  it('asks nothing from a screen under another one', async () => {
    const { unmount } = renderOn(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(calls.home).toBe(0);
    unmount();
  });
});
