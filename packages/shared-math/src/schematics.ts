// The picture library (issue #252): the things school asks to label — a plant cell, an eye, a
// flower, a bicycle — each a set of NAMED PARTS. docs/architecture.md §Practice, Labelled pictures.
//
// A picture is code and data, never a model's output: its parts' names (`schematics.data.ts` — the
// server checks every question against them; the app loads them with the first map or picture,
// `figureNames.ts`, #440, and every function here that resolves a name is handed them) and where
// each part stands. Since #599 (docs/adr/0009-labelled-pictures-are-images.md) a picture is a real
// image with its anchors as data (`schematicAnchors.data.ts`): per part the point on the motif,
// where its number stands and the area a finger hits, in the image's frame 300 wide. One picture
// is still drawn by us — the circuit, for which no free image exists (`SCHEMATIC_DRAWN`,
// `schematicShapes.data.ts`). Only how high each picture stands is here: its room while it loads.
// The model only picks a picture and names parts; code resolves the names against the library (any
// of the five languages, other names a part goes by — "Nukleus"), and the key of a question is a
// part of the picture or the question is dropped (`apps/api/src/modules/practice/
// schematicCheck.ts`).
//
// A labelled picture is answered by tapping a part — the tap mechanism of every figure (`tap.ts`,
// issue #248) — or by naming the part with a number.
//
// Dependency-free on purpose: the app imports it by path, like `tap.ts`.

import type { FigureNames } from './figureNames.js';
import type { RegionName, RegionSet, RegionShape } from './regions.js';
import {
  REGION_FRAME,
  REGION_TAP_BOX,
  regionName,
  regionNamed,
  regionTappable,
  TAP_TARGET,
} from './regions.js';

/** A picture by name: what it and each of its parts are called. */
export type Schematic = {
  /** The picture's name in the five languages ("Pflanzenzelle"). */
  names: Omit<RegionName, 'id' | 'alt'>;
  /** Its parts, in the order of its anchors (a drawing's: bottom to top). */
  parts: readonly RegionName[];
};

/** Where a part of a drawing stands, in the order of the names: its outline, its point, its tone. */
export type SchematicPartShape = RegionShape & {
  id: string;
  /** The index of its tone among the figure's pastels (`figure.slices`); -1: the ink itself. */
  tone: number;
};
/** A drawing's shapes: its parts, and lines that belong to no part. */
export type SchematicShape = {
  lines: readonly string[];
  parts: readonly SchematicPartShape[];
  /**
   * What is drawn on the parts without being a part: a battery's plus and minus, a bulb's wire.
   * White stays white and black stays black in the dark room too. A tap on a mark means the part
   * below.
   */
  marks?: { white?: readonly string[]; black?: readonly string[] };
};

/**
 * Where a part of an image stands, in the image's frame (`SCHEMATIC_IMAGE_WIDTH` wide, y down,
 * origin top left): `at` the point on the motif its leader line starts at, `badge` where its
 * number stands, `tap` the area a finger hits as [x, y, width, height] — at least 44 × 44, and
 * where two areas overlap the anchor nearest the finger wins (`anchorAt`).
 */
export type SchematicAnchor = {
  id: string;
  at: readonly [number, number];
  badge: readonly [number, number];
  tap: readonly [number, number, number, number];
};

/** The width of the frame every image's anchors are written in. */
export const SCHEMATIC_IMAGE_WIDTH = 300;

/**
 * The pictures that are images, each with the height of its frame `SCHEMATIC_IMAGE_WIDTH` wide —
 * known before its names and anchors are: its room while it loads. In the order of the contract's
 * list (`SCHEMATIC_DRAWINGS`, packages/shared-types), which a test in the API holds equal.
 */
const IMAGE_HEIGHTS = {
  plant_cell: 232,
  animal_cell: 266,
  flower: 268,
  plant: 420,
  eye: 333,
  tooth: 420,
  insect: 223,
  bicycle: 183,
  microscope: 411,
  lab: 213,
  heart: 368,
  ear: 231,
  skeleton: 420,
  organs: 420,
  signs: 200,
  instruments: 200,
  anlaut: 150,
  flower_section: 268,
  eye_front: 159,
  insect_head: 380,
  teeth: 420,
  joint: 420,
  breathing: 420,
  digestion: 420,
  leaf: 289,
  neuron: 420,
  mushroom: 420,
  seedling: 249,
  distillation: 408,
  earth: 310,
  volcano: 227,
  compass: 300,
  thermometer: 420,
  moon_phases: 300,
} as const satisfies Record<string, number>;

/**
 * The pictures we still draw ourselves, each with the reason it has no image — the one exception
 * to "every picture is an image" (#599). In the frame 1000 wide (`REGION_FRAME`): how high it
 * stands, and the box it fills, [x0, y0, x1, y1] (#462): a drawing with numbers is cut to that
 * box, so its columns stand beside the drawing, not beside empty paper.
 */
export const SCHEMATIC_DRAWN = {
  circuit: {
    height: 720,
    bounds: [130, 10, 900, 690],
    why: 'no free image shows real components (battery, bulb in its holder, switch, wires) — only diagrams of symbols',
  },
} as const satisfies Record<string, { height: number; bounds: readonly number[]; why: string }>;

export type SchematicImageId = keyof typeof IMAGE_HEIGHTS;
export type SchematicDrawnId = keyof typeof SCHEMATIC_DRAWN;
export type SchematicId = SchematicImageId | SchematicDrawnId;
/** Every picture that is an image, in the order of the frames. */
export const SCHEMATIC_IMAGE_IDS = Object.keys(IMAGE_HEIGHTS) as SchematicImageId[];
/** Every picture of the library: the images, then what we draw. */
export const SCHEMATIC_IDS: SchematicId[] = [
  ...SCHEMATIC_IMAGE_IDS,
  ...(Object.keys(SCHEMATIC_DRAWN) as SchematicDrawnId[]),
];
export type SchematicNames = Readonly<Record<SchematicId, Schematic>>;
export type SchematicShapes = Readonly<Record<SchematicDrawnId, SchematicShape>>;
/** Every image's anchors, its parts in the order of their names. */
export type SchematicAnchors = Readonly<Record<SchematicImageId, readonly SchematicAnchor[]>>;
/** Where the parts of the pictures stand: the images' anchors and the drawings' shapes. */
export type SchematicPlaces = { anchors: SchematicAnchors; shapes: SchematicShapes };

/** Whether picture `d` is an image with anchors; else it is one of `SCHEMATIC_DRAWN`. */
export function isImageSchematic(d: SchematicId): d is SchematicImageId {
  return d in IMAGE_HEIGHTS;
}

/** The shape of `SchematicFigure` (packages/shared-types/src/contracts/schematic.ts). */
export type SchematicFig = {
  type: 'schematic';
  d: SchematicId;
  /** The parts that carry the numbers 1, 2, 3 … by name. */
  n: readonly string[];
  /** The number whose part is the key ("Wie heißt Teil 3?"); 0 on a question that is tapped. */
  ask: number;
};

export function isSchematic(f: { type: string }): f is SchematicFig {
  return f.type === 'schematic';
}

/** A picture of the library, by name. */
export function schematic(names: FigureNames, d: SchematicId): Schematic {
  return names.pictures[d];
}

/**
 * The frame picture `d` stands in — known before its names, anchors or shapes are: an image's own
 * frame (`SCHEMATIC_IMAGE_WIDTH` wide), a drawing's 1000 wide. Every position of the picture is
 * written in it.
 */
export function schematicFrame(d: SchematicId): { width: number; height: number } {
  return isImageSchematic(d)
    ? { width: SCHEMATIC_IMAGE_WIDTH, height: IMAGE_HEIGHTS[d] }
    : { width: REGION_FRAME, height: SCHEMATIC_DRAWN[d].height };
}

/**
 * The box picture `d` fills in its frame, [x0, y0, x1, y1]: an image its whole frame, a drawing
 * the box it is cut to when it carries numbers (#462).
 */
export function schematicBounds(d: SchematicId): readonly [number, number, number, number] {
  return isImageSchematic(d)
    ? [0, 0, SCHEMATIC_IMAGE_WIDTH, IMAGE_HEIGHTS[d]]
    : SCHEMATIC_DRAWN[d].bounds;
}

/** The parts of a drawing as regions (`regions.ts`): what a finger can mean. */
export function schematicRegions(shapes: SchematicShapes, d: SchematicDrawnId): RegionSet {
  return { regions: shapes[d].parts };
}

/** A whole finger, in pt: the least a tap area is on the screen (44 pt, `TOUCH`). */
const FINGER = 2 * TAP_TARGET.picture;
/** How far apart two anchors of an image stand before a tap may ask for either, in pt. */
const APART = 2 * TAP_TARGET.image;

/**
 * A finger at the width an image is drawn at, in the frame's units: the smallest a tap area may
 * be on the screen (`anchorAt`'s `least`).
 */
export function anchorFinger(width: number): number {
  return (FINGER * SCHEMATIC_IMAGE_WIDTH) / width;
}

/**
 * The part of an image a finger at (x, y) means, in the frame's units: of the parts whose tap area
 * holds the point, the one whose anchor is nearest; where none does, the nearest anchor of all — a
 * tap never misses, as on every tappable figure (`regionAt`). `least`: the smallest a tap area may
 * be (`anchorFinger`): a smaller one grows about its middle, so a picture drawn narrower than its
 * frame keeps 44 pt on the screen.
 */
export function anchorAt(
  anchors: readonly SchematicAnchor[],
  x: number,
  y: number,
  least = 0,
): number {
  let [held, heldD, near, nearD] = [-1, Infinity, 0, Infinity];
  anchors.forEach((a, i) => {
    const d = Math.hypot(a.at[0] - x, a.at[1] - y);
    if (d < nearD) [near, nearD] = [i, d];
    const [tx, ty, tw, th] = a.tap;
    const [w, h] = [Math.max(tw, least), Math.max(th, least)];
    const [x0, y0] = [tx + (tw - w) / 2, ty + (th - h) / 2];
    if (x >= x0 && x <= x0 + w && y >= y0 && y <= y0 + h && d < heldD) [held, heldD] = [i, d];
  });
  return held >= 0 ? held : near;
}

/** How wide an image `height` high in its frame is drawn in the smallest room (`REGION_TAP_BOX`). */
function imageTapWidth(height: number): number {
  return Math.min(REGION_TAP_BOX.width, (REGION_TAP_BOX.height * SCHEMATIC_IMAGE_WIDTH) / height);
}

/**
 * Whether part `i` of an image can be asked for by a tap: in the smallest room the next anchor
 * stands at least 24 pt away (`TAP_TARGET.image`, the spacing of WCAG 2.2, 2.5.8) — where two tap
 * areas overlap the nearer anchor wins (`anchorAt`), so that much around its own anchor means this
 * part and no other. The radius and the ulna of the skeleton stand closer: a question to tap one
 * is dropped; naming it stays possible.
 */
function anchorTappable(anchors: readonly SchematicAnchor[], i: number, height: number): boolean {
  const own = anchors[i];
  if (!own) return false;
  const pt = imageTapWidth(height) / SCHEMATIC_IMAGE_WIDTH;
  return anchors.every(
    (a, j) => j === i || Math.hypot(a.at[0] - own.at[0], a.at[1] - own.at[1]) * pt >= APART,
  );
}

/**
 * Whether a finger can hit part `i` of picture `d` on the narrowest phone: an image's part by its
 * anchor (`anchorTappable`), a drawing's by its outline, a whole finger wide (`regionTappable`).
 */
export function schematicTappable(places: SchematicPlaces, d: SchematicId, i: number): boolean {
  if (isImageSchematic(d)) return anchorTappable(places.anchors[d], i, IMAGE_HEIGHTS[d]);
  return regionTappable(
    schematicRegions(places.shapes, d),
    i,
    SCHEMATIC_DRAWN[d].height,
    TAP_TARGET.picture,
  );
}

/** The index of the part `name` names in picture `d` ("Zellkern", "nucleus", "Nukleus"). */
export function schematicPart(names: FigureNames, d: SchematicId, name: string): number | null {
  return regionNamed(names.pictures[d].parts, name);
}

/** A part's name in `lang` (German where the app's language is none of the five). */
export function schematicPartName(
  names: FigureNames,
  d: SchematicId,
  index: number,
  lang: string,
): string {
  return regionName(names.pictures[d].parts, index, lang);
}

/**
 * The parts that carry the numbers 1, 2, 3 …, or null when a name is no part of the picture: then
 * no number may be drawn at all — dropping the one name would hand its number to the next part,
 * and "Wie heißt Teil 3?" would point at another one (#599: a stored question may name a part the
 * picture no longer shows).
 */
export function schematicNumbered(names: FigureNames, f: SchematicFig): number[] | null {
  const parts = f.n.map((name) => schematicPart(names, f.d, name));
  return parts.every((i): i is number => i !== null) ? parts : null;
}

/**
 * The first reason a picture cannot be shown as written, or null: a numbered part the picture does
 * not have, a part numbered twice, a number asked that no part carries.
 */
export function schematicProblem(names: FigureNames, f: SchematicFig): string | null {
  const parts = f.n.map((name) => schematicPart(names, f.d, name));
  const unknown = f.n.find((_, i) => parts[i] === null);
  if (unknown !== undefined) return `no part "${unknown}" in the picture ${f.d}`;
  if (new Set(parts).size !== parts.length) return 'a part is numbered twice';
  if (f.ask > f.n.length) return `no part carries the number ${f.ask}`;
  return null;
}

/** The picture with every numbered part written as its id ("Nukleus" → "nucleus"): what is stored. */
export function schematicCanonical<F extends SchematicFig>(names: FigureNames, f: F): F {
  const parts = names.pictures[f.d].parts;
  return {
    ...f,
    n: f.n.map((name) => parts[schematicPart(names, f.d, name) ?? -1]?.id ?? name),
  };
}
