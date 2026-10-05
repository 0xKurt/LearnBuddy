// The drawings of the picture library, loaded when a picture is on the screen (issue #252), like
// the maps' shapes (`useMapShapes`, `lib/lazyModule.ts`): pictures are a part of biology and
// Sachunterricht, and every other exercise would load them otherwise. Until they are there a
// picture keeps its room (`schematic(d).height`) and draws nothing, and a tap waits.

import { lazyModule } from '../lazyModule.js';

/** The data module of the drawings once it is loaded; null before. */
export const useSchematicShapes = lazyModule(
  () => import('../../../../packages/shared-math/src/schematicShapes.data.js'),
);
