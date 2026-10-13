// The one text field of the app (issue #365): every place she types into — a form field, the
// Composer of the chat and of every practice (`Composer`), a cloze's gap, a table's cell — is
// this component, and this is the only file that renders React Native's `TextInput`
// (`lb/one-text-field`, docs/engineering-guards.md). Before it there were five hand-built fields
// that only looked alike, each with its own border, ring and padding.
//
// One look, three sizes (`variant`):
//   · field — a form field: 52 pt high, the frame corner;
//   · bar   — the Composer's box (`components/lb/Composer.tsx`, the only caller): a floating
//             box that grows with the text. Her text on top over the full width, and `under` it
//             what the Composer puts there — its keys and its row of tools (design
//             components/composer/Composer.jsx, issue #599). A hairline frame that does not
//             change with the focus: the box is the one place she types on its screen;
//   · cell  — a gap in a line of text or a table's cell: one touch high, centred, as wide as the
//             place it stands in, her words in the accent.
// A field and a cell: paper, a frame, and while it has focus the violet frame with a soft halo
// (never colour alone: the halo is a shape). Errors show a red frame and the message below. The frame is the View around the text, so the ring and the controls inside it are one
// thing, and the browser never draws its own black box around the bare text.

import { forwardRef, type ReactNode, useState, useRef, useEffect } from 'react';
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
import { UI } from '../../lib/theme/components.js';
import { COMPOSER } from '../../lib/theme/composer.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Icon } from './Icon.js';
import { useFormFrameClearance } from './FormFrameClearance.js';

/** What a ref to the field holds (focus, blur) — the one name for it outside this file. */
export type LbTextInputRef = TextInput;

/** One line of typed text: the body size, the field's own line height (a page's rows count it). */
export const LINE = UI.field.line;
/** A form field's height (design brief): a touch target and a little air. */
const FIELD_HEIGHT = UI.field.height;
/** How many lines a growing field shows before it scrolls inside itself, unless told otherwise. */
const MAX_ROWS = UI.field.maxRows;
export type LbTextInputProps = Omit<TextInputProps, 'style'> & {
  /** field (default), bar (the input bar's box) or cell (a gap, a table's cell). */
  variant?: 'field' | 'bar' | 'cell';
  /** Bar only: inside the frame under her text — the Composer's keys and its row of tools. */
  under?: ReactNode;
  /** A multiline field's lines before it grows (a list of words wants a few). */
  rows?: number;
  /** The most lines it grows to before it scrolls inside itself (a long text wants more). */
  maxRows?: number;
  /**
   * Code (issue #262): the monospace face of `TYPE.code`, so a program's indentation and an
   * output's columns stand as they run.
   */
  mono?: boolean;
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
  hint?: string;
  toggleAccessibilityLabel?: string;
};

/**
 * RN Web reads legacy blurOnSubmit: explicit submit-without-blur is mapped below to
 * preserve cell focus handoffs. Multiline Enter also needs this key adapter; Shift+Enter
 * and composing input stay the field's own.
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
    under = null,
    rows = 1,
    maxRows = MAX_ROWS,
    mono = false,
    label,
    clearable,
    showToggle,
    shown,
    onToggle,
    error,
    errorMessage,
    hint,
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
  const frame = useRef<View>(null);
  // What a form keeps in view while this has the focus: a form field whole — its label, its box
  // and the note under it, so an error is never left under the pinned action (#599); a cell its
  // own frame.
  const whole = useRef<View>(null);
  const kept = variant === 'field' ? whole : frame;
  const clearance = useFormFrameClearance();
  useEffect(() => {
    const current = kept.current;
    return () => {
      if (current) clearance?.blur(current);
    };
  }, [clearance, kept]);
  const canClear = clearable === true && !showToggle && (rest.value ?? '').length > 0;
  // iOS has no live regions — the field says its error itself (lib/announcePlan.ts).
  useAnnounce(errorMessage);
  const bar = variant === 'bar';
  const cell = variant === 'cell';
  const face = mono ? TYPE.code : cell ? TYPE.cell : TYPE.input;
  const lines = rest.multiline === true;
  // A multiline field with several rows starts its text at the top, like a page.
  const top = lines && rows > 1;
  // What the frame keeps inside its hairline: a form field 52 pt, a cell one touch target.
  const inner = (cell ? TOUCH : FIELD_HEIGHT) - UI.border * 2;
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
          size={showToggle ? UI.field.toggleIcon : UI.field.clearIcon}
          color={pressed ? palette.ink : showToggle ? palette.ink2 : palette.ink3}
        />
      )}
    </Pressable>
  );
  return (
    <View
      ref={whole}
      collapsable={false}
      // A note that appears under the focused field (an error while she types) is brought in too.
      onLayout={() => {
        if (variant === 'field' && focused) clearance?.refresh();
      }}
      style={cell ? { width: '100%' } : { gap: UI.field.labelGap }}
    >
      {label ? (
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={[TYPE.label, { color: palette.ink2, paddingHorizontal: SPACE.xs }]}
        >
          {label}
        </Text>
      ) : null}
      <View
        ref={frame}
        testID={cell ? 'answer-cell-frame' : undefined}
        collapsable={false}
        onLayout={() => {
          if (cell && focused) clearance?.refresh();
        }}
        style={[
          {
            backgroundColor: palette.paper,
            borderWidth: UI.border,
            // The Composer's box keeps its hairline whatever has the focus (Composer.jsx:39).
            borderColor: bar
              ? palette.hairlineStrong
              : error
                ? palette.danger
                : focused
                  ? palette.primary
                  : palette.field,
            borderRadius: bar ? RADIUS.bar : cell ? RADIUS.sm : RADIUS.md,
            padding: bar ? COMPOSER.pad : 0,
            gap: bar ? COMPOSER.gap : undefined,
            // The halo: the same ring on every field and cell (iOS/Android new architecture,
            // the web).
            outlineStyle: 'solid',
            outlineWidth: focused && !bar ? SPACE.xs : 0,
            outlineColor: palette.ring,
          },
          bar ? SHADOW.float : null,
        ]}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: top ? 'flex-start' : 'center',
            // One line of her text is 37 pt of the box; the 44 pt she can touch reaches over
            // the box's own padding above and the gap below (lib/theme/composer.ts).
            marginVertical: bar && !top ? -COMPOSER.text.reach : undefined,
          }}
        >
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
            {...(Platform.OS === 'web' && rest.submitBehavior === 'submit'
              ? { blurOnSubmit: false }
              : {})}
            onKeyPress={webSubmit ?? onKeyPress}
            onFocus={(e) => {
              setFocused(true);
              if ((variant === 'field' || cell) && kept.current) clearance?.focus(kept.current);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              if (kept.current) clearance?.blur(kept.current);
              onBlur?.(e);
            }}
            style={[
              {
                flex: 1,
                minWidth: 0,
                // The bar's text keeps a complete editable touch target above the keys and
                // tools. Multirow growth keeps its row bounds.
                minHeight: top ? rows * LINE + 2 * SPACE.md : bar || cell ? TOUCH : inner,
                // A cell's frame is one touch target, and so is what she taps in it: the field
                // reaches over the frame's hairline instead of standing 42 pt inside it.
                ...(cell ? { marginVertical: -UI.border } : {}),
                maxHeight: lines ? Math.max(rows, maxRows) * LINE + 2 * SPACE.md : undefined,
                paddingHorizontal: bar ? UI.field.composerHorizontal : cell ? SPACE.xs : SPACE.lg,
                // A single line centres itself. A multiline one starting on one line is centred
                // by its padding: (height − LINE) / 2 above and below.
                paddingVertical: top
                  ? SPACE.md
                  : bar
                    ? undefined
                    : lines
                      ? // Half the room the line leaves keeps it centered.
                        UI.field.centeredPadding(inner)
                      : 0,
                // The box's line: 8 above, 6 below (Composer.jsx:43), inside its touch target.
                ...(bar && !top
                  ? {
                      paddingTop: SPACE.sm + COMPOSER.text.reach,
                      paddingBottom: UI.field.composerBottom + COMPOSER.text.reach,
                    }
                  : {}),
                ...face,
                lineHeight: LINE,
                // What she writes into a board stands apart from its print, as a pencil does:
                // the accent, a step bolder (the cloze's tapped words look the same, `Slot`).
                color: cell ? palette.primaryDk : palette.ink,
                textAlign: cell ? 'center' : undefined,
                backgroundColor: 'transparent',
                // The ring is the frame's; the browser's own box around the text stays off.
                outlineWidth: 0,
                ...(Platform.OS === 'web' ? { outlineStyle: 'solid' as const } : {}),
              },
              lines ? growsWithText(rest.value ?? '') : null,
            ]}
          />
          {canClear || (showToggle && onToggle) ? corner : null}
        </View>
        {bar ? under : null}
      </View>
      {/* A note under the field, like the label above it and the hint it replaces (welcome's
          "Mindestens 8 Zeichen."): `small`, in from the frame's edge by the same xs. At `body`
          size (issue #365) "Die beiden Passwörter sind noch nicht gleich." took a second line on
          a 360 phone and pushed the sign-up form under its pinned CTA (issue #392). */}
      {(errorMessage || hint) && (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            TYPE.meta,
            { color: errorMessage ? palette.danger : palette.ink2, paddingHorizontal: SPACE.xs },
          ]}
        >
          {errorMessage || hint}
        </Text>
      )}
    </View>
  );
});
