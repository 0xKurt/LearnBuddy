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
//
// On the Gradnetz (#429) a place is a crossing of its lines, written "50° N, 10° O": "Welche
// Koordinaten hat der markierte Punkt?" or "Tippe auf 50° N, 10° O". The model writes it in the
// question's language, where "20° O" is west in French; code reads it so (`gridWritten`) and
// stores it as `mapGrid.ts` writes it — a point where no two lines cross is no place, as a name
// no region has.

import {
  gridParse,
  gridText,
  isGridMap,
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

/**
 * A question on the Gradnetz with its crossings as code writes them: each marked one in German
 * (what is stored), the key in `lang` (what she is shown) — both read back alike. A text that is
 * no coordinate stays as the model wrote it, and costs the question in `mapItemView`.
 */
function gridWritten<T extends Mapped>(it: T, lang: string): T {
  const f = it.figure;
  if (!f || !isMap(f) || !isGridMap(f)) return it;
  const read = (text: string) => gridParse(text, lang);
  const hl = f.hl.map((n) => {
    const p = read(n);
    return p ? gridText(p, 'de') : n;
  });
  const key = read(it.answer);
  return { ...it, answer: key ? gridText(key, lang) : it.answer, figure: { ...f, hl } };
}

/**
 * The question on the view code chose, its places written as ids, or null when it cannot be
 * asked. `locale`: the language the questions are written in — her language, German for a sheet.
 */
export function checkedMap<T extends Mapped>(raw: T | null, locale: string | null): T | null {
  if (!raw) return null;
  const it = gridWritten(raw, locale ?? 'de');
  const checked = mapItemView(it);
  if (checked === null) return it;
  if ('problem' in checked) return null;
  const f = it.figure;
  return f && isMap(f) ? { ...it, figure: mapCanonical({ ...f, v: checked.view }) } : it;
}
