// A figure that opens full screen when tapped (gaps.md #1): on a small phone a labelled
// drawing is squeezed next to the question; in the viewer it can be pinched and moved.
// The tap target carries the figure's whole description for a screen reader.
//
// `folded`: while she types, the keyboard takes up to half of what she sees, and a drawing at its
// legible minimum — or a box diagram, which does not shrink at all — left the field she types in
// under the keyboard (issue #379). Then the drawing folds to one line, the way the reading text
// does (`PassagePanel`), and the same tap still opens it large. It unfolds when the keyboard goes.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { speakMathText } from '../../lib/math/speak.js';
import { useFigureNames } from '../../lib/math/useFigureNames.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { FoldLabel } from '../lb/FoldLabel.js';
import { Zoomable } from '../lb/ZoomViewer.js';
import { describeFigure, FigureView } from './FigureView.js';
import { useSpokenWords } from './useSpokenMath.js';

type Props = {
  figure: Figure;
  maxHeight?: number;
  /** One line instead of the drawing (while she types); a tap opens it large. */
  folded?: boolean;
};

export function ZoomableFigure({ figure, maxHeight, folded = false }: Props) {
  const { t } = useTranslation('math');
  const words = useSpokenWords();
  const names = useFigureNames(figure);
  const label = useMemo(
    () =>
      `${t('figure.label')}: ${describeFigure(figure, t, names, (s) => speakMathText(s, words))}`,
    [figure, t, names, words],
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
      {folded ? <FoldedFigure /> : <FigureView figure={figure} maxHeight={maxHeight} />}
    </Zoomable>
  );
}

/** The drawing as one line: what it is, and that a tap shows it. Words and a sign, not colour. */
function FoldedFigure() {
  const { palette, figure: ink } = useTheme();
  const { t } = useTranslation('math');
  return (
    <View
      testID="figure-folded"
      style={{
        minHeight: TOUCH,
        justifyContent: 'center',
        paddingHorizontal: SPACE.md,
        backgroundColor: ink.paper,
        borderRadius: RADIUS.frame,
        borderWidth: 1,
        borderColor: palette.hairline,
      }}
    >
      <FoldLabel icon="eye" title={t('figure.label')} action={t('figure.show')} />
    </View>
  );
}
