// Draws the figure that goes with a question (packages/shared-types/src/contracts/figure.ts) in
// its frame, at the width that is available. The model only sends data; each kind is drawn with
// react-native-svg in its own file — the fraction picture, the number line, the function plot,
// the bar chart, the geometry drawing and the table (`<Kind>Figure.tsx`), the charts of
// ChartFigures.tsx and the school figures of schoolFigures.tsx. Every figure also carries a text
// description for screen readers (describeFigure.ts).

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { BARE_FIGURE_CHROME, BARE_FIGURE_PAD } from '../../lib/math/figureScale.js';
import { speakMathText } from '../../lib/math/speak.js';
import { useFigureFit } from '../../lib/math/useFigureFit.js';
import { useFigureNames } from '../../lib/math/useFigureNames.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { RADIUS } from '../../lib/theme/radius.js';
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
  // Measure, then scale (`useFigureFit`, figureScale.ts): the size it shows, and how it gets there.
  const fit = useFigureFit(figure, maxHeight, bare ? BARE_FIGURE_CHROME : undefined);
  const { scale, bodyWidth } = fit;
  const words = useSpokenWords();
  const names = useFigureNames(figure);
  const description = useMemo(
    () => describeFigure(figure, t, names, (s) => speakMathText(s, words), { formulas: !bare }),
    [figure, t, names, words, bare],
  );

  return (
    <View
      // Until the drawing has its width and natural height, the size it shows is not the one it
      // keeps (measure, then scale): the walkthrough waits for this mark to go before a shot
      // (`settle`, issue #501).
      testID={fit.sizing ? 'figure-sizing' : undefined}
      accessible={!bare}
      accessibilityRole={bare ? undefined : 'image'}
      accessibilityLabel={bare ? undefined : `${t('figure.label')}: ${description}`}
      onLayout={fit.onFrame}
      style={{
        alignSelf: 'stretch',
        backgroundColor: ink.paper,
        borderRadius: bare ? SPACE.md : RADIUS.frame,
        borderWidth: bare ? 0 : 1,
        borderColor: palette.hairline,
        // Half the chrome on each side (BARE_FIGURE_CHROME / FIGURE_CHROME minus the border).
        padding: bare ? BARE_FIGURE_PAD : SPACE.md,
        minHeight: bare ? 0 : 60,
      }}
    >
      {fit.width > 0 ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ alignItems: 'center' }}
        >
          {/* The drawing's own box, exactly as wide as it was drawn: its layout says at which
              width — and so at which scale — the height it reports was drawn (`drawnAtWidth`).
              The stretched box around it always had the frame's width, so a height drawn at the
              previous scale passed as the natural one: after a resize the map stood at its
              natural size past its cap, taller on 360×740 than on 390×844 (#387). */}
          <View
            ref={fit.drawn}
            onLayout={fit.onDrawn}
            style={{ width: bodyWidth, alignItems: 'center' }}
          >
            <FigureBody figure={figure} width={bodyWidth} scale={scale} bare={bare} />
            {layer ? <View style={StyleSheet.absoluteFill}>{layer(bodyWidth)}</View> : null}
          </View>
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
      return <TableFigure fig={figure} width={width} />;
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
