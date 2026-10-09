// A press target that paints nothing (issue #311, step 5): the reach of something whose look is
// its own — a chat bubble that opens its menu on a long press, a receipt line, a part of a
// fraction bar, the mic, the talk button, Buddy's orb. A raw Pressable belongs here, in
// components/lb (CLAUDE.md rule 13); a CTA is still a `<Btn>`, an icon in a circle a `<CircleBtn>`.
//
// The style is layout only — never a colour: on React Native 0.73+ a background on a Pressable
// silently does not paint (rule 13). What shows, and how a press shows, is the caller's inner
// View, which gets `pressed`.

import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type ViewStyle } from 'react-native';

type Props = Pick<
  PressableProps,
  | 'onPress'
  | 'onLongPress'
  | 'delayLongPress'
  | 'disabled'
  | 'hitSlop'
  | 'android_ripple'
  | 'accessibilityRole'
  | 'accessibilityLabel'
  | 'accessibilityHint'
  | 'accessibilityState'
  | 'accessibilityValue'
  | 'accessibilityActions'
  | 'onAccessibilityAction'
> & {
  /** Size, place and shape of the target; a colour belongs to what it holds. */
  style?: Omit<ViewStyle, 'backgroundColor'>;
  /** What is pressed — or a render of it that shows the press. */
  children: ReactNode | ((pressed: boolean) => ReactNode);
};

export function PressArea({ style, children, ...press }: Props) {
  return (
    <Pressable {...press} style={style}>
      {({ pressed }) => (typeof children === 'function' ? children(pressed) : children)}
    </Pressable>
  );
}
