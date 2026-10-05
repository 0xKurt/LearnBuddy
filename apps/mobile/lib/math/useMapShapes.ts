// The shapes of the maps, loaded when a map is on the screen (issue #251), like VexFlow for the
// note line (`lib/lazyModule.ts`).
//
// The shapes of the three maps are ~90 KB of numbers (Natural Earth, `mapShapes.data.ts`). Maps
// are a part of geography; every start of the app and every other exercise would load them
// otherwise. Until they are there a map keeps its room (`mapHeight`) and draws nothing, and a tap
// waits.

import { lazyModule } from '../lazyModule.js';

/** The data module of the shapes once it is loaded; null before. */
export const useMapShapes = lazyModule(
  () => import('../../../../packages/shared-math/src/mapShapes.data.js'),
);
