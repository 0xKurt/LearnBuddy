// A figure she answers IN (issue #248): she taps — or drags to — a place on the number line, a
// point of the coordinate system, a column of the bar chart, the hands of a clock face, a region
// of a map (#251) or a crossing of its Gradnetz (#429). One mechanism for every tappable figure,
// built for labelled pictures (#252) too:
//
//   · the places are the figure's grid (`tapAxes`, @learnbuddy/shared-math `tap.ts`) — the grid
//     the server checked the key lies on;
//   · where they stand is the drawers' own geometry (`lib/math/tapLayout.ts`); the figure is drawn
//     by `FigureView` as everywhere, with the tap layer over it (`TapSurface` dragged + the mark);
//   · a tap snaps to the nearest place and writes it as text — exactly as a key is written, so it
//     is judged exactly by code (`tapVerdict`);
//   · the place stands in words under the figure (never colour or position alone), and that line
//     is also the control a screen reader adjusts, place by place. On a number line and a
//     coordinate system the line only says THAT she chose: the exact value in plain sight would let
//     her move the point until the words match the question — comparing text instead of reading
//     the figure (issue #409). Its value is the screen reader's alone (`aria-valuetext`); without
//     it a blind learner could not answer at all. After "Prüfen" her answer stands in the thread.
//
// A clock face is set one hand at a time: a tap moves the hand chosen above it, and after the
// small hand the large one is next. What the line says is where the hands stand, never the time
// they make — reading that is what the task practises (`describeClock`, issue #254).

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View, type AccessibilityActionEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';

import {
  isMap,
  mapLayer,
  mapPickIndex,
  mapPlaceName,
  type MapFig,
} from '../../../../packages/shared-math/src/maps.js';
import { regionName } from '../../../../packages/shared-math/src/regions.js';
import { parseClockAnswer } from '../../../../packages/shared-math/src/primary.js';
import {
  namedPlaces,
  tapAxes,
  tapPick,
  tapText,
  type Tappable,
  type TapPick,
} from '../../../../packages/shared-math/src/tap.js';
import { currentLocale } from '../../lib/i18n/index.js';
import { tapLayout, type TapMark } from '../../lib/math/tapLayout.js';
import { useMapShapes } from '../../lib/math/useMapShapes.js';
import { useSchematicShapes } from '../../lib/math/useSchematicShapes.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Segmented } from '../lb/Segmented.js';
import { TapSurface } from '../lb/TapSurface.js';
import { formatNumber, SMALL } from './figureText.js';
import { FigureView } from './FigureView.js';
import { describeClock } from './PrimaryFigures.js';

type Props = {
  figure: Tappable & Figure;
  /** Her answer so far, as a key is written ("2.5", "(2|-1)"); "" before her first tap. */
  value: string;
  onChange: (text: string) => void;
  disabled: boolean;
  /** The tallest the drawing may stand (it is drawn again, narrower, above that). */
  maxHeight?: number;
};

type T = (key: string, values?: Record<string, string | number>) => string;

/** The clock with her hands on it; every other figure stays as it is and gets a mark. */
function shownFigure(figure: Tappable & Figure, value: string): Figure {
  const time = figure.type === 'clock' ? parseClockAnswer(value) : null;
  return figure.type === 'clock' && time ? { ...figure, c: [time] } : figure;
}

/** What a figure's places are called in the tap lines: its type, or a map's layer of places (#429). */
function placeKind(figure: Tappable): string {
  return isMap(figure) && mapLayer(figure) !== 'regions' ? mapLayer(figure) : figure.type;
}

/**
 * The line a place of a map is named in: "Gebiet: Bayern", "Fluss: Rhein", "Punkt: 50° N, 10° O"
 * (#429).
 */
function placeWord(figure: MapFig): string {
  const layer = mapLayer(figure);
  return layer === 'regions' ? 'region' : `place_${layer}`;
}

/**
 * Her place in words for a screen reader: "Stelle: 2,5", "Punkt (2 | −1)", "Säule: Apr", where
 * the hands stand, "Gebiet: Bayern" (in her language).
 */
function placeWords(figure: Tappable, pick: TapPick | null, t: T): string {
  const [i = 0, j = 0] = pick ?? [];
  const at = (axis: number, index: number) => tapAxes(figure)?.[axis]?.values[index] ?? 0;
  if (!pick) return t(`tap.how_${placeKind(figure)}`);
  switch (figure.type) {
    case 'number_line':
      return t('tap.value', { value: formatNumber(at(0, i)) });
    case 'function_plot':
      return t('tap.point', { x: formatNumber(at(0, i)), y: formatNumber(at(1, j)) });
    case 'bar_chart':
      return t('tap.bar', { label: figure.bars[i]?.label ?? '' });
    case 'clock':
      return t('figure.clock', { hands: describeClock({ h: at(0, i), m: at(1, j) }, t) });
    case 'map':
      // A Land, a river or a crossing (#429), named in her language (`maps.ts`).
      return t(`tap.${placeWord(figure)}`, {
        name: mapPlaceName(figure, mapPickIndex(figure, pick), currentLocale()),
      });
    case 'schematic':
      return t('tap.part', { name: regionName(namedPlaces(figure) ?? [], i, currentLocale()) });
  }
}

/**
 * The same line as she sees it: on a number line, a coordinate system, a map and a picture only
 * that she chose ("Stelle gewählt", "Punkt gesetzt", "Gebiet gewählt", "Teil gewählt") — reading
 * the place off the figure, finding the region or the part, is the task (#409, #251, #252). A
 * column's name and the hands' positions are kept: the figure shows them anyway.
 */
function shownWords(figure: Tappable, pick: TapPick | null, t: T, spoken: string): string {
  if (!pick) return spoken;
  return figure.type === 'clock' || figure.type === 'bar_chart'
    ? spoken
    : t(`tap.chosen_${placeKind(figure)}`);
}

/** The mark on her place: a ring with a dot, or a frame around the column. */
function Mark({ mark }: { mark: TapMark }) {
  const { palette } = useTheme();
  if (!mark) return null;
  if (mark.kind === 'region') {
    return (
      <>
        {/* One tinted layer: the seams between a continent's countries do not darken. */}
        <G opacity={0.35}>
          <Path d={mark.d} fill={palette.primary} stroke={palette.primary} strokeWidth={1.5} />
        </G>
        {mark.outline ? (
          <Path
            d={mark.d}
            fill="none"
            stroke={palette.primary}
            strokeWidth={3}
            strokeLinejoin="round"
          />
        ) : null}
        <Circle
          cx={mark.x}
          cy={mark.y}
          r={5}
          fill={palette.primary}
          stroke={palette.paper}
          strokeWidth={2}
        />
      </>
    );
  }
  if (mark.kind === 'box') {
    const { x, y, w, h } = mark.box;
    return (
      <Rect
        x={x + 2}
        y={y + 2}
        width={w - 4}
        height={h - 4}
        rx={SPACE.sm}
        fill={palette.primary}
        fillOpacity={0.14}
        stroke={palette.primary}
        strokeWidth={2.5}
      />
    );
  }
  return (
    <>
      <Circle cx={mark.x} cy={mark.y} r={13} fill={palette.primary} fillOpacity={0.2} />
      <Circle
        cx={mark.x}
        cy={mark.y}
        r={6.5}
        fill={palette.primary}
        stroke={palette.paper}
        strokeWidth={2}
      />
    </>
  );
}

export function TapFigure({ figure, value, onChange, disabled, maxHeight }: Props) {
  const { palette, figure: ink } = useTheme();
  const { t } = useTranslation('math');
  const pick = value === '' ? null : tapPick(figure, value);
  const clock = figure.type === 'clock';
  // The shapes of a map or a picture, loaded with the first of its kind; nothing else loads them.
  const shapes = {
    maps: useMapShapes(figure.type === 'map')?.MAP_SHAPES,
    pictures: useSchematicShapes(figure.type === 'schematic')?.SCHEMATIC_SHAPES,
  };
  // The hand a tap on the clock moves: the small one first (axis 0), then the large one.
  const [active, setActive] = useState(0);
  const write = (next: TapPick) => {
    const text = tapText(figure, next);
    if (text !== null && text !== value) onChange(text);
  };

  // A screen reader moves her place one step at a time, on the axis the action names: around the
  // dial on a clock, to the end and no further anywhere else. The first step starts in the middle.
  const sizes = (tapAxes(figure) ?? []).map((a) => a.values.length);
  const step = (axis: number, by: number) => {
    const from = pick ?? sizes.map((n) => Math.floor((n - 1) / 2));
    const n = sizes[axis] ?? 1;
    const to = clock ? (from[axis]! + by + n) % n : Math.max(0, Math.min(n - 1, from[axis]! + by));
    write(from.map((v, i) => (i === axis ? to : v)));
  };
  // A coordinate system and a Gradnetz (#429): left and right, and up and down.
  const twoAxes = sizes.length === 2 && !clock;
  const along = clock ? active : 0;
  const actions = [
    { name: 'increment' },
    { name: 'decrement' },
    ...(twoAxes
      ? [
          { name: 'up', label: t('tap.up') },
          { name: 'down', label: t('tap.down') },
        ]
      : []),
  ];
  const onAction = (e: AccessibilityActionEvent) => {
    const name = e.nativeEvent.actionName;
    if (name === 'increment') step(along, 1);
    else if (name === 'decrement') step(along, -1);
    else if (name === 'up') step(1, 1);
    else if (name === 'down') step(1, -1);
  };
  const words = placeWords(figure, pick, t);
  const shown = shownWords(figure, pick, t, words);

  return (
    <View style={{ gap: SPACE.sm }}>
      {clock ? (
        <Segmented
          size="sm"
          options={[
            { value: '0', label: t('tap.hour_hand') },
            { value: '1', label: t('tap.minute_hand') },
          ]}
          value={String(active) as '0' | '1'}
          onChange={(v) => setActive(Number(v))}
        />
      ) : null}
      <View testID="tap-figure" pointerEvents={disabled ? 'none' : 'auto'}>
        <FigureView
          figure={shownFigure(figure, value)}
          maxHeight={maxHeight}
          layer={(width) => {
            const layout = tapLayout(figure, width, formatNumber, SMALL, shapes);
            if (!layout) return null;
            return (
              <>
                <Svg width={width} height="100%" pointerEvents="none">
                  {layout.guides.map((l, k) => (
                    <Line key={k} {...l} stroke={ink.grid} strokeWidth={1} strokeDasharray="3 3" />
                  ))}
                  <Mark mark={pick ? layout.markOf(pick) : null} />
                </Svg>
                <TapSurface
                  drag
                  testID="tap-pad"
                  disabled={disabled}
                  onPoint={(x, y) => write(layout.pickAt(x, y, pick, active))}
                  onRelease={clock && active === 0 ? () => setActive(1) : undefined}
                />
              </>
            );
          }}
        />
      </View>
      {/* Her place in words: the signal that is not colour, and what a screen reader adjusts. */}
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t('tap.label')}
        aria-valuetext={words}
        accessibilityActions={actions}
        onAccessibilityAction={onAction}
        accessibilityLiveRegion="polite"
      >
        <Text
          testID="tap-words"
          style={[TYPE.small, { color: pick ? palette.ink : palette.ink2, textAlign: 'center' }]}
        >
          {shown}
        </Text>
      </View>
    </View>
  );
}
