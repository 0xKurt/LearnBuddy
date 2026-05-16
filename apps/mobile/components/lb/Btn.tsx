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
};

const SIZE_STYLE: Record<Size, { height: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { height: 38, paddingHorizontal: 16, fontSize: 13 },
  md: { height: 48, paddingHorizontal: 22, fontSize: 14 },
  lg: { height: 54, paddingHorizontal: 26, fontSize: 15 },
};

// Doc DESIGN-BRIEF + CLAUDE.md §Design-system: "black-pill primary CTAs".
// `primary` is the high-contrast pill that lives at the bottom of every
// signup / continue screen — must always be readable. `accent` is the
// warm-brown variant for secondary cards.
const VARIANT_BG: Record<Variant, { bg: string; color: string; border?: string }> = {
  primary: { bg: LB.ink, color: '#fff' },
  soft: { bg: LB.primaryLt, color: LB.primaryDk },
  outline: { bg: '#fff', color: LB.ink, border: LB.hairline },
  ghost: { bg: 'transparent', color: LB.ink2 },
  danger: { bg: 'transparent', color: LB.danger, border: 'rgba(177,73,60,0.25)' },
};

export function Btn({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  full = false,
  disabled = false,
}: Props) {
  const s = SIZE_STYLE[size];
  const v = VARIANT_BG[variant];
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => ({
        height: s.height,
        paddingHorizontal: s.paddingHorizontal,
        backgroundColor: v.bg,
        borderRadius: 12,
        borderWidth: v.border ? 1 : 0,
        borderColor: v.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: full ? 'stretch' : 'flex-start',
        // Disabled = still clearly visible (the user needs to SEE the button
        // is there so they know they have to fill the form). 0.6 was a
        // common "yeah I'm here but not active" feel; 0.4 made it ghostly.
        opacity: disabled ? 0.6 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
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
