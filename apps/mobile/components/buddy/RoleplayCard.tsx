// The role card of a roleplay started in the conversation (issue #244), as the design draws it
// (components/practice/Modes.jsx:20–31 `RoleplayCard`) on the thread's one card (`ChatCard`,
// #599): the tile, its language and what it is, the scene as the title, who Buddy plays, what
// she has to manage, and "Gespräch starten" — the scene spoken, in conversation mode. Typing
// her lines in the chat works as before; the button is the design's way in, not a gate.
//
// Its way out is NOT on the card: the card scrolls away with the scene, so the one "end" button
// lives in the strip pinned above the conversation (`RoleplayStrip`) — and, while the scene is
// spoken, on the conversation screen (app/talk.tsx). Once over, the card is a quiet line — the
// feedback stands below it in the conversation.
//
// No count of turns, no progress bar, no score (rule 6): a scene is not a test.

import type { ActionSummary, RoleplayNow } from '@learnbuddy/shared-types/contracts';
import { router, usePathname } from 'expo-router';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { RADIUS } from '../../lib/theme/radius.js';
import { ROLEPLAY } from '../../lib/theme/roleplay.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { EndButton } from '../lb/EndButton.js';
import { Icon } from '../lb/Icon.js';
import { ChatCard } from './ChatCard.js';
import { roleplayLabel, useEndRoleplay } from './RoleplayLive.js';

type Roleplay = Extract<ActionSummary, { tool: 'start_roleplay' }>;

/**
 * The way out, pinned above the conversation while a roleplay runs. The card scrolls away
 * with the scene after a few lines (the walkthrough found its button gone behind "Ältere
 * Nachrichten"); the way out must never be something she has to scroll back for. One line:
 * what is running, and the one button — the round ✕ every practice header ends with
 * (`EndButton`), so the scene's name keeps the line's width at 360 (issue #334.3).
 */
export function RoleplayStrip({ roleplay }: { roleplay: RoleplayNow }) {
  const { palette } = useTheme();
  const { t } = useTranslation(['buddy']);
  const { busy, end } = useEndRoleplay(roleplay.id);
  const what = [t('buddy:roleplay.label'), roleplay.scene].filter((x) => x !== '').join(' · ');
  return (
    <View
      testID="roleplay-strip"
      style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon name="speak" size={ROLEPLAY.stripGlyph} color={palette.primaryDk} />
      </View>
      <Text numberOfLines={1} style={[TYPE.small, { color: palette.ink2, flex: 1 }]}>
        {what}
      </Text>
      <EndButton
        busy={busy}
        onPress={() => void end()}
        label={t('buddy:roleplay.end')}
        hint={t('buddy:roleplay.end_hint')}
      />
    </View>
  );
}

export function RoleplayCard({ roleplay }: { roleplay: Roleplay }) {
  const { palette } = useTheme();
  const { t } = useTranslation(['buddy']);
  // On the conversation screen the scene is already being spoken: no second way in there.
  const spoken = usePathname() === '/talk';
  const label = roleplayLabel(t, roleplay.language);
  // The waveform is the sign of conversation mode: on the talk button, and here, where the
  // card's start is the design's second way into it (Modes.jsx:23, :27; the guard that keeps it
  // to these two is lib/__tests__/oneVoice.test.ts).

  if (roleplay.status !== 'active')
    return (
      <ChatCard
        mode="peach"
        icon="voice"
        label={label}
        title={roleplay.scene}
        titleLines={2}
        detail={t('buddy:roleplay.ended')}
      />
    );

  return (
    <ChatCard
      mode="peach"
      icon="voice"
      label={label}
      title={roleplay.scene}
      titleLines={2}
      heading
      primary={
        spoken
          ? null
          : {
              label: t('buddy:roleplay.start'),
              icon: 'voice',
              fit: true,
              onPress: () => router.push('/talk'),
            }
      }
    >
      {/* Who plays whom (Modes.jsx:11–15). Her own role is not part of the card's data, so
          only Buddy's stands here. */}
      <View
        style={{
          backgroundColor: palette.canvas,
          borderRadius: RADIUS.md,
          paddingVertical: ROLEPLAY.role.padV,
          paddingHorizontal: SPACE.md,
          gap: ROLEPLAY.role.gap,
        }}
      >
        <Text style={TYPE.label}>{t('buddy:thread.buddy')}</Text>
        <Text style={TYPE.voiceChoice} numberOfLines={2}>
          {roleplay.role}
        </Text>
      </View>
      <View style={{ gap: SPACE.xs }}>
        <Text style={TYPE.label}>{t('buddy:roleplay.tasks')}</Text>
        {roleplay.points.map((p, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: SPACE.sm }}>
            <Text
              accessibilityElementsHidden
              importantForAccessibility="no"
              style={[TYPE.reviewDetail, { color: palette.primaryDk }]}
            >
              •
            </Text>
            <Text style={[TYPE.reviewDetail, { flex: 1 }]} numberOfLines={2}>
              {p}
            </Text>
          </View>
        ))}
      </View>
    </ChatCard>
  );
}
