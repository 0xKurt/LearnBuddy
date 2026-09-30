// Buddy in talk mode: the large orb with its moon (components/lb/BuddyOrb.tsx), exactly as
// the approved prototype (variant 1 "Mond") draws and moves it — its white halo, and its
// pastel stage behind him — each state a clearly different movement, blended softly
// (never a jump; lib/buddy/moon.ts):
//   idle       the moon circles slowly with a faint white trail, the orb breathes;
//   listening  the moon stops at the upper right and glows with her voice, the orb swells
//              with her and the halo brightens (no bars in the glass, owner 2026-09-28);
//   thinking   the moon races round, its trail becomes a ring of light;
//   waiting    her turn: the moon hovers and bobs, a soft white ping leaves it;
//   speaking   the moon sways and pulses in a speech rhythm, the orb with it.
// There is no audio level of Buddy's voice, so speaking is a calm rhythm, not lip sync.
// With reduce motion nothing moves: the moon takes each state's still pose, cross-faded.
// Tapping it (onPress) is how she interrupts him while he speaks.

import { Pressable, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { moonForTalk, type TalkMode } from '../../lib/buddy/moon.js';
import { useSvgId } from '../../lib/theme/svgId.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { BuddyOrb } from '../lb/BuddyOrb.js';

export type OrbMode = TalkMode;

export function TalkOrb({
  mode,
  level,
  size = 200,
  onPress,
  pressLabel,
}: {
  mode: OrbMode;
  /** Her voice (0…1) while listening. */
  level: number;
  size?: number;
  /** Tapping Buddy (interrupts him while he speaks). */
  onPress?: () => void;
  pressLabel?: string;
}) {
  // Room around the orb for the halo and the moon's orbit.
  const box = Math.round(size * 1.5);
  const orb = (
    <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}>
      <Stage size={size * 2} box={box} />
      <BuddyOrb size={size} state={moonForTalk(mode)} level={level} reactToTap={false} halo />
    </View>
  );
  if (!onPress) return orb;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={pressLabel} onPress={onPress}>
      {({ pressed }) => <View style={{ transform: [{ scale: pressed ? 0.97 : 1 }] }}>{orb}</View>}
    </Pressable>
  );
}

/**
 * The prototype's stage: a soft pool of light (blue upper left, lilac, pink lower right)
 * behind Buddy, fading out at its edge so it melts into the screen's own light.
 *
 * Its tones come from the palette since issue #139. Hardcoded, the pastels melted into the
 * light ground they were made for and sat on the night one as a near-white disc at full
 * opacity — which is what the owner saw.
 */
function Stage({ size, box }: { size: number; box: number }) {
  const id = useSvgId('stage');
  const { palette } = useTheme();
  const [base, blue, pink] = palette.buddyLight.stage;
  const r = size / 2;
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: (box - size) / 2, top: (box - size) / 2 }}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={`${id}base`} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={base.color} stopOpacity={base.opacity} />
            <Stop offset="0.62" stopColor={base.color} stopOpacity={base.opacity * 0.9} />
            <Stop offset="1" stopColor={base.color} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`${id}blue`} cx="0.36" cy="0.36" r="0.3">
            <Stop offset="0" stopColor={blue.color} stopOpacity={blue.opacity} />
            <Stop offset="1" stopColor={blue.color} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`${id}pink`} cx="0.64" cy="0.66" r="0.28">
            <Stop offset="0" stopColor={pink.color} stopOpacity={pink.opacity} />
            <Stop offset="1" stopColor={pink.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={r} cy={r} r={r} fill={`url(#${id}base)`} />
        <Circle cx={r} cy={r} r={r} fill={`url(#${id}blue)`} />
        <Circle cx={r} cy={r} r={r} fill={`url(#${id}pink)`} />
      </Svg>
    </View>
  );
}
