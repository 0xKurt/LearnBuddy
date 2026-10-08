// The picture library (issue #252): schematic drawings of the things school asks to label — a
// plant cell, an eye, a flower, a bicycle — each a set of NAMED PARTS. docs/architecture.md
// §Practice, Labelled pictures.
//
// A drawing is code, never a model's output, in two files like the maps (#251): its parts' names
// (`schematics.data.ts`, small, static — the server checks every question against them) and
// where each part stands (`schematicShapes.data.ts`, drawn in the app's pastel tones, loaded by
// the app with the first picture). The model only picks a drawing and names parts; code resolves the names against the
// library (any of the five languages, other names a part goes by — "Nukleus"), and the key of a
// question is a part of the drawing or the question is dropped (`apps/api/src/modules/practice/
// schematicCheck.ts`).
//
// A part is a region like a Land on a map (`regions.ts`, issue #251): its outline, the point its
// name and number belong to, which part a finger means. A labelled picture is answered by
// tapping a part — the tap mechanism of every figure (`tap.ts`, issue #248) — or by naming the
// part with a number.
//
// Dependency-free on purpose: the app imports it by path, like `tap.ts`.

import type { RegionName, RegionSet, RegionShape } from './regions.js';
import { regionName, regionNamed } from './regions.js';
import { SCHEMATIC_NAMES } from './schematics.data.js';

/** A drawing by name: what it and each of its parts are called. */
export type Schematic = {
  /** The drawing's name in the five languages ("Pflanzenzelle"). */
  names: Omit<RegionName, 'id' | 'alt'>;
  /** How high it stands in the frame 1000 wide (`REGION_FRAME`): its room while it loads. */
  height: number;
  /**
   * The box of the frame the drawing fills, [x0, y0, x1, y1] (#462): a picture with numbers is cut
   * to it, so its columns stand beside the drawing rather than beside empty paper — a tall, narrow
   * skeleton is drawn twice as large. A picture to tap fills the whole frame, as the server
   * measured its parts (`regionTappable`).
   */
  bounds: readonly [number, number, number, number];
  /** Its parts, bottom to top: a part drawn later lies over an earlier one. */
  parts: readonly RegionName[];
};

/** Where a part stands, in the order of the names: its outline, its point, its pastel tone. */
export type SchematicPartShape = RegionShape & {
  id: string;
  /** The index of its tone among the figure's pastels (`figure.slices`); -1: the ink itself. */
  tone: number;
};
/** A drawing's shapes: its parts, and lines that belong to no part (spokes, the ground). */
export type SchematicShape = {
  lines: readonly string[];
  parts: readonly SchematicPartShape[];
  /**
   * What is drawn on the parts without being a part: a sign's white symbol, its black walker, a
   * fish's eye. White stays white and black stays black in the dark room too — a sign looks the
   * same at night. A tap on a mark means the part below.
   */
  marks?: { white?: readonly string[]; black?: readonly string[] };
};

/** A drawing of the library: one of the names `schematics.data.ts` gives. */
export type SchematicId = keyof typeof SCHEMATIC_NAMES;
/**
 * Every drawing, in the order of its names. The contract lists the same ids for the model
 * (`SCHEMATIC_DRAWINGS`, packages/shared-types); a test in the API holds the two lists equal.
 */
export const SCHEMATIC_IDS = Object.keys(SCHEMATIC_NAMES) as SchematicId[];
export type SchematicShapes = Readonly<Record<SchematicId, SchematicShape>>;

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

/** A drawing of the library, by name. */
export function schematic(d: SchematicId): Schematic {
  return SCHEMATIC_NAMES[d];
}

/** The parts of a drawing as regions (`regions.ts`): what a finger can mean. */
export function schematicRegions(shapes: SchematicShapes, d: SchematicId): RegionSet {
  return { regions: shapes[d].parts };
}

/** The index of the part `name` names in drawing `d` ("Zellkern", "nucleus", "Nukleus"). */
export function schematicPart(d: SchematicId, name: string): number | null {
  return regionNamed(SCHEMATIC_NAMES[d].parts, name);
}

/** A part's name in `lang` (German where the app's language is none of the five). */
export function schematicPartName(d: SchematicId, index: number, lang: string): string {
  return regionName(SCHEMATIC_NAMES[d].parts, index, lang);
}

/** The parts that carry the numbers 1, 2, 3 … (a name no part has numbers nothing). */
export function schematicNumbered(f: SchematicFig): number[] {
  return f.n.map((name) => schematicPart(f.d, name)).filter((i): i is number => i !== null);
}

/**
 * The first reason a drawing cannot be shown as written, or null: a numbered part the drawing does
 * not have, a part numbered twice, a number asked that no part carries.
 */
export function schematicProblem(f: SchematicFig): string | null {
  const parts = f.n.map((name) => schematicPart(f.d, name));
  const unknown = f.n.find((_, i) => parts[i] === null);
  if (unknown !== undefined) return `no part "${unknown}" in the drawing ${f.d}`;
  if (new Set(parts).size !== parts.length) return 'a part is numbered twice';
  if (f.ask > f.n.length) return `no part carries the number ${f.ask}`;
  return null;
}

/** The drawing with every numbered part written as its id ("Nukleus" → "nucleus"): what is stored. */
export function schematicCanonical<F extends SchematicFig>(f: F): F {
  const parts = SCHEMATIC_NAMES[f.d].parts;
  return { ...f, n: f.n.map((name) => parts[schematicPart(f.d, name) ?? -1]?.id ?? name) };
}
