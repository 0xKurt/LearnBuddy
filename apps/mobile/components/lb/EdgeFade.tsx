// The top edge of a scrolling conversation (live finding 8): a message scrolled up under the
// question card or under the ways to start was cut off hard, and the last pixels of a violet
// bubble peeked out as a thin violet bar. A short fade to the screen's background takes what
// scrolls out softly away instead. On the web the scroll view itself is masked (no colour, so no
// seam over the background glow); on phones a short fade to the background lies over its edge.
// Decoration only: no touches, nothing for screen readers.

import { Platform, View, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { useSvgId } from '../../lib/theme/svgId.js';

/**
 * How tall the fade at a scroll view's top edge is. 28, not 18: half a line of text still
 * stood readable under the question card and looked like a rendering fault (owner 28.09.,
 * issue #63) — a line of type is ~22 pt, so the fade has to cover one.
 */
export const EDGE_FADE = 28;

/**
 * The web: the scroll view's own top edge fades out (a CSS mask). Spread into its style.
 * React Native's style types do not know the mask properties; the web renderer passes them on.
 */
export const topEdgeMask: ViewStyle | null = topEdgeMaskFrom(0);

/**
 * The same mask, with the fade starting `from` points down the scroll view: where something
 * lies over its top (Buddy's slim bar, components/buddy/TopOverlay.tsx), the visible edge is
 * that thing's bottom, not the view's top. With the fade at 0 a message scrolled under the bar
 * came out sliced at its lower edge — half a sentence, or the top of a "Los geht's" button,
 * peeking out under the card (issue #287). Above `from` the view is hidden anyway. `size` is
 * the fade's height; only a view that rests on a whole item at its top asks for less (the
 * practice conversation at rest, issue #286) — once she scrolls it is EDGE_FADE again.
 */
export function topEdgeMaskFrom(from: number, size: number = EDGE_FADE): ViewStyle | null {
  if (Platform.OS !== 'web') return null;
  const start = Math.max(0, Math.round(from));
  const gradient = `linear-gradient(to bottom, transparent ${start}px, black ${start + size}px)`;
  return { maskImage: gradient, WebkitMaskImage: gradient } as unknown as ViewStyle;
}

/**
 * The web: the scroll view's BOTTOM edge fades out — a text that scrolls on in its own box (the
 * reading text above a question, issue #233) shows that there is more instead of ending in a
 * line cut in half.
 */
export function bottomEdgeMask(size: number = EDGE_FADE): ViewStyle | null {
  if (Platform.OS !== 'web') return null;
  const gradient = `linear-gradient(to top, transparent 0px, black ${size}px)`;
  return { maskImage: gradient, WebkitMaskImage: gradient } as unknown as ViewStyle;
}

/**
 * Phones: lies over the top edge of the scroll view it is placed after (its parent is the frame)
 * — or over its bottom edge (`bottom`, the reading text, issue #233), fading to `color` (the
 * surface the scroll view stands on; the screen's background by default).
 */
export function TopEdgeFade({
  top = 0,
  bottom = false,
  color,
}: {
  top?: number;
  bottom?: boolean;
  color?: string;
}) {
  const { palette } = useTheme();
  const id = useSvgId('edge');
  if (Platform.OS === 'web') return null;
  const at = bottom ? { bottom: 0 } : { top };
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', left: 0, right: 0, ...at, height: EDGE_FADE, zIndex: 1 }}
    >
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1 1">
        <Defs>
          <LinearGradient id={id} x1="0" y1={bottom ? '1' : '0'} x2="0" y2={bottom ? '0' : '1'}>
            {/* Fully opaque at the very top: at 0.9 a tenth of the card underneath still
                came through, and on a real phone that reads as a hard-cut lavender sliver
                under the row (measured on the Xiaomi, 01.10.) — the very fault this fade
                exists to remove (live finding 8, issue #63). */}
            <Stop offset="0" stopColor={color ?? palette.bg} stopOpacity={1} />
            <Stop offset="0.35" stopColor={color ?? palette.bg} stopOpacity={0.7} />
            <Stop offset="1" stopColor={color ?? palette.bg} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="1" height="1" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
