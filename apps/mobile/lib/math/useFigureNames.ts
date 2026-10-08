// The names of the maps' places and the pictures' parts (issue #440), loaded with the first map or
// picture, like their shapes (`useMapShapes`, `useSchematicShapes`, `lib/lazyModule.ts`): ~30 KB
// of names in five languages that every start of the app and every other exercise would load
// otherwise. Every function that resolves a name is handed them (`figureNames.ts` in
// shared-math). Until they are there a map or a picture keeps its room and draws nothing, its
// description says it is coming, and a tap waits — never half a figure, never one without names.

import type { Figure } from '@learnbuddy/shared-types/contracts';

import {
  needsFigureNames,
  type FigureNames,
} from '../../../../packages/shared-math/src/figureNames.js';
import { lazyModule } from '../lazyModule.js';

const useNamesModule = lazyModule(
  () => import('../../../../packages/shared-math/src/figureNames.data.js'),
);

/**
 * The names once they are loaded, null before — and null for figures that need none: nothing is
 * loaded for them. One call for all figures on the screen (the options of a choice). `load` is
 * the load it waits on (`lazyModule`).
 */
export const useFigureNames = Object.assign(
  function useFigureNames(...figures: readonly Figure[]): FigureNames | null {
    return useNamesModule(figures.some(needsFigureNames))?.FIGURE_NAMES ?? null;
  },
  { load: useNamesModule.load },
);
