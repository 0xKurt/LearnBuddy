// The periodic table as a figure (issue #250). docs/architecture.md §Practice, Periodic table.
//
// The model writes WHICH table (main groups or all groups), which elements to mark and what the
// question asks — never a fact. Atomic number, group, period, mass, electronegativity and whether
// an element is a metal come from the data in @learnbuddy/shared-math (`periodic.ts`, generated
// from the MIT package `periodic-table-data`), and every key is COMPUTED there: protons and
// electrons from the atomic number, neutrons from the rounded mass, valence electrons from the
// group, the trend from the position. A key that disagrees costs the question
// (`apps/api/src/modules/practice/periodicCheck.ts`). Rejected, never repaired.
//
// Short property names and no nullable field, like the charts and trees (schema size, #281).

import { z } from 'zod';

/** An element symbol as printed ("Na"); checked against the data, not here (schema size). */
const ElementSymbol = z.string().trim().min(1).max(2);

export const PERIODIC_ASKS = [
  'none',
  'protons',
  'electrons',
  'neutrons',
  'valence',
  'group',
  'period',
  'shells',
  'class',
  'en_max',
  'radius_max',
] as const;

export const PeriodicTableFigure = z.object({
  type: z.literal('periodic_table'),
  v: z.enum(['main', 'full']).describe('main: main groups I–VIII, years 7–10 · full: 18 groups'),
  hl: z.array(ElementSymbol).max(6).describe('symbols of the marked elements'),
  ask: z.enum(PERIODIC_ASKS).describe('the key is this computed value'),
  at: z.string().trim().max(2).describe('the element asked about, "" for none'),
});
