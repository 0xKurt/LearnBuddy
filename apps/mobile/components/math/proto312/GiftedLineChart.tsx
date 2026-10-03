// PROTOTYPE (issue #312, Phase 1) — not for merge.
//
// The line chart (`LineChartFigure`) drawn by react-native-gifted-charts instead of our own SVG.
// The axes are NOT the library's: they come from `lineAxes` in shared-math, the same function the
// API uses for the reading tolerance (Rule 0 — the grid she reads is the grid the key was
// checked against). The library is told the exact maximum, step and number of sections.
//
// Columns (`bar: true`), measured (uneven) x values and more than two series are not covered by
// this prototype; see scratchpad/libs-312.md.

// Must run before react-native-gifted-charts is evaluated (see the file).
import './rnWebPlatformShim.js';

import type { ChartFigure } from '@learnbuddy/shared-types/contracts';
import { Text, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';

import { lineAxes, type Axis } from '../../../../../packages/shared-math/src/charts.js';
import { useTheme } from '../../../lib/theme/ThemeProvider.js';
import { SPACE } from '../../../lib/theme/space.js';
import { formatNumber } from '../figureText.js';

type LineFig = Extract<ChartFigure, { type: 'line_chart' }>;

const Y_LABEL_W = 34;
const DASHES: ReadonlyArray<number[] | undefined> = [undefined, [7, 4], [2, 4]];

function sections(a: Axis): number {
  return Math.max(1, Math.round((a.hi - a.lo) / a.step));
}

export function GiftedLineChart({ fig, width }: { fig: LineFig; width: number }) {
  const { figure: ink } = useTheme();
  const { left: la, right: ra } = lineAxes(fig);
  const left = fig.s.filter((s) => !s.r);
  const right = fig.s.filter((s) => s.r);
  const main = left[0];
  const second = right[0];
  if (!main) return null;
  const plotW = width - Y_LABEL_W - (ra ? Y_LABEL_W : 0) - SPACE.sm;
  const n = fig.x.length;
  const edge = SPACE.md;
  const spacing = (plotW - 2 * edge) / Math.max(1, n - 1);
  const height = Math.round(Math.min(Math.max(width * 0.62, 160), 260));
  const text = { color: ink.label, fontSize: 12 };
  const colorOf = (k: number): string => ink.series[k % ink.series.length] ?? ink.stroke;

  return (
    <View style={{ gap: SPACE.sm, alignSelf: 'stretch' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={text}>{main.u}</Text>
        {second ? <Text style={text}>{second.u}</Text> : null}
      </View>
      <LineChart
        data={main.v.map((v, i) => ({ value: v - la.lo, label: fig.x[i] ?? '' }))}
        {...(second
          ? {
              secondaryData: second.v.map((v) => ({ value: v - (ra?.lo ?? 0) })),
              secondaryYAxis: {
                maxValue: (ra?.hi ?? 1) - (ra?.lo ?? 0),
                stepValue: ra?.step ?? 1,
                noOfSections: ra ? sections(ra) : 5,
                yAxisColor: ink.axis,
                yAxisTextStyle: text,
                yAxisLabelWidth: Y_LABEL_W,
                formatYLabel: (l: string) => formatNumber(Number(l) + (ra?.lo ?? 0)),
              },
              secondaryLineConfig: {
                color: colorOf(1),
                dataPointsColor: colorOf(1),
                strokeDashArray: DASHES[1],
                dataPointsShape: 'rectangular',
                dataPointsWidth: 8,
                dataPointsHeight: 8,
                thickness: 2.5,
                dataPointsRadius: 4,
              },
            }
          : {})}
        width={plotW}
        height={height}
        maxValue={la.hi - la.lo}
        stepValue={la.step}
        noOfSections={sections(la)}
        formatYLabel={(l: string) => formatNumber(Number(l) + la.lo)}
        initialSpacing={edge}
        endSpacing={edge}
        spacing={spacing}
        disableScroll
        isAnimated={false}
        color={colorOf(0)}
        thickness={2.5}
        dataPointsColor={colorOf(0)}
        dataPointsRadius={4}
        yAxisColor={ink.axis}
        xAxisColor={ink.axis}
        yAxisThickness={1.5}
        xAxisThickness={1.5}
        rulesColor={ink.grid}
        rulesType="solid"
        yAxisLabelWidth={Y_LABEL_W}
        yAxisTextStyle={text}
        xAxisLabelTextStyle={{ ...text, width: 30, textAlign: 'center' }}
      />
      <Text style={[text, { alignSelf: 'flex-end' }]}>{fig.xt}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md }}>
        {fig.s.map((s, k) => (
          <View key={s.n} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>
            <View
              style={{
                width: 18,
                height: 3,
                backgroundColor: colorOf(k),
                borderRadius: 2,
              }}
            />
            <Text style={text}>{`${s.n} (${s.u})`}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
