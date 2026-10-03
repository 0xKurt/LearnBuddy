// PROTOTYPE (issue #312, Phase 1) — not for merge, lives only on claude/train2-libs-312.
//
// One question with its figure, drawn either by today's own code (`v=old`, the real FigureView)
// or by a free library (`v=new`), so both can be shot at the same sizes and themes and set next
// to each other. The figures are the walkthrough's own fixtures
// (apps/api/src/testing/scenarios/learning-modes.ts), copied here as plain data.

import type { Figure, StaffFigure } from '@learnbuddy/shared-types/contracts';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { FigureView } from '../components/math/FigureView.js';
import { GiftedLineChart } from '../components/math/proto312/GiftedLineChart.js';
import { VexStaffLine } from '../components/math/proto312/VexStaffLine.js';
import { useTheme } from '../lib/theme/ThemeProvider.js';
import { SPACE } from '../lib/theme/space.js';
import { TYPE } from '../lib/theme/type.js';

const q = (name: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B', octave: number) =>
  ({ el: 'note', pitch: { name, octave }, value: 'quarter', dotted: false }) as const;

const STAFF_BASS: StaffFigure = {
  type: 'staff',
  clef: 'bass',
  time: '3/4',
  bars: [
    [q('G', 2), q('B', 2), q('D', 3)],
    [{ ...q('C', 3), value: 'half' }, q('A', 2)],
  ],
  tempo: 90,
};

const STAFF_TREBLE: StaffFigure = {
  type: 'staff',
  clef: 'treble',
  time: '4/4',
  bars: [
    [q('E', 4), q('G', 4), { ...q('B', 4), value: 'half' }],
    [
      q('A', 4),
      { el: 'rest', value: 'quarter', dotted: false },
      { el: 'note', pitch: { name: 'F#', octave: 5 }, value: 'eighth', dotted: true },
      { el: 'note', pitch: { name: 'C', octave: 4 }, value: 'sixteenth', dotted: false },
      { el: 'rest', value: 'quarter', dotted: false },
    ],
  ],
  tempo: 90,
};

const LINE: Extract<Figure, { type: 'line_chart' }> = {
  type: 'line_chart',
  x: ['0', '1', '2', '3', '4', '5'],
  xt: 'Zeit in s',
  s: [
    { n: 'Weg', u: 'm', v: [0, 2, 8, 18, 32, 50], bar: false, r: false },
    { n: 'Tempo', u: 'm/s', v: [0, 4, 8, 12, 16, 20], bar: false, r: true },
  ],
};

const CASES = {
  staff: { prompt: 'Welche Taktart passt zu dieser Zeile?', fig: STAFF_BASS },
  staff2: { prompt: 'Wie heißt die vierte Note im zweiten Takt?', fig: STAFF_TREBLE },
  chart: { prompt: 'Welchen Weg hat der Wagen nach 3 s zurückgelegt?', fig: LINE },
} as const;

function NewCard({ figure }: { figure: Figure }) {
  const { palette, figure: ink } = useTheme();
  const [width, setWidth] = useState(0);
  return (
    <View
      onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width) - 2 * SPACE.md - 2)}
      style={{
        alignSelf: 'stretch',
        backgroundColor: ink.paper,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: palette.hairline,
        padding: SPACE.md,
        minHeight: 60,
        alignItems: 'center',
      }}
    >
      {width > 0 && figure.type === 'staff' ? <VexStaffLine fig={figure} width={width} /> : null}
      {width > 0 && figure.type === 'line_chart' ? (
        <GiftedLineChart fig={figure} width={width} />
      ) : null}
    </View>
  );
}

export default function Proto312() {
  const { palette } = useTheme();
  const params = useLocalSearchParams<{ k?: string; v?: string }>();
  const key = params.k === 'staff2' || params.k === 'chart' ? params.k : 'staff';
  const c = CASES[key];
  const isNew = params.v === 'new';
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: SPACE.lg, gap: SPACE.lg }}
    >
      <Text style={TYPE.label}>{isNew ? 'Bibliothek (Prototyp #312)' : 'Eigenbau (heute)'}</Text>
      <Text style={TYPE.prompt}>{c.prompt}</Text>
      {isNew ? <NewCard figure={c.fig} /> : <FigureView figure={c.fig} />}
    </ScrollView>
  );
}
