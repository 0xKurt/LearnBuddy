import { createContext, useContext, useEffect, useRef } from 'react';
import { Keyboard, type ScrollView, type View } from 'react-native';
import { SPACE } from '../../lib/theme/space.js';

export type Frame = Pick<View, 'measureInWindow'>;
type Viewport = { top: number; height: number };

/** The viewport ends above the pinned footer; the keyboard rectangle is not its boundary. */
export function frameScrollDelta(top: number, height: number, viewport: Viewport, ring: number) {
  const bottom = top + height + ring - (viewport.top + viewport.height);
  if (bottom > 0) return bottom;
  return Math.min(0, top - ring - viewport.top);
}

/** Generation checks cover both asynchronous measurements, blur, replacement and disposal. */
export function createFrameClearance(
  viewport: () => Frame | null,
  scroll: (delta: number) => void,
) {
  let focused: Frame | null = null;
  let generation = 0;
  const refresh = () => {
    const target = focused;
    const visible = viewport();
    const ticket = ++generation;
    if (!target || !visible) return;
    visible.measureInWindow((_x, top, _w, height) => {
      if (ticket !== generation || !height) return;
      target.measureInWindow((_fx, fieldTop, _fw, fieldHeight) => {
        if (ticket !== generation || !fieldHeight) return;
        const delta = frameScrollDelta(fieldTop, fieldHeight, { top, height }, SPACE.xs);
        if (delta) scroll(delta);
      });
    });
  };
  return {
    focus(frame: Frame) {
      focused = frame;
      refresh();
    },
    blur(frame: Frame) {
      if (focused === frame) {
        focused = null;
        ++generation;
      }
    },
    refresh,
    dispose() {
      focused = null;
      ++generation;
    },
  };
}

export type FormClearance = ReturnType<typeof createFrameClearance>;
export const FormFrameContext = createContext<FormClearance | null>(null);
export const useFormFrameClearance = () => useContext(FormFrameContext);

export function useFormViewport() {
  const scroll = useRef<ScrollView>(null);
  const offset = useRef(0);
  const clearance = useRef<FormClearance | null>(null);
  if (!clearance.current) {
    clearance.current = createFrameClearance(
      () => scroll.current?.getNativeScrollRef() ?? null,
      (delta) => {
        const y = Math.max(0, offset.current + delta);
        offset.current = y;
        // Immediate correction has no transition to cancel on a live reduced-motion change.
        scroll.current?.scrollTo({ y, animated: false });
      },
    );
  }
  const controller = clearance.current;
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', controller.refresh);
    const hidden = Keyboard.addListener('keyboardDidHide', controller.refresh);
    return () => {
      shown.remove();
      hidden.remove();
      controller.dispose();
    };
  }, [controller]);
  return { scroll, offset, controller };
}
