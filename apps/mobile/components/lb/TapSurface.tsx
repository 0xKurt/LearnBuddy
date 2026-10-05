// A drawing she taps INTO (issues #249, #275): the place of the finger is the answer's value — the
// crossing of a grid a point snaps to, the line of a staff a note lands on — not which button was
// hit. One target over the whole drawing, so no part of it is too small to hit; a mistap costs one
// tap on a key that moves what she set, never a second try at a tiny target.
//
// Built here because a raw Pressable belongs in components/lb (CLAUDE.md rule 13, Engineering-
// Regel 2) and neither <Btn> nor a key reports where it was touched. The note line had this as its
// own Pressable (`StaffAnswer`); the grid would have been the second copy.
//
// The target lies OVER the drawing as an empty layer: a touch then always lands on the target
// itself, so its position is measured from the target's own corner on iOS, Android and the web
// alike (on the web `locationX` is relative to the element under the finger — a line of the
// drawing would otherwise move the origin). Nothing paints on the Pressable (rule 13).
//
// Without a finger — a screen reader's double tap, a keyboard — there is no position: `onTap` gets
// null and the caller puts the thing in a sensible place to be moved from there.

import { useRef, type ReactNode } from 'react';
import { Pressable, View, type GestureResponderEvent, type ViewStyle } from 'react-native';

export type TapPoint = { x: number; y: number };

type Props = {
  /** The tap, with where it landed from the surface's top-left corner — or null without a finger. */
  onTap: (at: TapPoint | null) => void;
  /** What the drawing shows now, for a screen reader (it hears the drawing here, where it acts). */
  accessibilityLabel: string;
  /** What a tap does. */
  accessibilityHint?: string;
  disabled?: boolean;
  testID?: string;
  /** Layout only (size, flex) — never a colour: the drawing underneath is what she sees. */
  style?: ViewStyle;
  /** The drawing. */
  children?: ReactNode;
};

const COVER = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const;

export function TapSurface({
  onTap,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
  testID,
  style,
  children,
}: Props) {
  const at = useRef<TapPoint | null>(null);
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
    <View testID={testID} style={style}>
      {children}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPressIn={pressIn}
        onPress={press}
        style={COVER}
      />
    </View>
  );
}
