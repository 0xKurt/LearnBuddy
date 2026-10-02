// Where a map is drawn and what a tap on it means (issue #251). The arithmetic of targets and
// the magnifying first tap lives in packages/shared-maps (`hit.ts`), the same code the server
// uses to decide that a key can be tapped at all; this file only fits it to the box the screen
// gives and keeps the draft honest.

import type { FigureTapTaskView, TapFigure, TapValue } from '@learnbuddy/shared-types/contracts';

import {
  fitScale,
  mapArea,
  mapFeature,
  mapTap,
  zoomScale,
  zoomWindow,
  type MapAreaId,
  type MapTap,
} from '../../../../packages/shared-maps/src/index.js';

export type MapFig = Extract<TapFigure, { kind: 'map' }>;

/** A part of the map in units: all of it, or the window a zoom shows. */
export type MapWindow = { x: number; y: number; width: number; height: number };

/** The size the map is drawn at in this box (pt), and its scale (pt per unit). */
export function mapSize(
  area: MapAreaId,
  box: { width: number; height: number },
): { width: number; height: number; scale: number } {
  const a = mapArea(area);
  const scale = fitScale(area, box);
  return {
    width: Math.floor(a.width * scale),
    height: Math.floor(a.height * scale),
    scale,
  };
}

export function wholeMap(area: MapAreaId): MapWindow {
  const a = mapArea(area);
  return { x: 0, y: 0, width: a.width, height: a.height };
}

/** A tap at (x, y) pt on a map of `size` showing `win`: the point in units. */
export function unitsAt(
  win: MapWindow,
  size: { width: number; height: number },
  x: number,
  y: number,
): { x: number; y: number } {
  return { x: win.x + (x / size.width) * win.width, y: win.y + (y / size.height) * win.height };
}

/**
 * What her tap does: choose a feature, magnify (the first tap near a small target), or nothing
 * (the sea). `zoomed` is the window after a zoom, or null for the whole map.
 */
export function tapOnMap(
  fig: MapFig,
  size: { width: number; height: number },
  zoomed: MapWindow | null,
  x: number,
  y: number,
): MapTap & { window?: MapWindow } {
  const win = zoomed ?? wholeMap(fig.area);
  const p = unitsAt(win, size, x, y);
  const scale = size.width / win.width;
  const whole = { width: size.width, height: size.height };
  const res = mapTap(fig.area, fig.layer, scale, p, zoomed !== null, zoomScale(fig.area, whole));
  if (res.kind === 'zoom') return { ...res, window: zoomWindow(fig.area, whole, p) };
  return res;
}

/** Does this kept value answer this map? (The server refuses anything else.) */
export function onMap(fig: MapFig, v: TapValue): boolean {
  switch (fig.ask) {
    case 'tap':
      return v.kind === 'map' && mapFeature(fig.area, fig.layer, v.id) !== null;
    case 'name':
      return v.kind === 'map_name' && v.text.trim() !== '';
    case 'coords':
      return v.kind === 'map_coords' && Number.isInteger(v.lat) && Number.isInteger(v.lon);
  }
}

export function isMapView(view: FigureTapTaskView): view is FigureTapTaskView & { figure: MapFig } {
  return view.figure.kind === 'map';
}
