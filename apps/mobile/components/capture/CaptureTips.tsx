// One short, concrete photo tip, and what happens to the photos.

import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Card } from '../lb/Card.js';
import { Icon } from '../lb/Icon.js';

export function CaptureTips() {
  const { t } = useTranslation('capture');
  return (
    <Card tone="peach" padding={16}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: LB.paper,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="bulb" size={20} color={LB.primaryDk} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[TYPE.body, { fontWeight: '600' }]}>{t('tip')}</Text>
          <Text style={[TYPE.small, { color: LB.ink2 }]}>{t('privacy')}</Text>
        </View>
      </View>
    </Card>
  );
}
