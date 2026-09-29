// The photos (and PDFs) picked so far, in page order — each one openable large
// (ZoomViewer), retakeable and removable before anything is sent (issue #57).

import { Image } from 'expo-image';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LB } from '../../lib/theme/colors.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Icon } from '../lb/Icon.js';
import { ZoomablePhoto } from '../lb/ZoomViewer.js';

const THUMB_WIDTH = 112;
const THUMB_HEIGHT = 148;

type Props = {
  uris: readonly string[];
  /** The files that are PDFs, with their names: shown as a page with the name, not an image. */
  pdfs?: Readonly<Record<string, string>>;
  /** Photos the check found hard to read: marked in words, not only colour. */
  flagged?: ReadonlySet<string>;
  disabled: boolean;
  onRemove: (uri: string) => void;
  /** Take this photo again with the camera, same place in the order (not for PDFs). */
  onRetake: (uri: string) => void;
};

export function PhotoStrip({ uris, pdfs, flagged, disabled, onRemove, onRetake }: Props) {
  const { t } = useTranslation('capture');
  // A photo the phone cannot show (a file that is gone, a format the viewer refuses) says
  // so instead of leaving an empty box — an empty tile looks like a broken app (issue #57).
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
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
              {pdfs?.[uri] ? (
                <View
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={t('files.pdf_label', {
                    index: i + 1,
                    total: uris.length,
                    name: pdfs[uri],
                  })}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: 10,
                    backgroundColor: LB.lavender,
                  }}
                >
                  <Icon name="file" size={36} color={LB.primaryDk} />
                  <Text
                    numberOfLines={3}
                    style={[TYPE.label, { color: LB.primaryDk, textAlign: 'center' }]}
                  >
                    {pdfs[uri]}
                  </Text>
                </View>
              ) : broken.has(uri) ? (
                <View
                  accessible
                  accessibilityLabel={t('preview_failed')}
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <Icon name="eye-off" size={28} color={LB.ink3} />
                  <Text style={[TYPE.small, { color: LB.ink2, textAlign: 'center' }]}>
                    {t('preview_failed')}
                  </Text>
                </View>
              ) : (
                // A tap shows the photo full screen, to zoom in (gaps.md #1).
                <ZoomablePhoto
                  uri={uri}
                  label={t('photo_label', { index: i + 1, total: uris.length })}
                  fill
                >
                  <Image
                    source={{ uri }}
                    accessible
                    accessibilityLabel={t('photo_label', { index: i + 1, total: uris.length })}
                    contentFit="cover"
                    transition={120}
                    recyclingKey={uri}
                    cachePolicy="memory-disk"
                    onError={() => setBroken((was) => new Set(was).add(uri))}
                    style={{ flex: 1 }}
                  />
                </ZoomablePhoto>
              )}
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
          {/* One row, icons with spoken names: two stacked worded buttons pushed the
              screen 32 px past 360×740 (fit rule; the walkthrough caught it). Retake:
              schief, unscharf, halbe Seite — this page again, in its place (issue #57). */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12 }}>
            {pdfs?.[uri] ? null : (
              <Btn
                size="sm"
                variant="ghost"
                pill
                icon="camera"
                disabled={disabled}
                onPress={() => onRetake(uri)}
                accessibilityLabel={t('retake_label', { index: i + 1 })}
              >
                {''}
              </Btn>
            )}
            <Btn
              size="sm"
              variant="ghost"
              pill
              icon="trash"
              disabled={disabled}
              onPress={() => onRemove(uri)}
              accessibilityLabel={t('remove_label', { index: i + 1 })}
            >
              {''}
            </Btn>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
