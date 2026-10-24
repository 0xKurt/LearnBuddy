// A structured board reports what is clipped so its shell can give back optional help before
// cutting an answer cell. The board keeps the same scroll/focus behavior and every real draft.
import { createContext, forwardRef, useContext, useEffect, useRef } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';

export const BoardOverflow = createContext<((height: number) => void) | null>(null);

export const BoardScroll = forwardRef<ScrollView, ScrollViewProps>(function BoardScroll(
  { onLayout, onContentSizeChange, ...props },
  ref,
) {
  const report = useContext(BoardOverflow);
  const size = useRef({ box: 0, content: 0 });
  const publish = () => {
    if (!props.horizontal && size.current.box > 0)
      report?.(Math.max(0, Math.round(size.current.content - size.current.box)));
  };
  useEffect(
    () => () => {
      if (!props.horizontal) report?.(0);
    },
    [report, props.horizontal],
  );
  return (
    <ScrollView
      {...props}
      ref={ref}
      onLayout={(e) => {
        size.current.box = e.nativeEvent.layout.height;
        publish();
        onLayout?.(e);
      }}
      onContentSizeChange={(width, height) => {
        size.current.content = height;
        publish();
        onContentSizeChange?.(width, height);
      }}
    />
  );
});
