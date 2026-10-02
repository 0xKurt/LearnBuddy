// Builds the map data the app draws and the server checks against (issue #251).
// docs/architecture.md §Practice ("Maps"); licence: docs/privacy.md §Processors and sources.
//
//   node packages/shared-maps/scripts/build-maps.mjs
//
// Source: Natural Earth (public domain, https://www.naturalearthdata.com/about/terms-of-use/),
// the GeoJSON of nvkelso/natural-earth-vector at the pinned tag below. The files are fetched
// with curl into a cache outside the repo (NE_DIR, default ~/.cache/learnbuddy-ne) and never
// committed; what is committed is the output in src/data/, simplified for a phone.
//
// What happens, per area (world, europe, germany):
//   1. project: an equirectangular projection with x scaled by cos(φ) of the area's middle —
//      meridians and parallels stay straight lines, so reading the graticule is exact;
//   2. clip to the area (with a margin, so a clipped edge lies outside the drawing);
//   3. simplify per ARC: a border two features share is simplified once and used by both, so
//      neighbours never overlap or leave a gap (Douglas–Peucker on the arc between junctions);
//   4. quantize to whole units of a 2000-unit-wide drawing and write SVG path strings.
// Names, ids, capitals and neighbours come from the data (see below), never from a model.
//
// Rivers: Natural Earth's large rivers carry only a local and an English name, and one river is
// split into differently named segments ("Rhein", "Rhine"). RIVERS below lists which segment
// names form one river and which of THEIR names is the German one. Every name in it is checked
// against the data, so the list can only select, never invent.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NE_TAG = 'v5.1.2';
const NE_BASE = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_TAG}/geojson`;
const NE_DIR = process.env.NE_DIR ?? join(homedir(), '.cache', 'learnbuddy-ne');
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data');

/** Units across the drawing. 2000 keeps a vertex under a point even at the largest zoom. */
const WIDTH = 2000;
const LANGS = ['de', 'en', 'fr', 'es', 'it'];

function load(name) {
  mkdirSync(NE_DIR, { recursive: true });
  const file = join(NE_DIR, `${name}.geojson`);
  if (!existsSync(file)) {
    console.log(`fetching ${name}`);
    execFileSync('curl', ['-sSfL', '-o', file, `${NE_BASE}/${name}.geojson`], {
      stdio: 'inherit',
    });
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

// ─────────────── areas ───────────────

const AREAS = {
  world: {
    west: -180,
    east: 180,
    south: -90,
    north: 90,
    mid: 0,
    tolerance: 1.6,
    minRing: 30,
    graticule: 15,
  },
  europe: {
    west: -25,
    east: 45,
    south: 34,
    north: 72,
    mid: 52,
    tolerance: 1.4,
    minRing: 40,
    graticule: 5,
  },
  germany: {
    west: 5.4,
    east: 15.6,
    south: 47.1,
    north: 55.2,
    mid: 51.2,
    tolerance: 1.0,
    minRing: 25,
    graticule: 1,
  },
};

/**
 * Rivers by area: the first name is the German one, the rest are the other names its
 * segments carry in Natural Earth (`name`, `name_en`). Every name must occur in the data.
 */
const RIVERS = {
  germany: [
    ['Rhein', 'Rhine'],
    ['Donau', 'Danube'],
    ['Elbe'],
    ['Oder'],
    ['Weser'],
    ['Main'],
    ['Mosel'],
    ['Ems'],
    ['Inn'],
  ],
  europe: [
    ['Rhein', 'Rhine', 'Rhin'],
    ['Donau', 'Danube'],
    ['Elbe'],
    ['Oder'],
    ['Seine'],
    ['Loire'],
    ['Rhône'],
    ['Po'],
    ['Ebro'],
    ['Tajo', 'Tejo'],
  ],
};

function projector(a) {
  const kx = Math.cos((a.mid * Math.PI) / 180);
  const q = WIDTH / ((a.east - a.west) * kx);
  const height = Math.round((a.north - a.south) * q);
  return {
    kx,
    q,
    width: WIDTH,
    height,
    p: ([lon, lat]) => [(lon - a.west) * kx * q, (a.north - lat) * q],
  };
}

// ─────────────── geometry ───────────────

/** Sutherland–Hodgman against an axis-aligned rectangle. Works on an open ring. */
function clipRing(ring, x0, y0, x1, y1) {
  const edges = [(p) => p[0] >= x0, (p) => p[0] <= x1, (p) => p[1] >= y0, (p) => p[1] <= y1];
  const cut = [
    (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])],
    (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])],
    (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0],
    (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1],
  ];
  let out = ring;
  for (let e = 0; e < 4; e++) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const inC = edges[e](cur);
      const inP = edges[e](prev);
      if (inC) {
        if (!inP) out.push(cut[e](prev, cur));
        out.push(cur);
      } else if (inP) out.push(cut[e](prev, cur));
    }
    if (out.length === 0) return [];
  }
  return out;
}

/** A polyline cut to the rectangle: the pieces inside it. */
function clipLine(line, x0, y0, x1, y1) {
  const inside = (p) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
  const pieces = [];
  let cur = [];
  for (let i = 0; i < line.length; i++) {
    const p = line[i];
    if (inside(p)) cur.push(p);
    else {
      if (cur.length) cur.push(p);
      if (cur.length > 1) pieces.push(cur);
      cur = [];
      const next = line[i + 1];
      if (next && inside(next)) cur.push(p);
    }
  }
  if (cur.length > 1) pieces.push(cur);
  return pieces;
}

function segDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  let t = len === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function douglasPeucker(pts, tol) {
  if (pts.length <= 2) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let best = -1;
    let at = -1;
    for (let k = i + 1; k < j; k++) {
      const d = segDist(pts[k], pts[i], pts[j]);
      if (d > best) {
        best = d;
        at = k;
      }
    }
    if (best > tol) {
      keep[at] = 1;
      stack.push([i, at], [at, j]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}

function ringArea(r) {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i];
    const b = r[(i + 1) % r.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

const key = (p) => `${p[0]},${p[1]}`;

/**
 * Simplifies every ring of every feature so that a stretch shared by two features is
 * simplified once (the same points for both). `feats` = [{ id, polys: [[ring, ...holes], ...] }].
 */
function simplifyShared(feats, tol) {
  const owners = new Map();
  feats.forEach((f, fi) => {
    for (const poly of f.polys)
      for (const ring of poly)
        for (const p of ring) {
          const k = key(p);
          let s = owners.get(k);
          if (!s) owners.set(k, (s = new Set()));
          s.add(fi);
        }
  });
  const sig = (p) => [...owners.get(key(p))].sort((a, b) => a - b).join(',');
  const cache = new Map();
  const simplifyArc = (arc) => {
    const fwd = `${key(arc[0])}|${key(arc[1] ?? arc[0])}|${key(arc[arc.length - 1])}|${arc.length}`;
    const rev = `${key(arc[arc.length - 1])}|${key(arc[arc.length - 2] ?? arc[0])}|${key(arc[0])}|${arc.length}`;
    const canonicalFwd = fwd <= rev;
    const k = canonicalFwd ? fwd : rev;
    let s = cache.get(k);
    if (!s) {
      const base = canonicalFwd ? arc : arc.slice().reverse();
      s = douglasPeucker(base, tol);
      cache.set(k, s);
    }
    return canonicalFwd ? s : s.slice().reverse();
  };
  const neighbours = feats.map(() => new Set());
  for (const s of owners.values())
    if (s.size > 1) for (const a of s) for (const b of s) if (a !== b) neighbours[a].add(b);

  const out = feats.map((f) => ({
    ...f,
    polys: f.polys.map((poly) =>
      poly.map((ring) => {
        const n = ring.length;
        const sigs = ring.map(sig);
        const junction = ring.map(
          (_, i) => sigs[i] !== sigs[(i + n - 1) % n] || sigs[i] !== sigs[(i + 1) % n],
        );
        const starts = [];
        for (let i = 0; i < n; i++) if (junction[i]) starts.push(i);
        if (starts.length === 0) {
          // A ring nobody shares: simplify it as two halves so it keeps an area.
          const half = Math.floor(n / 2);
          const a = douglasPeucker(ring.slice(0, half + 1), tol);
          const b = douglasPeucker([...ring.slice(half), ring[0]], tol);
          return [...a.slice(0, -1), ...b.slice(0, -1)];
        }
        const res = [];
        for (let s = 0; s < starts.length; s++) {
          const i = starts[s];
          const j = starts[(s + 1) % starts.length];
          const arc = [];
          for (let k = i; ; k = (k + 1) % n) {
            arc.push(ring[k]);
            if (k === j && arc.length > 1) break;
            if (arc.length > n + 1) break;
          }
          const simp = simplifyArc(arc);
          res.push(...simp.slice(0, -1));
        }
        return res;
      }),
    ),
  }));
  return { feats: out, neighbours };
}

function quantizeRing(ring) {
  const out = [];
  for (const p of ring) {
    const q = [Math.round(p[0]), Math.round(p[1])];
    const last = out[out.length - 1];
    if (!last || last[0] !== q[0] || last[1] !== q[1]) out.push(q);
  }
  while (
    out.length > 1 &&
    out[0][0] === out[out.length - 1][0] &&
    out[0][1] === out[out.length - 1][1]
  )
    out.pop();
  return out;
}

function pathOf(rings, closed) {
  return rings
    .map((r) => {
      let s = `M${r[0][0]} ${r[0][1]}`;
      if (r.length > 1) s += 'l';
      const parts = [];
      for (let i = 1; i < r.length; i++)
        parts.push(`${r[i][0] - r[i - 1][0]} ${r[i][1] - r[i - 1][1]}`);
      // Negative numbers carry their own separator in SVG path syntax.
      s += parts.join(' ').replace(/ -/g, '-');
      return closed ? `${s}z` : s;
    })
    .join('');
}

function pointInRing(p, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i];
    const b = r[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}

function distToPoly(p, poly) {
  let d = Infinity;
  for (const r of poly)
    for (let i = 0; i < r.length; i++) d = Math.min(d, segDist(p, r[i], r[(i + 1) % r.length]));
  const inside = pointInRing(p, poly[0]) && !poly.slice(1).some((h) => pointInRing(p, h));
  return inside ? d : -d;
}

/** The point deepest inside a polygon and its distance to the edge (grid search, refined). */
function polylabel(poly) {
  const xs = poly[0].map((p) => p[0]);
  const ys = poly[0].map((p) => p[1]);
  let x0 = Math.min(...xs);
  let x1 = Math.max(...xs);
  let y0 = Math.min(...ys);
  let y1 = Math.max(...ys);
  let best = [(x0 + x1) / 2, (y0 + y1) / 2];
  let bestD = distToPoly(best, poly);
  for (let round = 0; round < 6; round++) {
    const N = 24;
    for (let i = 0; i <= N; i++)
      for (let j = 0; j <= N; j++) {
        const p = [x0 + ((x1 - x0) * i) / N, y0 + ((y1 - y0) * j) / N];
        const d = distToPoly(p, poly);
        if (d > bestD) {
          bestD = d;
          best = p;
        }
      }
    const w = (x1 - x0) / 6;
    const h = (y1 - y0) / 6;
    x0 = best[0] - w;
    x1 = best[0] + w;
    y0 = best[1] - h;
    y1 = best[1] + h;
  }
  return {
    at: [Math.round(best[0]), Math.round(best[1])],
    r: Math.max(0, Math.round(bestD * 10) / 10),
  };
}

function polysOf(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}

function linesOf(geom) {
  if (geom.type === 'LineString') return [geom.coordinates];
  if (geom.type === 'MultiLineString') return geom.coordinates;
  return [];
}

const open = (ring) => {
  const r = ring.slice();
  const a = r[0];
  const b = r[r.length - 1];
  if (r.length > 1 && a[0] === b[0] && a[1] === b[1]) r.pop();
  return r;
};

// ─────────────── names ───────────────

const clean = (s) => (typeof s === 'string' && s.trim() !== '' ? s.trim() : null);

function namesFrom(props, upper) {
  const n = {};
  for (const l of LANGS) {
    const v = clean(props[upper ? `NAME_${l.toUpperCase()}` : `name_${l}`]);
    if (v) n[l] = v;
  }
  return n;
}

function altFrom(names, extra) {
  const seen = new Set(Object.values(names));
  const out = [];
  for (const e of extra) {
    const v = clean(e);
    if (!v) continue;
    for (const part of v.split('|')) {
      const p = part.trim();
      if (p && !seen.has(p)) {
        seen.add(p);
        out.push(p);
      }
    }
  }
  return out;
}

const slug = (s) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// ─────────────── one area ───────────────

function buildAreas(area, a, polySources) {
  const pr = projector(a);
  const m = 40;
  const box = [-m, -m, pr.width + m, pr.height + m];
  const feats = [];
  for (const src of polySources) {
    const polys = [];
    for (const poly of polysOf(src.geometry)) {
      const rings = poly
        .map((r) => clipRing(open(r).map(pr.p), ...box))
        .filter((r) => r.length >= 3);
      if (rings.length && rings[0].length >= 3) polys.push(rings);
    }
    if (polys.length) feats.push({ ...src, polys });
  }
  const { feats: simple, neighbours } = simplifyShared(feats, a.tolerance);
  const out = [];
  simple.forEach((f, fi) => {
    let polys = f.polys
      .map((poly) => poly.map(quantizeRing).filter((r) => r.length >= 3))
      .filter((poly) => poly.length && poly[0].length >= 3);
    if (!polys.length) return;
    const areaOf = (poly) => Math.abs(ringArea(poly[0]));
    const largest = polys.reduce((b, p) => (areaOf(p) > areaOf(b) ? p : b));
    // Islands too small to see are left out; the largest part always stays.
    polys = polys.filter((p) => p === largest || areaOf(p) >= a.minRing);
    polys = polys.map((poly) => [
      poly[0],
      ...poly.slice(1).filter((h) => Math.abs(ringArea(h)) >= a.minRing),
    ]);
    const all = polys.flat();
    const xs = all.flat().map((p) => p[0]);
    const ys = all.flat().map((p) => p[1]);
    const label = polylabel(largest);
    out.push({
      fi,
      id: f.id,
      layer: f.layer,
      names: f.names,
      alt: f.alt,
      d: pathOf(all, true),
      anchor: label.at,
      r: label.r,
      box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
      of: f.of ?? null,
    });
  });
  for (const f of out)
    f.neighbours = [...neighbours[f.fi]]
      .map((j) => simple[j])
      .filter((g) => g.id && g.layer === f.layer && g.id !== f.id)
      .map((g) => g.id)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .sort();
  return { pr, out };
}

function buildRivers(a, pr, groups, sources, multilingual) {
  const m = 40;
  const box = [-m, -m, pr.width + m, pr.height + m];
  const rivers = [];
  for (const g of groups) {
    const segs = sources.filter((f) => g.match(f.properties));
    if (!segs.length) throw new Error(`river ${g.names[0]} not in Natural Earth`);
    const pieces = [];
    for (const s of segs)
      for (const line of linesOf(s.geometry))
        for (const piece of clipLine(line.map(pr.p), ...box)) {
          const q = quantizeRing(douglasPeucker(piece, a.tolerance));
          if (q.length >= 2) pieces.push(q);
        }
    if (!pieces.length) continue;
    const len = pieces.reduce(
      (s, p) =>
        s + p.slice(1).reduce((t, q, i) => t + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0),
      0,
    );
    // A river that only grazes the area is not one she could be asked about.
    if (len < pr.width * 0.04) continue;
    const xs = pieces.flat().map((p) => p[0]);
    const ys = pieces.flat().map((p) => p[1]);
    const names = multilingual ? g.names : g.names;
    rivers.push({
      id: `r-${slug(g.id)}`,
      layer: 'rivers',
      names,
      alt: g.alt,
      d: pathOf(pieces, false),
      box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    });
  }
  return rivers;
}

function cityFrom(pr, f, of) {
  const p = f.properties;
  const [x, y] = pr.p([p.LONGITUDE, p.LATITUDE]);
  const names = namesFrom(p, true);
  return {
    id: `c-${slug(p.NAMEASCII || p.NAME)}`,
    layer: 'cities',
    names,
    alt: altFrom(names, [p.NAME, p.NAMEASCII, p.NAMEALT]),
    at: [Math.round(x), Math.round(y)],
    lat: Math.round(p.LATITUDE * 100) / 100,
    lon: Math.round(p.LONGITUDE * 100) / 100,
    of,
  };
}

function inArea(a, lon, lat) {
  return lon >= a.west && lon <= a.east && lat >= a.south && lat <= a.north;
}

// ─────────────── output ───────────────

const j = (v) => JSON.stringify(v);

function write(name, a, pr, areas, context, rivers, cities) {
  const constName = name.toUpperCase();
  const lines = [];
  lines.push(`// GENERATED by packages/shared-maps/scripts/build-maps.mjs — do not edit by hand.`);
  lines.push(`// Natural Earth ${NE_TAG} (public domain), simplified for a phone. Issue #251.`);
  lines.push(`import type { MapAreaData } from '../types.js';`);
  lines.push('');
  lines.push(`export const ${constName}: MapAreaData = {`);
  lines.push(`  id: '${name}',`);
  lines.push(`  west: ${a.west}, east: ${a.east}, south: ${a.south}, north: ${a.north},`);
  lines.push(`  kx: ${pr.kx}, q: ${pr.q}, width: ${pr.width}, height: ${pr.height},`);
  lines.push(`  graticule: ${a.graticule},`);
  lines.push(`  context: [`);
  for (const c of context) lines.push(`    ${j(c)},`);
  lines.push(`  ],`);
  lines.push(`  areas: [`);
  for (const f of areas)
    lines.push(
      `    ${j({ id: f.id, names: f.names, alt: f.alt, d: f.d, anchor: f.anchor, r: f.r, box: f.box, neighbours: f.neighbours, capital: f.capital ?? null })},`,
    );
  lines.push(`  ],`);
  lines.push(`  rivers: [`);
  for (const r of rivers)
    lines.push(`    ${j({ id: r.id, names: r.names, alt: r.alt, d: r.d, box: r.box })},`);
  lines.push(`  ],`);
  lines.push(`  cities: [`);
  for (const c of cities)
    lines.push(
      `    ${j({ id: c.id, names: c.names, alt: c.alt, at: c.at, lat: c.lat, lon: c.lon, of: c.of })},`,
    );
  lines.push(`  ],`);
  lines.push(`};`);
  const text = `${lines.join('\n')}\n`;
  writeFileSync(join(OUT, `${name}.ts`), text);
  console.log(
    `${name}: ${areas.length} areas, ${rivers.length} rivers, ${cities.length} cities, ${(text.length / 1024).toFixed(1)} KiB`,
  );
}

function countryFeature(f) {
  const p = f.properties;
  const code = clean(p.ADM0_A3);
  const names = namesFrom(p, true);
  // Features without an ISO code (Somaliland, N. Cyprus …) are drawn as land, never asked.
  const named = clean(p.ISO_A2_EH) && p.ISO_A2_EH !== '-99' && code;
  return {
    id: named ? code : null,
    layer: 'areas',
    names,
    alt: named ? altFrom(names, [p.NAME, p.NAME_LONG, p.FORMAL_EN, p.NAME_ALT, p.NAME_EN]) : [],
    geometry: f.geometry,
  };
}

function riverGroups(list, sources) {
  return list.map((names) => {
    for (const n of names)
      if (!sources.some((f) => f.properties.name === n || f.properties.name_en === n))
        throw new Error(`river name ${n} not in Natural Earth`);
    const set = new Set(names);
    const en = sources.find((f) => set.has(f.properties.name) && clean(f.properties.name_en))
      ?.properties.name_en;
    const nm = { de: names[0] };
    if (en && en !== names[0]) nm.en = en;
    else if (names.includes('Rhine')) nm.en = 'Rhine';
    return {
      id: names[0],
      names: nm,
      alt: names.filter((n) => !Object.values(nm).includes(n)),
      match: (p) => set.has(p.name),
    };
  });
}

function capitalsByCountry(places, cls) {
  const by = new Map();
  for (const f of places.features) {
    if (f.properties.FEATURECLA !== cls) continue;
    const k = f.properties.ADM0_A3;
    by.set(k, [...(by.get(k) ?? []), f]);
  }
  return by;
}

function main() {
  mkdirSync(OUT, { recursive: true });
  const places10 = load('ne_10m_populated_places');
  const caps0 = capitalsByCountry(places10, 'Admin-0 capital');
  const rivers10 = load('ne_10m_rivers_lake_centerlines').features;

  // world
  {
    const a = AREAS.world;
    const src = load('ne_110m_admin_0_countries').features.map(countryFeature);
    const { pr, out } = buildAreas('world', a, src);
    const r110 = load('ne_110m_rivers_lake_centerlines').features;
    // Natural Earth names the Yangtze twice ("Chang", "Yangtze"); its German name joins them.
    const byDe = new Map();
    for (const f of r110) {
      const k = f.properties.name_de;
      byDe.set(k, [...(byDe.get(k) ?? []), f]);
    }
    const groups = [...byDe.entries()].map(([de, fs]) => {
      const names = namesFrom(fs[0].properties, false);
      names.de = de;
      return {
        id: fs[0].properties.name_en ?? de,
        names,
        alt: altFrom(
          names,
          fs.flatMap((f) => [f.properties.name, f.properties.name_en]),
        ),
        match: (p) => p.name_de === de,
      };
    });
    const rivers = buildRivers(a, pr, groups, r110, true);
    const cities = [];
    for (const f of out) {
      const cs = caps0.get(f.id);
      if (cs?.length === 1) {
        const c = cityFrom(pr, cs[0], f.id);
        cities.push(c);
        f.capital = c.id;
      }
    }
    write(
      'world',
      a,
      pr,
      out.filter((f) => f.id),
      out.filter((f) => !f.id).map((f) => f.d),
      rivers,
      cities,
    );
  }

  // europe
  {
    const a = AREAS.europe;
    const src = load('ne_50m_admin_0_countries').features.map(countryFeature);
    const { pr, out } = buildAreas('europe', a, src);
    const rivers = buildRivers(a, pr, riverGroups(RIVERS.europe, rivers10), rivers10, false);
    const cities = [];
    for (const f of out) {
      const cs = caps0.get(f.id);
      if (cs?.length === 1 && inArea(a, cs[0].properties.LONGITUDE, cs[0].properties.LATITUDE)) {
        const c = cityFrom(pr, cs[0], f.id);
        cities.push(c);
        f.capital = c.id;
      }
    }
    write(
      'europe',
      a,
      pr,
      out.filter((f) => f.id),
      out.filter((f) => !f.id).map((f) => f.d),
      rivers,
      cities,
    );
  }

  // germany: the 16 Länder, the neighbouring countries as quiet context
  {
    const a = AREAS.germany;
    const states = load('ne_10m_admin_1_states_provinces').features.filter(
      (f) => f.properties.iso_a2 === 'DE',
    );
    if (states.length !== 16) throw new Error(`expected 16 Länder, got ${states.length}`);
    const stateSrc = states.map((f) => {
      // `name` is the short German name ("Bremen"); `name_de` may be the long one.
      const names = { ...namesFrom(f.properties, false), de: f.properties.name };
      return {
        id: f.properties.iso_3166_2,
        layer: 'areas',
        names,
        alt: altFrom(names, [f.properties.name_de, f.properties.name_alt, f.properties.name_local]),
        geometry: f.geometry,
      };
    });
    const neighbours = load('ne_10m_admin_0_countries')
      .features.filter((f) => f.properties.ADM0_A3 !== 'DEU')
      .map((f) => ({ id: null, layer: 'context', names: {}, alt: [], geometry: f.geometry }));
    const { pr, out } = buildAreas('germany', a, [...stateSrc, ...neighbours]);
    const rivers = buildRivers(a, pr, riverGroups(RIVERS.germany, rivers10), rivers10, false);
    const cities = [];
    for (const f of out.filter((o) => o.id)) {
      const name = f.names.de;
      const hits = places10.features.filter(
        (p) =>
          p.properties.ADM0_A3 === 'DEU' &&
          /capital/.test(p.properties.FEATURECLA) &&
          p.properties.ADM1NAME === name,
      );
      if (hits.length === 1) {
        const c = cityFrom(pr, hits[0], f.id);
        cities.push(c);
        f.capital = c.id;
      }
    }
    write(
      'germany',
      a,
      pr,
      out.filter((f) => f.id),
      out.filter((f) => !f.id).map((f) => f.d),
      rivers,
      cities,
    );
  }
}

main();
