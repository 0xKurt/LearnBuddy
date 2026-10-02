// Where a map is drawn and what a tap on it means (issue #251). The arithmetic of targets and
// the magnifying first tap lives in packages/shared-maps (`hit.ts`), the same code the server
// uses to decide that a key can be tapped at all; this file only fits it to the box the screen
// gives and keeps the draft honest.

import type { FigureTapTaskView, TapFigure, TapValue } from '@learnbuddy/shared-types/contracts';

import {
  fitScale,
  MAP_LOOK_ZOOM,
  mapArea,
  mapFeature,
  mapTap,
  pathRings,
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
  const to = zoomScale(fig.area, whole, fig.layer);
  const res = mapTap(fig.area, fig.layer, scale, p, zoomed !== null, to);
  if (res.kind === 'zoom') return { ...res, window: zoomWindow(fig.area, whole, p, to) };
  return res;
}

/**
 * The magnified part of a map she only READS (a marked feature, the graticule): round the
 * point she tapped, or round the mark when she asks for it ("Vergrößern").
 */
export function lookWindow(
  fig: MapFig,
  size: { width: number; height: number },
  at: { x: number; y: number } | null,
): MapWindow {
  const whole = { width: size.width, height: size.height };
  const p = at ??
    markCentre(fig) ?? { x: mapArea(fig.area).width / 2, y: mapArea(fig.area).height / 2 };
  return zoomWindow(fig.area, whole, p, fitScale(fig.area, whole) * MAP_LOOK_ZOOM);
}

/** The middle of what the question marks, in units. */
export function markCentre(fig: MapFig): { x: number; y: number } | null {
  const m = fig.mark;
  if (!m) return null;
  if (m.form === 'point') return { x: m.x, y: m.y };
  const pts = pathRings(m.d).flat();
  if (pts.length === 0) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

/** Room for the graticule's degrees beside and under the map (pt): none without a graticule. */
export function gutterOf(fig: MapFig): { left: number; bottom: number } {
  return fig.graticule ? { left: 40, bottom: 18 } : { left: 0, bottom: 0 };
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
