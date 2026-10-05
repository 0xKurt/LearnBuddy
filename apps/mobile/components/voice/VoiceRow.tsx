// The conversation's controls (issue #386): the big mic in the middle, one round action with its
// word on either side — "Tastatur" on the left, the screen's own action on the right. The
// conversation screen (`app/talk.tsx`) and a practice question in a conversation (`CheckBar`) use
// this one row, so the mic stands in the same place in both. Before it practice had a pill
// ("Nochmal vorlesen") left of a mic that was not centred (owner 04.10.: "sehr off").
//
// Each side takes half of what the mic leaves, so the mic stays centred whatever the words are
// (and also when a side is empty); a word that would wrap at 96 pt ("Nochmal vorlesen") has room.

import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { CircleBtn } from '../lb/CircleBtn.js';

type Side = {
  icon: 'keyboard' | 'camera' | 'speak';
  /** The word under it, which is also its name for a screen reader. */
  label: string;
  /** A longer name for a screen reader, where the word alone says too little. */
  accessibilityLabel?: string;
  onPress: () => void;
};

export function VoiceRow({
  left,
  mic,
  right,
}: {
  left: Side;
  /** The big mic (`MicButton` size lg). */
  mic: ReactNode;
  /** Nothing here: the mic stays in the middle all the same. */
  right: Side | null;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <SideAction side={left} />
      {mic}
      {right ? <SideAction side={right} /> : <View style={{ flex: 1 }} />}
    </View>
  );
}

function SideAction({ side }: { side: Side }) {
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: SPACE.xs }}>
      <CircleBtn
        icon={side.icon}
        onPress={side.onPress}
        accessibilityLabel={side.accessibilityLabel ?? side.label}
      />
      {/* The button carries the name; the word is for the eyes. */}
      <Text aria-hidden numberOfLines={1} style={[TYPE.label, { color: palette.ink2 }]}>
        {side.label}
      </Text>
    </View>
  );
}
