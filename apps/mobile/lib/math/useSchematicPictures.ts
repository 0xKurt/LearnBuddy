// The images of the picture library and their anchors (issue #599), loaded when a picture is on
// the screen, like the maps' shapes (`useMapShapes`, `lib/lazyModule.ts`): pictures are a part of
// biology and Sachunterricht, and every other exercise would load them otherwise. Until they are
// there a picture keeps its room (`schematicFrame(d)`) and draws nothing, and a tap waits.

import { lazyModule } from '../lazyModule.js';

/** The pictures' module once it is loaded; null before. */
export const useSchematicPictures = lazyModule(() => import('./schematicPictures.js'));
