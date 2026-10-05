// A labelled picture as a figure (issue #252): a drawing of the picture library with numbers on
// chosen parts. docs/architecture.md §Practice, Labelled pictures.
//
// The model writes WHICH drawing, which parts carry the numbers 1, 2, 3 … (by name) and which
// number is asked — never a shape, never a coordinate, never the key's spelling. The drawings,
// their parts and the parts' names in five languages are code in @learnbuddy/shared-math
// (`schematics.ts`); a part the drawing does not have costs the question
// (`apps/api/src/modules/practice/schematicCheck.ts`), and what is stored names each part by its
// id. Rejected, never repaired.
//
// Short property names and no nullable field, like the charts and maps (schema size, #281).

import { z } from 'zod';

/** The drawings of the library (`SCHEMATIC_IDS` in shared-math; the API's typecheck ties them). */
export const SCHEMATIC_DRAWINGS = [
  'plant_cell',
  'animal_cell',
  'flower',
  'plant',
  'eye',
  'tooth',
  'insect',
  'bicycle',
] as const;

export const SchematicFigure = z.object({
  type: z.literal('schematic'),
  d: z.enum(SCHEMATIC_DRAWINGS).describe('the drawing'),
  n: z
    .array(z.string().trim().min(1).max(40))
    .max(6)
    .describe('parts that carry the numbers 1, 2, 3 …, by name ("Zellkern"); [] for none'),
  ask: z
    .number()
    .int()
    .min(0)
    .max(6)
    .describe('the number whose part is the key ("Wie heißt Teil 3?" → 3); 0 on a tap question'),
});
