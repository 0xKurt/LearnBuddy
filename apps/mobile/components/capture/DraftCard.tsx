// Photos left from before (the app was closed before they were sent): go on
// with them, or let them go — with a way back (lib/capture/draft.ts).

import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';

type Props = {
  count: number;
  /** The first photo, so she recognises the sheet. */
  preview: string | null;
  /** Just let go: the card offers to bring the photos back. */
  discarded: boolean;
  onResume: () => void;
  onDiscard: () => void;
  onUndo: () => void;
};

export function DraftCard({ count, preview, discarded, onResume, onDiscard, onUndo }: Props) {
  const { t } = useTranslation('capture');
  if (discarded) {
    return (
      <Card tone="sky" padding={14} radius={22}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text accessibilityLiveRegion="polite" style={[TYPE.body, { flex: 1 }]}>
            {t('draft.discarded', { count })}
          </Text>
          <Btn
            size="sm"
            variant="ghost"
            onPress={onUndo}
            accessibilityLabel={t('draft.undo_label')}
          >
            {t('draft.undo')}
          </Btn>
        </View>
      </Card>
    );
  }
  return (
    <Card tone="sky" padding={16} radius={22}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        {preview ? (
          <Image
            source={{ uri: preview }}
            accessibilityIgnoresInvertColors
            accessible={false}
            style={{ width: 44, height: 58, borderRadius: 8 }}
            contentFit="cover"
          />
        ) : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Text accessibilityRole="header" style={TYPE.title}>
            {t('draft.title')}
          </Text>
          <Text style={TYPE.small}>{t('draft.body', { count })}</Text>
        </View>
      </View>
      <View style={{ marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Btn onPress={onResume}>{t('draft.resume')}</Btn>
        <Btn variant="ghost" onPress={onDiscard}>
          {t('draft.discard')}
        </Btn>
      </View>
    </Card>
  );
}
