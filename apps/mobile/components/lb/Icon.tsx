// Native icon set ported from components.jsx (consistent stroke 1.6). An icon is a list of shapes
// on a 24-unit grid; one <Svg> draws every icon with the same stroke (issue #311: the 32 cases
// used to spell the same <Svg> frame out each).
import Svg, { Circle, Path, Rect } from 'react-native-svg';

type Shape =
  /** A stroked line; `bold` draws it 2.2 thick instead of 1.6. */
  | { d: string; bold?: true }
  /** A stroked circle, or with `dot` a filled one without a stroke. */
  | { cx: number; cy: number; r: number; dot?: true }
  /** A stroked rounded box, or with `solid` stroked and filled. */
  | { x: number; y: number; width: number; height: number; rx: number; solid?: true };

const ICONS = {
  home: [{ d: 'M4 11l8-7 8 7M6 10v10h4v-6h4v6h4V10' }],
  practice: [{ d: 'M4 6h16M4 12h16M4 18h10' }],
  camera: [
    { x: 3, y: 6, width: 18, height: 13, rx: 2.5 },
    { d: 'M8 6l1.3-2h5.4L16 6' },
    { cx: 12, cy: 12.5, r: 3.5 },
  ],
  profile: [{ cx: 12, cy: 8, r: 3.5 }, { d: 'M4 20c1.6-3.6 4.6-5.4 8-5.4S18.4 16.4 20 20' }],
  back: [{ d: 'M14 5l-7 7 7 7' }],
  close: [{ d: 'M6 6l12 12M18 6L6 18' }],
  more: [
    { cx: 5, cy: 12, r: 1.4, dot: true },
    { cx: 12, cy: 12, r: 1.4, dot: true },
    { cx: 19, cy: 12, r: 1.4, dot: true },
  ],
  plus: [{ d: 'M12 5v14M5 12h14' }],
  check: [{ d: 'M5 12l5 5 9-10' }],
  mic: [{ x: 9, y: 3, width: 6, height: 11, rx: 3 }, { d: 'M5 11a7 7 0 0014 0M12 18v3M8.5 21h7' }],
  arrow: [{ d: 'M5 12h14M13 6l6 6-6 6' }],
  // Höher / tiefer auf der Notenzeile (issue #275); „Zurück“ nimmt das eine 'undo' unten.
  up: [{ d: 'M6 15l6-6 6 6', bold: true }],
  down: [{ d: 'M6 9l6 6 6-6', bold: true }],
  chevron: [{ d: 'M9 6l6 6-6 6' }],
  pencil: [{ d: 'M4 20l4-1L19 8l-3-3L5 16l-1 4z' }],
  trash: [
    {
      d: 'M5 7h14M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M7 7l1 12a2 2 0 002 2h4a2 2 0 002-2l1-12',
    },
  ],
  folder: [{ d: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z' }],
  clock: [{ cx: 12, cy: 12, r: 8.5 }, { d: 'M12 7v5l3 2' }],
  flame: [
    { d: 'M12 3c1 3.5 4 5 4 8.5 0 2.5-1.8 4.5-4 4.5s-4-2-4-4.5C8 9 9.5 7.5 12 3z' },
    { d: 'M9 17c0 2 1.4 3.5 3 3.5s3-1.5 3-3.5' },
  ],
  speak: [{ d: 'M11 5L6 9H3v6h3l5 4V5z' }, { d: 'M16 8.5a5 5 0 010 7M19 6a8 8 0 010 12' }],
  // The same speaker with its waves struck through: reading aloud is off. The shape
  // carries the state, not the colour alone (issue #181, design system).
  'speak-off': [{ d: 'M11 5L6 9H3v6h3l5 4V5z' }, { d: 'M16 9.5l5 5M21 9.5l-5 5' }],
  shield: [{ d: 'M12 3l8 3v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V6l8-3z' }],
  eye: [{ d: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z' }, { cx: 12, cy: 12, r: 3 }],
  'eye-off': [
    {
      d: 'M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22',
    },
    { d: 'M8.71 8.71a4 4 0 105.58 5.58' },
  ],
  bulb: [
    { d: 'M9 18h6M10 21h4' },
    { d: 'M12 3a6 6 0 00-3.6 10.8c.7.6 1.1 1.3 1.1 2.2V16h5c0-.9.4-1.6 1.1-2.2A6 6 0 0012 3z' },
  ],
  book: [
    {
      d: 'M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5V5.5z',
    },
    { d: 'M12 6v13.5' },
  ],
  keyboard: [
    { x: 2.5, y: 6, width: 19, height: 12, rx: 2.5 },
    { d: 'M6.5 10h1M10.5 10h1M14.5 10h1M17 10h.5M6.5 14h11' },
  ],
  file: [
    { d: 'M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z' },
    { d: 'M14 3v5h5M9 13h6M9 17h4' },
  ],
  // Three soft bars, symmetric around the middle — the conversation mark users know
  // from assistants. Thicker than the outline icons: it sits on a filled button.
  voice: [
    { d: 'M7.5 9v6', bold: true },
    { d: 'M12 5.25v13.5', bold: true },
    { d: 'M16.5 9v6', bold: true },
  ],
  // A round arrow turning back (issue #295): the receipt's quiet way back in the chat.
  undo: [{ d: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9' }, { d: 'M4.5 4.5V9H9' }],
  stop: [{ x: 6.5, y: 6.5, width: 11, height: 11, rx: 2.5, solid: true }],
} satisfies Record<string, readonly Shape[]>;

export type IconName = keyof typeof ICONS;

type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
};

export function Icon({ name, size = 22, color = 'currentColor' }: IconProps) {
  const shapes: readonly Shape[] = ICONS[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {shapes.map((shape, i) => (
        <IconShape key={i} shape={shape} color={color} />
      ))}
    </Svg>
  );
}

function IconShape({ shape, color }: { shape: Shape; color: string }) {
  const common = {
    fill: 'none',
    stroke: color,
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if ('d' in shape) {
    return <Path d={shape.d} {...common} strokeWidth={shape.bold ? 2.2 : common.strokeWidth} />;
  }
  if ('cx' in shape) {
    const { cx, cy, r } = shape;
    return shape.dot ? (
      <Circle cx={cx} cy={cy} r={r} fill={color} />
    ) : (
      <Circle cx={cx} cy={cy} r={r} {...common} />
    );
  }
  const { x, y, width, height, rx } = shape;
  return (
    <Rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={rx}
      {...common}
      fill={shape.solid ? color : common.fill}
    />
  );
}
