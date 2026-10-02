// The layer over an interactive figure that takes her finger (issues #248, #249).
//
// Why a layer of its own and not `onPress` on the drawing: an SVG shape cannot report where in
// the FIGURE it was touched (on the web its own box is the reference), and a bar she pulls
// needs every move, not only the lift. So one empty View lies over the drawing, takes the
// responder, and reports positions in the figure's coordinates: on the first touch the
// offset between the page and the layer is fixed (the layer is the target then), and every
// move after it is the page position minus that offset — also when the finger leaves the layer.
//
// It is not the accessible way to answer: a screen reader cannot aim at a place. That way is
// the "Eingeben" sheet next to every figure (`ExactSheet.tsx`), and this layer is hidden from
// assistive technology so the figure's description is what is read.

import { useRef } from 'react';
import { View, type GestureResponderEvent } from 'react-native';

type Props = {
  width: number;
  height: number;
  disabled: boolean;
  /** A touch that ended where it began (a tap), in layer coordinates. */
  onTap?: (x: number, y: number) => void;
  /** Every position while the finger is down, the first one included (pulling a bar). */
  onDrag?: (x: number, y: number) => void;
  /** The finger is up (or the touch was taken away): a pull has ended. */
  onEnd?: () => void;
  testID?: string;
};

/** A finger that moves less than this between down and up is a tap, not a pull. */
const SLOP = 10;

export function TouchLayer({ width, height, disabled, onTap, onDrag, onEnd, testID }: Props) {
  const origin = useRef<{ dx: number; dy: number; x: number; y: number } | null>(null);

  const at = (e: GestureResponderEvent) => {
    const o = origin.current;
    const { pageX, pageY } = e.nativeEvent;
    return o ? { x: pageX - o.dx, y: pageY - o.dy } : { x: 0, y: 0 };
  };

  return (
    <View
      testID={testID}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ position: 'absolute', left: 0, top: 0, width, height }}
      onStartShouldSetResponder={() => !disabled}
      onMoveShouldSetResponder={() => !disabled}
      // A vertical pull on a bar must not become a scroll of the page around it.
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        const { locationX, locationY, pageX, pageY } = e.nativeEvent;
        origin.current = {
          dx: pageX - locationX,
          dy: pageY - locationY,
          x: locationX,
          y: locationY,
        };
        onDrag?.(locationX, locationY);
      }}
      onResponderMove={(e) => {
        if (!onDrag) return;
        const p = at(e);
        onDrag(p.x, p.y);
      }}
      onResponderRelease={(e) => {
        const o = origin.current;
        const p = at(e);
        origin.current = null;
        onEnd?.();
        if (!o || !onTap) return;
        if (Math.abs(p.x - o.x) <= SLOP && Math.abs(p.y - o.y) <= SLOP) onTap(o.x, o.y);
      }}
      onResponderTerminate={() => {
        origin.current = null;
        onEnd?.();
      }}
    />
  );
}
