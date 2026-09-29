import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { LB, TONE_BG, type SubjectTone } from '../../lib/theme/colors.js';
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

const SIZE_STYLE: Record<Size, { height: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { height: 44, paddingHorizontal: 16, fontSize: 15 },
  md: { height: 48, paddingHorizontal: 22, fontSize: 16 },
  lg: { height: 54, paddingHorizontal: 26, fontSize: 17 },
};

type VariantSkin = { bg: string; color: string; borderColor: string; borderWidth: number };

// Read at render time: as a module constant this froze the start palette into every
// button — the ghost "Rückgängig" kept pastel ink on the night cards (issue #84, the one
// capture the first scanner missed because the type annotation spans lines).
const variantStyle = (): Record<Variant, VariantSkin> => ({
  primary: { bg: LB.primary, color: LB.paper, borderColor: 'transparent', borderWidth: 0 },
  soft: { bg: LB.primaryLt, color: LB.primaryDk, borderColor: 'transparent', borderWidth: 0 },
  outline: { bg: LB.paper, color: LB.ink, borderColor: LB.hairline, borderWidth: 1 },
  ghost: { bg: 'transparent', color: LB.ink2, borderColor: 'transparent', borderWidth: 0 },
  danger: {
    bg: 'transparent',
    color: LB.danger,
    borderColor: 'rgba(177,73,60,0.25)',
    borderWidth: 1,
  },
});

// The waiting skin (issue #97): a disabled button in its own muted surface and muted
// label from the tokens — 20 % opacity on the primary violet was invisible on a light
// screenshot. The label stays readable (ink2 on canvas ≥ 4.5:1 in every palette, and the
// ready primary stands out ≥ 3:1 against canvas — lib/theme/__tests__/contrast.test.ts).
// Ghost and danger have no fill to mute: their text steps back to the placeholder tone
// (also ≥ 4.5:1 on paper and bg). Read at render time, like variantStyle (issue #84).
const mutedStyle = (variant: Variant): VariantSkin =>
  variant === 'ghost'
    ? { bg: 'transparent', color: LB.placeholder, borderColor: 'transparent', borderWidth: 0 }
    : variant === 'danger'
      ? { bg: 'transparent', color: LB.placeholder, borderColor: LB.hairline, borderWidth: 1 }
      : { bg: LB.canvas, color: LB.ink2, borderColor: LB.hairline, borderWidth: 1 };

export function Btn({
  children,
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  full = false,
  center = false,
  wrap = false,
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
  const s = SIZE_STYLE[size];
  const off = disabled || busy;
  // Busy keeps the variant's colours — the spinner says why nothing happens. Only a
  // plainly disabled button wears the muted skin (issue #97).
  const muted = disabled && !busy;
  const base = variantStyle()[variant];
  const active = tone ? { ...base, bg: TONE_BG[tone], color: LB.ink, borderWidth: 0 } : base;
  const v = muted ? mutedStyle(variant) : active;
  const radius = pill ? s.height / 2 : 14;
  // With a handler, a tap on the waiting button answers ("what is missing?") instead of
  // being swallowed; the accessibilityState below still says disabled either way.
  const reveal = muted && onDisabledPress ? onDisabledPress : undefined;

  return (
    <Pressable
      onPress={reveal ?? onPress}
      disabled={off && !reveal}
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
        alignSelf: full ? 'stretch' : center ? 'center' : 'flex-start',
        ...(grow ? { flexGrow: 1 } : {}),
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
            paddingHorizontal: s.paddingHorizontal,
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
                color={variant === 'outline' || tone ? LB.primaryDk : v.color}
              />
            </View>
          ) : icon ? (
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Icon
                name={icon}
                size={Math.round(s.fontSize * 1.4)}
                // A muted button's icon steps back with its label (issue #97).
                color={!muted && (variant === 'outline' || tone) ? LB.primaryDk : v.color}
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
}
