// A table (FigureView, `table`): a header row on lavender and the rows under it, every cell set
// with `MathText`, all columns as wide as each other.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { View } from 'react-native';

import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { MathText } from './MathText.js';

type TableFig = Extract<Figure, { type: 'table' }>;

export function TableFigure({ fig }: { fig: TableFig }) {
  const { palette, figure: ink } = useTheme();
  const cols = Math.max(fig.header.length, ...fig.rows.map((r) => r.length));
  const cell = (text: string, key: number, header: boolean, last: boolean) => (
    <View
      key={key}
      style={{
        flex: 1,
        minWidth: 0,
        paddingHorizontal: SPACE.sm,
        paddingVertical: SPACE.sm,
        borderRightWidth: last ? 0 : 1,
        borderColor: ink.gridStrong,
        justifyContent: 'center',
      }}
    >
      <MathText
        accessible={false}
        text={text}
        // token-exempt: cell text at 15/20, a line tighter than TYPE.small, so rows stay compact
        style={[TYPE.body, { fontSize: 15, lineHeight: 20, fontWeight: header ? '700' : '400' }]}
      />
    </View>
  );
  const row = (cells: string[], header: boolean, key: string) => (
    <View
      key={key}
      style={{
        flexDirection: 'row',
        backgroundColor: header ? palette.lavender : ink.paper,
        borderTopWidth: header ? 0 : 1,
        borderColor: ink.gridStrong,
      }}
    >
      {Array.from({ length: cols }, (_, i) => cell(cells[i] ?? '', i, header, i === cols - 1))}
    </View>
  );
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: ink.gridStrong,
        borderRadius: 10, // token-exempt: the table's corner from before RADIUS (#310), kept as is
        overflow: 'hidden',
      }}
    >
      {row(fig.header, true, 'h')}
      {fig.rows.map((r, i) => row(r, false, `r${i}`))}
    </View>
  );
}
