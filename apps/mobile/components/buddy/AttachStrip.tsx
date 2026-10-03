// The pages attached to the message she is writing (issue #82): small squares above
// the field, like every messenger — a tap shows one full screen, the ✕ takes it out
// again. The ✕ looks small and is a full 44 pt to hit.
//
// The square must show the photo (issue #294: on the phone it stayed an empty dark box,
// while the same file showed at once in the card after sending). The tile is now built
// like the two thumbnails that DO show on the phone: the shadow on an outer view and the
// clipping on an inner one (components/capture/PhotoStrip.tsx — Android draws an elevated
// view that also clips its children unreliably), the image at a fixed size and without a
// cross-fade (the sent card, components/buddy/SlimBar.tsx). Under the image lies a camera
// mark, so a photo that never paints is never an empty box; one that cannot be read says so
// in words under the strip.

import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { Icon } from '../lb/Icon.js';
import { ZoomablePhoto } from '../lb/ZoomViewer.js';

const THUMB = 72;
const RADIUS = 14;

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
  const { palette } = useTheme();
  const { t } = useTranslation('capture');
  // A photo the phone cannot show says so instead of leaving an empty box (issues #57, #294).
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  if (uris.length === 0) return null;
  const unreadable = uris.some((uri) => broken.has(uri) && !pdfs[uri]);

  return (
    <View style={{ gap: SPACE.xs }}>
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
              {/* The shadow out here, the clipping inside: one view doing both is what
                  Android does not draw reliably (PhotoStrip has always split them). */}
              <View
                style={{
                  width: THUMB,
                  height: THUMB,
                  borderRadius: RADIUS,
                  backgroundColor: palette.canvas,
                  ...SHADOW.soft,
                }}
              >
                <View
                  testID="attach-tile"
                  style={{
                    width: THUMB,
                    height: THUMB,
                    borderRadius: RADIUS,
                    overflow: 'hidden',
                    backgroundColor: palette.canvas,
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
                        backgroundColor: palette.lavender,
                      }}
                    >
                      <Icon name="file" size={22} color={palette.primaryDk} />
                      <Text
                        numberOfLines={2}
                        style={[TYPE.small, { color: palette.primaryDk, textAlign: 'center' }]}
                      >
                        {pdfs[uri]}
                      </Text>
                    </View>
                  ) : broken.has(uri) ? (
                    <View
                      accessible
                      accessibilityRole="image"
                      accessibilityLabel={`${label}: ${t('preview_failed')}`}
                      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Icon name="eye-off" size={22} color={palette.ink3} />
                    </View>
                  ) : (
                    <>
                      {/* Covered by the photo once it paints; until then — or if it never
                          does — the box says what belongs in it. */}
                      <View
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon name="camera" size={22} color={palette.ink3} />
                      </View>
                      <ZoomablePhoto uri={uri} label={label} fill>
                        <Image
                          source={{ uri }}
                          accessible
                          accessibilityLabel={label}
                          contentFit="cover"
                          onError={() => setBroken((was) => new Set(was).add(uri))}
                          style={{ width: THUMB, height: THUMB }}
                        />
                      </ZoomablePhoto>
                    </>
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
                        backgroundColor: palette.butter,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: palette.warningText, fontSize: 11, fontWeight: '700' }}>
                        {t('quality.flag')}
                      </Text>
                    </View>
                  ) : null}
                </View>
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
                    backgroundColor: palette.ink,
                    opacity: disabled ? 0.4 : 0.85,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="close" size={14} color={palette.paper} />
                </View>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
      {/* In words, not only as a crossed-out eye: a box she cannot check is not a fault of hers,
          and she should know before she sends it (issue #294). */}
      {unreadable ? (
        <Text accessibilityLiveRegion="polite" style={[TYPE.small, { color: palette.ink2 }]}>
          {t('preview_failed')}
        </Text>
      ) : null}
    </View>
  );
}
