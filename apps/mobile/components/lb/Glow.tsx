// The soft pastel light behind a screen (blue, lilac and pink), drawn with SVG
// radial gradients so it looks the same on iOS, Android and the web.
// Purely decorative: no touches, hidden from screen readers.
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

export function Glow({ height = 520 }: { height?: number }) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { height }]}
    >
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id="blue" cx="10%" cy="30%" r="60%">
            <Stop offset="0" stopColor="#cfdcff" stopOpacity={0.9} />
            <Stop offset="1" stopColor="#cfdcff" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="lilac" cx="50%" cy="5%" r="60%">
            <Stop offset="0" stopColor="#e3d6ff" stopOpacity={0.95} />
            <Stop offset="1" stopColor="#e3d6ff" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="pink" cx="95%" cy="40%" r="55%">
            <Stop offset="0" stopColor="#ffd6ea" stopOpacity={0.9} />
            <Stop offset="1" stopColor="#ffd6ea" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx="10" cy="30" rx="60" ry="60" fill="url(#blue)" />
        <Ellipse cx="50" cy="5" rx="60" ry="60" fill="url(#lilac)" />
        <Ellipse cx="95" cy="40" rx="55" ry="55" fill="url(#pink)" />
      </Svg>
    </View>
  );
}
