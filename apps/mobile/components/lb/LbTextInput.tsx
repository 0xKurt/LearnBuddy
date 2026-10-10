// The one text field of the app (issue #365): every place she types into — a form field, the
// input bar of the chat and of a practice answer (`InputBar`), a cloze's gap, a table's cell — is
// this component, and this is the only file that renders React Native's `TextInput`
// (`lb/one-text-field`, docs/engineering-guards.md). Before it there were five hand-built fields
// that only looked alike, each with its own border, ring and padding.
//
// One look, three sizes (`variant`):
//   · field — a form field: 52 pt high, the frame corner;
//   · bar   — the input bar at the bottom of the chat and of a practice answer: a floating box
//             that holds its own controls and grows with the text. Built like the Claude app's
//             (owner 09.10., issue #522): her text on top over the full width, and under it one
//             row of tools — `start` and `chips` on the left, `end` (mic, the round send arrow)
//             on the right. Empty, it is one compact line with the controls beside the text, so a
//             small phone keeps its room; the tools fold under the text with the first letter.
//             The text is never squeezed into a column beside the controls again;
//   · cell  — a gap in a line of text or a table's cell: one touch high, centred, as wide as the
//             place it stands in, her words in the accent.
// The same everywhere: paper, a hairline frame, and while it has focus the violet frame with a
// soft halo (never colour alone: the halo is a shape). Errors show a red frame and the message
// below. The frame is the View around the text, so the ring and the controls inside it are one
// thing, and the browser never draws its own black box around the bare text.

import { forwardRef, type ReactNode, useState } from 'react';
import {
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  Text,
  TextInput,
  type TextInputKeyPressEventData,
  type TextInputProps,
  type TextInputSubmitEditingEventData,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAnnounce } from '../../lib/announce.js';
import { growsWithText } from '../../lib/growsWithText.js';
import { isDarkBackground } from '../../lib/theme/luminance.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Icon } from './Icon.js';

/** What a ref to the field holds (focus, blur) — the one name for it outside this file. */
export type LbTextInputRef = TextInput;

/** One line of typed text: the body size, the field's own line height (a page's rows count it). */
export const LINE = 22;
/** A form field's height (design brief): a touch target and a little air. */
const FIELD_HEIGHT = 52;
/** How many lines a growing field shows before it scrolls inside itself, unless told otherwise. */
const MAX_ROWS = 5;
/** The bar's chips: one row that gives way before the controls do. */
const CHIPS = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: SPACE.sm,
  flexShrink: 1,
} as const;

export type LbTextInputProps = Omit<TextInputProps, 'style'> & {
  /** field (default), bar (the input bar's box) or cell (a gap, a table's cell). */
  variant?: 'field' | 'bar' | 'cell';
  /** Inside the frame, the tools' start (the chat's +, the camera). */
  start?: ReactNode;
  /** Bar only: beside `start`, what goes with the answer (its unit, how her math is read). */
  chips?: ReactNode;
  /** Inside the frame, the tools' end (the mic, the round send arrow, the waveform). */
  end?: ReactNode;
  /** Inside the frame, under the text and above the bar's tools (the math keys she types with). */
  under?: ReactNode;
  /** A multiline field's lines before it grows (a list of words wants a few). */
  rows?: number;
  /** The most lines it grows to before it scrolls inside itself (a long text wants more). */
  maxRows?: number;
  /**
   * A visible name above the field ("Tag", "PIN"). The field says it to a screen reader itself
   * (its `accessibilityLabel`, unless one is given), so the line above is hidden from it.
   */
  label?: string;
  /**
   * An × that empties the field, while it has content (#133 position 17). Opt-in, not
   * everywhere: it earns its place where a typo means retyping a whole address, and it
   * would only be one more thing to hit next to a one-word answer. Never together with
   * `showToggle` — both want the same corner, and a password is not a field to wipe by
   * accident.
   */
  clearable?: boolean;
  showToggle?: boolean;
  shown?: boolean;
  onToggle?: () => void;
  error?: boolean;
  errorMessage?: string;
  toggleAccessibilityLabel?: string;
};

/**
 * The browser does not know `submitBehavior` (react-native-web reads only the deprecated
 * `blurOnSubmit`), so a multiline field there turned every Enter into a new line. Same rule as
 * on the phone; Shift+Enter and an input method still composing stay the field's own.
 */
function submitsOnEnter(
  e: NativeSyntheticEvent<TextInputKeyPressEventData>,
  submit: (() => void) | undefined,
): void {
  const key = e.nativeEvent as TextInputKeyPressEventData & {
    shiftKey?: boolean;
    isComposing?: boolean;
  };
  if (key.key !== 'Enter' || key.shiftKey === true || key.isComposing === true) return;
  e.preventDefault();
  submit?.();
}

export const LbTextInput = forwardRef<LbTextInputRef, LbTextInputProps>(function LbTextInput(
  {
    variant = 'field',
    start = null,
    chips = null,
    end = null,
    under = null,
    rows = 1,
    maxRows = MAX_ROWS,
    label,
    clearable,
    showToggle,
    shown,
    onToggle,
    error,
    errorMessage,
    toggleAccessibilityLabel,
    onFocus,
    onBlur,
    onKeyPress,
    ...rest
  },
  ref,
) {
  const { palette } = useTheme();
  const { t } = useTranslation('common');
  const [focused, setFocused] = useState(false);
  const canClear = clearable === true && !showToggle && (rest.value ?? '').length > 0;
  // iOS has no live regions — the field says its error itself (lib/announcePlan.ts).
  useAnnounce(errorMessage);
  const bar = variant === 'bar';
  const cell = variant === 'cell';
  const lines = rest.multiline === true;
  // A multiline field with several rows starts its text at the top, like a page.
  const top = lines && rows > 1;
  // The bar's text over the full width, its tools in a row under it: as soon as there is text,
  // and always for a page of several rows (issue #522).
  const stacked = bar && ((rest.value ?? '') !== '' || rows > 1);
  // What the frame keeps inside its hairline: a form field 52 pt, a cell and the bar's text
  // one touch target (the bar adds its padding around it).
  const inner = bar ? TOUCH : (cell ? TOUCH : FIELD_HEIGHT) - 2;
  const webSubmit =
    Platform.OS === 'web' && lines && rest.submitBehavior === 'submit'
      ? (e: NativeSyntheticEvent<TextInputKeyPressEventData>) =>
          // The keyboard event goes on as the submit event, as react-native-web does itself.
          submitsOnEnter(e, () =>
            rest.onSubmitEditing?.(
              e as unknown as NativeSyntheticEvent<TextInputSubmitEditingEventData>,
            ),
          )
      : undefined;
  const corner = (
    <Pressable
      onPress={showToggle ? onToggle : () => rest.onChangeText?.('')}
      hitSlop={SPACE.md}
      accessibilityRole="button"
      accessibilityLabel={showToggle ? toggleAccessibilityLabel : t('actions.clear_field')}
      style={{ width: TOUCH, minHeight: TOUCH, alignItems: 'center', justifyContent: 'center' }}
    >
      {/* It answers the finger (audit 30.09., #133 position 6): without it the only sign a
          press landed was the password appearing — and on a mistyped tap, nothing at all. */}
      {({ pressed }) => (
        <Icon
          name={showToggle ? (shown ? 'eye-off' : 'eye') : 'close'}
          size={showToggle ? 20 : 18}
          color={pressed ? palette.ink : showToggle ? palette.ink2 : palette.ink3}
        />
      )}
    </Pressable>
  );
  return (
    <View style={cell ? { width: '100%' } : { gap: SPACE.xs }}>
      {label ? (
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={[TYPE.small, { color: palette.ink2, paddingHorizontal: SPACE.xs }]}
        >
          {label}
        </Text>
      ) : null}
      <View
        style={[
          {
            backgroundColor: palette.paper,
            borderWidth: 1,
            borderColor: error ? palette.danger : focused ? palette.primary : palette.field,
            borderRadius: bar ? RADIUS.bar : cell ? RADIUS.cell : RADIUS.frame,
            padding: bar ? SPACE.xs : 0,
            // The halo: the same ring on every field (iOS/Android new architecture, the web).
            outlineStyle: 'solid',
            outlineWidth: focused ? SPACE.xs : 0,
            outlineColor: palette.ring,
          },
          bar ? SHADOW.float : null,
        ]}
      >
        <View
          style={{
            flexDirection: 'row',
            // flex-end: while the bar grows over several lines its controls stay on its last
            // line, like every messenger (user feedback, issue #187).
            alignItems: bar ? 'flex-end' : top ? 'flex-start' : 'center',
            // 2, off the scale: the text carries its own xs padding on each side — a full step
            // here would double the air inside the pill.
            gap: bar ? 2 : 0, // token-exempt: see above
          }}
        >
          {stacked ? null : start}
          <TextInput
            ref={ref}
            placeholderTextColor={palette.placeholder}
            // iOS draws a light keyboard over the night palette unless it is told otherwise
            // (audit 30.09., #133 position 7). Derived, not hardcoded: a new dark palette
            // gets it for free, and a light one is unaffected.
            keyboardAppearance={isDarkBackground(palette.bg) ? 'dark' : 'light'}
            accessibilityLabel={label}
            textAlignVertical={top ? 'top' : 'center'}
            // Where the growing starts: the web's textarea is two rows tall by default, which
            // makes an empty field look like a box to fill in (`growsWithText` does the rest).
            {...(Platform.OS === 'web' && lines ? { numberOfLines: rows } : {})}
            {...rest}
            onKeyPress={webSubmit ?? onKeyPress}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            style={[
              {
                flex: 1,
                minWidth: 0,
                // Stacked, the tools' row stands right under her last line: its round controls
                // keep their own air inside their touch height, so the text needs none below it
                // (the keys' row does: their faces fill it). Every pt counts on a small phone,
                // where a board stands above the bar (the Fehlerdetektiv's lines on 360×740, #522).
                minHeight: top
                  ? rows * LINE + 2 * SPACE.md
                  : stacked
                    ? LINE + SPACE.sm + (under === null ? 0 : SPACE.sm)
                    : inner,
                maxHeight: lines ? Math.max(rows, maxRows) * LINE + 2 * SPACE.md : undefined,
                paddingHorizontal: stacked ? SPACE.sm : bar || cell ? SPACE.xs : SPACE.lg,
                // A bar without a control before the text keeps the screen's gutter inside it.
                paddingLeft: bar && !stacked && start === null ? SPACE.md : undefined,
                // A single line centres itself. A multiline one starting on one line is centred
                // by its padding: (height − LINE) / 2 above and below.
                paddingVertical: top
                  ? SPACE.md
                  : stacked
                    ? undefined
                    : lines
                      ? // token-exempt: half the room the line leaves, so it sits centred (above)
                        (inner - LINE) / 2
                      : 0,
                ...(stacked && !top
                  ? { paddingTop: SPACE.sm, paddingBottom: under === null ? 0 : SPACE.sm }
                  : {}),
                fontSize: TYPE.body.fontSize,
                lineHeight: LINE,
                // What she writes into a board stands apart from its print, as a pencil does:
                // the accent, a step bolder (the cloze's tapped words look the same, `Slot`).
                color: cell ? palette.primaryDk : palette.ink,
                fontWeight: cell ? '600' : undefined,
                textAlign: cell ? 'center' : undefined,
                backgroundColor: 'transparent',
                // The ring is the frame's; the browser's own box around the text stays off.
                outlineWidth: 0,
              },
              lines ? growsWithText : null,
            ]}
          />
          {stacked || chips === null ? null : (
            <View style={[CHIPS, { alignSelf: 'center' }]}>{chips}</View>
          )}
          {stacked ? null : end}
          {canClear || (showToggle && onToggle) ? corner : null}
        </View>
        {under}
        {stacked ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            {start}
            <View style={[CHIPS, { flex: 1 }]}>{chips}</View>
            {end}
          </View>
        ) : null}
      </View>
      {/* A note under the field, like the label above it and the hint it replaces (welcome's
          "Mindestens 8 Zeichen."): `small`, in from the frame's edge by the same xs. At `body`
          size (issue #365) "Die beiden Passwörter sind noch nicht gleich." took a second line on
          a 360 phone and pushed the sign-up form under its pinned CTA (issue #392). */}
      {errorMessage && (
        <Text
          accessibilityLiveRegion="polite"
          style={[TYPE.small, { color: palette.danger, paddingHorizontal: SPACE.xs }]}
        >
          {errorMessage}
        </Text>
      )}
    </View>
  );
});
