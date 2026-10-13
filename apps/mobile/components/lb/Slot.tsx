// A place in a line of text that holds one word (issue #232): the gap of a cloze, tapped full
// from a word bank. A gap she types into is the app's one text field (`LbTextInput`, variant
// cell, issue #365) as wide as this slot would be (`slotWidth`). The look is the answer board's
// one state set (design components/practice/Tasks.jsx `Cloze`, lib/theme/board.ts, #599):
//
//   · empty — the board's slot: canvas with a dashed edge, "something goes here";
//   · filled — placed: her word on the light primary, without a ring, a step bolder than the
//     printed text around it;
//   · current (what the next bank word fills) — the slot with the 2 pt primary frame: the shape
//     says it, not only the colour.
//
// The gap is 36 pt high in the line; its touch target stays 44 pt.
//
// Built here and not in the form because a raw Pressable belongs in components/lb (CLAUDE.md
// Regel 13, Engineering-Regel 2).

import { Pressable, Text, View } from 'react-native';

import { BOARD, tileSkin } from '../../lib/theme/board.js';
import { UI } from '../../lib/theme/components.js';
import type { Palette } from '../../lib/theme/palettes.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';

/** About as wide as what is in the slot: small when empty, never wider than a phone line. */
export function slotWidth(text: string): number {
  const { minWidth, maxWidth, letter } = UI.slot;
  return Math.max(minWidth, Math.min(maxWidth, SPACE.xl + text.length * letter));
}

/** The slot's box for this word and state. */
function slotStyle(palette: Palette, value: string, current: boolean) {
  const skin = tileSkin(palette, value ? 'placed' : 'slot');
  return {
    minWidth: Math.max(BOARD.slot.minWidth, slotWidth(value)),
    height: BOARD.slot.height,
    paddingHorizontal: BOARD.slot.pad,
    borderRadius: RADIUS.md,
    backgroundColor: skin.bg,
    // Always the selected frame's width, so a gap never changes size when it becomes current.
    borderWidth: UI.selectedBorder,
    borderColor: current ? palette.primary : skin.borderColor,
    borderStyle: current ? ('solid' as const) : skin.borderStyle,
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
      style={{ minHeight: TOUCH, justifyContent: 'center' }}
    >
      <View
        style={{
          ...slotStyle(palette, value, current),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={[TYPE.bodyStrong, { color: palette.ink }]}>{value}</Text>
      </View>
    </Pressable>
  );
}
