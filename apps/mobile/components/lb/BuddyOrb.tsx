// Buddy's face: a soft pastel orb (blue → lilac → pink, like light through
// glass) with a white glow. With `listening`, sound bars appear in it (the
// voice-first look). The same Buddy at every size; decorative for screen readers.
import { View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useSvgId } from '../../lib/theme/svgId.js';
import { barHeights } from '../../lib/speech/level.js';
import { LB } from '../../lib/theme/colors.js';

const BAR_X = [33, 41, 49, 57, 65];
/** The tallest bar at full voice (in the 100-unit viewBox). */
const BAR_MAX = 44;

export function BuddyOrb({
  size = 32,
  listening = false,
  level = 0.5,
}: {
  size?: number;
  listening?: boolean;
  /** How loud she is (0…1): the sound bars follow it while listening. */
  level?: number;
}) {
  const heights = barHeights(level).map((h) => h * BAR_MAX);
  const base = useSvgId('g');
  const ids = { orbBody: `${base}orbBody`, orbShine: `${base}orbShine` };
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={ids.orbBody} cx="30%" cy="55%" r="80%">
            <Stop offset="0" stopColor="#b9c9ff" />
            <Stop offset="0.45" stopColor="#d7c4ff" />
            <Stop offset="0.8" stopColor="#f9c6e1" />
            <Stop offset="1" stopColor="#fbe3f0" />
          </RadialGradient>
          <RadialGradient id={ids.orbShine} cx="40%" cy="30%" r="45%">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.85} />
            <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="48" fill={`url(#${ids.orbBody})`} />
        <Circle cx="50" cy="50" r="47" fill={`url(#${ids.orbShine})`} />
        <Circle
          cx="50"
          cy="50"
          r="47.5"
          fill="none"
          stroke="#ffffff"
          strokeOpacity={0.9}
          strokeWidth={1.5}
        />
        {listening
          ? BAR_X.map((x, i) => (
              <Rect
                key={x}
                x={x - 1.8}
                y={50 - (heights[i] ?? 0) / 2}
                width={3.6}
                height={heights[i] ?? 0}
                rx={1.8}
                fill={LB.primary}
              />
            ))
          : null}
      </Svg>
    </View>
  );
}
