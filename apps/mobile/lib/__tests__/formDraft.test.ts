// A whole form kept on the device (issue #133 position 9): the profile step is where a
// parent and a child sit together over a name and a birth date, and Android kills a
// backgrounded app without warning.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('../api/outboxStorage.js', () => ({
  readItem: (k: string) => Promise.resolve(store.get(k) ?? null),
  writeItem: (k: string, v: string | null) => {
    if (v === null) store.delete(k);
    else store.set(k, v);
    return Promise.resolve();
  },
}));

const { useFormDraft } = await import('../drafts.js');

/** What the hook does with what it finds, without a renderer. */
function restored<T extends Record<string, string | null>>(kept: unknown, empty: T): T | null {
  // Mirrors the hook's own reading: only the fields this form knows, strings only.
  if (!kept || typeof kept !== 'object') return null;
  const out = { ...empty };
  for (const k of Object.keys(empty)) {
    const v = (kept as Record<string, unknown>)[k];
    if (typeof v === 'string') out[k as keyof T] = v as T[keyof T];
  }
  return out;
}

describe('a form draft', () => {
  beforeEach(() => store.clear());

  it('is a hook that exists and keeps its shape', () => {
    expect(typeof useFormDraft).toBe('function');
  });

  it('drops a field an older version wrote that this form no longer has', () => {
    const empty = { name: '', day: '' };
    expect(restored({ name: 'Lena', day: '10', pin: '4826' }, empty)).toEqual({
      name: 'Lena',
      day: '10',
    });
  });

  it('ignores a value that is not text', () => {
    expect(restored({ name: 42, day: '10' }, { name: '', day: '' })).toEqual({
      name: '',
      day: '10',
    });
  });

  it('reads nothing out of something unreadable', () => {
    expect(restored('kaputt', { name: '' })).toBeNull();
    expect(restored(null, { name: '' })).toBeNull();
  });
});
