// Capture's wrapping portrait previews: tap to zoom, remove through an inside 44 pt target.
// The real photo/PDF and quality review remain authoritative; no preview stand-ins.

import { Image } from 'expo-image';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { UI } from '../../lib/theme/components.js';
import { CAPTURE } from '../../lib/theme/capture.js';
import { TYPE } from '../../lib/theme/type.js';
import { circle, RADIUS } from '../../lib/theme/radius.js';
import { Icon } from '../lb/Icon.js';
import { PressArea } from '../lb/PressArea.js';
import { ZoomablePhoto } from '../lb/ZoomViewer.js';

const THUMB = CAPTURE.thumbnail;
/** The ✕'s dark circle; the 44 pt around it is what takes the tap. */
const CLOSE = CAPTURE.closeFace;

type Props = {
  uris: readonly string[];
  /** The files that are PDFs, with their names: shown as a page with the name, not an image. */
  pdfs: Readonly<Record<string, string>>;
  /** Pages the check found hard to read: said in words under the strip, marked here too. */
  flagged: ReadonlySet<string>;
  disabled: boolean;
  onRemove: (uri: string) => void;
  /** The camera again, as the strip's last square; null: not offered. */
  onMore?: (() => void) | null;
};

export function AttachStrip({ uris, pdfs, flagged, disabled, onRemove, onMore = null }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('capture');
  // A photo the phone cannot show says so instead of leaving an empty box (issues #57, #294).
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  if (uris.length === 0) return null;
  const unreadable = uris.some((uri) => broken.has(uri) && !pdfs[uri]);

  return (
    <View style={{ gap: SPACE.xs }}>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: CAPTURE.previewGap,
        }}
      >
        {uris.map((uri, i) => {
          const label = pdfs[uri]
            ? t('files.pdf_label', { index: i + 1, total: uris.length, name: pdfs[uri] })
            : `${t('photo_label', { index: i + 1, total: uris.length })}${flagged.has(uri) ? `: ${t('quality.flag')}` : ''}`;
          return (
            <View key={uri} style={{ width: THUMB.width, height: THUMB.height }}>
              {/* The shadow out here, the clipping inside: one view doing both is what
                  Android does not draw reliably. */}
              <View
                style={{
                  width: THUMB.width,
                  height: THUMB.height,
                  borderRadius: RADIUS.md,
                  backgroundColor: palette.canvas,
                  ...SHADOW.soft,
                }}
              >
                <View
                  testID="attach-tile"
                  style={{
                    width: THUMB.width,
                    height: THUMB.height,
                    borderRadius: RADIUS.md,
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
                        gap: CAPTURE.shadowInset,
                        padding: SPACE.xs,
                        backgroundColor: palette.lavender,
                      }}
                    >
                      <Icon name="file" size={CAPTURE.addGlyph} color={palette.primaryDk} />
                      <Text
                        numberOfLines={2}
                        style={[
                          CAPTURE.addLabelType,
                          { color: palette.primaryDk, textAlign: 'center' },
                        ]}
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
                      <Icon name="eye-off" size={CAPTURE.addGlyph} color={palette.ink3} />
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
                        <Icon name="camera" size={CAPTURE.addGlyph} color={palette.ink3} />
                      </View>
                      <ZoomablePhoto uri={uri} label={label} fill>
                        <Image
                          source={{ uri }}
                          accessible
                          accessibilityLabel={label}
                          contentFit="cover"
                          onError={() => setBroken((was) => new Set(was).add(uri))}
                          style={{ width: THUMB.width, height: THUMB.height }}
                        />
                      </ZoomablePhoto>
                    </>
                  )}
                  <View
                    pointerEvents="none"
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    aria-hidden
                    style={{
                      position: 'absolute',
                      top: CAPTURE.pageNumber.inset,
                      left: CAPTURE.pageNumber.inset,
                      width: CAPTURE.pageNumber.size,
                      height: CAPTURE.pageNumber.size,
                      borderRadius: RADIUS.round,
                      backgroundColor: palette.primary,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={[CAPTURE.pageNumberType, { color: palette.onPrimary }]}>
                      {i + 1}
                    </Text>
                  </View>
                  {flagged.has(uri) ? (
                    <View
                      pointerEvents="none"
                      aria-hidden
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        borderRadius: RADIUS.md,
                        borderWidth: CAPTURE.warningBorder,
                        borderColor: palette.warning,
                      }}
                    />
                  ) : null}
                </View>
              </View>
              {/* Small to look at, 44 pt to hit: the padding around the circle is the target. */}
              <PressArea
                onPress={() => onRemove(uri)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={t('remove_label', { index: i + 1 })}
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  width: TOUCH,
                  height: TOUCH,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View
                  style={{
                    position: 'absolute',
                    top: CAPTURE.closeInset,
                    right: CAPTURE.closeInset,
                    width: CLOSE,
                    height: CLOSE,
                    borderRadius: circle(CLOSE),
                    backgroundColor: palette.photoOverlay,
                    opacity: disabled ? UI.disabledOpacity : 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="close" size={CAPTURE.closeGlyph} color={palette.onPhotoOverlay} />
                </View>
              </PressArea>
            </View>
          );
        })}
        {onMore ? (
          <PressArea
            onPress={onMore}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={t('page.more')}
            style={{ width: THUMB.width, height: THUMB.height }}
          >
            {(pressed) => (
              <View
                style={{
                  width: THUMB.width,
                  height: THUMB.height,
                  borderRadius: RADIUS.md,
                  borderWidth: CAPTURE.border,
                  borderStyle: 'dashed',
                  borderColor: palette.hairlineStrong,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: CAPTURE.addGap,
                  padding: SPACE.xs,
                  opacity: disabled ? UI.disabledOpacity : pressed ? UI.pressedOpacity : 1,
                }}
              >
                <Icon name="plus" size={CAPTURE.addGlyph} color={palette.primaryDk} />
                <Text
                  numberOfLines={2}
                  style={[CAPTURE.addLabelType, { color: palette.primaryDk, textAlign: 'center' }]}
                >
                  {t('page.page')}
                </Text>
              </View>
            )}
          </PressArea>
        ) : null}
      </View>
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
