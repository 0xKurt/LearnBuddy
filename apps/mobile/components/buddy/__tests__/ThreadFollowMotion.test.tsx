import { act, renderHook } from '@testing-library/react';
import type {
  ScrollView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  LayoutChangeEvent,
} from 'react-native';
import { describe, expect, it, vi } from 'vitest';
import { useThreadFollow } from '../../../lib/buddy/useThreadFollow.js';

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('../../../lib/theme/motion.js', () => ({ useMotionReduced: () => motion.reduced }));

describe('thread scrolling respects live reduced motion', () => {
  it('keeps follow behavior while switching animation off and back on', () => {
    motion.reduced = false;
    const { result, rerender } = renderHook(() => useThreadFollow(null));
    const scrollToEnd = vi.fn();
    result.current.scroll.current = { scrollToEnd } as unknown as ScrollView;
    act(() => {
      result.current.followNext();
      result.current.follow();
    });
    expect(scrollToEnd).toHaveBeenLastCalledWith({ animated: true });
    motion.reduced = true;
    rerender();
    act(() => {
      result.current.followNext();
      result.current.follow();
    });
    expect(scrollToEnd).toHaveBeenLastCalledWith({ animated: false });
    act(() => result.current.toEnd());
    expect(scrollToEnd).toHaveBeenLastCalledWith({ animated: false });
    motion.reduced = false;
    rerender();
    act(() => result.current.toEnd());
    expect(scrollToEnd).toHaveBeenLastCalledWith({ animated: true });
  });
});

const scrolled = (y: number): NativeSyntheticEvent<NativeScrollEvent> =>
  ({
    nativeEvent: {
      contentOffset: { x: 0, y },
      layoutMeasurement: { width: 360, height: 300 },
      contentSize: { width: 360, height: 900 },
    },
  }) as NativeSyntheticEvent<NativeScrollEvent>;

it('settles an active intentional follow at its end once on live reduction', () => {
  motion.reduced = false;
  const { result, rerender } = renderHook(() => useThreadFollow(null));
  const scrollToEnd = vi.fn();
  result.current.scroll.current = { scrollToEnd } as unknown as ScrollView;
  act(() => {
    result.current.onScroll(scrolled(0));
    result.current.followNext();
    result.current.follow();
    result.current.onScroll(scrolled(40));
  });
  expect(scrollToEnd).toHaveBeenCalledWith({ animated: true });
  motion.reduced = true;
  rerender();
  expect(scrollToEnd.mock.calls).toEqual([[{ animated: true }], [{ animated: false }]]);
  rerender();
  expect(scrollToEnd).toHaveBeenCalledTimes(2);
});

it('does not move a manual reader or restart a completed programmatic follow', () => {
  motion.reduced = false;
  const { result, rerender } = renderHook(() => useThreadFollow(null));
  const scrollToEnd = vi.fn();
  result.current.scroll.current = { scrollToEnd } as unknown as ScrollView;
  act(() => {
    result.current.onScroll(scrolled(0));
    result.current.toEnd();
    result.current.onScroll(scrolled(600));
  });
  motion.reduced = true;
  rerender();
  expect(scrollToEnd).toHaveBeenCalledTimes(1);
  motion.reduced = false;
  rerender();
  act(() => {
    result.current.toEnd();
    result.current.onScroll(scrolled(300));
    result.current.onScroll(scrolled(200));
  });
  motion.reduced = true;
  rerender();
  expect(scrollToEnd).toHaveBeenCalledTimes(2);
  expect(result.current.atEnd).toBe(false);
});

it('keeps an interrupted user position when reduction changes before another scroll event', () => {
  motion.reduced = false;
  const { result, rerender } = renderHook(() => useThreadFollow(null));
  const scrollToEnd = vi.fn();
  result.current.scroll.current = { scrollToEnd } as unknown as ScrollView;
  act(() => {
    result.current.onScroll(scrolled(0));
    result.current.toEnd();
    result.current.onScroll(scrolled(40));
    result.current.interrupt();
  });
  motion.reduced = true;
  rerender();
  expect(scrollToEnd.mock.calls).toEqual([[{ animated: true }]]);
});

it('keeps a long initial question at the top until an actual send requests following', () => {
  motion.reduced = false;
  const { result } = renderHook(() => useThreadFollow(null, { initiallyFollowing: false }));
  const scrollToEnd = vi.fn();
  result.current.scroll.current = { scrollToEnd } as unknown as ScrollView;
  act(() => {
    result.current.onLayout({
      nativeEvent: { layout: { width: 360, height: 300, x: 0, y: 0 } },
    } as LayoutChangeEvent);
    result.current.follow();
  });
  expect(scrollToEnd).not.toHaveBeenCalled();
  act(() => {
    result.current.followNext();
    result.current.follow();
  });
  expect(scrollToEnd).toHaveBeenCalledOnce();
  expect(scrollToEnd).toHaveBeenLastCalledWith({ animated: true });
});

it('replaces active end movement with a read start and never settles that read to the bottom', () => {
  motion.reduced = false;
  const { result, rerender } = renderHook(() =>
    useThreadFollow(null, { initiallyFollowing: false }),
  );
  const scrollToEnd = vi.fn();
  const scrollTo = vi.fn();
  result.current.scroll.current = { scrollToEnd, scrollTo } as unknown as ScrollView;
  act(() => {
    result.current.onLayout({
      nativeEvent: { layout: { width: 360, height: 300, x: 0, y: 0 } },
    } as LayoutChangeEvent);
    result.current.onContentSizeChange(360, 900);
    result.current.followNext();
    result.current.follow();
    result.current.readFrom('reply', 250);
  });
  expect(scrollToEnd).toHaveBeenCalledOnce();
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 250, animated: false });
  motion.reduced = true;
  rerender();
  expect(scrollToEnd).toHaveBeenCalledOnce();
  act(() => {
    result.current.interrupt();
    result.current.readFrom('reply', 320);
  });
  expect(scrollTo).toHaveBeenCalledOnce();
});

it('cancels an unmeasured keyed read when the user starts scrolling', () => {
  const { result } = renderHook(() => useThreadFollow(null, { initiallyFollowing: false }));
  const scrollTo = vi.fn();
  result.current.scroll.current = { scrollTo, scrollToEnd: vi.fn() } as unknown as ScrollView;
  act(() => {
    result.current.followNext();
    result.current.readFrom('reasons');
    result.current.inputProps.onTouchMove();
    result.current.onLayout({
      nativeEvent: { layout: { width: 360, height: 300, x: 0, y: 0 } },
    } as LayoutChangeEvent);
    result.current.onContentSizeChange(360, 900);
    result.current.readFrom('reasons', 250);
  });
  expect(scrollTo).not.toHaveBeenCalled();
});

it('a read intent supersedes a queued end follow before content grows', () => {
  motion.reduced = false;
  const { result } = renderHook(() => useThreadFollow(null, { initiallyFollowing: false }));
  const scrollTo = vi.fn();
  const scrollToEnd = vi.fn();
  result.current.scroll.current = { scrollTo, scrollToEnd } as unknown as ScrollView;
  act(() => {
    result.current.onLayout({
      nativeEvent: { layout: { width: 360, height: 300, x: 0, y: 0 } },
    } as LayoutChangeEvent);
    result.current.onContentSizeChange(360, 900);
    result.current.followNext();
    result.current.readFrom('reply', 250);
    result.current.onContentSizeChange(360, 960);
  });
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 250, animated: false });
  expect(scrollToEnd).not.toHaveBeenCalled();
});
