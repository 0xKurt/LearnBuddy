// Buddy in talk mode: the large orb with its moon (components/lb/BuddyOrb.tsx) and a soft
// halo, both following the conversation's state — each a clearly different movement,
// blended softly (never a jump; lib/buddy/moon.ts):
//   idle       the moon circles slowly with a faint trail, the orb breathes;
//   listening  the moon stops at the upper right and glows with her voice, sound bars
//              in the orb follow it too;
//   thinking   the moon races round, its trail becomes a ring of light;
//   waiting    her turn: the moon hovers and bobs, a soft ping leaves it;
//   speaking   the moon sways and pulses in a speech rhythm, the orb with it.
// There is no audio level of Buddy's voice, so speaking is a calm rhythm, not lip sync.
// With reduce motion nothing moves: the moon takes each state's still pose, cross-faded.
// Tapping it (onPress) is how she interrupts him while he speaks.

import { Pressable, View } from 'react-native';

import { moonForTalk, type TalkMode } from '../../lib/buddy/moon.js';
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
      <BuddyOrb
        size={size}
        state={moonForTalk(mode)}
        listening={mode === 'listening'}
        level={level}
        reactToTap={false}
        halo
      />
    </View>
  );
  if (!onPress) return orb;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={pressLabel} onPress={onPress}>
      {({ pressed }) => <View style={{ transform: [{ scale: pressed ? 0.97 : 1 }] }}>{orb}</View>}
    </Pressable>
  );
}
