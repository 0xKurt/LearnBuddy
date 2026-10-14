// Buddy's moon steps only while it can be seen (#637): an orb on a screen under another one, or
// with the app in the background, keeps no frame callback running. On the POCO X3 the two orbs
// of the chat, hidden under a practice, kept the UI thread at ≈ 1 core with every frame late.

import { NavigationContext } from '@react-navigation/native';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const frame = vi.hoisted(() => ({ active: false, calls: [] as boolean[] }));

vi.mock('react-native-reanimated', async (load) => ({
  ...(await load<Record<string, unknown>>()),
  useFrameCallback: () => ({
    setActive: (on: boolean) => {
      frame.active = on;
      frame.calls.push(on);
    },
    isActive: frame.active,
  }),
}));

const { useMoon } = await import('../../../lib/buddy/useMoon.js');

type Listener = () => void;

/** A route's navigation as react-navigation hands it to the screen: focus and blur events. */
function fakeRoute(focused: boolean) {
  const on: Record<string, Listener[]> = { focus: [], blur: [] };
  const route = {
    focused,
    isFocused: () => route.focused,
    addListener: (name: 'focus' | 'blur', fn: Listener) => {
      on[name]!.push(fn);
      return () => {
        on[name] = on[name]!.filter((f) => f !== fn);
      };
    },
    emit(name: 'focus' | 'blur') {
      route.focused = name === 'focus';
      for (const fn of on[name]!) fn();
    },
  };
  return route;
}

let appListener: ((s: AppStateStatus) => void) | null = null;

beforeEach(() => {
  frame.active = false;
  frame.calls = [];
  appListener = null;
  vi.spyOn(AppState, 'addEventListener').mockImplementation((_type, fn) => {
    appListener = fn as (s: AppStateStatus) => void;
    return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
  });
});
afterEach(() => vi.restoreAllMocks());

function renderOrb(route: ReturnType<typeof fakeRoute> | null, live = true) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    route ? (
      <NavigationContext.Provider value={route as never}>{children}</NavigationContext.Provider>
    ) : (
      <>{children}</>
    );
  return renderHook(() => useMoon('idle', 0.5, live, 3), { wrapper });
}

describe('the moon steps only while it can be seen', () => {
  it('steps on the screen she sees', () => {
    renderOrb(fakeRoute(true));
    expect(frame.active).toBe(true);
  });

  it('starts still on a screen that is under another one', () => {
    renderOrb(fakeRoute(false));
    expect(frame.active).toBe(false);
    expect(frame.calls).not.toContain(true);
  });

  it('holds when another screen comes on top, and goes on when she comes back', () => {
    const route = fakeRoute(true);
    renderOrb(route);
    expect(frame.active).toBe(true);
    act(() => route.emit('blur'));
    expect(frame.active).toBe(false);
    act(() => route.emit('focus'));
    expect(frame.active).toBe(true);
  });

  it('holds while the app is in the background', () => {
    renderOrb(fakeRoute(true));
    act(() => appListener?.('background'));
    expect(frame.active).toBe(false);
    act(() => appListener?.('active'));
    expect(frame.active).toBe(true);
  });

  it('outside any screen (the start, before the stack) it counts as seen', () => {
    renderOrb(null);
    expect(frame.active).toBe(true);
  });

  it('a still orb (`breathe` off) never steps, seen or not', () => {
    renderOrb(fakeRoute(true), false);
    expect(frame.calls).not.toContain(true);
  });
});
