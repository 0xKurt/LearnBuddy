import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../lib/api/client.js';
import { keys, queryClient } from '../../../lib/api/queries.js';
import { useMaterialAct } from '../../../lib/api/useMaterialAct.js';

describe('shared material action serialization', () => {
  it('blocks a second start until the first settles and releases the guard after settlement', async () => {
    const shared = { current: false };
    const { result } = renderHook(() => useMaterialAct(shared));
    let release: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const second = vi.fn(async () => undefined);
    let first: Promise<void>;
    act(() => {
      first = result.current.act('a', () => pending);
    });
    expect(shared.current).toBe(true);
    expect(result.current.busyId).toBe('a');
    await act(async () => result.current.act('b', second));
    expect(second).not.toHaveBeenCalled();
    await act(async () => {
      release();
      await first;
    });
    expect(shared.current).toBe(false);
    await act(async () => result.current.act('b', second));
    expect(second).toHaveBeenCalledTimes(1);
    expect(result.current.busyId).toBeNull();
  });
  it('reloads material and home facts after a stale target and releases the deletion guard', async () => {
    const invalidation = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const shared = { current: false };
    const { result } = renderHook(() => useMaterialAct(shared));
    try {
      await act(async () =>
        result.current.act('a', async () => {
          throw new ApiError('not_found', 'Already removed', 404);
        }),
      );
      expect(invalidation).toHaveBeenCalledWith({ queryKey: keys.library });
      expect(invalidation).toHaveBeenCalledWith({ queryKey: keys.home });
      expect(shared.current).toBe(false);
      expect(result.current.busyId).toBeNull();
    } finally {
      invalidation.mockRestore();
    }
  });
});
