// The sheet's own figure for this question (issue #50): a REAL crop from the
// photographed page — a labelled diagram, a reference chart — never a generated
// picture. Rendered in a frame whose height is known before the pixels arrive
// (the contract carries width/height), so the card never jumps while it loads.
// A tap opens it full screen in the ZoomViewer (pinch to zoom; closable by an
// in-sheet <Btn>, CLAUDE.md rule 14).

import type { ItemImage } from '@learnbuddy/shared-types/contracts';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Zoomable } from '../lb/ZoomViewer.js';

type Props = {
  image: ItemImage;
  /**
   * Stable cache key (the question's id): the signed URL changes with every
   * fetch of the session, the pixels never do — so the crop is downloaded once.
   */
  cacheKey: string;
  /** The tallest the crop may be, so question and answer stay on screen. */
  maxHeight?: number;
};

export function StimulusImage({ image, cacheKey, maxHeight = 180 }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const label = image.label.trim() || t('image_fallback');
  const ratio = image.width / image.height;
  return (
    <View style={{ marginTop: 12 }}>
      <Zoomable
        label={label}
        large={
          <Image
            source={{ uri: image.url, cacheKey }}
            accessible={false}
            contentFit="contain"
            style={{ width: '100%', height: '100%' }}
          />
        }
      >
        {/* The frame keeps the crop's own ratio, capped in height; `contain` never
         *  distorts — a cap only leaves paper-coloured margins, like the sheet itself. */}
        <Image
          source={{ uri: image.url, cacheKey }}
          accessible={false}
          contentFit="contain"
          transition={90}
          style={{
            width: '100%',
            aspectRatio: Number.isFinite(ratio) && ratio > 0 ? ratio : 4 / 3,
            maxHeight,
            borderRadius: 14,
            backgroundColor: palette.paper,
          }}
        />
      </Zoomable>
    </View>
  );
}
