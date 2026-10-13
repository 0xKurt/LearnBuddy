import { createContext, useContext, useEffect, useRef } from 'react';
import { Keyboard, Platform, type ScrollView, type ScrollViewProps, type View } from 'react-native';
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
  axis: 'vertical' | 'horizontal' = 'vertical',
) {
  let focused: Frame | null = null;
  let generation = 0;
  const refresh = () => {
    const target = focused;
    const visible = viewport();
    const ticket = ++generation;
    if (!target || !visible) return;
    visible.measureInWindow((left, top, width, height) => {
      if (ticket !== generation || !(axis === 'horizontal' ? width : height)) return;
      target.measureInWindow((fieldLeft, fieldTop, fieldWidth, fieldHeight) => {
        if (ticket !== generation || !(axis === 'horizontal' ? fieldWidth : fieldHeight)) return;
        const delta =
          axis === 'horizontal'
            ? frameScrollDelta(fieldLeft, fieldWidth, { top: left, height: width }, SPACE.xs)
            : frameScrollDelta(fieldTop, fieldHeight, { top, height }, SPACE.xs);
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

export function useFormViewport(axis: 'vertical' | 'horizontal' = 'vertical') {
  const scroll = useRef<ScrollView>(null);
  const offset = useRef(0);
  const clearance = useRef<FormClearance | null>(null);
  if (!clearance.current) {
    clearance.current = createFrameClearance(
      () => scroll.current?.getNativeScrollRef() ?? null,
      (delta) => {
        // Browser focus can scroll before RN Web reports its event offset. Read the public
        // live viewport on web; native hosts retain their event-reported offset.
        const node: unknown = scroll.current?.getScrollableNode();
        const property = axis === 'horizontal' ? 'scrollLeft' : 'scrollTop';
        const liveOffset =
          node !== null && typeof node === 'object' && property in node
            ? (Reflect.get(node, property) as unknown)
            : undefined;
        const currentOffset =
          Platform.OS === 'web' && typeof liveOffset === 'number' && Number.isFinite(liveOffset)
            ? liveOffset
            : offset.current;
        const nextOffset = Math.max(0, currentOffset + delta);
        offset.current = nextOffset;
        // Immediate correction has no transition to cancel on a live reduced-motion change.
        scroll.current?.scrollTo(
          axis === 'horizontal'
            ? { x: nextOffset, animated: false }
            : { y: nextOffset, animated: false },
        );
      },
      axis,
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
  /** What the form's ScrollView reports back, so the focused field is measured again. */
  const follow: Pick<ScrollViewProps, 'onLayout' | 'onContentSizeChange' | 'onScroll'> = {
    onLayout: controller.refresh,
    onContentSizeChange: controller.refresh,
    onScroll: ({ nativeEvent }) => {
      offset.current = nativeEvent.contentOffset[axis === 'horizontal' ? 'x' : 'y'];
    },
  };
  return { scroll, offset, controller, follow };
}
