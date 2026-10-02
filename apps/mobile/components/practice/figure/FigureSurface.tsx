// The frame both interactive figures stand in (issues #248, #249): the figure as large as the
// room between the question and "Prüfen" allows, one line under it that says in WORDS what she
// has set (never only the drawing — UX-PRINCIPLES "never colour as the only signal"), and the
// pinned bar.
//
// The room is measured, not guessed: the surface takes what the screen gives it
// (`app/practice/[id].tsx` lets a figure grow, the question card keeps its own height), and
// the figure is drawn for exactly that box. So on a 360×740 phone with Buddy's reply above it
// the figure is smaller, and on a 390×844 one larger — and nothing ever scrolls (rule 16).
// Figure and words stand together right under the question: no empty band between the question
// and the figure, none between the figure and its words.

import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import type { Box } from '../../../lib/math/gridFrame.js';
import { SPACE, TOUCH } from '../../../lib/theme/space.js';
import { useTheme } from '../../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../../lib/theme/type.js';
import { BottomBar } from '../BottomBar.js';

/** The row of words and quiet tools under the figure: one 44 pt button high. */
const ROW = TOUCH;

type Props = {
  /** What she has set, in words ("Dein Punkt: (2 | −1)"). */
  readout: string;
  /** Quiet tools at the end of that row ("Eingeben", "Ganze Figur"). */
  tools: ReactNode;
  /** Something that stands above the figure inside its room (the clock's hand choice). */
  above?: ReactNode;
  aboveHeight?: number;
  /** The figure, drawn for the box it is given; also its tallest useful height. */
  children: (box: Box) => ReactNode;
  /** The figure never grows past this, however much room there is (a number line is a line). */
  maxHeight?: number;
  /** The pinned bar ("Prüfen", "Rückgängig"). */
  bar: ReactNode;
  testID?: string;
};

export function FigureSurface({
  readout,
  tools,
  above,
  aboveHeight = 0,
  children,
  maxHeight,
  bar,
  testID,
}: Props) {
  const { palette } = useTheme();
  const [room, setRoom] = useState<Box | null>(null);
  const box: Box | null = room
    ? {
        width: room.width,
        height: Math.max(
          0,
          Math.min(maxHeight ?? Infinity, room.height - ROW - 2 * SPACE.sm - aboveHeight),
        ),
      }
    : null;
  return (
    <>
      <View
        testID={testID}
        style={{ flex: 1, minHeight: 0, paddingHorizontal: SPACE.lg, paddingTop: SPACE.xs }}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          const next = {
            width: Math.round(width - 2 * SPACE.lg),
            height: Math.round(height - SPACE.xs),
          };
          if (!room || room.width !== next.width || room.height !== next.height) setRoom(next);
        }}
      >
        {/* Right under the question, like every other way to answer: what is left over stands
            above the pinned bar, never between the question and the figure (shots 50, 54). */}
        <View style={{ flex: 1, justifyContent: 'flex-start', paddingTop: SPACE.sm }}>
          {above}
          {box ? <View style={{ alignItems: 'center' }}>{children(box)}</View> : null}
          <View
            style={{
              minHeight: ROW,
              marginTop: SPACE.sm,
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACE.sm,
            }}
          >
            <Text
              testID="figure-readout"
              accessibilityLiveRegion="polite"
              numberOfLines={2}
              style={[TYPE.caption, { flex: 1, color: palette.ink, fontWeight: '600' }]}
            >
              {readout}
            </Text>
            {tools}
          </View>
        </View>
      </View>
      <BottomBar>{bar}</BottomBar>
    </>
  );
}
