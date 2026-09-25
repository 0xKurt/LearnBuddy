import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
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
  /** A pastel tint instead of the variant's background (suggestions: one tint per kind). */
  tone?: SubjectTone;
  /** Fully rounded ends (chips). */
  pill?: boolean;
  /** Set for one choice of several (Segmented): read out as a radio button and whether it is chosen. */
  selected?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

const SIZE_STYLE: Record<Size, { height: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { height: 44, paddingHorizontal: 16, fontSize: 15 },
  md: { height: 48, paddingHorizontal: 22, fontSize: 16 },
  lg: { height: 54, paddingHorizontal: 26, fontSize: 17 },
};

const VARIANT_STYLE: Record<
  Variant,
  { bg: string; color: string; borderColor: string; borderWidth: number }
> = {
  primary: { bg: LB.primary, color: '#fff', borderColor: 'transparent', borderWidth: 0 },
  soft: { bg: LB.primaryLt, color: LB.primaryDk, borderColor: 'transparent', borderWidth: 0 },
  outline: { bg: '#fff', color: LB.ink, borderColor: LB.hairline, borderWidth: 1 },
  ghost: { bg: 'transparent', color: LB.ink2, borderColor: 'transparent', borderWidth: 0 },
  danger: {
    bg: 'transparent',
    color: LB.danger,
    borderColor: 'rgba(177,73,60,0.25)',
    borderWidth: 1,
  },
};

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
  selected,
  tone,
  pill = false,
  accessibilityLabel,
  accessibilityHint,
}: Props) {
  const s = SIZE_STYLE[size];
  const base = VARIANT_STYLE[variant];
  const v = tone ? { ...base, bg: TONE_BG[tone], color: LB.ink, borderWidth: 0 } : base;
  const radius = pill ? s.height / 2 : 14;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={selected === undefined ? 'button' : 'radio'}
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityHint={accessibilityHint}
      accessibilityState={
        selected === undefined ? { disabled } : { disabled, selected, checked: selected }
      }
      android_ripple={{ color: 'rgba(0,0,0,0.1)', borderless: false }}
      style={{
        alignSelf: full ? 'stretch' : center ? 'center' : 'flex-start',
        ...(grow ? { flexGrow: 1 } : {}),
        opacity: disabled ? 0.6 : 1,
        borderRadius: radius,
        overflow: 'hidden',
      }}
    >
      {({ pressed }) => (
        <View
          style={{
            ...(wrap ? { minHeight: s.height, paddingVertical: 12 } : { height: s.height }),
            ...(grow ? { flexGrow: 1 } : {}),
            gap: icon ? 10 : 0,
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
          {icon ? (
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Icon
                name={icon}
                size={Math.round(s.fontSize * 1.4)}
                color={variant === 'outline' || tone ? LB.primaryDk : v.color}
              />
            </View>
          ) : null}
          {label !== undefined ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ flexShrink: 1 }}
            >
              {label}
            </View>
          ) : (
            <Text
              {...(wrap
                ? {}
                : { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.82 })}
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
