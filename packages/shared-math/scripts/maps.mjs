// Writes src/mapNames.data.ts (names), src/maps.data.ts (grids, heights) and src/mapShapes.data.ts (shapes) from Natural Earth (public domain, naturalearthdata.com), issues #251, #440.
// The regions a map question is checked against — their names in five languages, their shapes,
// where each is labelled (`regionPole`) — come from this data, never from a model and never typed in by hand.
//
// Three views, each a stummer Ausschnitt as school atlases print them, and three closer
// Ausschnitte of Europe (#429) where its small countries are big enough to tap:
//   de     — the 16 Bundesländer (admin-1, 1:10m), equirectangular around 51° N;
//   europe — the countries of Europe (admin-0, 1:50m), Lambert azimuthal equal-area around
//            10° E 52° N (the projection of the EU's own maps), cut to the frame of a school map;
//            the land around it (Turkey, North Africa, the Caucasus) drawn as context, not tappable;
//   world  — the seven continents (admin-0, 1:110m, grouped by continent; Russia split at the
//            Ural, 60° E, as German schools draw it), Natural Earth projection;
//   eu_central, eu_southeast, eu_north — Mitteleuropa, Südosteuropa and the Baltic, the same
//            countries in the same order as `europe`, cut to a closer frame (a country outside it
//            has no shape there).
//
// On Germany and Europe, three layers of places as well (#429): the capitals (the Länder's and
// the countries', populated places 1:10m), the rivers a school atlas names (rivers and lake
// centre lines 1:10m with its European supplement; their names in five languages written here,
// as the continents' are — the data names a river's segments in their local languages) and the
// mountain ranges (geography regions 1:10m). A capital is a point (a ring of one point), a river
// a line (a ring there and back, so it encloses nothing), a range an area.
//
// Shapes are projected, simplified (Douglas–Peucker) and written as integers in a frame 1000
// wide, rings as "x y x y …" strings. Islands smaller than a finger at that scale are dropped,
// never a whole region.
//
//   node packages/shared-math/scripts/maps.mjs <dir>          write the three files from the .geojson in <dir>
//   node packages/shared-math/scripts/maps.mjs <dir> --check  fail if one of them is out of date
//
// <dir> holds ne_10m_admin_1_states_provinces, ne_50m_admin_0_countries,
// ne_110m_admin_0_countries, ne_10m_populated_places, ne_10m_rivers_lake_centerlines,
// ne_10m_rivers_europe and ne_10m_geography_regions_polys as .geojson, from
// github.com/nvkelso/natural-earth-vector.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The same geometry the app taps with (node ≥ 22.18 runs TypeScript without a build step): every
// region is labelled at the centre of the largest circle inside it, where an atlas writes a name —
// far from an enclave like Berlin, so its label and Brandenburg's stay a finger apart.
const { regionPole } = await import('../src/regions.ts');

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = 'Natural Earth 5.1.2 (naturalearthdata.com, public domain)';

/** The frame every view is drawn in: 1000 wide, as high as its shape needs. */
const FRAME = 1000;
const RAD = Math.PI / 180;

// ── projections: lon/lat in degrees → plane, y down ─────────────────────────

const equirect = (lat0) => (lon, lat) => [lon * Math.cos(lat0 * RAD), -lat];

function laea(lon0, lat0) {
  const l0 = lon0 * RAD;
  const p0 = lat0 * RAD;
  return (lon, lat) => {
    const l = lon * RAD;
    const p = lat * RAD;
    const k = Math.sqrt(
      2 / (1 + Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l - l0)),
    );
    const x = k * Math.cos(p) * Math.sin(l - l0);
    const y = k * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l - l0));
    return [x, -y];
  };
}

/** The Natural Earth projection (Šavrič, Jenny, Patterson 2011). */
function naturalEarth(lon, lat) {
  const l = lon * RAD;
  const p = lat * RAD;
  const p2 = p * p;
  const p4 = p2 * p2;
  const x = l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)));
  const y = p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)));
  return [x, -y];
}

// ── geometry ────────────────────────────────────────────────────────────────

/** Twice the signed area of a ring: positive when it runs counter-clockwise in lon/lat. */
function signed(ring) {
  let a = 0;
  ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length];
    a += p[0] * q[1] - q[0] * p[1];
  });
  return a;
}

/**
 * The outer rings and holes of a GeoJSON geometry, as lists of [lon, lat]: every outline one way
 * round and every hole the other, so the app fills them with SVG's default rule (nonzero) and
 * Berlin stays a hole in Brandenburg (`inside` in regions.ts counts the same way). Projecting,
 * cutting and simplifying keep the direction.
 */
function ringsOf(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polys.flatMap((rings) =>
    rings.map((r, k) => (signed(r) > 0 === (k === 0) ? r : [...r].reverse())),
  );
}

/** A ring cut to the bounds [left, top, right, bottom] (Sutherland–Hodgman, edge by edge). */
function clip(ring, [w, s, e, n]) {
  const edges = [(p) => p[0] >= w, (p) => p[0] <= e, (p) => p[1] >= s, (p) => p[1] <= n];
  const cut = [
    (a, b) => at(a, b, 0, w),
    (a, b) => at(a, b, 0, e),
    (a, b) => at(a, b, 1, s),
    (a, b) => at(a, b, 1, n),
  ];
  function at(a, b, axis, v) {
    const t = (v - a[axis]) / (b[axis] - a[axis]);
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  }
  let out = ring;
  edges.forEach((inside, k) => {
    const input = out;
    out = [];
    input.forEach((cur, i) => {
      const prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cut[k](prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cut[k](prev, cur));
    });
  });
  return out;
}

function area(ring) {
  let a = 0;
  ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length];
    a += p[0] * q[1] - q[0] * p[1];
  });
  return Math.abs(a / 2);
}

/** Douglas–Peucker on a closed ring. */
function simplify(ring, tol) {
  if (ring.length < 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;
  // A closed ring: split at the point farthest from the first, so the first segment is not a chord.
  let far = 0;
  let farD = -1;
  ring.forEach((p, i) => {
    const d = (p[0] - ring[0][0]) ** 2 + (p[1] - ring[0][1]) ** 2;
    if (d > farD) [far, farD] = [i, d];
  });
  keep[far] = 1;
  const stack = [
    [0, far],
    [far, ring.length - 1],
  ];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = ring[a];
    const [bx, by] = ring[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let best = -1;
    let bestD = 0;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = ring[i];
      const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (d > bestD) [best, bestD] = [i, d];
    }
    if (best >= 0 && bestD > tol) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}

// ── views ───────────────────────────────────────────────────────────────────

const read = (dir, name) => JSON.parse(readFileSync(join(dir, `${name}.geojson`), 'utf8'));

/** The five languages of the app; the first name is the one a key is written in. */
const names = (de, en, fr, es, it) => ({ de, en, fr, es, it });

function germany(dir) {
  const src = read(dir, 'ne_10m_admin_1_states_provinces').features.filter(
    (f) => f.properties.adm0_a3 === 'DEU',
  );
  return {
    view: 'de',
    project: equirect(51),
    bounds: null,
    borders: true,
    // Simplify to about a pixel of a 1000-wide frame; drop islands below 40 units² (Hallig-sized).
    tol: 0.9,
    minIsland: 40,
    regions: src.map((f) => {
      const p = f.properties;
      return {
        id: p.iso_3166_2.replace('DE-', ''),
        names: names(p.name, p.name_en, p.name_fr, p.name_es, p.name_it),
        // The official name where it differs ("Freie Hansestadt Bremen").
        alt: p.name_de && p.name_de !== p.name ? [p.name_de] : [],
        rings: ringsOf(f.geometry),
      };
    }),
    context: [],
    features: {
      // The 16 seats of government: the Länder's capitals and Berlin.
      cities: places(dir, (p) => p.ADM0_A3 === 'DEU' && /capital/.test(p.FEATURECLA)),
      rivers: rivers(dir, GERMAN_RIVERS),
      mountains: ranges(dir, GERMAN_RANGES),
      // Only the part of a river inside Germany: the map shows no land beyond it.
      withinRegions: true,
    },
  };
}

/** Tiny states a school map of Europe does not ask for: too small to tap, merged into nothing. */
const EUROPE_LEFT_OUT = ['VAT', 'SMR', 'MCO', 'LIE', 'AND', 'JEY', 'GGY', 'IMN', 'FRO'];
/** Parts that belong to a country on a school map. */
const EUROPE_PART_OF = { ALD: 'FIN' };
/** The frame of the map, as lon/lat of its corners: from Iceland to the Urals' foot, Crete to the North Cape. */
const EUROPE_FRAME = { sw: [-11, 34.5], ne: [44, 71.5], west: -25, east: 50 };

function europe(dir) {
  const all = read(dir, 'ne_50m_admin_0_countries').features;
  const inside = (f) =>
    ringsOf(f.geometry).some((r) =>
      r.some(([lon, lat]) => lon >= -30 && lon <= 60 && lat >= 25 && lat <= 75),
    );
  const eu = all.filter(
    (f) => f.properties.CONTINENT === 'Europe' && !EUROPE_LEFT_OUT.includes(f.properties.ADM0_A3),
  );
  const parts = (a3) =>
    eu
      .filter((f) => EUROPE_PART_OF[f.properties.ADM0_A3] === a3)
      .flatMap((f) => ringsOf(f.geometry));
  const regions = eu
    .filter((f) => !(f.properties.ADM0_A3 in EUROPE_PART_OF))
    .map((f) => {
      const p = f.properties;
      const a2 = p.ISO_A2_EH === '-99' ? p.ADM0_A3 : p.ISO_A2_EH;
      return {
        id: a2,
        a3: p.ADM0_A3,
        names: names(p.NAME_DE, p.NAME_EN, p.NAME_FR, p.NAME_ES, p.NAME_IT),
        alt: [...new Set([p.NAME, p.NAME_LONG, p.ADMIN].filter((n) => n && n !== p.NAME_EN))],
        rings: [...ringsOf(f.geometry), ...parts(p.ADM0_A3)],
      };
    });
  const context = all
    .filter((f) => f.properties.CONTINENT !== 'Europe' && inside(f))
    .flatMap((f) => ringsOf(f.geometry));
  const project = laea(10, 52);
  // A rectangle on the projected map: from Iceland's west coast to the Urals' foot, Crete to the
  // North Cape — what a school atlas prints as "Europa".
  const [x0] = project(EUROPE_FRAME.west, 64);
  const [x1] = project(EUROPE_FRAME.east, 55);
  const [, y0] = project(25, EUROPE_FRAME.ne[1]);
  const [, y1] = project(25, EUROPE_FRAME.sw[1]);
  const a3s = new Set(regions.map((g) => g.a3));
  return {
    view: 'europe',
    project,
    bounds: [x0, y0, x1, y1],
    borders: true,
    tol: 0.9,
    minIsland: 30,
    regions,
    context,
    features: {
      cities: places(dir, (p) => p.FEATURECLA === 'Admin-0 capital' && a3s.has(p.ADM0_A3)),
      rivers: rivers(dir, EUROPEAN_RIVERS),
      mountains: ranges(dir, EUROPEAN_RANGES),
      withinRegions: false,
    },
  };
}

/**
 * The closer frames of Europe (#429), as lon/lat boxes [west, south, east, north]: there the
 * countries a finger cannot hit on the whole map — Luxembourg, the Balkans, the Baltic — are big
 * enough. The same regions and places as `europe`, in the same order.
 */
const EUROPE_CLOSER = {
  eu_central: [1.5, 43.5, 24.5, 55.8],
  eu_southeast: [12.5, 35.5, 30.5, 48.5],
  eu_north: [17, 52.5, 32, 60.8],
};

function closer(spec, view) {
  const [w, s, e, n] = EUROPE_CLOSER[view];
  const corners = [];
  for (let i = 0; i <= 8; i++) {
    corners.push(spec.project(w + ((e - w) * i) / 8, s), spec.project(w + ((e - w) * i) / 8, n));
    corners.push(spec.project(w, s + ((n - s) * i) / 8), spec.project(e, s + ((n - s) * i) / 8));
  }
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return {
    ...spec,
    view,
    bounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    // Closer, so smaller islands count: Malta, the Åland Islands.
    minIsland: 15,
    closerOf: 'europe',
  };
}

/** The continents as German schools name and count them. */
const CONTINENTS = [
  ['AF', 'Africa', names('Afrika', 'Africa', 'Afrique', 'África', 'Africa')],
  ['AS', 'Asia', names('Asien', 'Asia', 'Asie', 'Asia', 'Asia')],
  ['EU', 'Europe', names('Europa', 'Europe', 'Europe', 'Europa', 'Europa')],
  [
    'NA',
    'North America',
    names(
      'Nordamerika',
      'North America',
      'Amérique du Nord',
      'América del Norte',
      'America del Nord',
    ),
  ],
  [
    'SA',
    'South America',
    names('Südamerika', 'South America', 'Amérique du Sud', 'América del Sur', 'America del Sud'),
  ],
  [
    'OC',
    'Oceania',
    names('Australien und Ozeanien', 'Australia and Oceania', 'Océanie', 'Oceanía', 'Oceania'),
  ],
  ['AN', 'Antarctica', names('Antarktis', 'Antarctica', 'Antarctique', 'Antártida', 'Antartide')],
];
/** Other names a continent goes by in the five languages (the data has none for continents). */
const CONTINENT_ALT = {
  OC: ['Australien', 'Ozeanien', 'Australia', 'Oceania', 'Australie'],
  AN: ['Antarktika', 'Antarctique'],
};
/** Where Europe ends and Asia begins on a school map: the Ural, about 60° E. */
const URAL = 60;

function world(dir) {
  const all = read(dir, 'ne_110m_admin_0_countries').features.filter(
    (f) => f.properties.CONTINENT !== 'Seven seas (open ocean)',
  );
  const rings = Object.fromEntries(CONTINENTS.map(([id]) => [id, []]));
  const byName = Object.fromEntries(CONTINENTS.map(([id, en]) => [en, id]));
  for (const f of all) {
    const id = byName[f.properties.CONTINENT];
    if (!id) throw new Error(`unknown continent ${f.properties.CONTINENT}`);
    for (const r of ringsOf(f.geometry)) {
      if (f.properties.ADM0_A3 !== 'RUS') {
        rings[id].push(r);
        continue;
      }
      // Russia: west of the Ural is Europe, east of it Asia (and Chukotka across 180°).
      const west = clip(r, [-180, -90, URAL, 90]);
      const east = clip(r, [URAL, -90, 180, 90]);
      if (west.length > 2) rings.EU.push(west);
      if (east.length > 2) rings.AS.push(east);
    }
  }
  return {
    view: 'world',
    project: naturalEarth,
    bounds: null,
    // A continent is many countries: drawn as one outline, no border inside it (`MapData`).
    borders: false,
    tol: 1.2,
    minIsland: 25,
    regions: CONTINENTS.map(([id, , n]) => ({
      id,
      names: n,
      alt: CONTINENT_ALT[id] ?? [],
      rings: rings[id],
    })),
    context: [],
  };
}

// ── places: capitals, rivers, mountain ranges (#429) ───────────────────────

/** A place's names in the five languages; English where the data has none in one. */
const localNames = (p) =>
  names(...[p.NAME_DE, p.NAME_EN, p.NAME_FR, p.NAME_ES, p.NAME_IT].map((n) => n || p.NAME_EN));

/** The capitals the filter keeps, as points with their names in the five languages. */
function places(dir, keep) {
  return read(dir, 'ne_10m_populated_places')
    .features.filter((f) => keep(f.properties))
    .map((f) => {
      const p = f.properties;
      const slug = p.NAME_EN.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z]+/g, '-');
      return {
        id: slug,
        names: localNames(p),
        alt: [
          ...new Set([p.NAME, p.NAMEASCII].filter((n) => n && n !== p.NAME_DE && n !== p.NAME_EN)),
        ],
        point: f.geometry.coordinates,
      };
    });
}

/**
 * A river: its names in the five languages, and the names Natural Earth gives its segments (in
 * either river file, in whichever language a segment is named), within a lon/lat box where a name
 * is not the river's alone (the Russian Don, not the English one).
 */
const river = (id, n, match, box = [-30, 30, 60, 75]) => ({ id, names: n, match, box });

/** The rivers a German school atlas names on a map of Germany. */
const GERMAN_RIVERS = [
  river('rhein', names('Rhein', 'Rhine', 'Rhin', 'Rin', 'Reno'), ['Rhein', 'Rhine', 'Rhin']),
  river('donau', names('Donau', 'Danube', 'Danube', 'Danubio', 'Danubio'), ['Donau', 'Danube']),
  river('elbe', names('Elbe', 'Elbe', 'Elbe', 'Elba', 'Elba'), ['Elbe']),
  river('oder', names('Oder', 'Oder', 'Oder', 'Óder', 'Oder'), ['Oder', 'Odra']),
  river('weser', names('Weser', 'Weser', 'Weser', 'Weser', 'Weser'), ['Weser']),
  river('main', names('Main', 'Main', 'Main', 'Meno', 'Meno'), ['Main'], [7, 49, 12.5, 51]),
  river('mosel', names('Mosel', 'Moselle', 'Moselle', 'Mosela', 'Mosella'), ['Mosel', 'Moselle']),
  river('neckar', names('Neckar', 'Neckar', 'Neckar', 'Neckar', 'Neckar'), ['Neckar']),
  river('ems', names('Ems', 'Ems', 'Ems', 'Ems', 'Ems'), ['Ems'], [6, 51.5, 9, 54]),
  river('saale', names('Saale', 'Saale', 'Saale', 'Saale', 'Saale'), ['Saale']),
  river('spree', names('Spree', 'Spree', 'Spree', 'Spree', 'Sprea'), ['Spree']),
  river('isar', names('Isar', 'Isar', 'Isar', 'Isar', 'Isar'), ['Isar']),
  river('inn', names('Inn', 'Inn', 'Inn', 'Eno', 'Inn'), ['Inn'], [9, 46, 14, 49]),
];

/** The rivers a school atlas names on a map of Europe. */
const EUROPEAN_RIVERS = [
  ...GERMAN_RIVERS.filter((r) => ['rhein', 'donau', 'elbe', 'oder'].includes(r.id)),
  river('weichsel', names('Weichsel', 'Vistula', 'Vistule', 'Vístula', 'Vistola'), [
    'Vistula',
    'Wisła',
  ]),
  river('loire', names('Loire', 'Loire', 'Loire', 'Loira', 'Loira'), ['Loire']),
  river('seine', names('Seine', 'Seine', 'Seine', 'Sena', 'Senna'), ['Seine']),
  river('rhone', names('Rhone', 'Rhône', 'Rhône', 'Ródano', 'Rodano'), ['Rhône', 'Rhne', 'Rhone']),
  river('po', names('Po', 'Po', 'Pô', 'Po', 'Po'), ['Po'], [6.5, 44, 13, 46]),
  river('ebro', names('Ebro', 'Ebro', 'Èbre', 'Ebro', 'Ebro'), ['Ebro']),
  river('tajo', names('Tajo', 'Tagus', 'Tage', 'Tajo', 'Tago'), ['Tajo', 'Tejo']),
  river('themse', names('Themse', 'Thames', 'Tamise', 'Támesis', 'Tamigi'), ['Thames']),
  river('wolga', names('Wolga', 'Volga', 'Volga', 'Volga', 'Volga'), ['Volga']),
  river('dnepr', names('Dnepr', 'Dnieper', 'Dniepr', 'Dniéper', 'Dnepr'), [
    'Dnipro',
    'Dnepre',
    'Dnepr',
    'Dnieper',
  ]),
  river('don', names('Don', 'Don', 'Don', 'Don', 'Don'), ['Don'], [35, 46, 42, 54]),
];

/** The mountain ranges a school atlas names, by Natural Earth's name, with names where its own are off. */
const range = (match, n = null) => ({ match, names: n });
const GERMAN_RANGES = [range('ALPS'), range('Harz'), range('Erzgebirge'), range('Böhmerwald')];
const EUROPEAN_RANGES = [
  range('ALPS'),
  range('PYRENEES'),
  range('CARPATHIAN MOUNTAINS'),
  range('APPENNINI', names('Apennin', 'Apennines', 'Apennins', 'Apeninos', 'Appennini')),
  range(
    'KJØLEN MOUNTAINS',
    names(
      'Skanden',
      'Scandinavian Mountains',
      'Alpes scandinaves',
      'Alpes escandinavos',
      'Alpi scandinave',
    ),
  ),
  range('CAUCASUS MTS.'),
  range('Balkan Mts.'),
  range('Dinaric Alps'),
];

/** The segments of each river, as lines of [lon, lat]. */
function rivers(dir, list) {
  const segments = ['ne_10m_rivers_lake_centerlines', 'ne_10m_rivers_europe'].flatMap(
    (name) => read(dir, name).features,
  );
  return list.map((r) => {
    const [w, s, e, n] = r.box;
    const lines = segments
      .filter(
        (f) =>
          f.geometry &&
          [f.properties.name, f.properties.name_en, f.properties.name_de].some((x) =>
            r.match.includes(x),
          ),
      )
      .flatMap((f) =>
        f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates,
      )
      .filter((line) => line.some(([lon, lat]) => lon >= w && lon <= e && lat >= s && lat <= n));
    if (lines.length === 0) throw new Error(`no segments for the river ${r.id}`);
    return { id: r.id, names: r.names, alt: [], lines };
  });
}

/** The mountain ranges, as rings like a region's. */
function ranges(dir, list) {
  const all = read(dir, 'ne_10m_geography_regions_polys').features;
  return list.map((m) => {
    const f = all.find((x) => x.properties.NAME === m.match);
    if (!f) throw new Error(`no range ${m.match}`);
    const p = f.properties;
    return {
      id: p.NAME_EN.toLowerCase().replace(/[^a-z]+/g, '-'),
      names: m.names ?? localNames(p),
      alt: [],
      rings: ringsOf(f.geometry),
    };
  });
}

/** Douglas–Peucker on an open line. */
function simplifyLine(line, tol) {
  if (line.length < 3) return line;
  const keep = new Uint8Array(line.length);
  keep[0] = 1;
  keep[line.length - 1] = 1;
  const stack = [[0, line.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = line[a];
    const [bx, by] = line[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let best = -1;
    let bestD = 0;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = line[i];
      const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (d > bestD) [best, bestD] = [i, d];
    }
    if (best >= 0 && bestD > tol) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

/** Whether (x, y) lies inside any of the rings (even–odd per ring, nonzero across them). */
function insideAny(rings, x, y) {
  return rings.some((r) => {
    let hit = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i];
      const [xj, yj] = r[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  });
}

const lengthOf = (line) =>
  line.reduce(
    (t, p, i) => (i === 0 ? 0 : t + Math.hypot(p[0] - line[i - 1][0], p[1] - line[i - 1][1])),
    0,
  );

/** The point halfway along a line. */
function halfway(line) {
  let left = lengthOf(line) / 2;
  for (let i = 1; i < line.length; i++) {
    const d = Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
    if (d >= left) {
      const t = d === 0 ? 0 : left / d;
      return [
        line[i - 1][0] + t * (line[i][0] - line[i - 1][0]),
        line[i - 1][1] + t * (line[i][1] - line[i - 1][1]),
      ];
    }
    left -= d;
  }
  return line[line.length - 1];
}

/** Where a place outside the frame is labelled: far from every finger. */
const NOWHERE = [-100000, -100000];

// ── the Gradnetz (#429) ─────────────────────────────────────────────────────

/**
 * The step of each view's Gradnetz in degrees, as a school atlas draws it: every degree on
 * Germany, every ten on Europe, every thirty on the world (the 180th meridian is the world map's
 * own edge). Its crossings are what a question on the grid is about (`mapGrid.ts`); a closer
 * Ausschnitt of Europe has none.
 */
const GRID_STEP = { de: 1, europe: 10, world: 30 };

/** The part of the segment a–b inside [0, w] × [0, h], or null (Liang–Barsky). */
function clipSegment([x0, y0], [x1, y1], w, h) {
  let [t0, t1] = [0, 1];
  const [dx, dy] = [x1 - x0, y1 - y0];
  for (const [p, q] of [
    [-dx, x0],
    [dx, w - x0],
    [-dy, y0],
    [dy, h - y0],
  ]) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [
    [x0 + t0 * dx, y0 + t0 * dy],
    [x0 + t1 * dx, y0 + t1 * dy],
  ];
}

/** The runs of a line inside [0, w] × [0, h]; a point that does not project ends a run. */
function clipLine(line, w, h) {
  const runs = [];
  let run = [];
  const end = () => {
    if (run.length > 1) runs.push(run);
    run = [];
  };
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]];
    const seg = [...a, ...b].every(Number.isFinite) ? clipSegment(a, b, w, h) : null;
    if (!seg) {
      end();
      continue;
    }
    const last = run[run.length - 1];
    if (last && Math.hypot(last[0] - seg[0][0], last[1] - seg[0][1]) > 1e-6) end();
    if (run.length === 0) run.push(seg[0]);
    run.push(seg[1]);
  }
  end();
  return runs;
}

/** step, 2·step … up to `limit` and as far below zero: the values of one family of lines. */
const multiples = (step, limit) =>
  Array.from(
    { length: 2 * Math.floor(limit / step) + 1 },
    (_, i) => (i - Math.floor(limit / step)) * step,
  );

/**
 * The Gradnetz of a view, fitted to its frame: every meridian and parallel that crosses it, each
 * as its runs in the frame and the end where its degree is written — a meridian's at the bottom
 * edge (else the top), a parallel's at the left edge (else the right; on the world map, where the
 * parallels end at the map's own outline, its western end) —, and where each crossing stands
 * (null outside the frame).
 */
function graticule(spec, fit, height) {
  const step = GRID_STEP[spec.view];
  if (!step || spec.closerOf) return null;
  const fine = step / 20;
  const sample = (from, to, f) =>
    Array.from({ length: Math.round((to - from) / fine) + 1 }, (_, i) => fit(f(from + i * fine)));
  const lines = (points) =>
    clipLine(points, FRAME, height)
      .map((run) => simplifyLine(run, 0.5).map(([x, y]) => [Math.round(x), Math.round(y)]))
      .filter((run) => lengthOf(run) >= 8);
  /** The first end of a run that `where` accepts, tried in order; null where none does. */
  const labelled = (runs, ...where) => {
    const ends = runs.flatMap((r) => [r[0], r[r.length - 1]]);
    for (const w of where) {
      const end = ends.find(w);
      if (end) return end;
    }
    return null;
  };
  const family = (values, along, ...where) =>
    values
      .map((value) => ({ value, runs: lines(along(value)) }))
      .filter((l) => l.runs.length > 0)
      .map(({ value, runs }) => ({ value, runs, label: labelled(runs, ...where) }));
  const [bottom, top] = [([, y]) => y >= height - 1, ([, y]) => y <= 1];
  const [left, right] = [([x]) => x <= 1, ([x]) => x >= FRAME - 1];
  // ±180 is one meridian, on both edges of the world: the frame, never a line of the grid.
  const lon = family(
    multiples(step, 180).filter((v) => Math.abs(v) < 180),
    (v) => sample(-90, 90, (lat) => spec.project(v, lat)),
    bottom,
    top,
  );
  const lat = family(
    multiples(step, 90).filter((v) => Math.abs(v) < 90),
    (v) => sample(-180, 180, (l) => spec.project(l, v)),
    left,
    right,
    // The world map's parallels end at its outline: the western end, never one on the frame.
    (p) => !top(p) && !bottom(p) && p[0] < FRAME / 2,
  );
  const inFrame = ([x, y]) => x >= 0 && x <= FRAME && y >= 0 && y <= height;
  const crossing = (m, p) => {
    const c = fit(spec.project(m.value, p.value));
    return inFrame(c) ? c.map(Math.round) : null;
  };
  // A line no other crosses on the map — a corner of Europe's frame — is no line of its grid.
  const meridians = lon.filter((m) => lat.some((p) => crossing(m, p)));
  const parallels = lat.filter((p) => meridians.some((m) => crossing(m, p)));
  return {
    lon: meridians,
    lat: parallels,
    at: parallels.map((p) => meridians.map((m) => crossing(m, p))),
  };
}

// ── output ──────────────────────────────────────────────────────────────────

function build(spec) {
  // Cut on the projected map, so the frame is a rectangle on the screen.
  const cut = (r) => (spec.bounds ? clip(r, spec.bounds) : r);
  const project = (r) => r.map(([lon, lat]) => spec.project(lon, lat));
  const shaped = (rings) =>
    rings
      .map(project)
      .map(cut)
      .filter((r) => r.length > 2);
  const regions = spec.regions.map((g) => ({ ...g, rings: shaped(g.rings) }));
  const context = shaped(spec.context);
  const pts = [...regions.flatMap((g) => g.rings), ...context].flat();
  const minX = Math.min(...pts.map((p) => p[0]));
  const maxX = Math.max(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1]));
  const maxY = Math.max(...pts.map((p) => p[1]));
  const k = FRAME / (maxX - minX);
  const fit = ([x, y]) => [(x - minX) * k, (y - minY) * k];
  const height = Math.ceil((maxY - minY) * k);
  const shape = (rings, keepOne, tol = spec.tol) => {
    const kept = rings
      .map((r) => r.map(fit))
      .map((r) => simplify(r, tol))
      .map((r) => r.map(([x, y]) => [Math.round(x), Math.round(y)]))
      .filter((r) => r.length > 2);
    const big = kept.filter((r) => area(r) >= spec.minIsland);
    // Never drop a whole region: a region of small islands keeps its largest one (none where the
    // frame of a closer Ausschnitt leaves nothing of it).
    const out =
      big.length > 0 || !keepOne || kept.length === 0
        ? big
        : [kept.sort((a, b) => area(b) - area(a))[0]];
    return out.map((r) => r.flat().join(' '));
  };
  const labelled = (rings) => {
    if (rings.length === 0) return NOWHERE;
    const pole = regionPole({ rings });
    return [Math.round(pole.x), Math.round(pole.y)];
  };
  return {
    view: spec.view,
    height,
    borders: spec.borders,
    regions: regions
      .map((g) => {
        const rings = shape(g.rings, true);
        return { id: g.id, names: g.names, alt: g.alt, at: labelled(rings), rings };
      })
      .sort(byName),
    context: shape(context, false, spec.tol * 2),
    closerOf: spec.closerOf ?? null,
    features: spec.features ? features(spec, fit, height, regions, shape, labelled) : null,
    grid: graticule(spec, fit, height),
  };
}

const byName = (a, b) => a.names.de.localeCompare(b.names.de, 'de');

/** The capitals, rivers and ranges of a view, fitted to its frame (#429). */
function features(spec, fit, height, regions, shape, labelled) {
  const inFrame = ([x, y]) => x >= 0 && x <= FRAME && y >= 0 && y <= height;
  const land = spec.features.withinRegions
    ? regions.flatMap((g) => g.rings).map((r) => r.map(fit))
    : null;
  const shown = (p) => inFrame(p) && (!land || insideAny(land, p[0], p[1]));
  const cities = spec.features.cities
    .map((c) => {
      const p = fit(spec.project(c.point[0], c.point[1])).map(Math.round);
      const rings = shown(p) ? [p.join(' ')] : [];
      return { id: c.id, names: c.names, alt: c.alt, at: rings.length ? p : NOWHERE, rings };
    })
    .sort(byName);
  const rivers = spec.features.rivers
    .map((r) => {
      // The runs of each segment that stand on the map, simplified like the outlines.
      const runs = r.lines.flatMap((line) => {
        const out = [];
        let run = [];
        for (const [lon, lat] of line) {
          const p = fit(spec.project(lon, lat));
          if (shown(p)) run.push(p);
          else if (run.length) {
            out.push(run);
            run = [];
          }
        }
        if (run.length) out.push(run);
        return out;
      });
      const lines = runs
        .map((run) => simplifyLine(run, spec.tol).map(([x, y]) => [Math.round(x), Math.round(y)]))
        .filter((line) => line.length > 1 && lengthOf(line) >= 8);
      // There and back: a line that encloses nothing (`regions.ts` measures its distance).
      const rings = lines.map((line) => [...line, ...line.slice(1, -1).reverse()].flat().join(' '));
      const longest = lines.reduce((a, b) => (lengthOf(b) > lengthOf(a) ? b : a), []);
      const at = longest.length ? halfway(longest).map(Math.round) : NOWHERE;
      return { id: r.id, names: r.names, alt: r.alt, at, rings, line: true };
    })
    .sort(byName);
  const mountains = spec.features.mountains
    .map((m) => {
      const cut = (r) => (spec.bounds ? clip(r, spec.bounds) : r);
      const projected = m.rings
        .map((r) => cut(r.map(([lon, lat]) => spec.project(lon, lat))))
        .filter((r) => r.length > 2);
      const rings = shape(projected, false);
      return { id: m.id, names: m.names, alt: m.alt, at: labelled(rings), rings };
    })
    .sort(byName);
  return { cities, rivers, mountains };
}

const HEADER = [
  `// GENERATED by packages/shared-math/scripts/maps.mjs from ${SOURCE}.`,
  '// Do not edit: run the script. Issue #251. Natural Earth: "All versions of Natural Earth raster +',
  '// vector map data found on this website are in the public domain." Made with Natural Earth.',
];

const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/**
 * The regions and places of every view by name: what the server checks a key against
 * (`maps.ts`), and what the app loads with the first map or picture (`figureNames.data.ts`,
 * #440) — no part of the start bundle.
 */
function renderNames(views) {
  // A closer Ausschnitt has the regions and places of its view: their names are written once.
  const base = views.filter((v) => !v.closerOf);
  const region = (g) =>
    `    { id: ${q(g.id)}, de: ${q(g.names.de)}, en: ${q(g.names.en)}, fr: ${q(g.names.fr)}, es: ${q(g.names.es)}, it: ${q(g.names.it)}, alt: [${g.alt.map(q).join(', ')}] },`;
  return [
    ...HEADER,
    '',
    "import type { MapNames, MapPlaceNames } from './maps.js';",
    '',
    '/** The regions of each view in drawing order, with their names in the five languages. */',
    'export const MAP_NAMES: MapNames = {',
    ...base.flatMap((v) => [`  ${v.view}: [`, ...v.regions.map(region), '  ],']),
    '};',
    '',
    '/** The capitals, rivers and mountain ranges of a view, in drawing order (#429). */',
    'export const MAP_PLACE_NAMES: MapPlaceNames = {',
    ...base
      .filter((v) => v.features)
      .flatMap((v) => [
        `  ${v.view}: {`,
        ...LAYERS.flatMap((l) => [
          `    ${l}: [`,
          ...v.features[l].map((g) => `  ${region(g)}`),
          '    ],',
        ]),
        '  },',
      ]),
    '};',
    '',
  ].join('\n');
}

/**
 * What a map needs before its names and shapes are loaded (#440): the degrees of its Gradnetz and
 * the room it keeps. Small; in the start bundle.
 */
function renderViews(views) {
  const base = views.filter((v) => !v.closerOf);
  return [
    ...HEADER,
    '',
    "import type { MapGrids } from './mapGrid.js';",
    "import type { MapView } from './maps.js';",
    '',
    "/** The degrees of the meridians and parallels of each view's Gradnetz, west to east and south to north (#429). */",
    'export const MAP_GRIDS: MapGrids = {',
    ...base
      .filter((v) => v.grid)
      .map(
        (v) =>
          `  ${v.view}: { lon: [${v.grid.lon.map((l) => l.value).join(', ')}], lat: [${v.grid.lat.map((l) => l.value).join(', ')}] },`,
      ),
    '};',
    '',
    '/** How high each view stands in a frame 1000 wide: the drawing keeps its room while it loads. */',
    `export const MAP_HEIGHTS: Record<MapView, number> = { ${views.map((v) => `${v.view}: ${v.height}`).join(', ')} };`,
    '',
  ].join('\n');
}

/**
 * Where every region stands: only the app needs it, and it loads it when a map is on the screen
 * (`useMapShapes`), so it is no part of the start bundle.
 */
function renderShapes(views) {
  const region = (g) =>
    g.rings.length === 0
      ? '      OUTSIDE,'
      : `      { at: [${g.at.join(', ')}], rings: [${g.rings.map(q).join(', ')}]${g.line ? ', line: true' : ''} },`;
  return [
    ...HEADER,
    '// Shapes in a frame 1000 wide, y down; a ring is "x y x y …" (`RegionShape` in regions.ts).',
    '',
    "import type { MapShapes } from './maps.js';",
    "import type { RegionShape } from './regions.js';",
    '',
    '/** A region or place outside a closer view of Europe (#429): nothing to draw, nothing to tap. */',
    `const OUTSIDE: RegionShape = { at: [${NOWHERE.join(', ')}], rings: [] };`,
    '',
    '/** The shape of each view, its regions in the order of `MAP_NAMES`. */',
    'export const MAP_SHAPES: MapShapes = {',
    ...views.flatMap((v) => [
      `  ${v.view}: {`,
      `    borders: ${v.borders},`,
      '    regions: [',
      ...v.regions.map(region),
      '    ],',
      `    context: [${v.context.map(q).join(', ')}],`,
      ...(v.features
        ? [
            '    places: {',
            ...LAYERS.flatMap((l) => [
              `      ${l}: [`,
              ...v.features[l].map((g) => `  ${region(g)}`),
              '      ],',
            ]),
            '    },',
          ]
        : []),
      ...(v.grid ? renderGrid(v.grid) : []),
      '  },',
    ]),
    '};',
    '',
  ].join('\n');
}

/** A view's Gradnetz: its lines with where each is labelled, and where its crossings stand. */
function renderGrid(grid) {
  const point = (p) => (p ? `[${p.join(', ')}]` : 'null');
  const line = (l) =>
    `        { lines: [${l.runs.map((r) => q(r.flat().join(' '))).join(', ')}], label: ${point(l.label)} },`;
  return [
    '    grid: {',
    '      lon: [',
    ...grid.lon.map(line),
    '      ],',
    '      lat: [',
    ...grid.lat.map(line),
    '      ],',
    `      at: [${grid.at.map((row) => `[${row.map(point).join(', ')}]`).join(', ')}],`,
    '    },',
  ];
}

/** The layers of places a view may show (#429), in the order `maps.ts` names them. */
const LAYERS = ['cities', 'rivers', 'mountains'];

export function render(dir) {
  const eu = europe(dir);
  const views = [
    germany(dir),
    eu,
    world(dir),
    ...Object.keys(EUROPE_CLOSER).map((v) => closer(eu, v)),
  ].map(build);
  return {
    'mapNames.data.ts': renderNames(views),
    'maps.data.ts': renderViews(views),
    'mapShapes.data.ts': renderShapes(views),
  };
}

const [dir, flag] = process.argv.slice(2);
if (dir) {
  for (const [name, text] of Object.entries(render(dir))) {
    const file = join(here, '..', 'src', name);
    if (flag === '--check') {
      if (readFileSync(file, 'utf8') !== text) {
        console.error(`src/${name} is out of date: run packages/shared-math/scripts/maps.mjs`);
        process.exit(1);
      }
    } else {
      writeFileSync(file, text);
      console.log(`wrote src/${name} (${Math.round(text.length / 1024)} KB)`);
    }
  }
}
