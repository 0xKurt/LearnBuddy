// The photos picked so far, in page order, each with a way to take it out.

import { Image } from 'expo-image';
import { ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LB } from '../../lib/theme/colors.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { Btn } from '../lb/Btn.js';

const THUMB_WIDTH = 112;
const THUMB_HEIGHT = 148;

type Props = {
  uris: readonly string[];
  /** Photos the check found hard to read: marked in words, not only colour. */
  flagged?: ReadonlySet<string>;
  disabled: boolean;
  onRemove: (uri: string) => void;
};

export function PhotoStrip({ uris, flagged, disabled, onRemove }: Props) {
  const { t } = useTranslation('capture');
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // Room for the thumbnails' soft shadow.
      contentContainerStyle={{ gap: 12, paddingHorizontal: 2, paddingVertical: 6 }}
    >
      {uris.map((uri, i) => (
        <View key={uri} style={{ width: THUMB_WIDTH, gap: 6 }}>
          <View style={{ borderRadius: 18, backgroundColor: LB.paper, ...SHADOW.soft }}>
            <View
              style={{
                width: THUMB_WIDTH,
                height: THUMB_HEIGHT,
                borderRadius: 18,
                overflow: 'hidden',
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
                  top: 8,
                  left: 8,
                  minWidth: 24,
                  height: 24,
                  borderRadius: 12,
                  paddingHorizontal: 6,
                  backgroundColor: LB.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: LB.paper, fontSize: 12, fontWeight: '700' }}>{i + 1}</Text>
              </View>
              {flagged?.has(uri) ? (
                <View
                  style={{
                    position: 'absolute',
                    left: 6,
                    right: 6,
                    bottom: 6,
                    borderRadius: 10,
                    paddingVertical: 3,
                    backgroundColor: LB.butter,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: LB.warningText, fontSize: 12, fontWeight: '700' }}>
                    {t('quality.flag')}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <Btn
            size="sm"
            variant="ghost"
            pill
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
