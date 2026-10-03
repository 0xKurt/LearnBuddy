// Buddy offered a Kopfrechnen round in the chat ("Lass uns Einmaleins üben", issue #243): the
// same card as every other offer — what it is, in two words, and one "Los geht's". Starting it
// asks no model: the server writes the twenty tasks from the range in a few milliseconds, so
// there is no "wird vorbereitet" to wait through. The offer's action id is the request id, so
// tapping the same card again opens the same round.

import type { ActionSummary } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useAnnounce } from '../../lib/announce.js';
import { startDrill } from '../../lib/api/endpoints.js';
import { keys, queryClient } from '../../lib/api/queries.js';
import { messageFor } from '../../lib/errors.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { Icon } from '../lb/Icon.js';

type Offer = Extract<ActionSummary, { tool: 'offer_drill' }>;

export function DrillOfferCard({ actionId, offer }: { actionId: string; offer: Offer }) {
  const { palette } = useTheme();
  const { t } = useTranslation(['learn', 'common']);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const running = useRef(false);
  useAnnounce(failed);
  const label = t('learn:drill.label');

  async function go(): Promise<void> {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setFailed(null);
    try {
      const session = await startDrill(actionId, {
        range: offer.range,
        rows: offer.rows,
        carry: offer.carry,
      });
      queryClient.setQueryData(keys.session(session.id), session);
      void queryClient.invalidateQueries({ queryKey: keys.home });
      router.push(`/practice/${session.id}`);
    } catch (err) {
      setFailed(messageFor(err));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <Card tone="primaryLt" padding={SPACE.lg} radius={18}>
      {/* 10 pt, like OfferCard: the two offer cards stand in one thread and must match. */}
      {/* token-exempt: the same 10 pt as OfferCard's stack, so both offer cards match */}
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Icon name="flame" size={20} color={palette.primaryDk} />
          </View>
          <Text style={[TYPE.label, { color: palette.primaryDk }]}>{label.toUpperCase()}</Text>
        </View>
        <Text style={TYPE.body} numberOfLines={2}>
          {offer.title}
        </Text>
        <Btn busy={busy} onPress={() => void go()} accessibilityHint={`${label}: ${offer.title}`}>
          {failed ? t('common:actions.retry') : t('learn:topic.submit')}
        </Btn>
        {failed ? (
          <Text accessibilityLiveRegion="polite" style={[TYPE.small, { color: palette.ink2 }]}>
            {failed}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
