// A stumme Karte as a figure (issue #251). docs/architecture.md §Practice, Maps.
//
// The model writes WHICH map and which regions to mark, by name — never a coordinate, never a
// shape. The regions, their names in five languages and their shapes are Natural Earth data in
// @learnbuddy/shared-math (`maps.ts`); a name the map has no region for costs the question
// (`apps/api/src/modules/practice/mapCheck.ts`), and what is stored names each region by its id.
// Rejected, never repaired.
//
// Since #429 a map of Germany or Europe can be about its capitals, rivers or mountain ranges
// (`l`), Natural Earth too; and code may store a map of Europe as one of its closer Ausschnitte
// (`eu_*`), where the place to tap is big enough for a finger (shared-math `mapZoom.ts`). A map
// stored before reads as it always did (`l` defaults to the regions). And a map of Germany,
// Europe or the world can be about its Gradnetz (`grid`): its places are the crossings of its
// lines, marked and asked for by their coordinates ("50° N, 10° O") — a point where two drawn
// lines meet, never a fact about the world (shared-math `mapGrid.ts`).
//
// Short property names and no nullable field, like the charts and trees (schema size, #281).

import { z } from 'zod';

export const MapFigure = z.object({
  type: z.literal('map'),
  v: z
    .enum(['de', 'europe', 'world', 'eu_central', 'eu_southeast', 'eu_north'])
    .describe(
      'de: the 16 Bundesländer · europe: the countries of Europe · world: the continents; eu_*: closer views code picks',
    ),
  hl: z
    .array(z.string().trim().min(1).max(40))
    .max(4)
    .describe(
      'names of the marked places as an atlas writes them ("Bayern", "Rhein"; on the grid "50° N, 10° O"); [] for none',
    ),
  l: z
    .enum(['regions', 'cities', 'rivers', 'mountains', 'grid'])
    .default('regions')
    .describe(
      'what the question is about: the regions, the capitals, rivers or ranges on them, or the crossings of the Gradnetz',
    ),
});
