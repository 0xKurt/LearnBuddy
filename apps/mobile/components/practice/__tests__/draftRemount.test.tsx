// A typed answer survives a remount of the whole tree (issue #239, CI walkthrough of PR #306):
// the theme switch remounts everything (lib/theme/ThemeProvider.tsx), and the new field read
// the device copy before the old one's asynchronous write had landed — an empty field.

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('../../../lib/api/outboxStorage.js', () => ({
  readItem: (k: string) => Promise.resolve(store.get(k) ?? null),
  writeItem: (k: string, v: string | null) => {
    if (v === null) store.delete(k);
    else store.set(k, v);
    return Promise.resolve();
  },
}));

const { useDraft } = await import('../../../lib/drafts.js');

describe('a text draft across a remount', () => {
  beforeEach(() => store.clear());

  it('comes back from memory before the device write has landed', () => {
    const first = renderHook(() => useDraft('remount.test'));
    act(() => first.result.current.setText('2 H'));
    first.unmount();
    // The device copy is not written yet (its write is asynchronous) …
    expect(store.get('lb.draft.remount.test')).toBeUndefined();
    // … and the new instance still shows what she typed.
    const second = renderHook(() => useDraft('remount.test'));
    expect(second.result.current.text).toBe('2 H');
    // A sent answer stays sent, also for the next instance.
    act(() => second.result.current.clear());
    second.unmount();
    const third = renderHook(() => useDraft('remount.test'));
    expect(third.result.current.text).toBe('');
  });
});
