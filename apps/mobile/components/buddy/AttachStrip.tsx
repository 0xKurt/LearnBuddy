// The pages attached to the message she is writing (issue #82): small squares above
// the field, like every messenger — a tap shows one full screen, the ✕ takes it out
// again. The ✕ looks small and is a full 44 pt to hit.

import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LB } from '../../lib/theme/colors.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { Icon } from '../lb/Icon.js';
import { ZoomablePhoto } from '../lb/ZoomViewer.js';

const THUMB = 72;

type Props = {
  uris: readonly string[];
  /** The files that are PDFs, with their names: shown as a page with the name, not an image. */
  pdfs: Readonly<Record<string, string>>;
  /** Pages the check found hard to read: said in words under the strip, marked here too. */
  flagged: ReadonlySet<string>;
  disabled: boolean;
  onRemove: (uri: string) => void;
};

export function AttachStrip({ uris, pdfs, flagged, disabled, onRemove }: Props) {
  const { t } = useTranslation('capture');
  // A photo the phone cannot show says so instead of leaving an empty box (issue #57).
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  if (uris.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: SPACE.sm, paddingHorizontal: 2, paddingVertical: 4 }}
    >
      {uris.map((uri, i) => {
        const label = pdfs[uri]
          ? t('files.pdf_label', { index: i + 1, total: uris.length, name: pdfs[uri] })
          : t('photo_label', { index: i + 1, total: uris.length });
        return (
          <View key={uri} style={{ width: THUMB, height: THUMB }}>
            <View
              style={{
                width: THUMB,
                height: THUMB,
                borderRadius: 14,
                overflow: 'hidden',
                backgroundColor: LB.canvas,
                ...SHADOW.soft,
              }}
            >
              {pdfs[uri] ? (
                <View
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={label}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    padding: 4,
                    backgroundColor: LB.lavender,
                  }}
                >
                  <Icon name="file" size={22} color={LB.primaryDk} />
                  <Text
                    numberOfLines={2}
                    style={[TYPE.small, { color: LB.primaryDk, textAlign: 'center' }]}
                  >
                    {pdfs[uri]}
                  </Text>
                </View>
              ) : broken.has(uri) ? (
                <View
                  accessible
                  accessibilityLabel={t('preview_failed')}
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name="eye-off" size={22} color={LB.ink3} />
                </View>
              ) : (
                <ZoomablePhoto uri={uri} label={label} fill>
                  <Image
                    source={{ uri }}
                    accessible
                    accessibilityLabel={label}
                    contentFit="cover"
                    transition={120}
                    recyclingKey={uri}
                    cachePolicy="memory-disk"
                    onError={() => setBroken((was) => new Set(was).add(uri))}
                    style={{ flex: 1 }}
                  />
                </ZoomablePhoto>
              )}
              {flagged.has(uri) ? (
                // Never colour alone: the word stands under the strip, this only points at it.
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    paddingVertical: 1,
                    backgroundColor: LB.butter,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: LB.warningText, fontSize: 11, fontWeight: '700' }}>
                    {t('quality.flag')}
                  </Text>
                </View>
              ) : null}
            </View>
            {/* Small to look at, 44 pt to hit: the padding around the circle is the target. */}
            <Pressable
              onPress={() => onRemove(uri)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={t('remove_label', { index: i + 1 })}
              style={{
                position: 'absolute',
                top: -14,
                right: -14,
                width: 44,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: LB.ink,
                  opacity: disabled ? 0.4 : 0.85,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="close" size={14} color={LB.paper} />
              </View>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}
