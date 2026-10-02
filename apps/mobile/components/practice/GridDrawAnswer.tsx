// Zeichnen auf Raster (issue #249): Punkte setzen, eine Gerade durch zwei Punkte, Kästchen
// färben, Säulen ziehen. Ein Werkzeug pro Aufgabe — der Server sagt, welches (`view.tool`); sie
// muss nichts auswählen (Regel 16: so einfach wie möglich).
//
//   · points / line: ein Tipp setzt den nächsten Gitterpunkt, ein Tipp auf einen gesetzten nimmt
//     ihn weg. Braucht die Aufgabe n Punkte und sind n gesetzt, wandert der neueste.
//     Bei `line` zieht die App die Gerade durch die ersten zwei.
//   · cells: ein Tipp färbt das Kästchen, nochmal leert es.
//   · bars: tippen oder ziehen setzt die Säule auf die Höhe am Finger (eingerastet).
//   · Ist das Raster zu fein (Schritt < 44 pt), vergrößert der erste Tipp; der zweite setzt.
//   · „Rückgängig" nimmt den letzten Schritt zurück (statt Bestätigungen, UX-PRINCIPLES).
//   · Alles Gezeichnete steht in Worten darunter; „Eingeben" stellt es mit Knöpfen ein.
//   · Die Zeichnung und ihr Rückgängig-Verlauf stehen im Entwurf (lib/drafts.ts) und überleben
//     einen Wechsel Hell/Dunkel.
// Geprüft wird auf dem Server, exakt (apps/api/src/modules/practice/gridDraw.ts).

import type { GridDrawTaskView, StructuredAnswer } from '@learnbuddy/shared-types/contracts';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { snap } from '../../../../packages/shared-math/src/grid.js';
import { useDraft } from '../../lib/drafts.js';
import {
  barAt,
  cellAt,
  drawDraftFrom,
  drawingComplete,
  fromPx,
  fullWindow,
  needsZoom,
  planeFrame,
  pushDrawing,
  snapPoint,
  squaresFrom,
  toggleCell,
  togglePoint,
  undoDrawing,
  zoomWindow,
  type Drawing,
  type Window,
} from '../../lib/math/gridFrame.js';
import { SPACE } from '../../lib/theme/space.js';
import { Btn } from '../lb/Btn.js';
import { formatNumber } from '../math/FigureView.js';
import { DrawExactSheet } from './figure/ExactSheet.js';
import { FigureSurface } from './figure/FigureSurface.js';
import { PlaneSvg } from './figure/PlaneSvg.js';
import { TouchLayer } from './figure/TouchLayer.js';

type Props = {
  view: GridDrawTaskView;
  draftKey: string;
  disabled: boolean;
  onSubmit: (parts: StructuredAnswer, shown: string) => void;
};

/**
 * Her drawing in words — under the grid, in the sheet, and in the conversation. Squared paper
 * has no numbers to read a coordinate from, so there the line under the grid counts her points
 * (the grid shows where they are) and `full` — the screen reader's label — says each one as
 * squares from the bottom-left corner, the way the steppers in "Eingeben" count them.
 */
export function useDrawingWords(view: GridDrawTaskView): (d: Drawing, full?: boolean) => string {
  const { t } = useTranslation('practice');
  const g = view.grid;
  const point = (p: { x: number; y: number }) =>
    g.axes
      ? t('figure.point', { x: formatNumber(p.x), y: formatNumber(p.y) })
      : t('draw.square_point', {
          right: formatNumber(squaresFrom(g.x_min, p.x, g.step)),
          up: formatNumber(squaresFrom(g.y_min, p.y, g.step)),
        });
  return (d, full = false) => {
    switch (view.tool) {
      case 'points':
      case 'line':
        if (d.points.length === 0)
          return t(view.tool === 'line' ? 'draw.how_line' : 'draw.how_points');
        return g.axes || full
          ? t('draw.points', { points: d.points.map(point).join(g.axes ? ', ' : '; ') })
          : t('draw.points_set', { count: d.points.length });
      case 'cells':
        return d.cells.length === 0
          ? t('draw.how_cells')
          : t('draw.cells', { count: d.cells.length });
      case 'bars':
        return d.bars.every((b) => b.value === view.grid.y_min)
          ? t('draw.how_bars')
          : view.bars
              .map(
                (b) => `${b.label} ${formatNumber(d.bars.find((x) => x.id === b.id)?.value ?? 0)}`,
              )
              .join(' · ');
    }
  };
}

function waitsHint(view: GridDrawTaskView, t: (k: string, o?: Record<string, number>) => string) {
  switch (view.tool) {
    case 'points':
      return t('draw.check_waits_points', { count: view.needs ?? 1 });
    case 'line':
      return t('draw.check_waits_line');
    case 'cells':
      return t('draw.check_waits_cells');
    case 'bars':
      return t('draw.check_waits_bars');
  }
}

export function GridDrawAnswer({ view, draftKey, disabled, onSubmit }: Props) {
  const { t } = useTranslation('practice');
  const { text: kept, setText: keep } = useDraft(draftKey);
  const draft = drawDraftFrom(kept, view);
  const d = draft.now;
  const words = useDrawingWords(view);
  const [zoom, setZoom] = useState<Window | null>(null);
  const [exact, setExact] = useState(false);
  const g = view.grid;
  const complete = drawingComplete(view, d);

  /** A change of the drawing — kept, with the one before it for "Rückgängig". */
  const change = (next: (now: Drawing) => Drawing) =>
    keep((raw) => {
      const was = drawDraftFrom(raw, view);
      return JSON.stringify(pushDrawing(was, next(was.now)));
    });
  /** A pull on a bar: many moves, ONE step back for "Rückgängig" (the first move makes it). */
  const pulling = useRef(false);
  const pullBar = (x: number, y: number, frameRef: ReturnType<typeof planeFrame>) => {
    const p = fromPx(frameRef, x, y);
    const id = barAt(view, p.x);
    if (id === null) return;
    const value = snap(p.y, g.y_min, g.y_max, g.step);
    keep((raw) => {
      const was = drawDraftFrom(raw, view);
      const nextNow = {
        ...was.now,
        bars: was.now.bars.map((b) => (b.id === id ? { ...b, value } : b)),
      };
      const next = pulling.current ? { ...was, now: nextNow } : pushDrawing(was, nextNow);
      pulling.current = true;
      return JSON.stringify(next);
    });
  };

  const shown = (now: Drawing) => words(now);

  return (
    <>
      <FigureSurface
        testID="grid-draw"
        readout={zoom ? t('figure.zoomed') : words(d)}
        tools={
          zoom ? (
            <Btn
              size="sm"
              variant="ghost"
              pill
              onPress={() => setZoom(null)}
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
          )
        }
        bar={
          <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
            <Btn
              pill
              variant="soft"
              disabled={disabled || draft.before.length === 0}
              onPress={() => keep((raw) => JSON.stringify(undoDrawing(drawDraftFrom(raw, view))))}
              accessibilityHint={t('draw.undo_hint')}
            >
              {t('draw.undo')}
            </Btn>
            <View style={{ flex: 1 }}>
              <Btn
                pill
                full
                disabled={disabled || !complete}
                onPress={() =>
                  onSubmit(
                    { type: 'grid_draw', points: d.points, cells: d.cells, bars: d.bars },
                    shown(d),
                  )
                }
                accessibilityHint={complete ? undefined : waitsHint(view, t)}
              >
                {t('check')}
              </Btn>
            </View>
          </View>
        }
      >
        {(box) => {
          const frame = planeFrame(
            zoom ?? fullWindow(g),
            g.step,
            box,
            g.axes,
            view.tool !== 'bars',
          );
          const bars =
            view.tool === 'bars'
              ? view.bars.map((b) => ({
                  ...b,
                  value: d.bars.find((x) => x.id === b.id)?.value ?? g.y_min,
                }))
              : undefined;
          return (
            <View
              accessible
              accessibilityRole="image"
              accessibilityLabel={`${t('draw.canvas')}. ${words(d, true)}`}
              accessibilityHint={t('figure.exact_hint')}
              style={{ width: frame.width, height: frame.height }}
            >
              <PlaneSvg
                frame={frame}
                axes={g.axes}
                marks={view.given.marks}
                closed={view.given.closed}
                givenCells={view.given.cells}
                mirror={view.given.mirror}
                cells={d.cells}
                points={d.points}
                line={view.tool === 'line'}
                bars={bars}
              />
              <TouchLayer
                testID="figure-touch"
                width={frame.width}
                height={frame.height}
                disabled={disabled}
                onDrag={view.tool === 'bars' ? (x, y) => pullBar(x, y, frame) : undefined}
                onEnd={() => {
                  pulling.current = false;
                }}
                onTap={(x, y) => {
                  if (view.tool === 'bars') return;
                  if (zoom === null && needsZoom(frame)) {
                    setZoom(zoomWindow(g, box, snapPoint(frame, x, y)));
                    return;
                  }
                  if (view.tool === 'cells') {
                    const c = cellAt(frame, x, y);
                    if (c) change((now) => ({ ...now, cells: toggleCell(now.cells, c, g.step) }));
                  } else {
                    const p = snapPoint(frame, x, y);
                    change((now) => ({
                      ...now,
                      points: togglePoint(now.points, p, g.step, view.needs),
                    }));
                  }
                  setZoom(null);
                }}
              />
            </View>
          );
        }}
      </FigureSurface>
      <DrawExactSheet
        view={view}
        drawing={d}
        readout={words(d)}
        open={exact}
        onClose={() => setExact(false)}
        onChange={(next) => change(() => next)}
      />
    </>
  );
}
