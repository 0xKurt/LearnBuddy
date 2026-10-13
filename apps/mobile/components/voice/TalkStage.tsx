// The conversation screen's stage (design ui_kits/app/Talk.jsx:24–30, Extra.jsx:190–191): the
// orb, who Buddy plays in a scene, and under it the status and the one line. How large the orb is
// and how much room the line gets is decided in `talkRoom.ts` from the screen's measured room, so
// that an answer that arrived whole — the fixed help answer (CLAUDE.md rule 18) — stands in full.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { RADIUS } from '../../lib/theme/radius.js';
import { SPACE } from '../../lib/theme/space.js';
import { TALK } from '../../lib/theme/talk.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { TalkCaption } from './TalkCaption.js';
import type { TalkLineOf } from './talkLine.js';
import { TalkOrb, type OrbMode } from './TalkOrb.js';
import { talkOrbRoom, talkRoom } from './talkRoom.js';

export function TalkStage({
  mode,
  level,
  interrupt,
  role,
  live,
  status,
  line,
  keepRoom,
  height,
  middle,
}: {
  mode: OrbMode;
  /** Her voice (0…1) while listening. */
  level: number;
  /** Tapping Buddy while he speaks: the same action as the mic, so the same words name it. */
  interrupt: { onPress: () => void; label: string } | null;
  /** Who Buddy plays in the running scene. */
  role: string | null;
  /** A roleplay runs. */
  live: boolean;
  status: string;
  line: TalkLineOf;
  /** Keep the line's room while it is empty (no bubbles stand under the stage). */
  keepRoom: boolean;
  /** The window's height, and the measured room this stage stands in (null before layout). */
  height: number;
  middle: number | null;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation('buddy');
  const whole = line?.who === 'buddy' && line.whole;
  const [text, setText] = useState<number | null>(null);
  const room = talkRoom({ height, middle, live, whole, text: whole ? text : null });
  return (
    <View style={{ alignItems: 'center', flexShrink: 0, paddingHorizontal: SPACE.xxl }}>
      <TalkOrb
        mode={mode}
        size={room.stage}
        level={level}
        {...(interrupt ? { onPress: interrupt.onPress, pressLabel: interrupt.label } : {})}
      />
      {role ? (
        // Who Buddy plays, as the scene's pill (Extra.jsx:191).
        <View
          style={{
            backgroundColor: palette.paper,
            borderRadius: RADIUS.round,
            paddingVertical: SPACE.sm,
            paddingHorizontal: SPACE.md,
            marginBottom: SPACE.md,
          }}
        >
          <Text numberOfLines={1} style={TYPE.headerMeta}>
            {t('roleplay.plays', { role })}
          </Text>
        </View>
      ) : null}
      {/* The orb's box already holds the halo's room: the caption stands `groupGap` under the
          orb itself (Talk.jsx:25). Under a scene's pill it simply follows. */}
      <View
        style={{
          alignSelf: 'stretch',
          marginTop: role ? 0 : TALK.groupGap - talkOrbRoom(room.stage),
        }}
      >
        <TalkCaption
          status={status}
          line={line}
          lineRoom={room.line}
          onText={setText}
          room={keepRoom}
        />
      </View>
    </View>
  );
}
