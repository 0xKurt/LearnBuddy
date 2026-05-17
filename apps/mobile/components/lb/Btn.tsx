import { Pressable, Text } from 'react-native';
import { LB } from '../../lib/theme/colors.js';

type Variant = 'primary' | 'soft' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

type Props = {
  children: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  full?: boolean;
  disabled?: boolean;
  /** Overrides the visible label as the accessible name (e.g. when the
   *  label is an icon-only "→" but the action is "Weiter"). */
  accessibilityLabel?: string;
  /** Extra context for screen readers (e.g. "Bestätigt deine Auswahl"). */
  accessibilityHint?: string;
};

const SIZE_STYLE: Record<Size, { height: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { height: 38, paddingHorizontal: 16, fontSize: 13 },
  md: { height: 48, paddingHorizontal: 22, fontSize: 14 },
  lg: { height: 54, paddingHorizontal: 26, fontSize: 15 },
};

// Handoff components.jsx: "Button system — no all-black".
// primary = warm clay (LB.primary), all variants use radius 12.
const VARIANT_BG: Record<Variant, { bg: string; color: string; border?: string; radius: number }> =
  {
    primary: { bg: LB.primary, color: '#fff', radius: 12 },
    soft: { bg: LB.primaryLt, color: LB.primaryDk, radius: 12 },
    outline: { bg: '#fff', color: LB.ink, border: LB.hairline, radius: 12 },
    ghost: { bg: 'transparent', color: LB.ink2, radius: 12 },
    danger: { bg: 'transparent', color: LB.danger, border: 'rgba(177,73,60,0.25)', radius: 12 },
  };

export function Btn({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  full = false,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
}: Props) {
  const s = SIZE_STYLE[size];
  const v = VARIANT_BG[variant];
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={{
        height: s.height,
        paddingHorizontal: s.paddingHorizontal,
        backgroundColor: v.bg,
        borderRadius: v.radius,
        borderWidth: v.border ? 1 : 0,
        borderColor: v.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: full ? 'stretch' : 'flex-start',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Text
        style={{
          color: v.color,
          fontSize: s.fontSize,
          fontWeight: '600',
          letterSpacing: -0.1,
        }}
      >
        {children}
      </Text>
    </Pressable>
  );
}
