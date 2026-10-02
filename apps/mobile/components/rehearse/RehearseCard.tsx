// Buddy offered a rehearsal of her talk, or reading a text aloud (issue #264): one card under
// his message, the same shape as every other offer (OfferCard), with one button that opens the
// recorder. Nothing is recorded until she starts it there.

import type { ActionSummary } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { SPACE } from '../../lib/theme/space.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { Icon } from '../lb/Icon.js';

type Offer = Extract<ActionSummary, { tool: 'offer_rehearsal' }>;

export function RehearseCard({ actionId, offer }: { actionId: string; offer: Offer }) {
  const { palette } = useTheme();
  const { t } = useTranslation('learn');
  const label = t(offer.kind === 'talk' ? 'rehearse.offer.talk' : 'rehearse.offer.read_aloud');
  return (
    <Card tone="primaryLt" padding={16} radius={18}>
      <View style={{ gap: SPACE.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Icon
              name={offer.kind === 'talk' ? 'voice' : 'book'}
              size={20}
              color={palette.primaryDk}
            />
          </View>
          <Text style={[TYPE.label, { color: palette.primaryDk }]}>{label.toUpperCase()}</Text>
        </View>
        <Text style={TYPE.body} numberOfLines={2}>
          {offer.title}
        </Text>
        <Btn
          onPress={() => router.push({ pathname: '/rehearse', params: { action: actionId } })}
          accessibilityHint={`${label}: ${offer.title}`}
        >
          {t('rehearse.offer.start')}
        </Btn>
      </View>
    </Card>
  );
}
