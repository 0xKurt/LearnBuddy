// The ink every figure shares (components/math/FigureView.tsx, ChartFigures.tsx): the app's
// sans-serif inside SVG, numbers with the learner's decimal comma, and a label with a paper
// halo so it stays readable over grid lines and graphs.

import { Platform } from 'react-native';
import { G, Text as SvgText } from 'react-native-svg';

import { currentLocale } from '../../lib/i18n/index.js';
import { localDecimal } from '../../lib/numbers.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';

export const FONT = 13;
/** The app's sans-serif inside SVG too (the web would fall back to a serif). */
export const FAMILY = Platform.select({
  web: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined,
});
export const SMALL = 12;

/** 0.30000000000000004 → "0,3" (decimal comma where usual). */
export function formatNumber(n: number): string {
  const rounded = Math.round(n * 1e6) / 1e6;
  const plain = Object.is(rounded, -0) ? '0' : String(rounded);
  return localDecimal(plain, currentLocale()).replace('-', '−');
}

/** A label with a paper-coloured outline underneath, so it stays readable over grid and graphs. */
export function HaloText({
  x,
  y,
  color,
  anchor,
  text,
  size = FONT + 1,
  weight = '600',
}: {
  x: number;
  y: number;
  color: string;
  anchor: 'start' | 'middle' | 'end';
  text: string;
  size?: number;
  weight?: '400' | '600';
}) {
  const { figure: ink } = useTheme();
  return (
    <G>
      <SvgText
        fontFamily={FAMILY}
        x={x}
        y={y}
        fontSize={size}
        fontWeight={weight}
        fill={ink.paper}
        stroke={ink.paper}
        strokeWidth={4}
        strokeLinejoin="round"
        textAnchor={anchor}
      >
        {text}
      </SvgText>
      <SvgText
        fontFamily={FAMILY}
        x={x}
        y={y}
        fontSize={size}
        fontWeight={weight}
        fill={color}
        textAnchor={anchor}
      >
        {text}
      </SvgText>
    </G>
  );
}
