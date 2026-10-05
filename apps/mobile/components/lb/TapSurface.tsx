// The one surface that says where a finger is on a drawing (issues #248, #249, #275, #416): the
// place of the finger is the answer's value — the crossing of a grid a point snaps to, the line of
// a staff a note lands on, the place in a figure or on a map — not which button was hit. It knows
// nothing of what is drawn underneath; the caller decides what a position means.
//
// Two ways to touch it, one component (#416, Engineering-Regel 3):
//   · tapped (`onTap`): one target over the whole drawing, so no part is too small to hit; a
//     mistap costs one tap on a key that moves what she set. A Pressable — a raw one belongs in
//     components/lb (CLAUDE.md rule 13) — whose role the caller gives (`button` for the note line
//     and the grid). Without a finger — a screen reader's double tap, a keyboard — there is no
//     position: `onTap` gets null and the caller puts the thing in a sensible place.
//   · dragged (`drag` + `onPoint`): a pan of react-native-gesture-handler that starts on
//     touch-down, so a tap and a drag are one gesture and the mark follows the finger (figures,
//     maps; library check in #248). It has no role unless the caller gives one: over a figure it
//     is a pointer surface, and the controls a screen reader uses stand next to it, in words
//     (`TapFigure`).
//
// The target lies OVER the drawing as an empty layer: a touch then always lands on the target
// itself, so its position is measured from the target's own corner on iOS, Android and the web
// alike (on the web `locationX` is relative to the element under the finger — a line of the
// drawing would otherwise move the origin). Nothing paints on the target (rule 13).

import { useRef, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type AccessibilityRole,
  type GestureResponderEvent,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

type Common = {
  /** Its role for a screen reader; none by default (a pointer surface). */
  accessibilityRole?: AccessibilityRole;
  /** What the drawing shows now, for a screen reader (it hears the drawing here, where it acts). */
  accessibilityLabel?: string;
  /** What a touch does. */
  accessibilityHint?: string;
  disabled?: boolean;
  testID?: string;
  /** Layout only (size, flex) — never a colour. Without it the surface fills the box it sits in. */
  style?: ViewStyle;
  /** The drawing, under the target. */
  children?: ReactNode;
};

type Tapped = Common & {
  drag?: false;
  /** The tap, with where it landed from the surface's top-left corner — or null without a finger. */
  onTap: (at: { x: number; y: number } | null) => void;
};

type Dragged = Common & {
  /** The finger is followed: on touch-down and while it moves. */
  drag: true;
  /** The finger at (x, y), in the surface's own coordinates. */
  onPoint: (x: number, y: number) => void;
  /** The finger left the surface. */
  onRelease?: () => void;
};

export function TapSurface(props: Tapped | Dragged) {
  const { disabled = false, testID, style = StyleSheet.absoluteFill, children } = props;
  const a11y: A11yProps = {
    accessible: props.accessibilityRole !== undefined || props.accessibilityLabel !== undefined,
    accessibilityRole: props.accessibilityRole,
    accessibilityLabel: props.accessibilityLabel,
    accessibilityHint: props.accessibilityHint,
    accessibilityState: { disabled },
  };
  return (
    <View testID={testID} style={style}>
      {children}
      {props.drag ? (
        <DragTarget {...props} disabled={disabled} a11y={a11y} />
      ) : (
        <TapTarget {...props} disabled={disabled} a11y={a11y} />
      )}
    </View>
  );
}

type A11yProps = Pick<
  ViewProps,
  | 'accessible'
  | 'accessibilityRole'
  | 'accessibilityLabel'
  | 'accessibilityHint'
  | 'accessibilityState'
>;
type A11y = { a11y: A11yProps; disabled: boolean };

function DragTarget({ onPoint, onRelease, disabled, a11y }: Dragged & A11y) {
  const pan = Gesture.Pan()
    .minDistance(0)
    .enabled(!disabled)
    .runOnJS(true)
    .onBegin((e) => onPoint(e.x, e.y))
    .onUpdate((e) => onPoint(e.x, e.y))
    .onFinalize(() => onRelease?.());
  return (
    <GestureDetector gesture={pan}>
      <View {...a11y} collapsable={false} style={StyleSheet.absoluteFill} />
    </GestureDetector>
  );
}

function TapTarget({ onTap, disabled, a11y }: Tapped & A11y) {
  const at = useRef<{ x: number; y: number } | null>(null);
  const pressIn = (e: GestureResponderEvent) => {
    const { locationX: x, locationY: y } = e.nativeEvent;
    at.current = Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  };
  const press = () => {
    const where = at.current;
    at.current = null;
    onTap(where);
  };
  return (
    <Pressable
      {...a11y}
      disabled={disabled}
      onPressIn={pressIn}
      onPress={press}
      style={StyleSheet.absoluteFill}
    />
  );
}
