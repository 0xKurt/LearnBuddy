// The role card of a roleplay started in the conversation (issue #244). Its way out is NOT on
// the card: the card scrolls away with the scene, so the one "end" button lives in the strip
// pinned above the conversation (`RoleplayStrip`) — one button for one action, never two.
//
// Buddy plays the role in the chat itself — no new screen (CLAUDE.md rule 16): this card is
// only what a teacher hands out with a speaking task: the scene and the 3–5 things to manage.
// The strip's "end" gives her the feedback at once. Once over, the card shrinks to a quiet line — the feedback stands below
// it in the conversation, and the tasks are named there again with how each one went.
//
// No count of turns, no progress bar, no score (rule 6): a scene is not a test.

import type { ActionSummary, RoleplayNow } from '@learnbuddy/shared-types/contracts';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { endRoleplay } from '../../lib/api/endpoints.js';
import { setHome } from '../../lib/api/queries.js';
import { messageFor } from '../../lib/errors.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { Card } from '../lb/Card.js';
import { EndButton } from '../lb/EndButton.js';
import { Icon } from '../lb/Icon.js';
import { toast } from '../lb/Toast.js';

type Roleplay = Extract<ActionSummary, { tool: 'start_roleplay' }>;

/** Her tap on "end" in the strip: the feedback lands in the thread. */
function useEndRoleplay(roleplayId: string): { busy: boolean; end: () => Promise<void> } {
  const [busy, setBusy] = useState(false);
  async function end(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const res = await endRoleplay(roleplayId);
      setHome(res.home);
    } catch (err) {
      toast.show(messageFor(err), 'error');
    } finally {
      setBusy(false);
    }
  }
  return { busy, end };
}

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
        <Icon name="speak" size={18} color={palette.primaryDk} />
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
  const { t } = useTranslation(['buddy', 'common']);
  const active = roleplay.status === 'active';
  const heading = `${t('buddy:roleplay.label')} · ${t(`buddy:roleplay.lang.${roleplay.language}`)}`;

  return (
    <Card tone="primaryLt" padding={SPACE.lg} radius={18}>
      <View style={{ gap: SPACE.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Icon name="speak" size={20} color={palette.primaryDk} />
          </View>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={[TYPE.label, { color: palette.primaryDk, flexShrink: 1 }]}
          >
            {heading.toUpperCase()}
          </Text>
        </View>
        <Text style={TYPE.body} numberOfLines={1}>
          {roleplay.scene}
        </Text>
        {active ? (
          <>
            <Text style={[TYPE.small, { color: palette.ink2 }]} numberOfLines={1}>
              {t('buddy:roleplay.plays', { role: roleplay.role })}
            </Text>
            <View style={{ gap: SPACE.xs, marginTop: SPACE.xs }}>
              <Text style={[TYPE.label, { color: palette.ink2 }]}>{t('buddy:roleplay.tasks')}</Text>
              {roleplay.points.map((p, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: SPACE.sm }}>
                  <Text
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                    style={[TYPE.body, { color: palette.primaryDk }]}
                  >
                    •
                  </Text>
                  <Text style={[TYPE.body, { flex: 1 }]} numberOfLines={2}>
                    {p}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <Text style={[TYPE.small, { color: palette.ink2 }]}>{t('buddy:roleplay.ended')}</Text>
        )}
      </View>
    </Card>
  );
}
