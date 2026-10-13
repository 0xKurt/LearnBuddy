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
// (and also when a side is empty). The word stands beside its circle, not under it: under it the
// row was 8 pt taller than the 56 pt mic, and on 360×740 that, too, hid Buddy's reply (#386);
// beside it the row is the mic's height, and "Nochmal vorlesen" takes two short lines.
//
// In the conversation's own look (`presentation="talk"`, design ui_kits/app/Talk.jsx:32–39 and
// Gaps.jsx:136–143) the row is keyboard · pill · one more: the side buttons stand at the row's
// two ends (the caller gives the row its 28 pt inset, `TALK.rowInset`), the pill in the middle.

import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE } from '../../lib/theme/space.js';
import { TALK } from '../../lib/theme/talk.js';
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
  visibleLabel?: string;
  disabled: boolean;
  filled?: boolean;
  /** Instead of start/stop recording (the conversation screen runs its own loop). */
  onPress?: () => void;
};

export function VoiceRow({
  left,
  mic,
  right,
  size,
  action = null,
  centerAction = null,
  presentation = 'default',
}: {
  left: Side;
  mic: Mic;
  /** Nothing here: the mic stays in the middle all the same. */
  right: Side | null;
  /** lg: the whole screen is the conversation (/talk); md: it shares the screen (practice). */
  size: 'md' | 'lg';
  /** A selection's Check, kept reachable alongside the existing voice controls. */
  action?: ReactNode;
  centerAction?: ReactNode;
  presentation?: 'default' | 'talk';
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
        <SideAction
          side={left}
          talk={presentation === 'talk'}
          at="start"
          compact={action !== null || centerAction !== null}
        />
        {centerAction ? (
          // Beside a Check in the middle the mic is the quiet round tool, in either look: a
          // second pill would not fit the row.
          <MicButton
            voice={mic.voice}
            size={size}
            filled={false}
            tone="quiet"
            label={mic.label}
            visibleLabel={mic.visibleLabel}
            disabled={mic.disabled}
            {...(mic.onPress ? { onPress: mic.onPress } : {})}
          />
        ) : null}
      </View>
      {centerAction ?? (
        <MicButton
          presentation={presentation === 'talk' ? 'pill' : 'circle'}
          voice={mic.voice}
          size={size}
          filled={mic.filled ?? true}
          label={mic.label}
          visibleLabel={mic.visibleLabel}
          disabled={mic.disabled}
          {...(mic.onPress ? { onPress: mic.onPress } : {})}
        />
      )}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
        {right ? (
          <SideAction
            side={right}
            talk={presentation === 'talk'}
            at="end"
            compact={action !== null || centerAction !== null}
          />
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {action}
      </View>
    </View>
  );
}

function SideAction({
  side,
  compact = false,
  talk = false,
  at,
}: {
  side: Side;
  compact?: boolean;
  talk?: boolean;
  /** Which end of the row it stands at in the conversation's look. */
  at: 'start' | 'end';
}) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: talk ? (at === 'start' ? 'flex-start' : 'flex-end') : 'center',
        gap: SPACE.sm,
      }}
    >
      <CircleBtn
        icon={side.icon}
        {...(talk ? { size: TALK.sideSize, tone: 'quiet' as const } : {})}
        onPress={side.onPress}
        accessibilityLabel={side.accessibilityLabel ?? side.label}
      />
      {/* The button carries the name; the word is for the eyes. */}
      {compact || talk ? null : (
        <Text
          aria-hidden
          numberOfLines={2}
          style={[TYPE.label, { flexShrink: 1, color: palette.ink2 }]}
        >
          {side.label}
        </Text>
      )}
    </View>
  );
}
