// The soft light behind a screen (blue, lilac and pink), drawn with SVG radial
// gradients so it looks the same on iOS, Android and the web.
// Purely decorative: no touches, hidden from screen readers.
//
// The three tones come from the palette, never from here (issue #124): they were
// hardcoded pastels once, which meant the night palette got the light theme's
// whole lighting laid over a near-black ground — the owner's "komplett scheisse
// und unrund".
import { StyleSheet, View } from 'react-native';
import { useSvgId } from '../../lib/theme/svgId.js';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { useA11ySettings } from '../../lib/a11ySettings.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';

/** Where each blob sits: centre, radius (in the 0–100 viewBox). */
const SPOTS = [
  { cx: 10, cy: 30, r: 60 },
  { cx: 50, cy: 5, r: 60 },
  { cx: 95, cy: 40, r: 55 },
] as const;

/**
 * A linear fade from full to nothing bands visibly on an 8-bit panel — the steps
 * are evenly spaced across a long, wide tail. This mid stop pulls the falloff
 * in: bright core, quick fade, and the tail too faint for a step to be seen.
 */
const MID = { offset: 0.5, factor: 0.28 } as const;

export function Glow({ height = 520 }: { height?: number }) {
  const { palette } = useTheme();
  const base = useSvgId('g');
  // The OS was asked for no see-through surfaces (issue #133 position 13). The light is
  // what makes the app calm for most people and exactly what makes text hard to find for
  // whoever turned this on. It goes; the ground stays the palette's own colour, so nothing
  // is left unreadable.
  const { reduceTransparency } = useA11ySettings();
  if (reduceTransparency) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { height }]}
    >
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          {palette.glow.map((g, i) => (
            <RadialGradient
              key={`${base}${i}`}
              id={`${base}${i}`}
              cx={`${SPOTS[i]!.cx}%`}
              cy={`${SPOTS[i]!.cy}%`}
              r={`${SPOTS[i]!.r}%`}
            >
              <Stop offset="0" stopColor={g.color} stopOpacity={g.opacity} />
              <Stop
                offset={String(MID.offset)}
                stopColor={g.color}
                stopOpacity={g.opacity * MID.factor}
              />
              <Stop offset="1" stopColor={g.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {palette.glow.map((_, i) => (
          <Ellipse
            key={`${base}e${i}`}
            cx={SPOTS[i]!.cx}
            cy={SPOTS[i]!.cy}
            rx={SPOTS[i]!.r}
            ry={SPOTS[i]!.r}
            fill={`url(#${base}${i})`}
          />
        ))}
      </Svg>
    </View>
  );
}
