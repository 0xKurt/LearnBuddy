// Buddy's own messages in her thread are reported as opened once she has really seen them (#805,
// lib/buddy/seenOutreach.ts): the thread checks, a moment after it came to rest, which of them
// stand at least half inside the room it can be read in. Only while the app is in front and the
// home is the screen she looks at; a flick past one does not count.

import { useFocusEffect } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { AppState, View, type ScrollView } from 'react-native';

import { outreachOpened } from '../../lib/api/endpoints.js';
import { setHome } from '../../lib/api/queries.js';
import { seenTracker, type Box } from '../../lib/buddy/seenOutreach.js';

/** How long the thread rests before what stands in it counts as seen. */
const SETTLE_MS = 1000;

const tracker = seenTracker((id) => outreachOpened(id, null).then(setHome));

type Register = (id: string) => (view: View | null) => void;
const SeenContext = createContext<Register | null>(null);
export const SeenScope = SeenContext.Provider;

function boxOf(v: Pick<View, 'measureInWindow'>): Promise<Box> {
  return new Promise((resolve) => {
    v.measureInWindow((_x, top, _w, height) => resolve({ top, height }));
  });
}

/**
 * For the thread's ScrollView: `check` after it scrolled or grew, `register` for its rows.
 * `cover` is how far a card lying on top reaches into it.
 */
export function useSeenOutreach(scroll: RefObject<ScrollView | null>, cover: number) {
  const rows = useRef(new Map<string, View>());
  const refs = useRef(new Map<string, (view: View | null) => void>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focused = useRef(false);
  const covered = useRef(cover);
  covered.current = cover;

  const measure = useCallback(async () => {
    const list = scroll.current?.getNativeScrollRef() ?? null;
    if (!focused.current || AppState.currentState !== 'active' || !list) return;
    if (rows.current.size === 0) return;
    const whole = await boxOf(list);
    const top = Math.max(0, covered.current);
    const view = { top: whole.top + top, height: whole.height - top };
    const boxes = await Promise.all(
      [...rows.current].map(async ([id, v]) => ({ id, box: await boxOf(v) })),
    );
    tracker.check(view, boxes);
  }, [scroll]);

  const check = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void measure(), SETTLE_MS);
  }, [measure]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      check();
      return () => {
        focused.current = false;
        if (timer.current) clearTimeout(timer.current);
      };
    }, [check]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  const register = useCallback<Register>(
    (id) => {
      let ref = refs.current.get(id);
      if (!ref) {
        ref = (view) => {
          if (view) {
            rows.current.set(id, view);
            check();
          } else {
            rows.current.delete(id);
            refs.current.delete(id);
          }
        };
        refs.current.set(id, ref);
      }
      return ref;
    },
    [check],
  );

  return { check, register };
}

/**
 * One of Buddy's messages that reached out to her: watched while it is not yet seen. The frame
 * stays once it is, so the row is never drawn anew (and never enters a second time).
 */
export function SeenWhenShown({
  id,
  watch,
  children,
}: {
  id: string;
  watch: boolean;
  children: ReactNode;
}) {
  const register = useContext(SeenContext);
  if (!register) return <>{children}</>;
  return (
    <View collapsable={false} ref={watch ? register(id) : undefined}>
      {children}
    </View>
  );
}
