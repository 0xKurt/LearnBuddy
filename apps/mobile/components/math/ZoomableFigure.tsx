// A figure that opens full screen when tapped (gaps.md #1): on a small phone a labelled
// drawing is squeezed next to the question; in the viewer it can be pinched and moved.
// The tap target carries the figure's whole description for a screen reader.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { speakMathText } from '../../lib/math/speak.js';
import { Zoomable } from '../lb/ZoomViewer.js';
import { describeFigure, FigureView } from './FigureView.js';
import { useSpokenWords } from './useSpokenMath.js';

export function ZoomableFigure({ figure, maxHeight }: { figure: Figure; maxHeight?: number }) {
  const { t } = useTranslation('math');
  const words = useSpokenWords();
  const label = useMemo(
    () => `${t('figure.label')}: ${describeFigure(figure, t, (s) => speakMathText(s, words))}`,
    [figure, t, words],
  );
  return (
    <Zoomable
      label={label}
      large={
        <View style={{ alignSelf: 'stretch' }}>
          <FigureView figure={figure} />
        </View>
      }
    >
      <FigureView figure={figure} maxHeight={maxHeight} />
    </Zoomable>
  );
}
