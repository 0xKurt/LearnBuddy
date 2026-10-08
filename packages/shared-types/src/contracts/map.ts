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
// Her own Land as the default (#429, owner's decision of 08.10.): where her profile names the
// Bundesland she goes to school in (`curriculum_region`), a map the model writes without a view
// (`v` left out) is the map of Germany, and code outlines her Land on every map of Germany it can
// (`home`) — chosen by code from the profile, never by the model, and never where it would
// point at the key (`apps/api/src/modules/practice/mapCheck.ts`). The model still writes `europe` or
// `world` where the topic asks for them. Without her Land a map without a view costs the
// question, as before. So the model's map (`MapFigure`) and the map the app draws
// (`ShownMapFigure`: its view always set) are two shapes.
//
// Short property names and no nullable field, like the charts and trees (schema size, #281).

import { z } from 'zod';

const MapViewName = z.enum(['de', 'europe', 'world', 'eu_central', 'eu_southeast', 'eu_north']);

export const MapFigure = z.object({
  type: z.literal('map'),
  v: MapViewName.optional().describe(
    'de: the 16 Bundesländer · europe: the countries of Europe · world: the continents; eu_*: closer views code picks; left out only where HOME LAND says so',
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

/**
 * A map as stored and drawn: its view always set (code chose it where the model left it out),
 * and `home`, her Land's id ("BY"), where code outlines it — never written by the model.
 */
export const ShownMapFigure = MapFigure.extend({
  v: MapViewName,
  home: z.string().min(1).max(8).optional(),
});
