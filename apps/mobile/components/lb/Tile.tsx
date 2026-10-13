// The one piece of an answer board (design components/practice/Tasks.jsx `Tile`, #599): a word, a
// step, a side of a pair, a thing to sort, a place it goes to. Every form that lets her tap, place
// or mark draws its pieces here, so one state always looks the same — and the same as an Option:
//
//   tile · picked · placed · slot · correct · wrong   (lib/theme/board.ts)
//
// Shapes (Tasks.jsx: "Two piece sizes"; the others are the same skin in the places the app has):
//   · step — Option's height and corners, wraps, with a round badge for its number (an order);
//   · word — a 40 pt pill on one line (a word bank, the things of a grouping, a category);
//   · cell — a short thing in a grid place, centred (an order of numbers);
//   · row  — a row of a list she picks one from, its content the caller's (a line of a
//            Fehlerdetektiv, the chosen row of a choice in a sheet);
//   · text — a word or a line set in running text: no frame, the light primary when marked
//            (components/practice/Answers.jsx MarkText).
//
// A state is never colour alone: a number stands in the badge, a tick or a cross at the end of a
// judged step, and the caller's accessible name says the state in words. What it is for a screen
// reader is the caller's: one of a choice (`selected`, a radio), one of several (`checked`, a
// checkbox), or a button. Without `onPress` it is only drawn (an empty place) and not read.
//
// Built here because a raw Pressable belongs in components/lb (CLAUDE.md rule 13), and the board
// states are not a button's variants (implementation/MIGRATION.md §5: Tasks, not Btn).

import type { ReactNode } from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';

import { BOARD, tileBadge, tileSkin, type TileState } from '../../lib/theme/board.js';
import { pressedStyle, UI } from '../../lib/theme/components.js';
import { useMotionReduced } from '../../lib/theme/motion.js';
import { PRACTICE } from '../../lib/theme/practice.js';
import { circle, RADIUS } from '../../lib/theme/radius.js';
import { TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { MAX_FONT_SCALE } from './Btn.js';
import { Icon } from './Icon.js';

export type { TileState } from '../../lib/theme/board.js';
type TileShape = 'step' | 'word' | 'cell' | 'row' | 'text';

type Props = {
  /** Its words; also what a screen reader says unless `accessibilityLabel` is set. */
  children: string;
  /**
   * Drawn instead of the words (math, a word with its punctuation); given the state's ink, so the
   * caller never decides a colour. `children` stays the accessible text.
   */
  label?: ReactNode | ((color: string) => ReactNode);
  state?: TileState;
  shape?: TileShape;
  /** A step's badge: its number, or null for the empty circle of a step without a place. */
  badge?: string | number | null;
  onPress?: () => void;
  disabled?: boolean;
  /** One of a choice: read out as a radio button and whether it is chosen. */
  selected?: boolean;
  /** One of several she may mark together: read out as a checkbox. Never with `selected`. */
  checked?: boolean;
  /** Take the whole width (a word or a line that is a row of its own). */
  full?: boolean;
  /** Fill the height of its row too (two tiles side by side stay equally tall). */
  grow?: boolean;
  /** Its words a step smaller, 15/20 (Tasks.jsx Pairs; a category's name beside two others). */
  dense?: boolean;
  /**
   * A side of a pair: the taller step (Tasks.jsx Pairs: at least 64). A row: as tall as the
   * regular button it stands among.
   */
  tall?: boolean;
  /** Keeps its place and shows nothing: a word of the bank that is in a gap now. */
  hollow?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
};

/** Where the piece stands in its parent, by shape. */
function place(shape: TileShape, full: boolean, grow: boolean): ViewStyle {
  const stretch = full || shape === 'step' || shape === 'cell' || shape === 'row';
  return {
    alignSelf: stretch ? 'stretch' : 'flex-start',
    maxWidth: '100%',
    ...(grow ? { flexGrow: 1 } : {}),
    ...(shape === 'word'
      ? { minHeight: TOUCH, justifyContent: 'center', marginVertical: -BOARD.word.reach }
      : {}),
  };
}

/** The piece's own box, by shape. `inset` is what a thicker frame takes from the padding. */
function box(shape: TileShape, inset: number, grow: boolean, tall: boolean): ViewStyle {
  switch (shape) {
    case 'step':
      return {
        minHeight: tall ? BOARD.step.tall : BOARD.step.minHeight,
        paddingVertical: BOARD.step.padY - inset,
        paddingLeft: BOARD.step.padStart - inset,
        paddingRight: BOARD.step.padEnd - inset,
        gap: BOARD.step.gap,
        borderRadius: RADIUS.md,
        ...(grow ? { flexGrow: 1 } : {}),
      };
    case 'word':
      return {
        height: BOARD.word.height,
        paddingHorizontal: BOARD.word.pad - inset,
        gap: BOARD.word.gap,
        borderRadius: RADIUS.round,
      };
    case 'cell':
      return {
        minHeight: BOARD.cell.minHeight,
        paddingHorizontal: BOARD.cell.pad - inset,
        justifyContent: 'center',
        borderRadius: RADIUS.md,
      };
    case 'row':
      return {
        minHeight: tall ? BOARD.row.tall : BOARD.row.minHeight,
        paddingHorizontal: BOARD.row.pad - inset,
        borderRadius: RADIUS.md,
        ...(grow ? { flexGrow: 1 } : {}),
      };
    case 'text':
      return { minHeight: TOUCH, justifyContent: 'center', borderRadius: BOARD.mark.radius };
  }
}

export function Tile({
  children,
  label,
  state = 'tile',
  shape = 'step',
  badge,
  onPress,
  disabled = false,
  selected,
  checked,
  full = false,
  grow = false,
  dense = false,
  tall = false,
  hollow = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: Props) {
  const { palette } = useTheme();
  const reduced = useMotionReduced();
  const skin = tileSkin(palette, state);
  const judged = state === 'correct' || state === 'wrong';
  // Running text has no frame: only what is marked is filled (Answers.jsx MarkText).
  const framed = shape !== 'text';
  const inset = framed ? skin.borderWidth - PRACTICE.border : 0;
  // Its words take the room the piece has: a step always, anything else when it is a whole row.
  const wide = shape === 'step' || shape === 'row' || full;

  const words =
    label === undefined ? (
      <Text
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        {...(shape === 'word' ? { numberOfLines: 1 } : {})}
        style={[
          dense ? TYPE.boardCompact : TYPE.option,
          {
            color: skin.color,
            flexShrink: 1,
            textAlign: shape === 'cell' ? 'center' : 'left',
          },
        ]}
      >
        {children}
      </Text>
    ) : (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={wide ? { flex: 1, minWidth: 0 } : { flexShrink: 1 }}
      >
        {typeof label === 'function' ? label(skin.color) : label}
      </View>
    );

  const face = (pressed: boolean) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        ...box(shape, inset, grow, tall),
        backgroundColor: framed || state === 'picked' ? skin.bg : 'transparent',
        ...(framed
          ? {
              borderWidth: skin.borderWidth,
              borderColor: skin.borderColor,
              borderStyle: skin.borderStyle,
            }
          : {}),
        // An empty place is empty, not unavailable: it keeps its outline at full strength.
        opacity: disabled && state !== 'slot' ? UI.disabledOpacity : 1,
        ...pressedStyle(pressed, reduced),
      }}
    >
      {shape === 'step' && badge !== undefined ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: BOARD.step.badge,
            height: BOARD.step.badge,
            borderRadius: circle(BOARD.step.badge),
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: tileBadge(palette, state).bg,
          }}
        >
          <Text style={[TYPE.optionBadge, { color: tileBadge(palette, state).color }]}>
            {badge ?? ''}
          </Text>
        </View>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          flexShrink: 1,
          ...(wide ? { flex: 1, minWidth: 0 } : {}),
          ...(shape === 'cell' ? { flexGrow: 1, justifyContent: 'center' } : {}),
          opacity: hollow ? 0 : 1,
        }}
      >
        {words}
      </View>
      {judged && shape !== 'text' ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon
            name={state === 'correct' ? 'check' : 'close'}
            size={BOARD.step.mark}
            color={skin.color}
          />
        </View>
      ) : null}
    </View>
  );

  if (onPress === undefined) {
    return (
      <View
        testID={testID}
        // Only drawn: hidden from a screen reader on every platform (the web reads `aria-hidden`).
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={place(shape, full, grow)}
      >
        {face(false)}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={
        checked !== undefined ? 'checkbox' : selected === undefined ? 'button' : 'radio'
      }
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityHint={accessibilityHint}
      accessibilityState={{
        disabled,
        ...(selected === undefined ? {} : { selected, checked: selected }),
        ...(checked === undefined ? {} : { checked }),
      }}
      // On the web `accessibilityState.checked` alone does not become `aria-checked` (axe:
      // aria-required-attr, issue #73).
      {...(selected === undefined ? {} : { 'aria-checked': selected })}
      {...(checked === undefined ? {} : { 'aria-checked': checked })}
      style={place(shape, full, grow)}
    >
      {({ pressed }) => face(pressed)}
    </Pressable>
  );
}
