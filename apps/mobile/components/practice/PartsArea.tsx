// Structured answers normally fit without scrolling. While a required cell is focused in
// tight keyboard room, its explicit answer-form viewport may scroll to keep the whole frame
// visible above Composer (#576/#548). The board stays mounted and retains every draft/row.
// Wide required-cell grids use a stable horizontal viewport; nested focus registration
// clears both axes. Ordinary vertical scroll-parts remains strict.

import { useMemo, type ReactNode } from 'react';
import { BoardScroll } from './BoardScroll.js';
import {
  FormFrameContext,
  useFormFrameClearance,
  useFormViewport,
} from '../lb/FormFrameClearance.js';

export function PartsArea({
  children,
  list = false,
  keyboardEditing = false,
  horizontal = false,
}: {
  children: ReactNode;
  list?: boolean;
  keyboardEditing?: boolean;
  /** Wide required-cell grids retain full targets and share both viewport clearances. */
  horizontal?: boolean;
}) {
  const { scroll, offset, controller } = useFormViewport(horizontal ? 'horizontal' : 'vertical');
  const parent = useFormFrameClearance();
  const registration = useMemo(
    () =>
      parent
        ? {
            focus: (frame: Parameters<typeof controller.focus>[0]) => {
              parent.focus(frame);
              controller.focus(frame);
            },
            blur: (frame: Parameters<typeof controller.blur>[0]) => {
              parent.blur(frame);
              controller.blur(frame);
            },
            refresh: () => {
              parent.refresh();
              controller.refresh();
            },
            dispose: controller.dispose,
          }
        : controller,
    [parent, controller],
  );
  return (
    <FormFrameContext.Provider value={registration}>
      <BoardScroll
        ref={scroll}
        testID={
          horizontal
            ? 'scroll-answer-horizontal'
            : keyboardEditing
              ? 'scroll-answer-form'
              : list
                ? 'scroll-list'
                : 'scroll-parts'
        }
        horizontal={horizontal}
        contentContainerStyle={horizontal ? { flexGrow: 1, justifyContent: 'center' } : undefined}
        style={{ flexGrow: 0, flexShrink: 1 }}
        keyboardShouldPersistTaps="handled"
        onLayout={controller.refresh}
        onContentSizeChange={controller.refresh}
        onScroll={(event) => {
          offset.current = horizontal
            ? event.nativeEvent.contentOffset.x
            : event.nativeEvent.contentOffset.y;
        }}
      >
        {children}
      </BoardScroll>
    </FormFrameContext.Provider>
  );
}
