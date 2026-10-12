// Where the conversation on Buddy's home stands: like any chat, at its newest message, unless she
// scrolled up to read (lib/homeLayout.ts followsEnd, user feedback #6). Something she sends always
// brings her back to the end; a reply only while she follows it. What she saw at the end drives
// "↓ Neue Antwort" (lib/buddy/newReply.ts).

import { useEffect, useRef, useState, type WheelEvent, type KeyboardEvent } from 'react';
import { Platform } from 'react-native';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
} from 'react-native';

import { useEndScroll } from '../useEndScroll.js';
import { haptic } from '../haptics.js';
import { followsEnd } from '../homeLayout.js';
import { seenAfter, type ReplySeen } from './newReply.js';

export function useThreadFollow(
  newestReply: string | null,
  { initiallyFollowing = true }: { initiallyFollowing?: boolean } = {},
) {
  const scroll = useRef<ScrollView>(null);
  const endScroll = useEndScroll(scroll);
  // Layout reports and last scroll-event dimensions serve different purposes.
  const measured = useRef({ view: 0, content: 0 });
  const reading = useRef<{ key: string | null; y: number; manual: boolean }>({
    key: null,
    y: 0,
    manual: false,
  });
  const interrupt = () => {
    if (reading.current.key !== null) {
      reading.current.manual = true;
      followEnd.current = false;
    }
    endScroll.interrupt();
  };
  /** Where the conversation stands, and whether it follows its end. */
  const box = useRef({ y: 0, following: initiallyFollowing, view: 0, content: 0 });
  // After sending, follow the conversation to its end once the new content has rendered.
  const followEnd = useRef(false);
  /** Whether the conversation stands at its end (drives "↓ Neue Antwort"), and what she saw there. */
  const [atEnd, setAtEnd] = useState(initiallyFollowing);
  const [seen, setSeen] = useState<ReplySeen>({ seen: null });
  /** How tall the conversation's view is: the room the greeting needs to stand on top. */
  const [view, setView] = useState(0);

  // At the end of the conversation she sees Buddy's newest reply (no "↓ Neue Antwort" for it).
  useEffect(() => {
    setSeen((prev) => {
      const next = seenAfter(prev, atEnd, newestReply);
      return next.seen === prev.seen ? prev : next;
    });
  }, [atEnd, newestReply]);

  /** To its newest message, unless she scrolled up to read (lib/homeLayout.ts followsEnd). */
  function follow(): void {
    const b = box.current;
    // Something she sent always brings her back to the end (a reply only while she follows it).
    if (followEnd.current) {
      b.following = true;
      setAtEnd(true);
    }
    if (b.following && scroll.current) {
      endScroll.toEnd(followEnd.current);
    }
    followEnd.current = false;
  }

  return {
    scroll,
    atEnd,
    seen,
    view,
    follow,
    interrupt,
    inputProps: {
      ...endScroll.inputProps,
      onScrollBeginDrag: interrupt,
      onTouchMove: interrupt,
      ...(Platform.OS === 'web'
        ? {
            onWheel: (event: WheelEvent<HTMLElement>) => {
              if (!event.ctrlKey && event.deltaY !== 0) interrupt();
              endScroll.inputProps.onWheel?.(event);
            },
            onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
              if (reading.current.key !== null && !event.defaultPrevented) interrupt();
              endScroll.inputProps.onKeyDown?.(event);
            },
          }
        : {}),
    },
    /** Read an arrived reply or explicitly opened content from its measured start. */
    readFrom: (key: string, y?: number) => {
      if (reading.current.key === key && reading.current.manual) return;
      if (reading.current.key !== key) reading.current = { key, y: 0, manual: false };
      // Register intent before measurement too, so user input can cancel a pending read.
      // A read jump replaces, rather than races, any active intentional end movement.
      endScroll.interrupt();
      followEnd.current = false;
      box.current.following = false;
      setAtEnd(false);
      if (y === undefined) return;
      const target = Math.min(
        Math.max(0, y),
        Math.max(0, measured.current.content - measured.current.view),
      );
      reading.current = { key, y: target, manual: false };
      box.current.following = false;
      setAtEnd(false);
      scroll.current?.scrollTo({ y: target, animated: false });
    },
    onContentSizeChange: (_width: number, height: number) => {
      measured.current.content = height;
      follow();
    },
    /** She sent something: the next content brings her to the end. */
    followNext: () => {
      reading.current = { key: null, y: 0, manual: false };
      followEnd.current = true;
    },
    /** A conversation: at its newest message, unless she scrolled up to read. */
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const b = box.current;
      const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
      const was = b.following;
      if (
        reading.current.key !== null &&
        b.view === layoutMeasurement.height &&
        b.content === contentSize.height &&
        Math.abs(contentOffset.y - reading.current.y) > 1
      ) {
        reading.current.manual = true;
      }
      b.following = followsEnd(
        b.following,
        b.y,
        contentOffset.y,
        layoutMeasurement.height,
        contentSize.height,
        undefined,
        b.view !== layoutMeasurement.height || b.content !== contentSize.height,
      );
      endScroll.onScroll(e);
      if (!b.following) endScroll.interrupt();
      b.y = contentOffset.y;
      b.view = layoutMeasurement.height;
      b.content = contentSize.height;
      if (was !== b.following) setAtEnd(b.following);
    },
    onLayout: (e: LayoutChangeEvent) => {
      // How much view the greeting can have (issue #104); a phone that turns or a keyboard
      // that opens changes it, and the room follows.
      measured.current.view = e.nativeEvent.layout.height;
      setView(e.nativeEvent.layout.height);
      follow();
    },
    /** "↓ Neue Antwort": back to the end, and following it again. */
    toEnd: () => {
      if (reading.current.key !== null) reading.current.manual = true;
      haptic.tap();
      box.current.following = true;
      setAtEnd(true);
      if (scroll.current) {
        endScroll.toEnd(true);
      }
    },
  };
}

export type ThreadFollow = ReturnType<typeof useThreadFollow>;
