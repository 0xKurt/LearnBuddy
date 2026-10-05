// A question on a stumme Karte (issue #251), checked before it is stored. Rule 0: the model only
// NAMES regions; code resolves every name against the Natural Earth data (@learnbuddy/shared-math
// `maps.ts`), and a name the map has no region for costs the question — the shapes, the names in
// five languages and the key's spelling are the data's, never the model's.
//
// Two questions can be asked on a map, both with a place as the key — a region, or since #429 a
// capital, a river or a mountain range of the map's layer (`l`):
//   · "Tippe auf Bayern", "Tippe auf den Rhein" — answered by tapping (`ItemDraft.tap`); the tap
//     check (`tapCheck.ts`, the one mechanism of every tappable figure) holds the key to a place
//     of the map that the map does not mark;
//   · "Wie heißt das markierte Bundesland?", "… der markierte Fluss?" — typed (kind short): exactly
//     one place marked, and the key is that place. Anything else about a map — a neighbour, which
//     river flows through which city — is no fact of this data, and a question about it is
//     dropped rather than trusted.
// Every place the question needs — the one to tap, the marked ones — must be big enough for a
// finger on a 360 phone. On Europe code zooms in where it is not (`mapZoom`: Luxembourg on
// Mitteleuropa); where no Ausschnitt carries it, the question is dropped. Rejected, never
// repaired. What is stored names each marked place by its id, on the view code chose.

import {
  isMap,
  mapCanonical,
  mapMarked,
  mapPlace,
  mapProblem,
  mapZoom,
  type MapView,
} from '@learnbuddy/shared-math';
import type { Figure } from '@learnbuddy/shared-types/contracts';

type Mapped = { kind: string; answer: string; figure: Figure | null; tap?: boolean | null };

/**
 * The view this question about a map is asked on (code may zoom in, `mapZoom`), or why it cannot
 * be asked. A question without a map is no business of this check.
 */
function mapItemView(it: Mapped): { view: MapView } | { problem: string } | null {
  const f = it.figure;
  if (!f || !isMap(f)) return null;
  const problem = mapProblem(f);
  if (problem) return { problem };
  if (it.tap === true) {
    // On a place of the map, unmarked: the tap check (`tapCheck.ts`). Here only what it cannot
    // know without the shapes: a place too small for a finger on a phone is never the key.
    const key = mapPlace(f, it.answer);
    const view = key === null ? null : mapZoom(f, key);
    return view ? { view } : { problem: `"${it.answer}" is too small to tap on the map ${f.v}` };
  }
  if (it.kind !== 'short') return { problem: `a ${it.kind} question about a map` };
  const marked = mapMarked(f);
  if (marked.length !== 1) return { problem: 'name the marked place: mark exactly one' };
  const key = mapPlace(f, it.answer);
  if (key === null) return { problem: `no place "${it.answer}" on the map ${f.v}` };
  if (key !== marked[0]) return { problem: 'the key is not the marked place' };
  const view = mapZoom(f, null);
  return view ? { view } : { problem: `the marked place is too small on the map ${f.v}` };
}

/** The question on the view code chose, its places written as ids, or null when it cannot be asked. */
export function checkedMap<T extends Mapped>(it: T | null): T | null {
  if (!it) return null;
  const checked = mapItemView(it);
  if (checked === null) return it;
  if ('problem' in checked) return null;
  const f = it.figure;
  return f && isMap(f) ? { ...it, figure: mapCanonical({ ...f, v: checked.view }) } : it;
}
