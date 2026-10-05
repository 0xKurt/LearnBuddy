// A stumme Karte as a figure (issue #251). docs/architecture.md §Practice, Maps.
//
// The model writes WHICH map and which regions to mark, by name — never a coordinate, never a
// shape. The regions, their names in five languages and their shapes are Natural Earth data in
// @learnbuddy/shared-math (`maps.ts`); a name the map has no region for costs the question
// (`apps/api/src/modules/practice/mapCheck.ts`), and what is stored names each region by its id.
// Rejected, never repaired.
//
// Short property names and no nullable field, like the charts and trees (schema size, #281).

import { z } from 'zod';

export const MapFigure = z.object({
  type: z.literal('map'),
  v: z
    .enum(['de', 'europe', 'world'])
    .describe('de: the 16 Bundesländer · europe: the countries of Europe · world: the continents'),
  hl: z
    .array(z.string().trim().min(1).max(40))
    .max(4)
    .describe('names of the marked regions as an atlas writes them ("Bayern"); [] for none'),
});
