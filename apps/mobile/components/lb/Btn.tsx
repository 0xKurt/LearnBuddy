import { Pressable, Text, View } from 'react-native';
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
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

const SIZE_STYLE: Record<Size, { height: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { height: 44, paddingHorizontal: 16, fontSize: 13 },
  md: { height: 48, paddingHorizontal: 22, fontSize: 14 },
  lg: { height: 54, paddingHorizontal: 26, fontSize: 15 },
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
  onPress,
  variant = 'primary',
  size = 'md',
  full = false,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
}: Props) {
  const s = SIZE_STYLE[size];
  const v = VARIANT_STYLE[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      android_ripple={{ color: 'rgba(0,0,0,0.1)', borderless: false }}
      style={{
        alignSelf: full ? 'stretch' : 'flex-start',
        opacity: disabled ? 0.6 : 1,
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {({ pressed }) => (
        <View
          style={{
            height: s.height,
            paddingHorizontal: s.paddingHorizontal,
            backgroundColor: v.bg,
            borderRadius: 12,
            borderWidth: v.borderWidth,
            borderColor: v.borderColor,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.78 : 1,
          }}
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            style={{
              color: v.color,
              fontSize: s.fontSize,
              fontWeight: '600',
              letterSpacing: -0.1,
              textAlign: 'center',
            }}
          >
            {children}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
