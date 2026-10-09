import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { KEEPS_FOCUS } from '../../lib/keepsFocus.js';
import type { Palette, SubjectTone } from '../../lib/theme/palettes.js';
import { circle, RADIUS } from '../../lib/theme/radius.js';
import { CONTROL, RHYTHM, SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Icon, type IconName } from './Icon.js';

type Variant = 'primary' | 'soft' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

type Common = {
  /** The button's text; also what a screen reader says unless accessibilityLabel is set. */
  children: string;
  /**
   * Shown instead of the text when set (e.g. an answer choice with math via
   * <MathText>); `children` stays the accessible text. Style it in the variant's colour.
   */
  label?: ReactNode;
  onPress?: () => void;
  /**
   * A second, quieter way in on the same target — never the only way to anything. The answer
   * option with a picture opens it large this way, while a tap still answers (issue #231).
   */
  onLongPress?: () => void;
  variant?: Variant;
  size?: Size;
  full?: boolean;
  /** Fill the container's height too (tiles in a grid row stay equally tall). */
  grow?: boolean;
  /** Centre a button that is not full width (it sits at the start otherwise). */
  center?: boolean;
  /** Let a long label wrap onto several lines (answer choices, starters) instead of shrinking it. */
  wrap?: boolean;
  /**
   * Tighter horizontal padding (`BTN_PAD_COMPACT`) for a button that is only half a screen
   * wide and whose label needs every point of it — the two-column answer grid
   * (`components/practice/ChoiceList.tsx`, issue #203). The height, and with it the touch
   * target, is untouched.
   */
  compact?: boolean;
  /**
   * No padding at the sides at all: a target set in running text, whose label already has the
   * width it needs — a letter of a word to cut into syllables (`MarkAnswer`, issue #234), where
   * padding would pull the letters apart until the word no longer reads as one. The height, and
   * with it the 44-pt touch height, is untouched.
   */
  bare?: boolean;
  disabled?: boolean;
  /**
   * Answers a tap on the waiting (disabled, not busy) button instead of swallowing it:
   * the screen shows why the button waits (<WaitHint>, issue #97). The button still
   * looks muted and a screen reader still hears "deaktiviert" (accessibilityState).
   */
  onDisabledPress?: () => void;
  /**
   * The button's work is in flight: a small spinner replaces the icon, the button
   * is disabled and a screen reader hears "busy". Every submit that talks to the
   * network passes this instead of only `disabled`.
   */
  busy?: boolean;
  /** A pastel tint instead of the variant's background (suggestions: one tint per kind). */
  tone?: SubjectTone;
  /** Fully rounded ends (chips). */
  pill?: boolean;
  /** Set for one choice of several (Segmented): read out as a radio button and whether it is chosen. */
  selected?: boolean;
  /**
   * Set for one option of several she may tick together (select-all, issue #240): read out as a
   * checkbox and whether it is ticked. Never together with `selected`.
   */
  checked?: boolean;
  /** Opens and closes something below it (a folding group): read out as expanded or collapsed. */
  expanded?: boolean;
  /**
   * A tap that must not take the focus from the field it stands in (`lib/keepsFocus.ts`): the
   * input bar's own "Prüfen" while she types (issue #365).
   */
  keepsFocus?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

type Props = Common &
  (
    | {
        iconOnly?: false;
        /** An icon before the text (the start tiles on Buddy's home, the choices in a sheet). */
        icon?: IconName;
      }
    | {
        /**
         * The icon alone, small and quiet: a side control next to a line it belongs to, not
         * a CTA (issue #295 — the round "Rückgängig" arrow beside a receipt in the chat).
         * `children` stays the accessible name; the icon is all a sighted reader sees.
         * Variant, size, tone and the layout props do not apply to it.
         */
        iconOnly: true;
        icon: IconName;
      }
  );

/**
 * The icon-only button's visible circle. The touch target around it stays TOUCH (44): the
 * Pressable is 44 × 44 and gives the difference back through a negative margin, so a row
 * lays it out as ICON_BTN_SIZE and the target still reaches 44 — on the web too, where
 * `hitSlop` does not exist (issue #295).
 */
const ICON_BTN_SIZE = SPACE.xl;
const ICON_BTN_REACH = (TOUCH - ICON_BTN_SIZE) / 2;

/**
 * How far a button label follows the system text size (iOS AX sizes go past 3×): the WCAG
 * 200% target — the button grows via minHeight, and md/lg labels may wrap onto a second line.
 */
export const MAX_FONT_SCALE = 2;

/**
 * The md button's horizontal padding, and the tighter one `compact` uses. Both are exported
 * because a caller that has to know how much room is left INSIDE the pill must read the real
 * number instead of copying it: the choice grid derives from it how long a word may be before
 * the option has to go full width (`components/practice/ChoiceList.tsx`, issue #203).
 *
 * 22 is the pill's own look and stays the default. SPACE.md (12) is the compact value, and it
 * clears the rounded end: at the height where a 26 pt badge begins (11 pt down a 48 pt pill)
 * the curve of the 24 pt radius has only come in to x ≈ 3.8, so 12 leaves 8 pt of air.
 */
const BTN_PAD_MD = 22;
export const BTN_PAD_COMPACT = SPACE.md;

/**
 * Each size's height, side padding and the step of the type scale its label takes (15, 16, 17).
 * The step, not its size: TYPE is read at render time (issue #84).
 */
const SIZE_STYLE: Record<
  Size,
  { height: number; paddingHorizontal: number; label: 'small' | 'body' | 'header' }
> = {
  sm: { height: CONTROL.sm, paddingHorizontal: SPACE.lg, label: 'small' },
  md: { height: CONTROL.md, paddingHorizontal: BTN_PAD_MD, label: 'body' },
  // token-exempt: the lg pill's own look, a step roomier than md's 22
  lg: { height: CONTROL.lg, paddingHorizontal: 26, label: 'header' },
};

type VariantSkin = { bg: string; color: string; borderColor: string; borderWidth: number };

// Built from the palette the button is rendering with: as a module constant this froze the
// start palette into every button — the ghost "Rückgängig" kept pastel ink on the night
// cards (issue #84, the one capture the first scanner missed because the type annotation
// spans lines).
const variantStyle = (p: Palette): Record<Variant, VariantSkin> => ({
  primary: { bg: p.primary, color: p.paper, borderColor: 'transparent', borderWidth: 0 },
  soft: { bg: p.primaryLt, color: p.primaryDk, borderColor: 'transparent', borderWidth: 0 },
  outline: { bg: p.paper, color: p.ink, borderColor: p.hairline, borderWidth: 1 },
  ghost: { bg: 'transparent', color: p.ink2, borderColor: 'transparent', borderWidth: 0 },
  danger: {
    bg: 'transparent',
    color: p.danger,
    borderColor: 'rgba(177,73,60,0.25)',
    borderWidth: 1,
  },
});

// The waiting skin (issue #97): a disabled button in its own muted surface and muted
// label from the tokens — 20 % opacity on the primary violet was invisible on a light
// screenshot. The label stays readable (ink2 on canvas ≥ 4.5:1 in every palette, and the
// ready primary stands out ≥ 3:1 against canvas — lib/theme/__tests__/contrast.test.ts).
// Ghost and danger have no fill to mute: their text steps back to the placeholder tone
// (also ≥ 4.5:1 on paper and bg). Takes the palette, like variantStyle (issue #84).
const mutedStyle = (variant: Variant, p: Palette): VariantSkin =>
  variant === 'ghost'
    ? { bg: 'transparent', color: p.placeholder, borderColor: 'transparent', borderWidth: 0 }
    : variant === 'danger'
      ? { bg: 'transparent', color: p.placeholder, borderColor: p.hairline, borderWidth: 1 }
      : { bg: p.canvas, color: p.ink2, borderColor: p.hairline, borderWidth: 1 };

export function Btn(props: Props) {
  const { palette, tones } = useTheme();
  if (props.iconOnly) return <IconOnlyBtn {...props} />;
  const {
    children,
    label,
    onPress,
    onLongPress,
    variant = 'primary',
    size = 'md',
    full = false,
    center = false,
    wrap = false,
    compact = false,
    bare = false,
    icon,
    grow = false,
    disabled = false,
    onDisabledPress,
    busy = false,
    selected,
    checked,
    expanded,
    tone,
    pill = false,
    keepsFocus = false,
    accessibilityLabel,
    accessibilityHint,
  } = props;
  const s = SIZE_STYLE[size];
  const fontSize = TYPE[s.label].fontSize;
  const off = disabled || busy;
  // Busy keeps the variant's colours — the spinner says why nothing happens. Only a
  // plainly disabled button wears the muted skin (issue #97).
  const muted = disabled && !busy;
  const base = variantStyle(palette)[variant];
  const active = tone ? { ...base, bg: tones.bg[tone], color: palette.ink, borderWidth: 0 } : base;
  const v = muted ? mutedStyle(variant, palette) : active;
  const radius = pill ? circle(s.height) : RADIUS.tile;
  // A tap on the waiting button answers ("what is missing?") instead of being swallowed.
  // The button itself STAYS truly disabled — un-disabling it made the web lose its
  // `disabled` attribute and read as ready (RN Web's Pressable overwrites any passed
  // `aria-disabled` with its own; the walkthrough's toBeDisabled caught it, issue #97).
  // The tap lands on an invisible catcher laid over the disabled button instead.
  const reveal = muted && onDisabledPress ? onDisabledPress : undefined;

  const button = (
    <Pressable
      {...(keepsFocus ? KEEPS_FOCUS : {})}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={off}
      accessibilityRole={
        checked !== undefined ? 'checkbox' : selected === undefined ? 'button' : 'radio'
      }
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityHint={accessibilityHint}
      accessibilityState={{
        disabled: off,
        busy,
        ...(selected === undefined ? {} : { selected, checked: selected }),
        ...(checked === undefined ? {} : { checked }),
        ...(expanded === undefined ? {} : { expanded }),
      }}
      // A radio must say whether it is chosen; on the web `accessibilityState.checked`
      // alone does not become `aria-checked` (axe: aria-required-attr, issue #73).
      {...(selected === undefined ? {} : { 'aria-checked': selected })}
      {...(checked === undefined ? {} : { 'aria-checked': checked })}
      android_ripple={{ color: 'rgba(0,0,0,0.1)', borderless: false }}
      style={{
        ...(reveal
          ? { alignSelf: 'stretch' as const }
          : {
              alignSelf: full
                ? ('stretch' as const)
                : center
                  ? ('center' as const)
                  : ('flex-start' as const),
              ...(grow ? { flexGrow: 1 } : {}),
            }),
        // Only busy dims: the muted skin carries full opacity so its label keeps ≥ 4.5:1
        // (at 0.8 it fell to ~3.7 on the light palettes, issue #97).
        opacity: busy ? 0.8 : 1,
        borderRadius: radius,
        overflow: 'hidden',
      }}
    >
      {({ pressed }) => (
        <View
          style={{
            // minHeight, not height: large system text grows the button instead of clipping it
            // (audit M-84); the label's scaling is capped below so a row still fits.
            ...(wrap
              ? { minHeight: s.height, paddingVertical: SPACE.md }
              : { minHeight: s.height }),
            ...(grow ? { flexGrow: 1 } : {}),
            gap: icon || busy ? RHYTHM.parts : 0,
            paddingHorizontal: bare ? 0 : compact ? BTN_PAD_COMPACT : s.paddingHorizontal,
            backgroundColor: v.bg,
            borderRadius: radius,
            borderWidth: v.borderWidth,
            borderColor: v.borderColor,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: wrap ? 'flex-start' : 'center',
            opacity: pressed ? 0.78 : 1,
          }}
        >
          {busy ? (
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <ActivityIndicator
                size="small"
                color={variant === 'outline' || tone ? palette.primaryDk : v.color}
              />
            </View>
          ) : icon ? (
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Icon
                name={icon}
                size={Math.round(fontSize * 1.4)}
                // A muted button's icon steps back with its label (issue #97).
                color={!muted && (variant === 'outline' || tone) ? palette.primaryDk : v.color}
              />
            </View>
          ) : null}
          {label !== undefined ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ flexShrink: 1, flexGrow: full ? 1 : 0 }}
            >
              {label}
            </View>
          ) : (
            <Text
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              // sm buttons sit in tight rows and may shrink a little; md/lg wrap onto a
              // second line instead — minHeight lets the button grow (audit M-84).
              {...(wrap
                ? {}
                : size === 'sm'
                  ? { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.82 }
                  : { numberOfLines: 2 })}
              style={{
                flexShrink: 1,
                color: v.color,
                fontSize,
                lineHeight: Math.round(fontSize * 1.35), // token-exempt: 1.35 em of the label
                fontWeight: '600',
                letterSpacing: -0.1,
                textAlign: wrap ? 'left' : 'center',
              }}
            >
              {children}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );

  if (!reveal) return button;
  return (
    <View
      style={{
        alignSelf: full ? 'stretch' : center ? 'center' : 'flex-start',
        ...(grow ? { flexGrow: 1 } : {}),
      }}
    >
      {button}
      {/* Sighted pointer users tap here and hear what is missing; assistive tech talks
          to the real disabled button underneath, so this stays invisible to it. */}
      <Pressable
        onPress={reveal}
        accessible={false}
        focusable={false}
        tabIndex={-1}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
    </View>
  );
}

/**
 * A round icon on its own (issue #295). The owner, 02.10.: "Dieser rückgängig Button der
 * immer erscheint muss kleiner und dezenter werden. Ggfs ein rundes Pfeil icon neben der
 * entsprechenden Nachricht und kein großer fetter button." So: no fill, no ring, the icon in
 * the secondary ink — it stands beside a line and does not shout over it. The symbol carries
 * the meaning (never colour alone); a press shows a soft disc, busy turns the icon into a
 * spinner in the very same place, and a waiting one steps back to the placeholder tone.
 */
function IconOnlyBtn({
  children,
  icon,
  onPress,
  disabled = false,
  busy = false,
  accessibilityLabel,
  accessibilityHint,
}: Common & { icon: IconName }) {
  const { palette } = useTheme();
  const off = disabled || busy;
  const muted = disabled && !busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: off, busy }}
      // On the web `accessibilityState.busy` does not become `aria-busy`: say it directly,
      // so a screen reader there hears the spinner as well.
      aria-busy={busy}
      style={{
        width: TOUCH,
        height: TOUCH,
        margin: -ICON_BTN_REACH,
        borderRadius: circle(TOUCH),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {({ pressed }) => (
        <View
          style={{
            width: ICON_BTN_SIZE,
            height: ICON_BTN_SIZE,
            borderRadius: circle(ICON_BTN_SIZE),
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? palette.primaryLt : 'transparent',
          }}
        >
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {busy ? (
              <ActivityIndicator size="small" color={palette.primaryDk} />
            ) : (
              // 18 inside the 24 circle: the arrow reads at a glance and stays a side note.
              <Icon name={icon} size={18} color={muted ? palette.placeholder : palette.ink2} />
            )}
          </View>
        </View>
      )}
    </Pressable>
  );
}
