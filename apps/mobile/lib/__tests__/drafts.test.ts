// @vitest-environment jsdom
// A field's draft across a remount (walkthrough of #248): a theme switch unmounts and mounts
// the same field within a frame. Storage is slow; the new field must still show the newest
// text, not the one from before the last debounce.

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
/** Storage that answers only when told to — slower than any remount. */
let release: Array<() => void> = [];
vi.mock('../api/outboxStorage.js', () => ({
  readItem: (k: string) =>
    new Promise<string | null>((done) => release.push(() => done(store.get(k) ?? null))),
  writeItem: (k: string, v: string | null) => {
    if (v === null) store.delete(k);
    else store.set(k, v);
    return Promise.resolve();
  },
}));

const { clearDrafts, useDraft } = await import('../drafts.js');

describe('a draft across a remount', () => {
  beforeEach(async () => {
    store.clear();
    release = [];
    const wiping = clearDrafts();
    release.forEach((r) => r());
    await wiping;
    release = [];
  });

  it('comes back with the newest text at once, even before storage has it', () => {
    store.set('lb.draft.t1', 'old');
    const first = renderHook(() => useDraft('t1'));
    act(() => first.result.current.setText('new'));
    first.unmount();
    const second = renderHook(() => useDraft('t1'));
    expect(second.result.current.text).toBe('new');
    // Storage answering late with the older text changes nothing.
    act(() => release.forEach((r) => r()));
    expect(second.result.current.text).toBe('new');
  });

  it('a cleared draft stays cleared, and another key starts empty', () => {
    const first = renderHook(() => useDraft('t2'));
    act(() => first.result.current.setText('x'));
    act(() => first.result.current.clear());
    first.unmount();
    expect(renderHook(() => useDraft('t2')).result.current.text).toBe('');
    expect(renderHook(() => useDraft('t3')).result.current.text).toBe('');
  });
});
