// Buddy offered to start something in the chat ("Soll ich dir den Dativ
// erklären?"): the offer under its message, with one "Los geht's". It starts
// like the topic sheet does; the offer's action id is the request id, so the
// same offer always opens the same session (tapping it again resumes it).

import type { ActionSummary } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { Icon } from '../lb/Icon.js';
import { KIND_ICON, KIND_LABEL } from './kinds.js';
import { StartStatus } from './StartStatus.js';
import { useStartTopic } from './useStartTopic.js';

type Offer = Extract<ActionSummary, { tool: 'offer_learning' }>;

export function OfferCard({ actionId, offer }: { actionId: string; offer: Offer }) {
  const { t } = useTranslation(['learn', 'common']);
  const { state, start } = useStartTopic();
  const preparing = state.status === 'preparing';
  const label = t(`learn:${KIND_LABEL[offer.kind]}`);

  async function go(): Promise<void> {
    const session = await start(offer.kind, offer.text, actionId);
    if (session) router.push(`/practice/${session.id}`);
  }

  return (
    <Card tone="primaryLt" padding={16} radius={18}>
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Icon name={KIND_ICON[offer.kind]} size={20} color={LB.primaryDk} />
          </View>
          <Text style={[TYPE.label, { color: LB.primaryDk }]}>{label.toUpperCase()}</Text>
        </View>
        <Text style={TYPE.body} numberOfLines={5}>
          {offer.text}
        </Text>
        <StartStatus state={state} />
        {state.status === 'not_usable' ? null : (
          <Btn
            disabled={preparing}
            onPress={() => void go()}
            accessibilityHint={`${label}: ${offer.text}`}
          >
            {state.status === 'failed' ? t('common:actions.retry') : t('learn:topic.submit')}
          </Btn>
        )}
      </View>
    </Card>
  );
}
