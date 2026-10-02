import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { Palette, SubjectTone } from '../../lib/theme/palettes.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Icon, type IconName } from './Icon.js';

type Variant = 'primary' | 'soft' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

type Props = {
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
  /** An icon before the text (the start tiles on Buddy's home, the choices in a sheet). */
  icon?: IconName;
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
  /** Opens and closes something below it (a folding group): read out as expanded or collapsed. */
  expanded?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

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
export const BTN_PAD_MD = 22;
export const BTN_PAD_COMPACT = SPACE.md;

const SIZE_STYLE: Record<Size, { height: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { height: 44, paddingHorizontal: 16, fontSize: 15 },
  md: { height: 48, paddingHorizontal: BTN_PAD_MD, fontSize: 16 },
  lg: { height: 54, paddingHorizontal: 26, fontSize: 17 },
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

export function Btn({
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
  icon,
  grow = false,
  disabled = false,
  onDisabledPress,
  busy = false,
  selected,
  expanded,
  tone,
  pill = false,
  accessibilityLabel,
  accessibilityHint,
}: Props) {
  const { palette, tones } = useTheme();
  const s = SIZE_STYLE[size];
  const off = disabled || busy;
  // Busy keeps the variant's colours — the spinner says why nothing happens. Only a
  // plainly disabled button wears the muted skin (issue #97).
  const muted = disabled && !busy;
  const base = variantStyle(palette)[variant];
  const active = tone ? { ...base, bg: tones.bg[tone], color: palette.ink, borderWidth: 0 } : base;
  const v = muted ? mutedStyle(variant, palette) : active;
  const radius = pill ? s.height / 2 : 14;
  // A tap on the waiting button answers ("what is missing?") instead of being swallowed.
  // The button itself STAYS truly disabled — un-disabling it made the web lose its
  // `disabled` attribute and read as ready (RN Web's Pressable overwrites any passed
  // `aria-disabled` with its own; the walkthrough's toBeDisabled caught it, issue #97).
  // The tap lands on an invisible catcher laid over the disabled button instead.
  const reveal = muted && onDisabledPress ? onDisabledPress : undefined;

  const button = (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={off}
      accessibilityRole={selected === undefined ? 'button' : 'radio'}
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityHint={accessibilityHint}
      accessibilityState={{
        disabled: off,
        busy,
        ...(selected === undefined ? {} : { selected, checked: selected }),
        ...(expanded === undefined ? {} : { expanded }),
      }}
      // A radio must say whether it is chosen; on the web `accessibilityState.checked`
      // alone does not become `aria-checked` (axe: aria-required-attr, issue #73).
      {...(selected === undefined ? {} : { 'aria-checked': selected })}
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
            ...(wrap ? { minHeight: s.height, paddingVertical: 12 } : { minHeight: s.height }),
            ...(grow ? { flexGrow: 1 } : {}),
            gap: icon || busy ? 10 : 0,
            paddingHorizontal: compact ? BTN_PAD_COMPACT : s.paddingHorizontal,
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
                size={Math.round(s.fontSize * 1.4)}
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
                fontSize: s.fontSize,
                lineHeight: Math.round(s.fontSize * 1.35),
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
