// Where the conversation on Buddy's home stands: like any chat, at its newest message, unless she
// scrolled up to read (lib/homeLayout.ts followsEnd, user feedback #6). Something she sends always
// brings her back to the end; a reply only while she follows it. What she saw at the end drives
// "↓ Neue Antwort" (lib/buddy/newReply.ts).

import { useEffect, useRef, useState } from 'react';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
} from 'react-native';

import { haptic } from '../haptics.js';
import { followsEnd } from '../homeLayout.js';
import { seenAfter, type ReplySeen } from './newReply.js';

export function useThreadFollow(newestReply: string | null) {
  const scroll = useRef<ScrollView>(null);
  /** Where the conversation stands, and whether it follows its end. */
  const box = useRef({ y: 0, following: true, view: 0, content: 0 });
  // After sending, follow the conversation to its end once the new content has rendered.
  const followEnd = useRef(false);
  /** Whether the conversation stands at its end (drives "↓ Neue Antwort"), and what she saw there. */
  const [atEnd, setAtEnd] = useState(true);
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
    if (b.following) scroll.current?.scrollToEnd({ animated: followEnd.current });
    followEnd.current = false;
  }

  return {
    scroll,
    atEnd,
    seen,
    view,
    follow,
    /** She sent something: the next content brings her to the end. */
    followNext: () => {
      followEnd.current = true;
    },
    /** A conversation: at its newest message, unless she scrolled up to read. */
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const b = box.current;
      const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
      const was = b.following;
      b.following = followsEnd(
        b.following,
        b.y,
        contentOffset.y,
        layoutMeasurement.height,
        contentSize.height,
        undefined,
        b.view !== layoutMeasurement.height || b.content !== contentSize.height,
      );
      b.y = contentOffset.y;
      b.view = layoutMeasurement.height;
      b.content = contentSize.height;
      if (was !== b.following) setAtEnd(b.following);
    },
    onLayout: (e: LayoutChangeEvent) => {
      // How much view the greeting can have (issue #104); a phone that turns or a keyboard
      // that opens changes it, and the room follows.
      setView(e.nativeEvent.layout.height);
      follow();
    },
    /** "↓ Neue Antwort": back to the end, and following it again. */
    toEnd: () => {
      haptic.tap();
      box.current.following = true;
      setAtEnd(true);
      scroll.current?.scrollToEnd({ animated: true });
    },
  };
}

export type ThreadFollow = ReturnType<typeof useThreadFollow>;
