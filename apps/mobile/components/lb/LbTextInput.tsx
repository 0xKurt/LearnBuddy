// The one text field of the app (issue #365): every place she types into — a form field, the
// input bar of the chat and of a practice answer (`InputBar`), a cloze's gap, a table's cell — is
// this component, and this is the only file that renders React Native's `TextInput`
// (`lb/one-text-field`, docs/engineering-guards.md). Before it there were five hand-built fields
// that only looked alike, each with its own border, ring and padding.
//
// One look, three sizes (`variant`):
//   · field — a form field: 52 pt high, the frame corner;
//   · bar   — the input bar at the bottom of the chat and of a practice answer: a floating pill
//             that holds its own controls (`start`, `end`) and grows with the text;
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

/** One line of typed text: the body size, the field's own line height. */
const LINE = 22;
/** A form field's height (design brief): a touch target and a little air. */
const FIELD_HEIGHT = 52;
/** The tallest a growing field gets before it scrolls inside itself: five lines. */
const MAX_GROW = 5 * LINE + 2 * SPACE.md;

export type LbTextInputProps = Omit<TextInputProps, 'style'> & {
  /** field (default), bar (the input bar's pill) or cell (a gap, a table's cell). */
  variant?: 'field' | 'bar' | 'cell';
  /** Inside the frame, before the text (the chat's +). */
  start?: ReactNode;
  /** Inside the frame, after the text (the mic, "Senden", a unit). */
  end?: ReactNode;
  /** Inside the frame, under the text (how her typed math will be read). */
  under?: ReactNode;
  /** A multiline field's lines before it grows (a list of words wants a few). */
  rows?: number;
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
    end = null,
    under = null,
    rows = 1,
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
          {start}
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
                minHeight: top ? rows * LINE + 2 * SPACE.md : inner,
                maxHeight: lines ? MAX_GROW : undefined,
                paddingHorizontal: bar || cell ? SPACE.xs : SPACE.lg,
                // A bar without a control before the text keeps the screen's gutter inside it.
                paddingLeft: bar && start === null ? SPACE.md : undefined,
                // A single line centres itself. A multiline one starting on one line is centred
                // by its padding: (height − LINE) / 2 above and below.
                paddingVertical: top ? SPACE.md : lines ? (inner - LINE) / 2 : 0,
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
          {end}
          {canClear || (showToggle && onToggle) ? corner : null}
        </View>
        {under}
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
