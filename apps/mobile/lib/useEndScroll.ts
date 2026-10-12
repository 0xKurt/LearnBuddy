// Tracks only an intentional programmatic movement to the end. Callers own their follow policy.
import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
  type RefObject,
  type WheelEvent,
} from 'react';
import {
  Platform,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';
import { useMotionReduced } from './theme/motion.js';

export function useEndScroll(scroll: RefObject<ScrollView | null>) {
  const reduced = useMotionReduced();
  const active = useRef(false);
  const interrupt = useCallback(() => {
    active.current = false;
  }, []);
  useEffect(() => {
    if (reduced && active.current) {
      active.current = false;
      // It intentionally follows the end, so settle at that end rather than halfway.
      scroll.current?.scrollToEnd({ animated: false });
    }
  }, [reduced, scroll]);
  useEffect(() => interrupt, [interrupt]);
  const toEnd = (animated: boolean) => {
    if (!scroll.current) return;
    active.current = animated && !reduced;
    scroll.current.scrollToEnd({ animated: active.current });
  };
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (contentSize.height - layoutMeasurement.height - contentOffset.y <= 0) interrupt();
  };
  const inputProps = {
    onScrollBeginDrag: interrupt,
    onTouchMove: interrupt,
    ...(Platform.OS === 'web'
      ? {
          onWheel: (event: WheelEvent<HTMLElement>) => {
            if (!event.ctrlKey && event.deltaY !== 0) interrupt();
          },
          onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
            if (event.defaultPrevented) return;
            const target = event.target;
            if (
              target instanceof HTMLElement &&
              target.closest('input, textarea, [contenteditable="true"]')
            )
              return;
            if (
              event.key === ' ' &&
              target instanceof HTMLElement &&
              target.closest('button, [role="button"], [role="checkbox"], [role="radio"], a')
            )
              return;
            if (
              ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)
            )
              interrupt();
          },
        }
      : {}),
  };
  return { toEnd, onScroll, interrupt, inputProps };
}
