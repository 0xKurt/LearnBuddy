// One short, concrete photo tip, and what happens to the photos.

import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Card } from '../lb/Card.js';

export function CaptureTips() {
  const { t } = useTranslation('capture');
  return (
    <Card tone="peach" padding={16} radius={20}>
      <View style={{ gap: 6 }}>
        <Text style={[TYPE.body, { fontWeight: '600' }]}>{t('tip')}</Text>
        <Text style={[TYPE.body, { color: LB.ink2 }]}>{t('privacy')}</Text>
      </View>
    </Card>
  );
}
