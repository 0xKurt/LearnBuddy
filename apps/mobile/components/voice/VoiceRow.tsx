// The conversation's controls (issue #386): the big mic in the middle, one round action with its
// word on either side — "Tastatur" on the left, the screen's own action on the right. The
// conversation screen (`app/talk.tsx`) and a practice question in a conversation (`CheckBar`) use
// this one row, so the mic stands in the same place in both. Before it practice had a pill
// ("Nochmal vorlesen") left of a mic that was not centred (owner 04.10.: "sehr off").
//
// One size prop, not a second row: /talk has the whole screen and takes the 72 pt mic; on a
// practice question the row shares the screen with the question, its conversation and the
// options, and the 72 pt mic cost the 16 pt that hid Buddy's reply on 360×740 (#386) — there it is
// the 56 pt mic, the same row.
//
// Each side takes half of what the mic leaves, so the mic stays centred whatever the words are
// (and also when a side is empty); a word that would wrap at 96 pt ("Nochmal vorlesen") has room.

import { Text, View } from 'react-native';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { CircleBtn } from '../lb/CircleBtn.js';
import { MicButton } from './MicButton.js';
import type { VoiceInput } from './useVoiceInput.js';

type Side = {
  icon: 'keyboard' | 'camera' | 'speak';
  /** The word under it, which is also its name for a screen reader. */
  label: string;
  /** A longer name for a screen reader, where the word alone says too little. */
  accessibilityLabel?: string;
  onPress: () => void;
};

type Mic = {
  voice: VoiceInput;
  /** What tapping it does ("Sprechen", "Antwort sagen", "Unterbrechen"). */
  label: string;
  disabled: boolean;
  /** Instead of start/stop recording (the conversation screen runs its own loop). */
  onPress?: () => void;
};

export function VoiceRow({
  left,
  mic,
  right,
  size,
}: {
  left: Side;
  mic: Mic;
  /** Nothing here: the mic stays in the middle all the same. */
  right: Side | null;
  /** lg: the whole screen is the conversation (/talk); md: it shares the screen (practice). */
  size: 'md' | 'lg';
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <SideAction side={left} />
      <MicButton
        voice={mic.voice}
        size={size}
        filled
        label={mic.label}
        disabled={mic.disabled}
        {...(mic.onPress ? { onPress: mic.onPress } : {})}
      />
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
