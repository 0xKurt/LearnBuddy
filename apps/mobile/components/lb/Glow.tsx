// Static native SVG equivalent of the supplied full-page CSS background.
// Decorative, untouchable and omitted when Reduce Transparency is enabled.
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useA11ySettings } from '../../lib/a11ySettings.js';
import { BACKGROUND } from '../../lib/theme/background.js';
import { useSvgId } from '../../lib/theme/svgId.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';

export function Glow() {
  const { palette } = useTheme();
  const base = useSvgId('g');
  const { reduceTransparency } = useA11ySettings();
  if (reduceTransparency) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox={BACKGROUND.viewBox}>
        <Defs>
          {BACKGROUND.layers.map((layer, i) => {
            const glow = palette.glow[layer.color];
            return (
              <RadialGradient
                key={i}
                id={`${base}${i}`}
                gradientUnits="userSpaceOnUse"
                cx={0}
                cy={0}
                r={BACKGROUND.extent}
                gradientTransform={`translate(${layer.cx} ${layer.cy}) scale(${layer.rx / BACKGROUND.extent} ${layer.ry / BACKGROUND.extent})`}
              >
                <Stop offset="0" stopColor={glow.color} stopOpacity={glow.opacity} />
                <Stop offset={BACKGROUND.fade} stopColor={glow.color} stopOpacity={0} />
              </RadialGradient>
            );
          })}
        </Defs>
        {/* SVG paints back to front; CSS lists its first gradient on top. */}
        {[...BACKGROUND.layers.keys()].reverse().map((i) => (
          <Rect
            key={i}
            width={BACKGROUND.extent}
            height={BACKGROUND.extent}
            fill={`url(#${base}${i})`}
          />
        ))}
      </Svg>
    </View>
  );
}
