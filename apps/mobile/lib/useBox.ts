// The size a view was laid out at, in whole points — for a drawing that takes the room it gets
// (the note line she writes on, #226; the grid she draws on, #249): its width decides how large it
// wants to be, the height it really gets decides last. Zero until the first layout. A layout of
// the same size sets nothing, so a drawing never renders twice for one measure.

import { useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

export type Box = { width: number; height: number };

export function useBox(): { box: Box; onLayout: (e: LayoutChangeEvent) => void } {
  const [box, setBox] = useState<Box>({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const width = Math.round(e.nativeEvent.layout.width);
    const height = Math.round(e.nativeEvent.layout.height);
    if (width !== box.width || height !== box.height) setBox({ width, height });
  };
  return { box, onLayout };
}
