// Solids, cube nets and points in space as data (issue #255): a Schrägbild of a solid, six
// squares that may fold into a cube, a 3D coordinate system. docs/architecture.md §Practice,
// Solids.
//
// The model writes the kind and the measures, the squares, the points — no coordinate on the
// screen, no key. Shape limits sit here; everything zod cannot say (which measures a kind uses,
// whether six squares fold into a cube, two points on one spot) and every key (vertices, edges
// and faces by Euler, volume, surface area, the opposite square, coordinates, a vector, a
// distance) is computed and checked in @learnbuddy/shared-math (`solids.ts`, `space.ts`), and
// `apps/api/src/modules/practice/solidCheck.ts` holds the question's key to it. Rejected, never
// repaired.
//
// Short property names and no nullable field, like the charts and the trees: these branches sit
// in every item of every generated set (the schema-size pressure of issue #281).

import { z } from 'zod';

const Length = z.number().min(0).max(1000);

export const SolidFigure = z.object({
  type: z.literal('solid'),
  k: z.enum(['cube', 'cuboid', 'prism', 'pyramid', 'cylinder', 'cone', 'sphere']),
  n: z.number().int().min(0).max(8),
  a: Length,
  b: Length,
  h: Length,
  r: Length,
  u: z.enum(['mm', 'cm', 'dm', 'm']),
  ask: z.enum(['none', 'vertices', 'edges', 'faces', 'volume', 'surface']),
});

export const CubeNetFigure = z.object({
  type: z.literal('cube_net'),
  c: z
    .array(z.object({ x: z.number().int().min(0).max(4), y: z.number().int().min(0).max(4) }))
    .min(6)
    .max(6),
  ask: z.enum(['none', 'fold', 'opposite']),
  at: z.number().int().min(0).max(5),
});

const Coord = z.number().int().min(-4).max(6);

export const Axes3dFigure = z.object({
  type: z.literal('axes3d'),
  p: z
    .array(z.object({ l: z.string().trim().min(1).max(1), x: Coord, y: Coord, z: Coord }))
    .min(1)
    .max(6),
  v: z
    .array(z.object({ a: z.number().int().min(0).max(5), b: z.number().int().min(0).max(5) }))
    .max(4),
  ask: z.enum(['none', 'point', 'vector', 'distance']),
  i: z.number().int().min(0).max(5),
  j: z.number().int().min(0).max(5),
});
