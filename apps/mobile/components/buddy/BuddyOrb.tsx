// Buddy's face: a warm, glowing orb (terracotta → peach with a lavender rim
// and a soft highlight). The same Buddy at every size — large when it
// introduces itself, small beside its messages. Decorative for screen readers.
import { View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

export function BuddyOrb({ size = 32 }: { size?: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id="body" cx="38%" cy="32%" r="75%">
            <Stop offset="0" stopColor="#fff1e6" />
            <Stop offset="0.35" stopColor="#f6c2a4" />
            <Stop offset="0.72" stopColor="#dc8f6f" />
            <Stop offset="1" stopColor="#b98ad8" />
          </RadialGradient>
          <RadialGradient id="shine" cx="35%" cy="28%" r="30%">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.9} />
            <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="48" fill="url(#body)" />
        <Circle cx="38" cy="32" r="26" fill="url(#shine)" />
      </Svg>
    </View>
  );
}
