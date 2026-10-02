// The maps as features she can be asked about (issue #251). docs/architecture.md §Practice
// ("Maps").
//
// Three areas (world, Europe, Germany) and four layers:
//   areas  — countries (world, Europe) or the 16 Länder (Germany), from Natural Earth;
//   rivers — rivers, from Natural Earth;
//   cities — capitals of those countries or Länder, from Natural Earth;
//   zones  — the illumination zones (world only), computed here: between the tropics, between
//            a tropic and a polar circle, beyond a polar circle. They have exact borders, so code
//            can decide them; the four "Klimazonen" of a school atlas have no exact border and
//            are therefore not offered.
//
// A feature is known by an id code gives it (never one a model writes) and by its names.

import { EUROPE } from './data/europe.js';
import { GERMANY } from './data/germany.js';
import { WORLD } from './data/world.js';
import type { MapAreaData, MapNames } from './types.js';

export const MAP_AREAS = ['world', 'europe', 'germany'] as const;
export type MapAreaId = (typeof MAP_AREAS)[number];

export const MAP_LAYERS = ['areas', 'rivers', 'cities', 'zones'] as const;
export type MapLayer = (typeof MAP_LAYERS)[number];

const DATA: Record<MapAreaId, MapAreaData> = { world: WORLD, europe: EUROPE, germany: GERMANY };

export function mapArea(area: MapAreaId): MapAreaData {
  return DATA[area];
}

/** The layers an area has: zones only on the world map (they run round the globe). */
export function mapLayers(area: MapAreaId): readonly MapLayer[] {
  return area === 'world' ? MAP_LAYERS : MAP_LAYERS.filter((l) => l !== 'zones');
}

/** The tropics and the polar circles, rounded to two decimals (23° 26′, 66° 34′). */
export const TROPIC = 23.44;
export const POLAR_CIRCLE = 66.56;

/**
 * A feature as the checks see it. `shape` areas and zones are closed paths, `line` rivers
 * are open paths, `point` cities a position.
 */
export type MapFeature = {
  id: string;
  layer: MapLayer;
  names: MapNames;
  alt: readonly string[];
  form: 'shape' | 'line' | 'point';
  /** Path for a shape or a line; for a point, a small circle (drawn by the app itself). */
  d: string;
  /** Where its target is when it is too small for a finger: a shape's deepest point, a city. */
  anchor: readonly [number, number];
  /** Half its smallest width (units): a shape's inscribed radius, a zone's half height. */
  r: number;
  box: readonly [number, number, number, number];
  neighbours: readonly string[];
  /** A city's position in degrees; null for anything else. */
  lat: number | null;
  lon: number | null;
  /** areas: its capital's id; cities: the area it is the capital of. */
  capital: string | null;
  of: string | null;
};

/** Units → degrees and back, for an area. */
export function toUnits(a: MapAreaData, lat: number, lon: number): [number, number] {
  return [(lon - a.west) * a.kx * a.q, (a.north - lat) * a.q];
}

export function toDegrees(a: MapAreaData, x: number, y: number): { lat: number; lon: number } {
  return { lat: a.north - y / a.q, lon: a.west + x / (a.kx * a.q) };
}

const ZONE_NAMES: Record<string, MapNames> = {
  'z-tropics': {
    de: 'Tropen',
    en: 'Tropics',
    fr: 'Zone intertropicale',
    es: 'Zona tropical',
    it: 'Zona tropicale',
  },
  'z-north-temperate': {
    de: 'Nördliche gemäßigte Zone',
    en: 'North Temperate Zone',
    fr: 'Zone tempérée nord',
    es: 'Zona templada norte',
    it: 'Zona temperata boreale',
  },
  'z-south-temperate': {
    de: 'Südliche gemäßigte Zone',
    en: 'South Temperate Zone',
    fr: 'Zone tempérée sud',
    es: 'Zona templada sur',
    it: 'Zona temperata australe',
  },
  'z-north-polar': {
    de: 'Nördliche Polarzone',
    en: 'North Polar Zone',
    fr: 'Zone polaire nord',
    es: 'Zona polar norte',
    it: 'Zona polare artica',
  },
  'z-south-polar': {
    de: 'Südliche Polarzone',
    en: 'South Polar Zone',
    fr: 'Zone polaire sud',
    es: 'Zona polar sur',
    it: 'Zona polare antartica',
  },
};

/** Further names the same band has in school books (the first is the atlas's own word). */
const ZONE_ALT: Record<string, string[]> = {
  'z-tropics': ['Tropische Zone', 'Tropenzone', 'Torrid Zone'],
  'z-north-temperate': ['Nördliche Mittelbreiten', 'Northern Temperate Zone'],
  'z-south-temperate': ['Südliche Mittelbreiten', 'Southern Temperate Zone'],
  'z-north-polar': ['Nördliche Polarzone', 'Arktische Zone', 'Arctic Zone', 'North Frigid Zone'],
  'z-south-polar': ['Antarktische Zone', 'Antarctic Zone', 'South Frigid Zone'],
};

function band(a: MapAreaData, id: string, north: number, south: number): MapFeature {
  const [, y0] = toUnits(a, north, 0);
  const [, y1] = toUnits(a, south, 0);
  const top = Math.round(y0);
  const bottom = Math.round(y1);
  return {
    id,
    layer: 'zones',
    names: ZONE_NAMES[id] ?? {},
    alt: (ZONE_ALT[id] ?? []).filter((n) => !Object.values(ZONE_NAMES[id] ?? {}).includes(n)),
    form: 'shape',
    d: `M0 ${top}H${a.width}V${bottom}H0z`,
    anchor: [Math.round(a.width / 2), Math.round((top + bottom) / 2)],
    r: (bottom - top) / 2,
    box: [0, top, a.width, bottom],
    neighbours: [],
    lat: null,
    lon: null,
    capital: null,
    of: null,
  };
}

function zones(a: MapAreaData): MapFeature[] {
  const z = [
    band(a, 'z-north-polar', 90, POLAR_CIRCLE),
    band(a, 'z-north-temperate', POLAR_CIRCLE, TROPIC),
    band(a, 'z-tropics', TROPIC, -TROPIC),
    band(a, 'z-south-temperate', -TROPIC, -POLAR_CIRCLE),
    band(a, 'z-south-polar', -POLAR_CIRCLE, -90),
  ];
  // Bands touch the bands above and below them.
  return z.map((f, i) => ({
    ...f,
    neighbours: [z[i - 1]?.id, z[i + 1]?.id].filter((x): x is string => x !== undefined),
  }));
}

const cache = new Map<string, MapFeature[]>();

/** Every feature of one layer of an area, in a fixed order. */
export function mapFeatures(area: MapAreaId, layer: MapLayer): readonly MapFeature[] {
  const k = `${area}/${layer}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const a = DATA[area];
  let list: MapFeature[] = [];
  switch (layer) {
    case 'areas':
      list = a.areas.map((f) => ({
        id: f.id,
        layer,
        names: f.names,
        alt: f.alt,
        form: 'shape',
        d: f.d,
        anchor: f.anchor,
        r: f.r,
        box: f.box,
        neighbours: f.neighbours,
        lat: null,
        lon: null,
        capital: f.capital,
        of: null,
      }));
      break;
    case 'rivers':
      list = a.rivers.map((f) => {
        const [x0, y0, x1, y1] = f.box;
        return {
          id: f.id,
          layer,
          names: f.names,
          alt: f.alt,
          form: 'line',
          d: f.d,
          anchor: [Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2)],
          // A line is as wide as the finger that touches it: its target is a band round it.
          r: Infinity,
          box: f.box,
          neighbours: [],
          lat: null,
          lon: null,
          capital: null,
          of: null,
        };
      });
      break;
    case 'cities':
      list = a.cities.map((c) => ({
        id: c.id,
        layer,
        names: c.names,
        alt: c.alt,
        form: 'point',
        d: '',
        anchor: c.at,
        r: 0,
        box: [c.at[0], c.at[1], c.at[0], c.at[1]],
        neighbours: [],
        lat: c.lat,
        lon: c.lon,
        capital: null,
        of: c.of,
      }));
      break;
    case 'zones':
      list = area === 'world' ? zones(a) : [];
      break;
  }
  cache.set(k, list);
  return list;
}

export function mapFeature(area: MapAreaId, layer: MapLayer, id: string): MapFeature | null {
  return mapFeatures(area, layer).find((f) => f.id === id) ?? null;
}

/** Every feature of an area, all layers. */
export function allMapFeatures(area: MapAreaId): readonly MapFeature[] {
  return mapLayers(area).flatMap((l) => mapFeatures(area, l));
}

/** Its name in this language, else German, else English, else any. */
export function mapName(f: Pick<MapFeature, 'names' | 'alt'>, locale: string): string {
  const base = locale.slice(0, 2) as keyof MapNames;
  return f.names[base] ?? f.names.de ?? f.names.en ?? Object.values(f.names)[0] ?? f.alt[0] ?? '';
}

/** Does the data give this feature a name in this language? */
export function hasMapName(f: Pick<MapFeature, 'names'>, locale: string): boolean {
  return f.names[locale.slice(0, 2) as keyof MapNames] !== undefined;
}
