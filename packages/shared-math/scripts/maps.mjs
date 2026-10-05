// Writes src/maps.data.ts (names) and src/mapShapes.data.ts (shapes) from Natural Earth (public domain, naturalearthdata.com), issue #251.
// The regions a map question is checked against — their names in five languages, their shapes,
// where each is labelled (`regionPole`) — come from this data, never from a model and never typed in by hand.
//
// Three views, each a stummer Ausschnitt as school atlases print them:
//   de     — the 16 Bundesländer (admin-1, 1:10m), equirectangular around 51° N;
//   europe — the countries of Europe (admin-0, 1:50m), Lambert azimuthal equal-area around
//            10° E 52° N (the projection of the EU's own maps), cut to the frame of a school map;
//            the land around it (Turkey, North Africa, the Caucasus) drawn as context, not tappable;
//   world  — the seven continents (admin-0, 1:110m, grouped by continent; Russia split at the
//            Ural, 60° E, as German schools draw it), Natural Earth projection.
//
// Shapes are projected, simplified (Douglas–Peucker) and written as integers in a frame 1000
// wide, rings as "x y x y …" strings. Islands smaller than a finger at that scale are dropped,
// never a whole region.
//
//   node packages/shared-math/scripts/maps.mjs <dir>          write both files from the .geojson in <dir>
//   node packages/shared-math/scripts/maps.mjs <dir> --check  fail if either file is out of date
//
// <dir> holds ne_10m_admin_1_states_provinces, ne_50m_admin_0_countries and
// ne_110m_admin_0_countries as .geojson, from github.com/nvkelso/natural-earth-vector (tag below).

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
  return {
    view: 'europe',
    project,
    bounds: [x0, y0, x1, y1],
    borders: true,
    tol: 0.9,
    minIsland: 30,
    regions,
    context,
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
    // Never drop a whole region: a region of small islands keeps its largest one.
    const out = big.length > 0 || !keepOne ? big : [kept.sort((a, b) => area(b) - area(a))[0]];
    return out.map((r) => r.flat().join(' '));
  };
  return {
    view: spec.view,
    height,
    borders: spec.borders,
    regions: regions
      .map((g) => {
        const rings = shape(g.rings, true);
        const pole = regionPole({ rings });
        return {
          id: g.id,
          names: g.names,
          alt: g.alt,
          at: [Math.round(pole.x), Math.round(pole.y)],
          rings,
        };
      })
      .sort((a, b) => a.names.de.localeCompare(b.names.de, 'de')),
    context: shape(context, false, spec.tol * 2),
  };
}

const HEADER = [
  `// GENERATED by packages/shared-math/scripts/maps.mjs from ${SOURCE}.`,
  '// Do not edit: run the script. Issue #251. Natural Earth: "All versions of Natural Earth raster +',
  '// vector map data found on this website are in the public domain." Made with Natural Earth.',
];

const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** The regions of every view by name: what the server checks a key against (`maps.ts`). */
function renderNames(views) {
  const region = (g) =>
    `    { id: ${q(g.id)}, de: ${q(g.names.de)}, en: ${q(g.names.en)}, fr: ${q(g.names.fr)}, es: ${q(g.names.es)}, it: ${q(g.names.it)}, alt: [${g.alt.map(q).join(', ')}] },`;
  return [
    ...HEADER,
    '',
    "import type { MapNames, MapView } from './maps.js';",
    '',
    '/** The regions of each view in drawing order, with their names in the five languages. */',
    'export const MAP_NAMES: MapNames = {',
    ...views.flatMap((v) => [`  ${v.view}: [`, ...v.regions.map(region), '  ],']),
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
    `      { at: [${g.at.join(', ')}], rings: [${g.rings.map(q).join(', ')}] },`;
  return [
    ...HEADER,
    '// Shapes in a frame 1000 wide, y down; a ring is "x y x y …" (`RegionShape` in regions.ts).',
    '',
    "import type { MapShapes } from './maps.js';",
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
      '  },',
    ]),
    '};',
    '',
  ].join('\n');
}

export function render(dir) {
  const views = [germany(dir), europe(dir), world(dir)].map(build);
  return { 'maps.data.ts': renderNames(views), 'mapShapes.data.ts': renderShapes(views) };
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
