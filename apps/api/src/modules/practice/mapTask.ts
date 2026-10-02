// Karten (issue #251): a map from Natural Earth as a member of the tap figures (#248).
// docs/architecture.md §Practice ("Maps").
//
// Three questions on one figure, all decided by code (0 model calls per answer):
//   tap    — "Tippe auf Bayern": she taps; her tap is a feature id, compared with the key's id.
//   name   — "Wie heißt das markierte Land?": she types; the text is compared with every name
//            the data has for the marked feature (packages/shared-maps names.ts).
//   coords — "Welche Koordinaten hat der markierte Ort?": she reads latitude and longitude off
//            the graticule; compared with the city's position from the data, within the
//            tolerance the area's graticule allows (`COORD_TOLERANCE`).
//
// Regel 0 for what the MODEL wrote: it names an area, a layer and a feature by NAME. Code
// resolves the name against the data; a name that fits no feature or two gives no question,
// a feature too small for a finger on the smallest phone gives no tap question, a marked
// feature without a name in her language gives no name question, a prompt that names the
// marked feature or prints the position gives the answer away. The model never writes an id,
// a coordinate or a capital: a capital is the data's (`layer: cities`, feature = the country).

import {
  compass,
  COORD_TOLERANCE,
  coordRange,
  hasMapName,
  isTappable,
  isVisible,
  judgeMapName,
  mapFeature,
  mapFeatures,
  mapLayers,
  mapName,
  nameKey,
  namesOf,
  resolveMapName,
  type Compass,
  type MapFeature,
} from '@learnbuddy/shared-maps';
import {
  MapAreaId,
  MapAsk,
  MapLayer,
  type FigureTapTask,
  type MapMark,
  type TapFigure,
  type TapValue,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

import { t, type MessageKey } from '../../i18n/index.js';

/** Why a map question is not stored. Each one is a test (`__tests__/mapTask.test.ts`). */
export type MapProblem =
  /** A layer the area does not have (zones off the world map), or `coords` off the capitals. */
  | 'map_form'
  /** The name fits no feature of the layer, or two. */
  | 'map_feature'
  /** The key cannot be told apart from its neighbours by a finger, even magnified. */
  | 'too_small'
  /** The data has no name for the marked feature in her language: her answer could not be judged. */
  | 'no_name'
  /** The prompt names the marked feature, or prints the position she is to read. */
  | 'map_given_away';

/** What the model writes for a map: five short fields, every one checked. */
export const MapDraft = z
  .object({
    area: MapAreaId,
    layer: MapLayer,
    ask: MapAsk,
    feature: z.string().trim().min(1).max(80),
    graticule: z.boolean(),
  })
  .nullable()
  .default(null)
  .describe('A map; null unless a map feature is tapped, named or located');
export type MapDraft = z.infer<typeof MapDraft>;

export const MAP_RULES = `map: area "world", "europe" or "germany"; layer "areas" (countries; on germany the 16 Länder), "rivers", "cities" (capitals) or "zones" (world only: the illumination zones — tropics, temperate and polar zones); ask "tap" (the prompt names the feature, she taps it), "name" (the feature is marked, she types its name — the prompt never names it) or "coords" (layer cities: the capital is marked, she reads its latitude and longitude off the graticule — the prompt never gives them); feature: its usual name (for a capital you may write the country or Land: its capital is taken from the map data); graticule: true to draw parallels and meridians (always for coords). Use only names that are on a school map of that area.`;

/** The marked feature as the app draws it: an outline or line, or a position. Never its id. */
function markOf(f: MapFeature): MapMark {
  return f.form === 'point'
    ? { form: 'point', x: f.anchor[0], y: f.anchor[1] }
    : { form: 'path', d: f.d };
}

/** Does the prompt contain one of the feature's names (as whole words)? */
function promptNames(prompt: string, f: MapFeature): boolean {
  const text = ` ${nameKey(prompt)} `;
  return namesOf(f).some((n) => {
    const k = nameKey(n);
    return k.length >= 3 && text.includes(` ${k} `);
  });
}

/** Does the prompt print the position (its whole degrees, both of them)? */
function promptGivesPosition(prompt: string, lat: number, lon: number): boolean {
  const numbers = new Set(
    (prompt.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Math.round(Number(n.replace(',', '.')))),
  );
  return numbers.has(Math.round(Math.abs(lat))) && numbers.has(Math.round(Math.abs(lon)));
}

/** The feature a name means on a layer — for capitals also by its country or Land. */
function featureFor(area: MapAreaId, layer: MapLayer, name: string): MapFeature | 'map_feature' {
  const hit = resolveMapName(area, layer, name);
  if (typeof hit !== 'string') return hit;
  if (layer === 'cities' && hit === 'none') {
    // "die Hauptstadt von Bayern": the capital is the data's, not the model's.
    const of = resolveMapName(area, 'areas', name);
    if (typeof of !== 'string' && of.capital) {
      const capital = mapFeature(area, 'cities', of.capital);
      if (capital) return capital;
    }
  }
  return 'map_feature';
}

/** The stored task for a map draft, or why there is none. */
export function mapTaskFrom(
  m: NonNullable<MapDraft>,
  prompt: string,
  /** Her language: a name question needs a name in it. */
  locale: string,
): FigureTapTask | MapProblem {
  if (!mapLayers(m.area).includes(m.layer)) return 'map_form';
  if (m.ask === 'coords' && m.layer !== 'cities') return 'map_form';
  const f = featureFor(m.area, m.layer, m.feature);
  if (typeof f === 'string') return f;
  const figure = (mark: MapMark | null, graticule: boolean): TapFigure => ({
    kind: 'map',
    area: m.area,
    layer: m.layer,
    ask: m.ask,
    mark,
    graticule,
  });
  switch (m.ask) {
    case 'tap':
      if (!isTappable(m.area, m.layer, f.id)) return 'too_small';
      return {
        type: 'figure_tap',
        figure: figure(null, m.graticule),
        key: { kind: 'map', id: f.id },
      };
    case 'name':
      if (!isVisible(m.area, m.layer, f.id)) return 'too_small';
      if (!hasMapName(f, locale)) return 'no_name';
      if (promptNames(prompt, f)) return 'map_given_away';
      return {
        type: 'figure_tap',
        figure: figure(markOf(f), m.graticule),
        key: { kind: 'map', id: f.id },
      };
    case 'coords':
      if (f.lat === null || f.lon === null) return 'map_form';
      if (!isVisible(m.area, m.layer, f.id)) return 'too_small';
      if (promptGivesPosition(prompt, f.lat, f.lon)) return 'map_given_away';
      return {
        type: 'figure_tap',
        figure: figure(markOf(f), true),
        key: { kind: 'map_coords', lat: f.lat, lon: f.lon },
      };
  }
}

type MapFig = Extract<TapFigure, { kind: 'map' }>;

/** What is wrong with a stored map task (the same rules, read back), or null. */
export function mapTaskProblem(figure: MapFig, key: TapValue): MapProblem | null {
  if (!mapLayers(figure.area).includes(figure.layer)) return 'map_form';
  switch (figure.ask) {
    case 'tap': {
      if (key.kind !== 'map' || figure.mark !== null) return 'map_form';
      if (!mapFeature(figure.area, figure.layer, key.id)) return 'map_feature';
      return isTappable(figure.area, figure.layer, key.id) ? null : 'too_small';
    }
    case 'name': {
      if (key.kind !== 'map' || figure.mark === null) return 'map_form';
      const f = mapFeature(figure.area, figure.layer, key.id);
      if (!f) return 'map_feature';
      return isVisible(figure.area, figure.layer, key.id) ? null : 'too_small';
    }
    case 'coords': {
      if (key.kind !== 'map_coords' || figure.layer !== 'cities') return 'map_form';
      if (figure.mark?.form !== 'point' || !figure.graticule) return 'map_form';
      const r = coordRange(figure.area);
      if (key.lat < r.lat[0] || key.lat > r.lat[1] || key.lon < r.lon[0] || key.lon > r.lon[1])
        return 'map_form';
      return null;
    }
  }
}

// ─────────────── words ───────────────

function degree(locale: string, value: number, pos: 'N' | 'E', neg: 'S' | 'W'): string {
  const n = Math.round(Math.abs(value) * 10) / 10;
  const num = locale === 'en' ? String(n) : String(n).replace('.', ',');
  return t(locale, 'practice.map.degree', {
    n: num,
    dir: t(locale, `practice.map.dir_${value >= 0 ? pos : neg}`),
  });
}

/** A position in words: "52,5° N, 13,4° O". */
export function positionWords(locale: string, lat: number, lon: number): string {
  return t(locale, 'practice.map.position', {
    lat: degree(locale, lat, 'N', 'S'),
    lon: degree(locale, lon, 'E', 'W'),
  });
}

/** Her map answer (or the key) in words: a feature's name, what she typed, a position. */
export function mapValueWords(locale: string, figure: MapFig, v: TapValue): string {
  switch (v.kind) {
    case 'map': {
      const f = mapFeature(figure.area, figure.layer, v.id);
      return f ? mapName(f, locale) : '';
    }
    case 'map_name':
      return v.text;
    case 'map_coords':
      return positionWords(locale, v.lat, v.lon);
    default:
      return '';
  }
}

// ─────────────── Regel 0: her answer ───────────────

/** How a map answer is off — what the reply can say without guessing. */
export type MapMiss =
  /** tap: a feature that borders the key; another one. */
  | 'neighbour'
  | 'feature'
  /** name: another feature's name (a neighbour's, or one elsewhere on the map); no name of it. */
  | 'name_neighbour'
  | 'name_other'
  | 'name_wrong'
  /** coords: one of the two right; the two swapped; a hemisphere wrong; neither. */
  | 'lat_right'
  | 'lon_right'
  | 'coords_swapped'
  | 'hemisphere'
  | 'coords';

export type MapCheck = {
  correct: boolean;
  miss: MapMiss | null;
  /** A slip of the right name: right, and the reply shows how it is written. */
  slip: boolean;
  /** The feature she tapped or named instead (for the reply), and which way the key lies. */
  other: string | null;
  toward: Compass | null;
};

/** Does her value fit this map at all? Anything else was never an answer to it (422). */
export function onMap(figure: MapFig, v: TapValue): boolean {
  switch (figure.ask) {
    case 'tap':
      return v.kind === 'map' && mapFeature(figure.area, figure.layer, v.id) !== null;
    case 'name':
      return v.kind === 'map_name';
    case 'coords':
      // She types whole degrees; the contract keeps them on the globe.
      return v.kind === 'map_coords' && Number.isInteger(v.lat) && Number.isInteger(v.lon);
  }
}

export function checkMap(figure: MapFig, key: TapValue, v: TapValue): MapCheck | null {
  if (!onMap(figure, v)) return null;
  const done = (miss: MapMiss | null, more: Partial<MapCheck> = {}): MapCheck => ({
    correct: miss === null,
    miss,
    slip: false,
    other: null,
    toward: null,
    ...more,
  });
  if (figure.ask === 'coords') {
    if (key.kind !== 'map_coords' || v.kind !== 'map_coords') return null;
    const tol = COORD_TOLERANCE[figure.area];
    const near = (a: number, b: number) => Math.abs(a - b) <= tol + 1e-9;
    const lat = near(v.lat, key.lat);
    const lon = near(v.lon, key.lon);
    if (lat && lon) return done(null);
    if (near(v.lat, key.lon) && near(v.lon, key.lat)) return done('coords_swapped');
    if (near(Math.abs(v.lat), Math.abs(key.lat)) && near(Math.abs(v.lon), Math.abs(key.lon)))
      return done('hemisphere');
    return done(lat ? 'lat_right' : lon ? 'lon_right' : 'coords');
  }
  if (key.kind !== 'map') return null;
  const keyF = mapFeature(figure.area, figure.layer, key.id);
  if (!keyF) return null;
  if (figure.ask === 'tap') {
    if (v.kind !== 'map') return null;
    if (v.id === key.id) return done(null);
    const tapped = mapFeature(figure.area, figure.layer, v.id);
    if (!tapped) return null;
    return done(keyF.neighbours.includes(v.id) ? 'neighbour' : 'feature', {
      other: v.id,
      toward: compass(tapped, keyF),
    });
  }
  if (v.kind !== 'map_name') return null;
  const said = judgeMapName(figure.area, keyF, v.text);
  switch (said.verdict) {
    case 'right':
      return done(null);
    case 'slip':
      return done(null, { slip: true });
    case 'other': {
      const sameLayer = mapFeatures(figure.area, figure.layer).some((f) => f.id === said.id);
      return done(
        sameLayer && keyF.neighbours.includes(said.id) ? 'name_neighbour' : 'name_other',
        {
          other: sameLayer ? said.id : null,
        },
      );
    }
    case 'wrong':
      return done('name_wrong');
  }
}

const TOWARD: Record<Compass, MessageKey> = {
  n: 'practice.map.toward_n',
  ne: 'practice.map.toward_ne',
  e: 'practice.map.toward_e',
  se: 'practice.map.toward_se',
  s: 'practice.map.toward_s',
  sw: 'practice.map.toward_sw',
  w: 'practice.map.toward_w',
  nw: 'practice.map.toward_nw',
};

/**
 * The reply to a map answer. What she tapped is named (that is feedback — she learns where it
 * is); which WAY the key lies comes from the second miss on, the next rung of the hint ladder,
 * and counts as help (`mapNamesPart`).
 */
export function mapReply(
  locale: string,
  figure: MapFig,
  check: MapCheck,
  priorMisses: number,
): string {
  const name = (id: string | null) => {
    const f = id ? mapFeature(figure.area, figure.layer, id) : null;
    return f ? mapName(f, locale) : '';
  };
  switch (check.miss) {
    case null:
      return t(locale, 'practice.correct');
    case 'neighbour':
    case 'feature': {
      const base = t(
        locale,
        check.miss === 'neighbour' ? 'practice.map.tap_neighbour' : 'practice.map.tap_other',
        { name: name(check.other) },
      );
      return mapNamesPart(check, priorMisses) && check.toward
        ? `${base} ${t(locale, TOWARD[check.toward])}`
        : base;
    }
    case 'name_neighbour':
      return t(locale, 'practice.map.name_neighbour', { name: name(check.other) });
    case 'name_other':
      return t(locale, 'practice.map.name_other');
    case 'name_wrong':
      return t(locale, 'practice.map.name_wrong');
    case 'lat_right':
      return t(locale, 'practice.map.lat_right');
    case 'lon_right':
      return t(locale, 'practice.map.lon_right');
    case 'coords_swapped':
      return t(locale, 'practice.map.coords_swapped');
    case 'hemisphere':
      return t(locale, 'practice.map.hemisphere');
    case 'coords':
      return t(locale, 'practice.map.coords_wrong');
  }
}

/** The reply to a right answer that was a slip of the name: right, and how it is written. */
export function mapSlipReply(locale: string, figure: MapFig, key: TapValue): string {
  return t(locale, 'practice.map.slip', { name: mapValueWords(locale, figure, key) });
}

export function mapNamesPart(check: MapCheck, priorMisses: number): boolean {
  return (check.miss === 'neighbour' || check.miss === 'feature') && priorMisses >= 1;
}
