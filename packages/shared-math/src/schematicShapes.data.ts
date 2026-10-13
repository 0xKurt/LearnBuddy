// The one drawing the picture library still draws itself: the circuit (issue #252). Every other
// picture is an image with its anchors as data since #599 (`schematicAnchors.data.ts`,
// docs/adr/0008-labelled-pictures-are-images.md); for the circuit no free image shows real
// components — only diagrams of symbols (apps/mobile/assets/figures/TEILE.md §Offen) — so it keeps
// its drawing until one exists.
//
// A schematic as a schoolbook prints it, in a frame 1000 wide (y down), made of the shapes in
// `drawShapes.ts`; every part has the tone it is drawn in (an index into the figure's pastels) and
// the point its number points at (`at`, chosen by hand: on the part, clear of the others). The
// parts stand in the order of their names (`schematicWorldNames.data.ts`). Only the app draws it,
// and it loads this file with the first such picture (`useSchematicShapes`); the server reads it
// for what a finger can tap.

import { box, circle, shape, stroke, TONE } from './drawShapes.js';
import type { SchematicShape, SchematicShapes } from './schematics.js';

const { BLUE, ORANGE, SAND, YELLOW } = TONE;

// The first circuit of primary school as a picture, not as a diagram (that is the circuit figure,
// #261): a battery, a bulb in its holder, a switch, closed, and the wires between them.
const circuit: SchematicShape = {
  lines: [],
  parts: [
    shape(
      'wire',
      ORANGE,
      [150, 450],
      [
        stroke(10, 392, 640, 150, 640, 150, 255, 457, 255),
        stroke(10, 543, 255, 850, 255, 850, 337),
        stroke(10, 850, 478, 850, 640, 612, 640),
      ],
    ),
    shape('battery', BLUE, [470, 640], [box(390, 600, 200, 80, 14), box(588, 618, 24, 44, 6)]),
    shape('holder', SAND, [500, 250], [box(455, 215, 90, 70, 10)]),
    shape('bulb', YELLOW, [500, 85], [circle(500, 110, 90), box(465, 180, 70, 40, 6)]),
    shape('switch', SAND, [850, 410], [box(815, 335, 70, 145, 12)]),
  ],
  marks: {
    white: [
      stroke(6, 548, 640, 572, 640),
      stroke(6, 560, 628, 560, 652),
      stroke(6, 410, 640, 432, 640),
    ],
    black: [
      stroke(4, 480, 172, 486, 112, 500, 98, 514, 112, 520, 172),
      stroke(10, 850, 462, 850, 352),
      circle(850, 352, 10),
      circle(850, 462, 10),
    ],
  },
};

/** The drawings the library draws itself, by name. */
export const SCHEMATIC_SHAPES: SchematicShapes = { circuit };
