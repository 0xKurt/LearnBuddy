// Buddy at work in the thread (#599): his mini orb beside what he says, and the note that he is
// on something she is waiting for.
//
// `ThreadOrb` is the design's mini orb (components/buddy/Message.jsx:18, Cards.jsx:100) — the one
// existing `BuddyOrb`, given a size and a state and nothing else (owner rule 1). It stands beside
// the newest of Buddy's lines and beside his typing dots; the head keeps the large one. Practice
// can draw its own waiting line with the same piece.
//
// `WorkingNote` says what he is doing with her photos or her finished practice instead of an
// unexplained pause — as the thread's status card (ui_kits/app/Flows.jsx:151, `ChatCard busy`).

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAnnounce } from '../../lib/announce.js';
import { CHAT } from '../../lib/theme/chat.js';
import { BuddyOrb, type MoonState } from '../lb/BuddyOrb.js';
import { ChatCard } from './ChatCard.js';

/** Buddy beside his line. Decorative: the line itself is what a screen reader hears. */
export function ThreadOrb({
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
}

export function WorkingNote({ what }: { what: NonNullable<BuddyHome['working']> }) {
  const { t } = useTranslation('buddy');
  useAnnounce(t(`working.${what}`));
  return <ChatCard tone="quiet" busy live title={t(`working.${what}`)} />;
}
