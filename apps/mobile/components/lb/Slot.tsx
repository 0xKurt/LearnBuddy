// A place in a line of text that holds one word (issue #232): the gap of a cloze, tapped full
// from a word bank or typed into. One look for both ways in (design pass #287):
//
//   · empty — a dashed blank: "something goes here";
//   · filled — her word in the accent, a step bolder, on a soft tint without a frame, so her
//     words stand apart from the printed text the way a pencil stands apart from print;
//   · current (where she types, or what the next bank word fills) — the accent frame: the shape
//     says it, not only the colour.
//
// `slotStyle` is the look alone, for a slot that is a text field; `<Slot>` is the tappable one.
// Built here and not in the form because a raw Pressable belongs in components/lb (CLAUDE.md
// Regel 13, Engineering-Regel 2): neither <Btn> nor <CircleBtn> draws a dashed blank.

import { Pressable, Text, View, type TextStyle } from 'react-native';

import type { Palette } from '../../lib/theme/palettes.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';

/** About as wide as what is in the slot: small when empty, never wider than a phone line. */
export function slotWidth(text: string): number {
  return Math.max(64, Math.min(220, SPACE.xl + text.length * 9.5));
}

/** Her word in a slot: the accent, a step bolder than the body text around it. */
export function slotText(palette: Palette): TextStyle {
  return { color: palette.primaryDk, fontSize: TYPE.body.fontSize, fontWeight: '600' };
}

/** The slot's box for this word and state; a text field adds its own text style. */
export function slotStyle(palette: Palette, value: string, current: boolean) {
  const frame = current
    ? { borderWidth: 2, borderColor: palette.primary, borderStyle: 'solid' as const }
    : value
      ? { borderWidth: 2, borderColor: 'transparent', borderStyle: 'solid' as const }
      : { borderWidth: 1.5, borderColor: palette.field, borderStyle: 'dashed' as const };
  return {
    minWidth: slotWidth(value),
    height: TOUCH,
    paddingHorizontal: SPACE.sm,
    // token-exempt: the corner of a table cell (TableAnswer), until the radius tokens of #311
    borderRadius: 10,
    backgroundColor: value && !current ? palette.primaryLt : palette.paper,
    ...frame,
  };
}

type Props = {
  value: string;
  current: boolean;
  disabled: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
};

/** A slot filled by tapping (a word from a bank); a tap on a filled one is hers to undo. */
export function Slot({
  value,
  current,
  disabled,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: Props) {
  const { palette } = useTheme();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, selected: current }}
    >
      <View
        style={{
          ...slotStyle(palette, value, current),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={slotText(palette)}>{value}</Text>
      </View>
    </Pressable>
  );
}
