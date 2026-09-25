// The soft colour wash at the top of a screen (lavender and peach light),
// drawn with SVG radial gradients so it looks the same on iOS, Android and
// the web. Purely decorative: no touches, hidden from screen readers.
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { LB } from '../../lib/theme/colors.js';

export function Glow({ height = 420 }: { height?: number }) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { height }]}
    >
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id="lav" cx="20%" cy="10%" r="70%">
            <Stop offset="0" stopColor="#c9b6ee" stopOpacity={1} />
            <Stop offset="1" stopColor={LB.lavender} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="peach" cx="90%" cy="25%" r="60%">
            <Stop offset="0" stopColor="#f3bfa3" stopOpacity={1} />
            <Stop offset="1" stopColor={LB.peach} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx="20" cy="10" rx="80" ry="70" fill="url(#lav)" />
        <Ellipse cx="90" cy="25" rx="70" ry="60" fill="url(#peach)" />
      </Svg>
    </View>
  );
}
