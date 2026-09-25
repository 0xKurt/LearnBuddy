// The photos picked so far, in page order, each with a way to take it out.

import { Image } from 'expo-image';
import { ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LB } from '../../lib/theme/colors.js';
import { Btn } from '../lb/Btn.js';

const THUMB_WIDTH = 112;
const THUMB_HEIGHT = 148;

type Props = {
  uris: readonly string[];
  disabled: boolean;
  onRemove: (uri: string) => void;
};

export function PhotoStrip({ uris, disabled, onRemove }: Props) {
  const { t } = useTranslation('capture');
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 12 }}
    >
      {uris.map((uri, i) => (
        <View key={uri} style={{ width: THUMB_WIDTH, gap: 4 }}>
          <View
            style={{
              width: THUMB_WIDTH,
              height: THUMB_HEIGHT,
              borderRadius: 14,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: LB.hairline,
              backgroundColor: LB.canvas,
            }}
          >
            <Image
              source={{ uri }}
              accessible
              accessibilityLabel={t('photo_label', { index: i + 1, total: uris.length })}
              contentFit="cover"
              transition={120}
              style={{ flex: 1 }}
            />
            {/* Page number; the image label already says it for screen readers. */}
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                position: 'absolute',
                top: 6,
                left: 6,
                minWidth: 22,
                height: 22,
                borderRadius: 11,
                paddingHorizontal: 6,
                backgroundColor: LB.ink,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{i + 1}</Text>
            </View>
          </View>
          <Btn
            size="sm"
            variant="ghost"
            full
            disabled={disabled}
            onPress={() => onRemove(uri)}
            accessibilityLabel={t('remove_label', { index: i + 1 })}
          >
            {t('remove')}
          </Btn>
        </View>
      ))}
    </ScrollView>
  );
}
