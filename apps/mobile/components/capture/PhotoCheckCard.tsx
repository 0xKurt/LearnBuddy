// A photo the check on the device found hard to read (lib/photo/quality.ts):
// what is wrong in plain words, how to do it better, and two ways on — take it
// again (the usual choice) or keep it anyway. Calm, never blocking.
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { PhotoProblem } from '../../lib/photo/quality.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';

type Props = {
  /** 1-based number of the photo. */
  index: number;
  problems: readonly PhotoProblem[];
  disabled: boolean;
  onRetake: () => void;
  onKeep: () => void;
};

export function PhotoCheckCard({ index, problems, disabled, onRetake, onKeep }: Props) {
  const { t } = useTranslation('capture');
  const main = problems[0] ?? 'blurry';
  return (
    <View accessibilityLiveRegion="polite">
      <Card tone="butter" padding={16}>
        <View style={{ gap: 10 }}>
          <Text accessibilityRole="header" style={[TYPE.body, { fontWeight: '700' }]}>
            {t(`quality.${main}`, { index })}
          </Text>
          <Text style={TYPE.small}>{t(`quality.${main}_tip`)}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Btn size="sm" pill icon="camera" disabled={disabled} onPress={onRetake}>
              {t('quality.retake')}
            </Btn>
            <Btn size="sm" pill variant="ghost" disabled={disabled} onPress={onKeep}>
              {t('quality.keep')}
            </Btn>
          </View>
        </View>
      </Card>
    </View>
  );
}
