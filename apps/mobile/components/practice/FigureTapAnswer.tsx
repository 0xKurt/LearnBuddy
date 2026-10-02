// Antippen in einer Figur (issue #248): ein Punkt im Koordinatensystem, eine Stelle am
// Zahlenstrahl, eine Säule, eine Uhrzeit. Ein Tipp IST die Antwort, „Prüfen" schickt sie.
//
//   · Der Tipp rastet auf den nächsten Platz der Figur ein (Gitterpunkt, Teilstrich, Säule,
//     5-Minuten-Schritt) — zwischen zwei Plätzen gibt es nichts, und geprüft wird auf dem
//     Server exakt (apps/api/src/modules/practice/figureTap.ts).
//   · Ist das Gitter für einen Finger zu fein (ein Schritt < 44 pt), vergrößert der erste Tipp
//     den Teil, auf den sie zielt; der zweite setzt (lib/math/gridFrame.ts).
//   · Unter der Figur steht in Worten, was gesetzt ist („Dein Punkt: (2 | −1)").
//   · „Eingeben" öffnet dieselbe Antwort zum Einstellen mit Knöpfen — der Weg ohne Zielen,
//     auch für den Screenreader (ExactSheet.tsx).
//   · Was sie gesetzt hat, steht im Entwurf (lib/drafts.ts): ein Wechsel Hell/Dunkel baut den
//     Baum neu, und der Punkt ist trotzdem noch da.

import type {
  FigureTapTaskView,
  StructuredAnswer,
  TapValue,
} from '@learnbuddy/shared-types/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { hourAt, minuteAt } from '../../../../packages/shared-math/src/grid.js';
import { useDraft } from '../../lib/drafts.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import {
  fullWindow,
  lineFrame,
  lineValueAt,
  lineZoom,
  needsZoom,
  planeFrame,
  snapPoint,
  tapFrom,
  zoomWindow,
  type Window,
} from '../../lib/math/gridFrame.js';
import { Btn } from '../lb/Btn.js';
import { Segmented } from '../lb/Segmented.js';
import { formatNumber } from '../math/FigureView.js';
import { clockText, TapExactSheet } from './figure/ExactSheet.js';
import { FigureSurface } from './figure/FigureSurface.js';
import { PlaneSvg } from './figure/PlaneSvg.js';
import {
  ClockSvg,
  clockAngle,
  LINE_HEIGHT,
  NumberLineSvg,
  TapBarsSvg,
} from './figure/TapFigures.js';
import { TouchLayer } from './figure/TouchLayer.js';

type Props = {
  view: FigureTapTaskView;
  draftKey: string;
  disabled: boolean;
  onSubmit: (parts: StructuredAnswer, shown: string) => void;
};

/** A chart of six bars needs no more height than this to read; more would only stretch it. */
const BARS_MAX = 260;
/** A clock face larger than this is a poster, not a question. */
const CLOCK_MAX = 300;
/** The row with the choice of hand above the face: one button and its gap. */
const HAND_ROW = TOUCH + SPACE.sm;

/** Her tap in words, the same words the thread and the server use. */
export function useTapWords(view: FigureTapTaskView): (v: TapValue | null) => string {
  const { t } = useTranslation('practice');
  return (v) => {
    if (v === null) return t('figure.nothing');
    switch (v.kind) {
      case 'plane':
        return t('figure.your_point', {
          point: t('figure.point', { x: formatNumber(v.x), y: formatNumber(v.y) }),
        });
      case 'number_line':
        return t('figure.your_number', { value: formatNumber(v.value) });
      case 'bars': {
        const fig = view.figure;
        const label = fig.kind === 'bars' ? (fig.bars.find((b) => b.id === v.id)?.label ?? '') : '';
        return t('figure.your_bar', { label });
      }
      case 'clock':
        return t('figure.your_time', { time: clockText(v.h, v.m) });
    }
  };
}

/** What she sent, as it stands in the conversation (the server writes the same). */
function shownText(
  v: TapValue,
  view: FigureTapTaskView,
  t: (k: string, o?: Record<string, string>) => string,
): string {
  switch (v.kind) {
    case 'plane':
      return t('figure.point', { x: formatNumber(v.x), y: formatNumber(v.y) });
    case 'number_line':
      return formatNumber(v.value);
    case 'bars':
      return view.figure.kind === 'bars'
        ? (view.figure.bars.find((b) => b.id === v.id)?.label ?? '')
        : '';
    case 'clock':
      return clockText(v.h, v.m);
  }
}

export function FigureTapAnswer({ view, draftKey, disabled, onSubmit }: Props) {
  const { t } = useTranslation('practice');
  const { text: kept, setText: keep } = useDraft(draftKey);
  const value = tapFrom(kept, view);
  const set = (v: TapValue) => keep(JSON.stringify(v));
  const words = useTapWords(view);
  const [zoom, setZoom] = useState<Window | null>(null);
  const [lineWin, setLineWin] = useState<{ v0: number; v1: number } | null>(null);
  const [exact, setExact] = useState(false);
  const [hand, setHand] = useState<'hour' | 'minute'>('hour');
  const fig = view.figure;
  const zoomed = zoom !== null || lineWin !== null;

  const exactBtn = zoomed ? (
    <Btn
      size="sm"
      variant="ghost"
      pill
      onPress={() => {
        setZoom(null);
        setLineWin(null);
      }}
      accessibilityHint={t('figure.whole_hint')}
    >
      {t('figure.whole')}
    </Btn>
  ) : (
    <Btn
      size="sm"
      variant="ghost"
      pill
      disabled={disabled}
      onPress={() => setExact(true)}
      accessibilityHint={t('figure.exact_hint')}
    >
      {t('figure.exact')}
    </Btn>
  );

  const figure = (box: { width: number; height: number }) => {
    switch (fig.kind) {
      case 'plane': {
        const frame = planeFrame(zoom ?? fullWindow(fig.grid), fig.grid.step, box, fig.grid.axes);
        const shown = value?.kind === 'plane' ? [value] : [];
        return (
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={`${t('figure.canvas')}. ${words(value)}`}
            accessibilityHint={t('figure.exact_hint')}
            style={{ width: frame.width, height: frame.height }}
          >
            <PlaneSvg frame={frame} axes={fig.grid.axes} marks={fig.marks} points={shown} />
            <TouchLayer
              testID="figure-touch"
              width={frame.width}
              height={frame.height}
              disabled={disabled}
              onTap={(x, y) => {
                const p = snapPoint(frame, x, y);
                if (zoom === null && needsZoom(frame)) {
                  setZoom(zoomWindow(fig.grid, box, p));
                  return;
                }
                set({ kind: 'plane', x: p.x, y: p.y });
                setZoom(null);
              }}
            />
          </View>
        );
      }
      case 'number_line': {
        const win = lineWin ?? { v0: fig.min, v1: fig.max };
        const frame = lineFrame(win.v0, win.v1, fig.snap, box.width);
        const chosen = value?.kind === 'number_line' ? value.value : null;
        return (
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={`${t('figure.canvas')}. ${words(value)}`}
            accessibilityHint={t('figure.exact_hint')}
            style={{ width: box.width, height: LINE_HEIGHT }}
          >
            <NumberLineSvg fig={fig} frame={frame} width={box.width} chosen={chosen} />
            <TouchLayer
              testID="figure-touch"
              width={box.width}
              height={LINE_HEIGHT}
              disabled={disabled}
              onTap={(x) => {
                const v = lineValueAt(frame, x);
                if (lineWin === null && frame.pitch < TOUCH) {
                  setLineWin(lineZoom(fig, box.width, v));
                  return;
                }
                set({ kind: 'number_line', value: v });
                setLineWin(null);
              }}
            />
          </View>
        );
      }
      case 'bars': {
        const height = Math.min(box.height, BARS_MAX);
        const chosen = value?.kind === 'bars' ? value.id : null;
        return (
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={`${t('figure.canvas')}. ${words(value)}`}
            accessibilityHint={t('figure.exact_hint')}
            style={{ width: box.width, height }}
          >
            <TapBarsSvg fig={fig} width={box.width} height={height} chosen={chosen} />
            <TouchLayer
              testID="figure-touch"
              width={box.width}
              height={height}
              disabled={disabled}
              onTap={(x) => {
                const i = Math.min(
                  fig.bars.length - 1,
                  Math.max(0, Math.floor((x / box.width) * fig.bars.length)),
                );
                const bar = fig.bars[i];
                if (bar) set({ kind: 'bars', id: bar.id });
              }}
            />
          </View>
        );
      }
      case 'clock': {
        const size = Math.max(160, Math.min(box.width, box.height, CLOCK_MAX));
        const c = value?.kind === 'clock' ? value : null;
        return (
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={`${t('figure.clock_canvas')}. ${words(value)}`}
            accessibilityHint={t('figure.exact_hint')}
            style={{ width: size, height: size }}
          >
            <ClockSvg size={size} h={c?.h ?? 12} m={c?.m ?? 0} set={c !== null} active={hand} />
            <TouchLayer
              testID="figure-touch"
              width={size}
              height={size}
              disabled={disabled}
              onTap={(x, y) => {
                const angle = clockAngle(size, x, y);
                const now = c ?? { kind: 'clock' as const, h: 12, m: 0 };
                if (hand === 'hour') {
                  set({ ...now, h: hourAt(angle) });
                  // The short hand first, then the long one — the order the reply asks for.
                  setHand('minute');
                } else {
                  set({ ...now, m: minuteAt(angle, fig.snap) });
                }
              }}
            />
          </View>
        );
      }
    }
  };

  const readout = zoomed ? t('figure.zoomed') : words(value);
  return (
    <>
      <FigureSurface
        testID="figure-tap"
        readout={readout}
        tools={exactBtn}
        maxHeight={fig.kind === 'number_line' ? LINE_HEIGHT : undefined}
        above={
          fig.kind === 'clock' ? (
            <View style={{ alignItems: 'center', marginBottom: SPACE.sm }}>
              <Segmented
                size="sm"
                value={hand}
                onChange={setHand}
                options={[
                  { value: 'hour', label: t('figure.hand_hour') },
                  { value: 'minute', label: t('figure.hand_minute') },
                ]}
              />
            </View>
          ) : undefined
        }
        aboveHeight={fig.kind === 'clock' ? HAND_ROW : 0}
        bar={
          <Btn
            pill
            full
            disabled={disabled || value === null}
            onPress={() =>
              value && onSubmit({ type: 'figure_tap', value }, shownText(value, view, t))
            }
            accessibilityHint={value === null ? t('figure.check_waits') : undefined}
          >
            {t('check')}
          </Btn>
        }
      >
        {figure}
      </FigureSurface>
      <TapExactSheet
        view={view}
        value={value}
        readout={words(value)}
        open={exact}
        onClose={() => setExact(false)}
        onChange={set}
      />
    </>
  );
}
