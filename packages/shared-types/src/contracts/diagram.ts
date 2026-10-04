// A schema as data (issue #247): boxes with arrows — a chain (Nahrungskette, Kausalkette), a
// cycle (Wasserkreislauf, Stoffkreislauf), a tree (Gewaltenteilung) or boxes on a small grid
// (Regelkreis, Wirkungsgefüge, Programmablaufplan). docs/architecture.md §Practice, Diagrams.
//
// The model writes the boxes and the arrows, nothing else: no coordinate, no size, no key. The
// app lays them out. Shape limits sit here; everything zod cannot say — every arrow between
// boxes that exist, no box without an arrow, a cycle that closes, a chain without one, texts
// that fit the 360 px phone, no arrow through a box — is `diagramProblem` in
// @learnbuddy/shared-math (`diagram.ts`), and `apps/api/src/modules/practice/diagramCheck.ts`
// holds a gap question to it. Rejected, never repaired.
//
// Short property names and no nullable field, like the trees: these branches sit in every item
// of every generated set (the schema-size pressure of issue #281).

import { z } from 'zod';

/** The most boxes a diagram may have: what the narrowest phone shows without a scroll. */
const MAX_DIAGRAM_BOXES = 8;

const Box = z
  .number()
  .int()
  .min(0)
  .max(MAX_DIAGRAM_BOXES - 1);

export const DiagramFigure = z.object({
  type: z.literal('diagram'),
  k: z
    .enum(['chain', 'cycle', 'tree', 'free'])
    .describe('chain: a → b → c · cycle: closed ring · tree: from one root · free: boxes on g'),
  n: z
    .array(z.string().trim().min(1).max(40))
    .min(2)
    .max(MAX_DIAGRAM_BOXES)
    .describe('box texts; "?" = a gap, lettered A, B, C by the app'),
  e: z
    .array(z.object({ a: Box, b: Box, l: z.string().trim().max(14) }))
    .min(1)
    .max(12)
    .describe('arrows from box a to box b, l = arrow label or ""'),
  g: z
    .array(z.object({ c: z.number().int().min(0).max(2), r: z.number().int().min(0).max(3) }))
    .max(MAX_DIAGRAM_BOXES)
    .describe('free only: column c and row r of each box, in the order of n; else []'),
});
