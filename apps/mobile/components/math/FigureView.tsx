// Draws the figure that goes with a question (packages/shared-types/src/contracts/figure.ts) in
// its frame, at the width that is available. The model only sends data; each kind is drawn with
// react-native-svg in its own file — the fraction picture, the number line, the function plot,
// the bar chart, the geometry drawing and the table (`<Kind>Figure.tsx`), the charts of
// ChartFigures.tsx and the school figures of schoolFigures.tsx. Every figure also carries a text
// description for screen readers (describeFigure.ts).

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  BARE_FIGURE_CHROME,
  BARE_FIGURE_PAD,
  figureBodyWidth,
  figureScale,
  naturalFigureHeight,
  newFigureWidth,
} from '../../lib/math/figureScale.js';
import { speakMathText } from '../../lib/math/speak.js';
import { useFigureNames } from '../../lib/math/useFigureNames.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { BarChartFigure } from './BarChartFigure.js';
import { ChartBody } from './ChartFigures.js';
import { describeFigure } from './describeFigure.js';
import { FractionFigure } from './FractionFigure.js';
import { FunctionPlotFigure } from './FunctionPlotFigure.js';
import { GeometryFigure } from './GeometryFigure.js';
import { MoleculeView } from './MoleculeView.js';
import { NumberLineFigure } from './NumberLineFigure.js';
import { isSchoolFigure, SchoolFigureBody } from './schoolFigures.js';
import { StaffLine } from './StaffLine.js';
import { TableFigure } from './TableFigure.js';
import { useSpokenWords } from './useSpokenMath.js';

/**
 * `maxHeight` keeps a drawing from pushing the answer off a small screen: a figure
 * that comes out taller is drawn again, narrower (its height follows its width).
 *
 * `bare`: the figure IS an answer option ("Welcher Graph passt?", issue #231). Then it names
 * no formula — no legend under a graph, none in its description, which describes the graph
 * by points it passes instead (a legend reading "y = x² − 1" would answer the question) —
 * it draws no frame of its own (the option card is the frame), its height follows its width
 * alone so four fit a phone, and it is not a screen-reader element of its own: the option
 * that holds it says what it shows.
 *
 * `layer`: drawn over the figure in the drawing's own coordinates, at the width the drawing got —
 * what she taps and the place she chose (issue #248, `TapFigure`).
 */
export function FigureView({
  figure,
  maxHeight,
  bare = false,
  layer,
}: {
  figure: Figure;
  maxHeight?: number;
  bare?: boolean;
  layer?: (width: number) => ReactNode;
}) {
  const { palette, figure: ink } = useTheme();
  const { t } = useTranslation('math');
  const [width, setWidth] = useState(0);
  // The drawing's full height at this width, measured once; the scale is then DERIVED
  // from whatever `maxHeight` is right now (the rules and why they matter for issue #96
  // are in lib/math/figureScale.ts, where they are tested).
  const [fullHeight, setFullHeight] = useState(0);
  const scale = figureScale(fullHeight, maxHeight);
  const bodyWidth = figureBodyWidth(width, scale, bare ? BARE_FIGURE_CHROME : undefined);
  const words = useSpokenWords();
  const names = useFigureNames(figure);
  const description = useMemo(
    () => describeFigure(figure, t, names, (s) => speakMathText(s, words), { formulas: !bare }),
    [figure, t, names, words, bare],
  );

  return (
    <View
      accessible={!bare}
      accessibilityRole={bare ? undefined : 'image'}
      accessibilityLabel={bare ? undefined : `${t('figure.label')}: ${description}`}
      onLayout={(e) => {
        const w = newFigureWidth(width, e.nativeEvent.layout.width);
        if (w !== null) {
          setWidth(w);
          setFullHeight(0); // a new width means a new natural height: measure again
        }
      }}
      style={{
        alignSelf: 'stretch',
        backgroundColor: ink.paper,
        borderRadius: bare ? SPACE.md : 16,
        borderWidth: bare ? 0 : 1,
        borderColor: palette.hairline,
        // Half the chrome on each side (BARE_FIGURE_CHROME / FIGURE_CHROME minus the border).
        padding: bare ? BARE_FIGURE_PAD : 12,
        minHeight: bare ? 0 : 60,
      }}
    >
      {width > 0 ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ alignItems: 'center' }}
          onLayout={(e) => {
            // The first layout after a width change renders at scale 1: that is the
            // drawing's natural height, the one number the derived scale needs.
            const h = naturalFigureHeight(fullHeight, e.nativeEvent.layout.height);
            if (h !== null) setFullHeight(h);
          }}
        >
          {layer ? (
            <View style={{ width: bodyWidth, alignItems: 'center' }}>
              <FigureBody figure={figure} width={bodyWidth} scale={scale} bare={bare} />
              <View style={StyleSheet.absoluteFill}>{layer(bodyWidth)}</View>
            </View>
          ) : (
            <FigureBody figure={figure} width={bodyWidth} scale={scale} bare={bare} />
          )}
        </View>
      ) : null}
    </View>
  );
}

/** `width` is already shrunk by `scale`; only a tree, whose height follows its levels, needs both. */
type BodyProps = { figure: Figure; width: number; scale: number; bare: boolean };

function FigureBody({ figure, width, scale, bare }: BodyProps) {
  // Clock, money, trees, the periodic table, solids … are drawn in their own files.
  if (isSchoolFigure(figure))
    return <SchoolFigureBody figure={figure} width={width} scale={scale} />;
  switch (figure.type) {
    case 'fraction':
      return <FractionFigure fig={figure} width={width} />;
    case 'number_line':
      return <NumberLineFigure fig={figure} width={width} />;
    case 'function_plot':
      return <FunctionPlotFigure fig={figure} width={width} bare={bare} />;
    case 'bar_chart':
      return <BarChartFigure fig={figure} width={width} />;
    case 'geometry':
      return <GeometryFigure fig={figure} width={width} />;
    case 'table':
      return <TableFigure fig={figure} />;
    case 'molecule':
      return <MoleculeView fig={figure} width={width} />;
    // Die Notenzeile (issue #226). Gezeichnet wird sie in `StaffLine.tsx`, weil dieselbe
    // Zeichnung die Fläche ist, auf die sie schreibt — eine Figur ist, was sie LIEST.
    case 'staff':
      return <StaffLine fig={figure} width={width} />;
    // Charts (issues #245, #246) are drawn in ChartFigures.tsx.
    case 'line_chart':
    case 'climate_chart':
    case 'pie_chart':
    case 'box_plot':
    case 'histogram':
    case 'scatter_plot':
    case 'pyramid':
      return <ChartBody figure={figure} width={width} />;
  }
}
