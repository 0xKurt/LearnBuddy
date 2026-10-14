// Buddy beside his line in the thread (#599): the design's mini orb
// (components/buddy/Message.jsx:18, Cards.jsx:100) — the one existing `BuddyOrb`, given a size and
// a state and nothing else (owner rule 1). It stands beside the newest of Buddy's lines and beside
// his typing dots; the head keeps the large one.

import { memo } from 'react';
import { View } from 'react-native';

import { CHAT } from '../../lib/theme/chat.js';
import { BuddyOrb, type MoonState } from '../lb/BuddyOrb.js';

/**
 * Buddy beside his line. Decorative: the line itself is what a screen reader hears. Drawn again
 * only for a new size or state (#637): the conversation around it renders for every reply.
 */
export const ThreadOrb = memo(function ThreadOrb({
  size = CHAT.orb.size,
  state = 'idle',
}: {
  size?: number;
  state?: MoonState;
}) {
  return (
    <View
      testID="thread-orb"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <BuddyOrb size={size} state={state} />
    </View>
  );
});
