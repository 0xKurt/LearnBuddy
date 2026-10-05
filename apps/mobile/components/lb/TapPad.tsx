// A surface that says where a finger is on it (issue #248): laid over a drawing, it reports the
// position of a tap — and of a finger that moves on — in its own coordinates. It knows nothing of
// what is drawn underneath; the figure decides which place a position means (`lib/math/tapLayout`).
// The building block for tapping inside a figure, a map (#251) or a picture to label (#252).
//
// Built on react-native-gesture-handler (already in the app, `ZoomViewer`): a pan that starts on
// touch-down, so a tap and a drag are one gesture and the mark follows the finger. Library check in
// #248 (comment of 05.10.2026). No role of its own: it is a pointer surface over a drawing, and the
// controls a screen reader uses stand next to it, in words (`TapFigure`).

import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

type Props = {
  /** The finger at (x, y), in the pad's own coordinates: on touch-down and while it moves. */
  onPoint: (x: number, y: number) => void;
  /** The finger left the pad. */
  onRelease?: () => void;
  disabled?: boolean;
};

/** Fills the box it sits in (position it over the drawing). */
export function TapPad({ onPoint, onRelease, disabled = false }: Props) {
  const pan = Gesture.Pan()
    .minDistance(0)
    .enabled(!disabled)
    .runOnJS(true)
    .onBegin((e) => onPoint(e.x, e.y))
    .onUpdate((e) => onPoint(e.x, e.y))
    .onFinalize(() => onRelease?.());
  return (
    <GestureDetector gesture={pan}>
      <View testID="tap-pad" collapsable={false} style={StyleSheet.absoluteFill} />
    </GestureDetector>
  );
}
