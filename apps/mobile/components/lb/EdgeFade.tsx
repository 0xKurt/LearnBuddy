// The top edge of a scrolling conversation (live finding 8): a message scrolled up under the
// question card or under the ways to start was cut off hard, and the last pixels of a violet
// bubble peeked out as a thin violet bar. A short fade to the screen's background takes what
// scrolls out softly away instead. On the web the scroll view itself is masked (no colour, so no
// seam over the background glow); on phones a short fade to the background lies over its edge.
// Decoration only: no touches, nothing for screen readers.

import { Platform, View, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { LB } from '../../lib/theme/colors.js';
import { useSvgId } from '../../lib/theme/svgId.js';

/** How tall the fade at a scroll view's top edge is. */
export const EDGE_FADE = 18;

/**
 * The web: the scroll view's own top edge fades out (a CSS mask). Spread into its style.
 * React Native's style types do not know the mask properties; the web renderer passes them on.
 */
export const topEdgeMask: ViewStyle | null =
  Platform.OS === 'web'
    ? ({
        maskImage: `linear-gradient(to bottom, transparent 0, black ${EDGE_FADE}px)`,
        WebkitMaskImage: `linear-gradient(to bottom, transparent 0, black ${EDGE_FADE}px)`,
      } as unknown as ViewStyle)
    : null;

/** Phones: lies over the top edge of the scroll view it is placed after (its parent is the frame). */
export function TopEdgeFade({ top = 0 }: { top?: number }) {
  const id = useSvgId('edge');
  if (Platform.OS === 'web') return null;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', left: 0, right: 0, top, height: EDGE_FADE, zIndex: 1 }}
    >
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1 1">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={LB.bg} stopOpacity={0.9} />
            <Stop offset="0.35" stopColor={LB.bg} stopOpacity={0.7} />
            <Stop offset="1" stopColor={LB.bg} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="1" height="1" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
