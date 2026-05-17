// Native icon set ported from components.jsx (consistent stroke 1.6).
import Svg, { Circle, Path, Rect } from 'react-native-svg';

type IconName =
  | 'home'
  | 'practice'
  | 'camera'
  | 'profile'
  | 'back'
  | 'close'
  | 'more'
  | 'plus'
  | 'check'
  | 'mic'
  | 'arrow'
  | 'chevron'
  | 'pencil'
  | 'trash'
  | 'folder'
  | 'clock'
  | 'flame'
  | 'speak'
  | 'shield'
  | 'eye'
  | 'eye-off';

type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
};

export function Icon({ name, size = 22, color = 'currentColor' }: IconProps) {
  const common = {
    fill: 'none',
    stroke: color,
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'home':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4 11l8-7 8 7M6 10v10h4v-6h4v6h4V10" {...common} />
        </Svg>
      );
    case 'practice':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4 6h16M4 12h16M4 18h10" {...common} />
        </Svg>
      );
    case 'camera':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x={3} y={6} width={18} height={13} rx={2.5} {...common} />
          <Path d="M8 6l1.3-2h5.4L16 6" {...common} />
          <Circle cx={12} cy={12.5} r={3.5} {...common} />
        </Svg>
      );
    case 'profile':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={12} cy={8} r={3.5} {...common} />
          <Path d="M4 20c1.6-3.6 4.6-5.4 8-5.4S18.4 16.4 20 20" {...common} />
        </Svg>
      );
    case 'back':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M14 5l-7 7 7 7" {...common} />
        </Svg>
      );
    case 'close':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M6 6l12 12M18 6L6 18" {...common} />
        </Svg>
      );
    case 'more':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={5} cy={12} r={1.4} fill={color} />
          <Circle cx={12} cy={12} r={1.4} fill={color} />
          <Circle cx={19} cy={12} r={1.4} fill={color} />
        </Svg>
      );
    case 'plus':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M12 5v14M5 12h14" {...common} />
        </Svg>
      );
    case 'check':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M5 12l5 5 9-10" {...common} />
        </Svg>
      );
    case 'mic':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x={9} y={3} width={6} height={11} rx={3} {...common} />
          <Path d="M5 11a7 7 0 0014 0M12 18v3M8.5 21h7" {...common} />
        </Svg>
      );
    case 'arrow':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M5 12h14M13 6l6 6-6 6" {...common} />
        </Svg>
      );
    case 'chevron':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M9 6l6 6-6 6" {...common} />
        </Svg>
      );
    case 'pencil':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4 20l4-1L19 8l-3-3L5 16l-1 4z" {...common} />
        </Svg>
      );
    case 'trash':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            d="M5 7h14M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M7 7l1 12a2 2 0 002 2h4a2 2 0 002-2l1-12"
            {...common}
          />
        </Svg>
      );
    case 'folder':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
            {...common}
          />
        </Svg>
      );
    case 'clock':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={8.5} {...common} />
          <Path d="M12 7v5l3 2" {...common} />
        </Svg>
      );
    case 'flame':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            d="M12 3c1 3.5 4 5 4 8.5 0 2.5-1.8 4.5-4 4.5s-4-2-4-4.5C8 9 9.5 7.5 12 3z"
            {...common}
          />
          <Path d="M9 17c0 2 1.4 3.5 3 3.5s3-1.5 3-3.5" {...common} />
        </Svg>
      );
    case 'speak':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M11 5L6 9H3v6h3l5 4V5z" {...common} />
          <Path d="M16 8.5a5 5 0 010 7M19 6a8 8 0 010 12" {...common} />
        </Svg>
      );
    case 'shield':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M12 3l8 3v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V6l8-3z" {...common} />
        </Svg>
      );
    case 'eye':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" {...common} />
          <Circle cx={12} cy={12} r={3} {...common} />
        </Svg>
      );
    case 'eye-off':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22"
            {...common}
          />
          <Path d="M8.71 8.71a4 4 0 105.58 5.58" {...common} />
        </Svg>
      );
  }
}
