// The photos (and PDFs) picked so far, in page order — each one openable large
// (ZoomViewer), retakeable and removable before anything is sent (issue #57).

import { useState } from 'react';
import { ScrollView, Text, View, type TextStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn, MAX_FONT_SCALE } from '../lb/Btn.js';
import { Icon } from '../lb/Icon.js';
import { PhotoThumb } from '../lb/ZoomViewer.js';

const THUMB_WIDTH = 112;
const THUMB_HEIGHT = 148;
/** The photo's corner, between a tile's and a card's. */
const THUMB_RADIUS = 18;
/**
 * The page number and the "hard to read" tag on a photo: small, bold, on a coloured patch.
 * token-exempt: 12, below TYPE.label, so it fits on a 112 pt photo.
 */
const TAG: TextStyle = { fontSize: 12, fontWeight: '700' };

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
  const { palette } = useTheme();
  const { t } = useTranslation('capture');
  // A photo the phone cannot show (a file that is gone, a format the viewer refuses) says
  // so instead of leaving an empty box — an empty tile looks like a broken app (issue #57).
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        gap: SPACE.md,
        // token-exempt: room for the thumbnails' soft shadow, 2 to the side, 6 above and below
        paddingHorizontal: 2,
        paddingVertical: 6, // token-exempt: room for the soft shadow (above)
      }}
    >
      {uris.map((uri, i) => (
        <View
          key={uri}
          style={{
            width: THUMB_WIDTH,
            gap: 6, // token-exempt: the photo close above its buttons
          }}
        >
          <View
            style={{ borderRadius: THUMB_RADIUS, backgroundColor: palette.paper, ...SHADOW.soft }}
          >
            <View
              style={{
                width: THUMB_WIDTH,
                height: THUMB_HEIGHT,
                borderRadius: THUMB_RADIUS,
                overflow: 'hidden',
                backgroundColor: palette.canvas,
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
                    gap: SPACE.sm,
                    padding: 10, // token-exempt: three lines of a file's name fit the 112 pt page
                    backgroundColor: palette.lavender,
                  }}
                >
                  <Icon name="file" size={36} color={palette.primaryDk} />
                  <Text
                    numberOfLines={3}
                    style={[TYPE.label, { color: palette.primaryDk, textAlign: 'center' }]}
                  >
                    {pdfs[uri]}
                  </Text>
                </View>
              ) : broken.has(uri) ? (
                <View
                  accessible
                  accessibilityLabel={t('preview_failed')}
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.sm }}
                >
                  <Icon name="eye-off" size={28} color={palette.ink3} />
                  <Text style={[TYPE.small, { color: palette.ink2, textAlign: 'center' }]}>
                    {t('preview_failed')}
                  </Text>
                </View>
              ) : (
                // A tap shows the photo full screen, to zoom in (gaps.md #1).
                <PhotoThumb
                  uri={uri}
                  label={t('photo_label', { index: i + 1, total: uris.length })}
                  onError={() => setBroken((was) => new Set(was).add(uri))}
                />
              )}
              {/* Page number; the image label already says it for screen readers. */}
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  // min sizes: large system text grows the badge over the thumbnail
                  // instead of clipping the number in a fixed box (audit M-84, issue #73).
                  minWidth: 24,
                  minHeight: 24,
                  borderRadius: 999, // token-exempt: fully round ends, like Chip
                  paddingHorizontal: 6, // token-exempt: page numbers of two figures stay round
                  backgroundColor: palette.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                  style={[TAG, { color: palette.paper }]}
                >
                  {i + 1}
                </Text>
              </View>
              {flagged?.has(uri) ? (
                <View
                  style={{
                    position: 'absolute',
                    left: 6,
                    right: 6,
                    bottom: 6,
                    borderRadius: 10, // token-exempt: tag corner inside the photo's 18
                    paddingVertical: 3, // token-exempt: one line, snug on the photo
                    backgroundColor: palette.butter,
                    alignItems: 'center',
                  }}
                >
                  <Text style={[TAG, { color: palette.warningText }]}>{t('quality.flag')}</Text>
                </View>
              ) : null}
            </View>
          </View>
          {/* One row, icons with spoken names: two stacked worded buttons pushed the
              screen 32 px past 360×740 (fit rule; the walkthrough caught it). Retake:
              schief, unscharf, halbe Seite — this page again, in its place (issue #57). */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: SPACE.md }}>
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
