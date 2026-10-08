// Named regions of a drawing — what each is called, and which one a finger means (issue #251): the Länder of a map, and
// — the same code — the parts of a labelled picture (#252). A tap on such a figure is a tap like
// every other (`tap.ts`, issue #248); this file only answers where its regions stand.
//
// A region is drawn in a frame `REGION_FRAME` wide, y down: its outline as rings of "x y x y …"
// (a hole is a ring inside another, even–odd) and the point its name belongs to (`at`). Which
// region a finger at (x, y) means (`regionAt`): a region smaller than a finger whose label it is
// near (Berlin inside Brandenburg, Luxembourg between three countries), else the region under it —
// the topmost, where a picture lays one part over another —, else the nearest one: a tap never
// misses, as on every tappable figure.
//
// Dependency-free and pixel-free: the app scales by the width it draws at, the server decides with
// the smallest room a figure is drawn in (`REGION_TAP_BOX`, `regionTappable`).

/** The languages a region is named in: the app's five. */
export const REGION_LANGS = ['de', 'en', 'fr', 'es', 'it'] as const;
export type RegionLang = (typeof REGION_LANGS)[number];

/** A region by name: its id, its name in each language, other names it goes by ("Nukleus"). */
export type RegionName = Readonly<Record<RegionLang, string>> & {
  id: string;
  alt: readonly string[];
};

/** "nordrhein westfalen", " Nordrhein-Westfalen " → one spelling: case, spaces and dashes. */
function fold(name: string): string {
  return name
    .normalize('NFC')
    .trim()
    .toLocaleLowerCase('de')
    .replace(/[\s\-‐‑–]+/g, ' ');
}

/**
 * The index of the region `name` names among `regions` — by its name in any of the five
 * languages, another name it goes by, or its id — or null when none has that name.
 */
export function regionNamed(regions: readonly RegionName[], name: string): number | null {
  const want = fold(name);
  if (want === '') return null;
  const i = regions.findIndex(
    (r) =>
      fold(r.id) === want ||
      REGION_LANGS.some((l) => fold(r[l]) === want) ||
      r.alt.some((a) => fold(a) === want),
  );
  return i < 0 ? null : i;
}

/** A region's name in `lang` (German where the app's language is none of the five). */
export function regionName(regions: readonly RegionName[], index: number, lang: string): string {
  const r = regions[index];
  if (!r) return '';
  return (REGION_LANGS as readonly string[]).includes(lang) ? r[lang as RegionLang] : r.de;
}

/** The width of the frame every region is drawn in. */
export const REGION_FRAME = 1000;

/** A region's shape: where it is labelled, and its rings as "x y x y …" in the frame. */
export type RegionShape = { at: readonly [number, number]; rings: readonly string[] };
/** The regions of one drawing, bottom to top. */
export type RegionSet = { regions: readonly RegionShape[] };

/** A ring as numbers: x0, y0, x1, y1, … */
type Ring = readonly number[];

const parsed = new WeakMap<RegionShape, Ring[]>();

/** The rings of a region as numbers (parsed once per shape). */
function ringsOf(shape: RegionShape): Ring[] {
  let rings = parsed.get(shape);
  if (!rings) {
    rings = shape.rings.map((r) => r.split(' ').map(Number));
    parsed.set(shape, rings);
  }
  return rings;
}

/** An SVG path of `rings` drawn `k` times the frame's size, the frame's (0, 0) at (x0, y0). */
export function regionPath(rings: readonly string[], k: number, x0 = 0, y0 = 0): string {
  return rings
    .map((r) => {
      const n = r
        .split(' ')
        .map((v, j) => Math.round((Number(v) * k + (j % 2 === 0 ? x0 : y0)) * 10) / 10);
      let d = '';
      for (let i = 0; i + 1 < n.length; i += 2) d += `${i === 0 ? 'M' : 'L'}${n[i]} ${n[i + 1]}`;
      return `${d}Z`;
    })
    .join('');
}

/**
 * Whether (x, y) lies inside the region: the winding number over all its rings is not zero — the
 * rule SVG fills with by default. An outline runs one way round and a hole the other (the
 * generators write them so), and two strokes of one part that cross (the tubes of a bicycle frame)
 * stay filled where they overlap.
 */
function inside(rings: readonly Ring[], x: number, y: number): boolean {
  let winding = 0;
  for (const r of rings) {
    const n = r.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = r[2 * i]!;
      const yi = r[2 * i + 1]!;
      const xj = r[2 * j]!;
      const yj = r[2 * j + 1]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        winding += yj > yi ? 1 : -1;
      }
    }
  }
  return winding !== 0;
}

/** The distance from (x, y) to the region's outline. */
function distance(rings: readonly Ring[], x: number, y: number): number {
  let best = Infinity;
  for (const r of rings) {
    const n = r.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = r[2 * j]!;
      const ay = r[2 * j + 1]!;
      const dx = r[2 * i]! - ax;
      const dy = r[2 * i + 1]! - ay;
      const len = dx * dx + dy * dy;
      const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len));
      best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
    }
  }
  return best;
}

/** The region's extent: [minX, minY, maxX, maxY]. */
function extent(rings: readonly Ring[]): [number, number, number, number] {
  const e: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings) {
    for (let i = 0; i + 1 < r.length; i += 2) {
      e[0] = Math.min(e[0], r[i]!);
      e[1] = Math.min(e[1], r[i + 1]!);
      e[2] = Math.max(e[2], r[i]!);
      e[3] = Math.max(e[3], r[i + 1]!);
    }
  }
  return e;
}

/** The centre of the largest circle inside a region, and its radius. */
export type RegionPole = { x: number; y: number; r: number };

const poles = new WeakMap<Pick<RegionShape, 'rings'>, RegionPole>();

/**
 * The largest circle inside the region, about: the best point of a 16 × 16 grid, then of a finer
 * grid around it, twice. Its centre is where an atlas writes a name (the generators put `at`
 * there); its radius is how wide a finger may be and still land in it — a bounding box would call
 * the thin ring of a cell wall large, this does not.
 */
export function regionPole(shape: Pick<RegionShape, 'rings'>): RegionPole {
  let pole = poles.get(shape);
  if (!pole) {
    const rings = shape.rings.map((r) => r.split(' ').map(Number));
    const [x0, y0, x1, y1] = extent(rings);
    let best: RegionPole = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, r: 0 };
    let [cx, cy, half] = [(x0 + x1) / 2, (y0 + y1) / 2, Math.max(x1 - x0, y1 - y0) / 2];
    for (let round = 0; round < 3; round++) {
      const step = (2 * half) / 16;
      for (let x = cx - half + step / 2; x < cx + half; x += step) {
        for (let y = cy - half + step / 2; y < cy + half; y += step) {
          if (!inside(rings, x, y)) continue;
          const r = distance(rings, x, y);
          if (r > best.r) best = { x, y, r };
        }
      }
      [cx, cy, half] = [best.x, best.y, step * 1.5];
    }
    pole = best;
    poles.set(shape, pole);
  }
  return pole;
}

/** The radius of the largest circle inside the region (`regionPole`). */
function inscribed(shape: RegionShape): number {
  return regionPole(shape).r;
}

/**
 * Whether a finger `reach` wide (half a touch target, in the frame's units at the size it is
 * drawn) fits nowhere inside the region: then a tap near its label means it, even where another
 * region lies under the finger.
 */
export function regionSmall(shape: RegionShape, reach: number): boolean {
  return inscribed(shape) < reach;
}

/**
 * How far around its label a small region catches a finger: `reach`, but at most half the way to
 * the next label — so no two catch each other's label, and Niedersachsen's label still means
 * Niedersachsen, not the Bremen beside it (the spacing of WCAG 2.2, 2.5.8).
 */
function catchRadius(set: RegionSet, i: number, reach: number): number {
  const [x, y] = set.regions[i]!.at;
  let r = reach;
  set.regions.forEach((s, j) => {
    if (j !== i) r = Math.min(r, Math.hypot(s.at[0] - x, s.at[1] - y) / 2);
  });
  return r;
}

/**
 * The region a finger at (x, y) means, in the frame's units: a small region whose label it is near
 * (`catchRadius`), else the topmost region under the finger, else the nearest one.
 */
export function regionAt(set: RegionSet, x: number, y: number, reach: number): number {
  let near = -1;
  let nearD = Infinity;
  set.regions.forEach((s, i) => {
    const d = Math.hypot(s.at[0] - x, s.at[1] - y);
    // Cheap first: only a label within reach is measured at all.
    if (d <= reach && d < nearD && d <= catchRadius(set, i, reach) && regionSmall(s, reach)) {
      [near, nearD] = [i, d];
    }
  });
  if (near >= 0) return near;
  for (let i = set.regions.length - 1; i >= 0; i--) {
    if (inside(ringsOf(set.regions[i]!), x, y)) return i;
  }
  let best = 0;
  let bestD = Infinity;
  set.regions.forEach((s, i) => {
    const d = distance(ringsOf(s), x, y);
    if (d < bestD) [best, bestD] = [i, d];
  });
  return best;
}

/**
 * The smallest room such a figure is drawn in, in pt: a 360 × 740 phone, its width minus the
 * margins of the answer, its height what the board may take there (`boardCap`,
 * apps/mobile/lib/practice/visuals.ts). A tall figure — Germany — is drawn narrower to fit. What
 * can be tapped is decided in this room, the hardest case.
 */
export const REGION_TAP_BOX = { width: 320, height: 330 } as const;
/** Half a finger: a 44 pt target (`TOUCH`), in pt. */
const REACH_PT = 22;

/**
 * Half the target a region needs before a question may ask to tap it, in pt: a part of a picture a
 * whole finger (44 pt, `TOUCH` — we draw the pictures, so we draw them big enough, #252); a region
 * of a map at least the 24 pt of WCAG 2.2 (2.5.8) — its countries are as small as they are.
 */
export const TAP_TARGET = { picture: REACH_PT, map: 12 } as const;

/** `pt` on a drawing `width` pt wide, in the frame's units. */
function units(pt: number, width: number): number {
  return (pt * REGION_FRAME) / width;
}

/** Half a finger on a drawing `width` pt wide, in the frame's units (`regionAt`'s reach). */
export function regionReach(width: number): number {
  return units(REACH_PT, width);
}

/** How wide a drawing `height` high in the frame is drawn in the smallest room (`REGION_TAP_BOX`). */
export function regionTapWidth(height: number): number {
  return Math.min(REGION_TAP_BOX.width, (REGION_TAP_BOX.height * REGION_FRAME) / height);
}

/**
 * Whether region `i` of a drawing `height` high can be asked for by a tap: in the smallest room a
 * target `half` pt from its middle (`TAP_TARGET`) fits inside it, or it catches one around its
 * label. Luxembourg on the map of Europe does neither, nor does the pupil of an eye — a question to
 * tap it is dropped; naming it stays possible.
 */
export function regionTappable(set: RegionSet, i: number, height: number, half: number): boolean {
  const shape = set.regions[i];
  if (!shape) return false;
  const width = regionTapWidth(height);
  const least = units(half, width);
  // A region narrower than that is small, so its label catches; wider ones are hit directly.
  return inscribed(shape) >= least || catchRadius(set, i, regionReach(width)) >= least;
}
