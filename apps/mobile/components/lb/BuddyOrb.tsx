// Buddy's face: a pastel glass orb (blue → lilac → pink, lit from the upper left) and his
// signature beside it — by default a small pearl moon on a tilted orbit that passes in front
// of and behind the glass (owner decision 2026-09-27, docs/DESIGN-BRIEF.md §Buddy's moon and
// §Buddy's signature). The signature shows what Buddy is doing — idle, listen, think, wait,
// speak, happy — and blends softly between those states (lib/buddy/signatures/). The glass
// stays clear in every state — listening is the signature glowing with her voice, not bars
// in the orb (owner feedback 2026-09-28). The same Buddy at every size; decorative for
// screen readers.
//
// The reference is the approved prototype (owner 2026-09-28: "alle Animationen waren doch
// gut aus den Testfiles"): the same glass, white halo and shadow for every signature
// (signatures/stage.tsx), and each signature's own parts as its prototype variant draws
// them (signatures/<Key>Signature.tsx). A large orb draws it exactly; a chat avatar the same
// signature at the same scale with fewer small parts and no reflection, shadow or halo; the
// smallest none.
//
// How it moves: one frame callback on the UI thread steps the signature and writes a pose;
// a few animated views read it — no JS re-render per frame (signatures/useSignature.ts).
// `breathe={false}` (an older avatar in the chat) and reduce motion stand still: the
// signature takes its state's still pose, and a change of state only cross-fades. A tap on a
// large orb makes it bob gently — nothing happens because of it.
import { Pressable, View } from 'react-native';
import {
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { ORB_R, type OrbState } from '../../lib/buddy/signatures/core.js';
import { DEFAULT_SIGNATURE, type SignatureKey } from '../../lib/buddy/signatures/index.js';
import { DURATION, EASE, SPRING } from '../../lib/theme/motion.js';
import { SIGNATURES } from './signatures/index.js';
import { FILL } from './signatures/stage.js';

export type { OrbState } from '../../lib/buddy/signatures/core.js';

export function BuddyOrb({
  size = 32,
  state = 'idle',
  level = 0.5,
  breathe = true,
  reactToTap = size >= 48,
  halo,
  signature = DEFAULT_SIGNATURE,
}: {
  size?: number;
  /** What Buddy is doing (lib/buddy/signatures/core.ts). */
  state?: OrbState;
  /** How loud she is (0…1): the listening orb, halo and signature follow it. */
  level?: number;
  /** Alive: breathing and the signature moving (off for older avatars, where many stand together). */
  breathe?: boolean;
  /** Bob gently when touched (decorative: the tap starts nothing); default for a large orb. */
  reactToTap?: boolean;
  /** The soft white halo that follows the state (default: large orbs, as the prototype). */
  halo?: boolean;
  /** Which signature Buddy wears (default: the moon; the others are prepared, not offered). */
  signature?: SignatureKey;
}) {
  const reduce = useReducedMotion();
  const live = breathe && !reduce;
  const bob = useSharedValue(1);
  const u = (size * FILL) / ORB_R;
  const Signature = SIGNATURES[signature];
  // A different signature is a different drawing: it starts fresh.
  const orb = (
    <Signature
      key={signature}
      state={state}
      level={level}
      live={live}
      size={size}
      u={u}
      bob={bob}
      halo={halo}
    />
  );
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      {reactToTap ? (
        <Pressable
          accessible={false}
          onPressIn={() => {
            if (reduce) return;
            bob.value = withSequence(
              withTiming(0.92, { duration: DURATION.quick, easing: EASE.standard }),
              withSpring(1, SPRING),
            );
          }}
        >
          {orb}
        </Pressable>
      ) : (
        orb
      )}
    </View>
  );
}
