// A question on a stumme Karte (issue #251), checked before it is stored. Rule 0: the model only
// NAMES regions; code resolves every name against the Natural Earth data (@learnbuddy/shared-math
// `maps.ts`), and a name the map has no region for costs the question — the shapes, the names in
// five languages and the key's spelling are the data's, never the model's.
//
// Two questions can be asked on a map, both with a region as the key:
//   · "Tippe auf Bayern" — answered by tapping (`ItemDraft.tap`); the tap check (`tapCheck.ts`,
//     the one mechanism of every tappable figure) holds the key to a region of the map that the
//     map does not mark;
//   · "Wie heißt das markierte Bundesland?" — typed (kind short): exactly one region marked, and
//     the key is that region. Anything else about a map — a capital, a neighbour, a river — is no
//     fact of this data, and a question about it is dropped rather than trusted.
// Rejected, never repaired. What is stored names each marked region by its id.

import {
  isMap,
  MAP_SHAPES,
  mapCanonical,
  mapHeight,
  mapMarked,
  mapProblem,
  mapRegion,
  regionTappable,
  TAP_TARGET,
} from '@learnbuddy/shared-math';
import type { Figure } from '@learnbuddy/shared-types/contracts';

type Mapped = { kind: string; answer: string; figure: Figure | null; tap?: boolean | null };

/** Why this question about a map cannot be asked, or null when it can (or has no map). */
function mapItemProblem(it: Mapped): string | null {
  const f = it.figure;
  if (!f || !isMap(f)) return null;
  const problem = mapProblem(f);
  if (problem) return problem;
  if (it.tap === true) {
    // On a region of the map, unmarked: the tap check (`tapCheck.ts`). Here only what it cannot
    // know without the shapes: a region too small for a finger on a phone is never the key.
    const key = mapRegion(f.v, it.answer);
    return key === null || regionTappable(MAP_SHAPES[f.v], key, mapHeight(f.v), TAP_TARGET.map)
      ? null
      : `"${it.answer}" is too small to tap on the map ${f.v}`;
  }
  if (it.kind !== 'short') return `a ${it.kind} question about a map`;
  const marked = mapMarked(f);
  if (marked.length !== 1) return 'name the marked region: mark exactly one';
  const key = mapRegion(f.v, it.answer);
  if (key === null) return `no region "${it.answer}" on the map ${f.v}`;
  return key === marked[0] ? null : 'the key is not the marked region';
}

/** The question with its map's regions written as ids, or null when it cannot be asked. */
export function checkedMap<T extends Mapped>(it: T | null): T | null {
  if (!it || mapItemProblem(it) !== null) return null;
  const f = it.figure;
  return f && isMap(f) ? { ...it, figure: mapCanonical(f) } : it;
}
