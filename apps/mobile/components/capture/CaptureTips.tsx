// One short, concrete photo tip, and what happens to the photos.

import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Card } from '../lb/Card.js';
import { IconDisc } from '../lb/IconDisc.js';

export function CaptureTips() {
  const { palette } = useTheme();
  const { t } = useTranslation('capture');
  return (
    <Card tone="peach" padding={SPACE.lg}>
      <View style={{ flexDirection: 'row', gap: SPACE.md, alignItems: 'flex-start' }}>
        <IconDisc name="bulb" size={36} iconSize={20} />
        <View style={{ flex: 1, gap: SPACE.xs }}>
          <Text style={[TYPE.body, { fontWeight: '600' }]}>{t('tip')}</Text>
          <Text style={[TYPE.small, { color: palette.ink2 }]}>{t('privacy')}</Text>
        </View>
      </View>
    </Card>
  );
}
