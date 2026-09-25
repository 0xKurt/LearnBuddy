// Buddy is on something the learner is waiting for (their photos, the
// practice they just finished): say so, instead of an unexplained pause.

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { ActivityIndicator, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Card } from '../lb/Card.js';

export function WorkingNote({ what }: { what: NonNullable<BuddyHome['working']> }) {
  const { t } = useTranslation('buddy');
  return (
    <Card padding={16} radius={18}>
      <View
        accessibilityLiveRegion="polite"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <ActivityIndicator color={LB.ink2} />
        <Text style={[TYPE.body, { flex: 1 }]}>{t(`working.${what}`)}</Text>
      </View>
    </Card>
  );
}
