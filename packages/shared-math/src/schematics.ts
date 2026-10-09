// The picture library (issue #252): schematic drawings of the things school asks to label — a
// plant cell, an eye, a flower, a bicycle — each a set of NAMED PARTS. docs/architecture.md
// §Practice, Labelled pictures.
//
// A drawing is code, never a model's output, in two files like the maps (#251): its parts' names
// (`schematics.data.ts` — the server checks every question against them; the app loads them with
// the first map or picture, `figureNames.ts`, #440, and every function here that resolves a name
// is handed them) and where each part stands (`schematicShapes.data.ts`, drawn in the app's pastel
// tones, loaded by the app with the first picture). Only how high each drawing stands is here: its
// room while it loads. The model only picks a drawing and names parts; code resolves the names against the
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

import type { FigureNames } from './figureNames.js';
import type { RegionName, RegionSet, RegionShape } from './regions.js';
import { regionName, regionNamed } from './regions.js';

/** A drawing by name: what it and each of its parts are called. */
export type Schematic = {
  /** The drawing's name in the five languages ("Pflanzenzelle"). */
  names: Omit<RegionName, 'id' | 'alt'>;
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

/**
 * Where each drawing of the library stands in the frame 1000 wide (`REGION_FRAME`), known before
 * its names and shapes are: how high it is — its room while it loads — and the box it fills,
 * [x0, y0, x1, y1] (#462): a picture with numbers is cut to that box, so its columns stand beside
 * the drawing, not beside empty paper. Held to the drawings' outlines in `schematics.test.ts`. The
 * keys are the library's drawings; the contract lists the same ids for the model
 * (`SCHEMATIC_DRAWINGS`, packages/shared-types), a test in the API holds the two lists equal.
 */
const SCHEMATIC_FRAMES = {
  plant_cell: { height: 720, bounds: [140, 50, 860, 670] },
  animal_cell: { height: 640, bounds: [140, 20, 880, 600] },
  flower: { height: 820, bounds: [240, 220, 760, 830] },
  plant: { height: 880, bounds: [110, 110, 890, 860] },
  eye: { height: 640, bounds: [280, 70, 940, 570] },
  tooth: { height: 900, bounds: [180, 70, 820, 890] },
  insect: { height: 820, bounds: [180, 100, 820, 800] },
  bicycle: { height: 620, bounds: [90, 100, 920, 580] },
  microscope: { height: 960, bounds: [230, 30, 790, 950] },
  lab: { height: 1060, bounds: [140, 10, 890, 1050] },
  heart: { height: 900, bounds: [180, 0, 980, 900] },
  ear: { height: 700, bounds: [10, 50, 990, 700] },
  skeleton: { height: 1030, bounds: [260, 0, 740, 1030] },
  organs: { height: 1000, bounds: [270, 0, 730, 1000] },
  signs: { height: 900, bounds: [120, 30, 890, 880] },
  instruments: { height: 900, bounds: [60, 70, 970, 850] },
  anlaut: { height: 1060, bounds: [130, 30, 910, 1040] },
  flower_section: { height: 910, bounds: [30, 80, 970, 910] },
  eye_front: { height: 820, bounds: [250, 20, 1000, 800] },
  insect_head: { height: 900, bounds: [170, 80, 830, 880] },
  teeth: { height: 820, bounds: [50, 50, 950, 720] },
  joint: { height: 940, bounds: [240, 10, 760, 950] },
  breathing: { height: 1000, bounds: [180, 10, 820, 1000] },
  digestion: { height: 1000, bounds: [150, 0, 820, 1010] },
  leaf: { height: 640, bounds: [50, 50, 960, 590] },
  neuron: { height: 620, bounds: [30, 40, 980, 610] },
  mushroom: { height: 960, bounds: [50, 90, 950, 950] },
  seedling: { height: 980, bounds: [110, 190, 890, 970] },
  distillation: { height: 840, bounds: [10, 90, 990, 830] },
  earth: { height: 1000, bounds: [20, 20, 980, 980] },
  volcano: { height: 990, bounds: [10, 20, 990, 990] },
  compass: { height: 1000, bounds: [20, 20, 980, 980] },
  thermometer: { height: 940, bounds: [320, 20, 680, 940] },
  moon_phases: { height: 1000, bounds: [60, 60, 940, 940] },
  circuit: { height: 720, bounds: [130, 10, 900, 690] },
} as const satisfies Record<string, { height: number; bounds: readonly number[] }>;
export type SchematicId = keyof typeof SCHEMATIC_FRAMES;
/** Every drawing of the library, in the order of the frames. */
export const SCHEMATIC_IDS = Object.keys(SCHEMATIC_FRAMES) as SchematicId[];
export type SchematicNames = Readonly<Record<SchematicId, Schematic>>;
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
export function schematic(names: FigureNames, d: SchematicId): Schematic {
  return names.pictures[d];
}

/** How high drawing `d` stands in the frame 1000 wide — known before its names and shapes are. */
export function schematicHeight(d: SchematicId): number {
  return SCHEMATIC_FRAMES[d].height;
}

/** The box drawing `d` fills, [x0, y0, x1, y1] (#462): where a picture with numbers is cut. */
export function schematicBounds(d: SchematicId): readonly [number, number, number, number] {
  return SCHEMATIC_FRAMES[d].bounds;
}

/** The parts of a drawing as regions (`regions.ts`): what a finger can mean. */
export function schematicRegions(shapes: SchematicShapes, d: SchematicId): RegionSet {
  return { regions: shapes[d].parts };
}

/** The index of the part `name` names in drawing `d` ("Zellkern", "nucleus", "Nukleus"). */
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

/** The parts that carry the numbers 1, 2, 3 … (a name no part has numbers nothing). */
export function schematicNumbered(names: FigureNames, f: SchematicFig): number[] {
  return f.n.map((name) => schematicPart(names, f.d, name)).filter((i): i is number => i !== null);
}

/**
 * The first reason a drawing cannot be shown as written, or null: a numbered part the drawing does
 * not have, a part numbered twice, a number asked that no part carries.
 */
export function schematicProblem(names: FigureNames, f: SchematicFig): string | null {
  const parts = f.n.map((name) => schematicPart(names, f.d, name));
  const unknown = f.n.find((_, i) => parts[i] === null);
  if (unknown !== undefined) return `no part "${unknown}" in the drawing ${f.d}`;
  if (new Set(parts).size !== parts.length) return 'a part is numbered twice';
  if (f.ask > f.n.length) return `no part carries the number ${f.ask}`;
  return null;
}

/** The drawing with every numbered part written as its id ("Nukleus" → "nucleus"): what is stored. */
export function schematicCanonical<F extends SchematicFig>(names: FigureNames, f: F): F {
  const parts = names.pictures[f.d].parts;
  return {
    ...f,
    n: f.n.map((name) => parts[schematicPart(names, f.d, name) ?? -1]?.id ?? name),
  };
}
